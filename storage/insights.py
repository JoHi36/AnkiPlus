"""
Insight extraction from card chats.
Extracts learning insights incrementally using AI, merges with existing insights.
Uses OpenRouter API for fast, cheap extraction calls.
"""
import hashlib
import json
import re
import urllib.request
import urllib.error

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
EXTRACTION_MODEL = 'google/gemini-2.0-flash-001'


def insight_hash(text):
    """Deterministic 8-char hash of insight text for seen-tracking."""
    return hashlib.md5(text.encode('utf-8')).hexdigest()[:8]


def compute_new_indices(insights, seen_hashes):
    """Return indices of insights whose text hash is not in seen_hashes."""
    return [
        i for i, ins in enumerate(insights)
        if insight_hash(ins.get('text', '')) not in seen_hashes
    ]


EXTRACTION_PROMPT = """Du extrahierst Lernerkenntnisse aus einem Chat über eine Anki-Lernkarte.

KARTE: {question}

BISHERIGE ERKENNTNISSE: {existing_insights}

CHAT:
{chat_messages}

REGELN:
- Extrahiere NUR Erkenntnisse die direkt mit dem Karteninhalt zu tun haben
- Ignoriere Off-Topic-Gespräche, UI-Tests, Smalltalk oder Fragen die nichts mit der Karte zu tun haben
- Typ "learned": Konzept verstanden, Wissen bestätigt, neue Fakten gelernt
- Typ "weakness": Fehler gemacht, Verwechslung, Unsicherheit beim User
- Priorisiere: User-Fehler > neue Konzepte > Bestätigungen
- Merge mit bisherigen Erkenntnissen: Duplikate entfernen, Widersprüche aktualisieren, max 10 Einträge
- Wenn keine neuen kartenrelevanten Erkenntnisse vorhanden: gib die bisherigen Erkenntnisse unverändert zurück
- NUR das JSON-Objekt ausgeben, KEIN anderer Text

BEISPIEL-OUTPUT:
{{"version":1,"insights":[{{"text":"Kompetitive Hemmung erhöht Km, nicht Vmax","type":"learned"}},{{"text":"Verwechslung: allosterisch ≠ nicht-kompetitiv","type":"weakness"}}]}}"""


def _strip_html(text):
    """Remove HTML tags and collapse whitespace."""
    if not text:
        return ''
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:300]


def _filter_messages_for_extraction(messages):
    """Filter messages for extraction: include user + tutor + research, exclude Plusi + tool calls.

    Inclusion rules:
    - User messages: always included
    - Tutor/assistant responses: included (main learning content)
    - Research agent results: included (factual content relevant to learning)
    - Plusi messages: EXCLUDED (personality/emotional, not learning content)
    - Tool/function calls: EXCLUDED (internal mechanics)
    - Tool widget markers: EXCLUDED (UI signals)
    """
    filtered = []
    for m in messages:
        # Skip tool/function calls
        if m.get('is_function_call'):
            continue

        # Skip tool widget markers
        text = m.get('text', '')
        if text.startswith('[[TOOL') or text.startswith('[[LOADING'):
            continue

        sender = m.get('sender', m.get('from', ''))

        # Skip Plusi messages (subagent personality responses)
        if m.get('subagent') == 'plusi' or m.get('agent') == 'plusi':
            continue

        # Include user messages
        if sender == 'user':
            filtered.append(m)
            continue

        # Include assistant/bot/tutor messages
        if sender in ('assistant', 'bot'):
            filtered.append(m)
            continue

    return filtered


def _format_chat_for_extraction(messages):
    """Format filtered messages as compact text for the extraction prompt."""
    filtered = _filter_messages_for_extraction(messages)
    lines = []
    for m in filtered:
        sender = "User" if m.get('sender', m.get('from')) == 'user' else "Tutor"
        text = m.get('text', '')[:400]
        lines.append(f"{sender}: {text}")
    result = "\n".join(lines)
    return result[:3000]


def _count_user_messages(messages):
    """Count messages from the user."""
    return sum(1 for m in messages if m.get('sender', m.get('from')) == 'user')


def build_extraction_prompt(card_context, messages, existing_insights, performance_data=None):
    """Build the full extraction prompt."""
    question = card_context.get('frontField', '')
    if not question:
        question = _strip_html(card_context.get('question', ''))

    existing_str = json.dumps(existing_insights, ensure_ascii=False) if existing_insights.get('insights') else "Keine"
    chat_str = _format_chat_for_extraction(messages)

    return EXTRACTION_PROMPT.format(
        question=question[:300],
        existing_insights=existing_str,
        chat_messages=chat_str,
    )


def extract_insights_via_openrouter(prompt, api_key):
    """Call OpenRouter API directly for insight extraction.

    Uses a fast, cheap model (Gemini 2.0 Flash) for structured JSON output.
    Returns the raw response text or raises on error.
    """
    if not api_key:
        raise ValueError("Kein OpenRouter API-Key konfiguriert")

    payload = json.dumps({
        'model': EXTRACTION_MODEL,
        'messages': [
            {'role': 'user', 'content': prompt},
        ],
        'temperature': 0.3,
        'max_tokens': 1000,
    }).encode('utf-8')

    req = urllib.request.Request(
        OPENROUTER_URL,
        data=payload,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ankiplus.app',
            'X-Title': 'AnkiPlus Insight Extraction',
        },
    )

    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    answer = data.get('choices', [{}])[0].get('message', {}).get('content', '')
    if not answer:
        raise ValueError("Empty response from OpenRouter")

    usage = data.get('usage', {})
    logger.info("Insight extraction via OpenRouter [%s]: %s prompt + %s completion tokens",
                EXTRACTION_MODEL,
                usage.get('prompt_tokens', '?'),
                usage.get('completion_tokens', '?'))

    return answer


def parse_extraction_response(response_text):
    """Parse AI response into insights JSON. Returns None on failure."""
    try:
        text = response_text.strip()
        # Strip markdown code fences
        if '```json' in text:
            text = text.split('```json')[1].split('```')[0].strip()
        elif '```' in text:
            text = text.split('```')[1].split('```')[0].strip()

        # Try to find JSON object in text
        json_match = re.search(r'\{[\s\S]*"insights"\s*:\s*\[[\s\S]*\]\s*\}', text)
        if json_match:
            text = json_match.group(0)

        data = json.loads(text)

        if 'insights' not in data or not isinstance(data['insights'], list):
            return None

        data['version'] = data.get('version', 1)

        valid_insights = []
        for insight in data['insights'][:10]:
            if isinstance(insight, dict) and 'text' in insight and 'type' in insight:
                if insight['type'] not in ('learned', 'weakness'):
                    insight['type'] = 'learned'
                insight.setdefault('citations', [])
                valid_insights.append(insight)

        data['insights'] = valid_insights
        return data

    except (json.JSONDecodeError, KeyError, IndexError) as e:
        logger.error("[InsightExtractor] Failed to parse response: %s", e)
        return None


def should_extract(messages):
    """Check if extraction should trigger (≥2 user messages)."""
    return _count_user_messages(messages) >= 2
