"""
Insight extraction from card chats.
Extracts learning insights incrementally using AI, merges with existing insights.
"""
import json


EXTRACTION_PROMPT = """Du extrahierst Lernerkenntnisse aus einem Chat über eine Anki-Lernkarte.

Karteninhalt:
Frage: {question}
Antwort: {answer}

Bisherige Erkenntnisse: {existing_insights}

Chat-Verlauf:
{chat_messages}

Session-Performance: {performance}

Regeln:
- Formuliere stichpunktartig, keine ganzen Sätze
- Priorisiere: User-Fehler > neue Konzepte > Bestätigungen
- Typ "learned" = verstanden/gelernt, Typ "weakness" = Fehler/Unsicherheit
- Wenn eine andere Karte relevant ist, füge cardId als Citation hinzu
- Merge mit bestehenden Erkenntnissen: update wenn sich etwas verändert hat, ergänze nur wirklich Neues
- Maximal 10 Erkenntnisse pro Karte — wenn das Limit erreicht ist, ersetze die am wenigsten relevante
- Antworte ausschließlich im folgenden JSON-Format

Output-Format:
{{
  "version": 1,
  "insights": [
    {{
      "text": "Stichpunktartige Erkenntnis",
      "type": "learned | weakness",
      "citations": [{{ "cardId": 12345, "label": "1" }}]
    }}
  ]
}}"""


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
        text = m.get('text', '')[:500]  # Truncate long messages
        lines.append(f"{sender}: {text}")
    return "\n".join(lines)


def _count_user_messages(messages):
    """Count messages from the user."""
    return sum(1 for m in messages if m.get('sender', m.get('from')) == 'user')


def build_extraction_prompt(card_context, messages, existing_insights, performance_data=None):
    """Build the full extraction prompt."""
    question = card_context.get('question', card_context.get('frontField', ''))
    answer = card_context.get('answer', '')

    existing_str = json.dumps(existing_insights, ensure_ascii=False) if existing_insights.get('insights') else "Keine"
    chat_str = _format_chat_for_extraction(messages)
    perf_str = json.dumps(performance_data, ensure_ascii=False) if performance_data else "Keine Daten"

    return EXTRACTION_PROMPT.format(
        question=question,
        answer=answer,
        existing_insights=existing_str,
        chat_messages=chat_str,
        performance=perf_str
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
