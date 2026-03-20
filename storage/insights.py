"""
Insight extraction from card chats.
Extracts learning insights incrementally using AI, merges with existing insights.
"""
import json
import re


EXTRACTION_PROMPT = """Extrahiere Lernerkenntnisse aus diesem Chat über eine Anki-Lernkarte.

Karte: {question}

Bisherige Erkenntnisse: {existing_insights}

Chat:
{chat_messages}

Regeln:
- Stichpunktartig, keine ganzen Sätze
- Priorisiere: User-Fehler > neue Konzepte > Bestätigungen
- Typ "learned" = verstanden, "weakness" = Fehler/Unsicherheit
- Maximal 10 Erkenntnisse, ersetze unwichtigste wenn nötig
- Nur JSON, kein anderer Text

Format:
{{"version":1,"insights":[{{"text":"...","type":"learned","citations":[]}}]}}"""


def _strip_html(text):
    """Remove HTML tags and collapse whitespace."""
    if not text:
        return ''
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:300]  # Max 300 chars for card content


def _strip_tool_messages(messages):
    """Remove tool/function call messages to reduce tokens."""
    return [
        m for m in messages
        if not m.get('is_function_call') and m.get('sender', m.get('from')) in ('user', 'assistant', 'bot')
    ]


def _format_chat_for_extraction(messages):
    """Format chat messages as compact text for the extraction prompt."""
    stripped = _strip_tool_messages(messages)
    lines = []
    for m in stripped:
        sender = "User" if m.get('sender', m.get('from')) == 'user' else "Plusi"
        text = m.get('text', '')[:300]  # Truncate long messages
        lines.append(f"{sender}: {text}")
    # Cap total chat to ~2000 chars
    result = "\n".join(lines)
    return result[:2000]


def _count_user_messages(messages):
    """Count messages from the user."""
    return sum(1 for m in messages if m.get('sender', m.get('from')) == 'user')


def build_extraction_prompt(card_context, messages, existing_insights, performance_data=None):
    """Build the full extraction prompt. Kept small to avoid 429 rate limits."""
    # Use frontField (clean text) over question (rendered HTML)
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


def parse_extraction_response(response_text):
    """Parse AI response into insights JSON. Returns None on failure."""
    try:
        text = response_text.strip()
        if '```json' in text:
            text = text.split('```json')[1].split('```')[0].strip()
        elif '```' in text:
            text = text.split('```')[1].split('```')[0].strip()

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
        print(f"[InsightExtractor] Failed to parse response: {e}")
        return None


def should_extract(messages):
    """Check if extraction should trigger (≥2 user messages)."""
    return _count_user_messages(messages) >= 2
