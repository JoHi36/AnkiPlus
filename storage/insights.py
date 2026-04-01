"""
Insight extraction from card chats.
Extracts learning insights incrementally using AI, merges with existing insights.
Uses backend /insights/extract endpoint for extraction calls.
"""
import hashlib
import json
import re

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)




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

FOKUS:
Erfasse was der NUTZER in diesem Chat gelernt, gefragt oder falsch verstanden hat.
Fasse NICHT den Tutor-Text zusammen — erfasse das Lernverhalten des Nutzers:

1. FRAGEN des Nutzers → zeigen Wissenslücken oder aktives Interesse (type: "learned")
2. FEHLER/VERWECHSLUNGEN → was der Nutzer falsch verstanden hat (type: "weakness")
3. UNSICHERHEITEN → wo der Nutzer nachfragen musste (type: "weakness")
4. SCHLÜSSELMOMENTE → was der Nutzer erst durch die Erklärung verstanden hat (type: "learned")

REGELN:
- Formuliere aus Nutzerperspektive: "Gefragt nach X", "Verwechslung: X vs Y", "Verstanden: X"
- Jede Frage des Nutzers ist eine potenzielle Erkenntnis (zeigt Interesse oder Wissenslücke)
- NUR kartenrelevante Erkenntnisse, kein Off-Topic/Smalltalk
- Merge mit bisherigen Erkenntnissen: Duplikate entfernen, max 10 Einträge
- Wenn keine neuen Erkenntnisse: bisherige unverändert zurückgeben
- NUR das JSON-Objekt ausgeben, KEIN anderer Text

BEISPIEL-OUTPUT:
{{"version":1,"insights":[{{"text":"Gefragt nach weiteren Ansätzen am Tuber ischiadicum","type":"learned"}},{{"text":"Verwechslung: M. pterygoideus lateralis vs. medialis","type":"weakness"}},{{"text":"Verstanden: Km ändert sich nur bei kompetitiver Hemmung","type":"learned"}}]}}"""


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


def extract_insights_via_openrouter(prompt, api_key=''):
    """Extract insights via backend /insights/extract endpoint.

    Args:
        prompt: The extraction prompt (contains card context + chat messages).
        api_key: Unused (kept for backward compat).

    Returns the raw response text (JSON string) or raises on error.
    """
    try:
        from ..config import get_backend_url, get_auth_token
    except ImportError:
        from config import get_backend_url, get_auth_token

    backend_url = get_backend_url()
    auth_token = get_auth_token()

    if not backend_url or not auth_token:
        raise ValueError("Nicht authentifiziert")

    import requests
    headers = {
        'Authorization': 'Bearer %s' % auth_token,
        'Content-Type': 'application/json',
    }
    resp = requests.post('%s/insights/extract' % backend_url.rstrip('/'),
                         json={'messages': [{'role': 'user', 'content': prompt}]},
                         headers=headers, timeout=20)
    resp.raise_for_status()
    data = resp.json()

    logger.info("Insight extraction via backend completed")

    # Caller expects raw text for parse_extraction_response() to parse
    return json.dumps(data)


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
