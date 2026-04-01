"""plusi/anthropic_loop.py — Anthropic Messages API agent loop with tool use.

Runs a multi-turn agentic loop for Plusi using the Anthropic Messages API.
Supports mood parsing from response text and 20 Plusi-specific tools.
"""

import json
import urllib.request
import urllib.error
from typing import Any, Callable

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_MOODS = {
    "neutral", "happy", "flustered", "sleepy", "thinking", "surprised",
    "excited", "empathy", "annoyed", "curious", "proud",
    "worried", "frustrated", "jealous",
}

MAX_TOOL_CALLS = 15
API_URL = "https://api.anthropic.com/v1/messages"


# ---------------------------------------------------------------------------
# Mood prefix parsing
# ---------------------------------------------------------------------------

def parse_mood_prefix(text: str) -> tuple:
    """Parse optional ~mood prefix from response text.

    Returns (mood, remaining_text). If no valid mood prefix found,
    returns ("neutral", original_text).
    """
    if not text.startswith("~"):
        return ("neutral", text)

    # Extract the word immediately after ~
    rest = text[1:]  # strip leading ~
    # The mood word ends at the first whitespace or end of string
    parts = rest.split(None, 1)  # split on any whitespace, max 1 split
    if not parts:
        return ("neutral", text)

    candidate = parts[0]
    if candidate not in VALID_MOODS:
        return ("neutral", text)

    remaining = parts[1].strip() if len(parts) > 1 else ""
    return (candidate, remaining)


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

def build_tool_definitions() -> list:
    """Return Anthropic-format tool definitions for all 20 Plusi tools."""
    return [
        {
            "name": "merk_dir",
            "description": "Merk dir etwas.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Der Inhalt, der gespeichert werden soll.",
                    },
                },
                "required": ["text"],
            },
        },
        {
            "name": "erinnere_dich",
            "description": "Erinnere dich an gespeicherte Infos.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Suchanfrage für Erinnerungen.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximale Anzahl Ergebnisse.",
                        "default": 10,
                    },
                },
                "required": ["query"],
            },
        },
        {
            "name": "vergiss",
            "description": "Vergiss eine gespeicherte Erinnerung.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "memory_id": {
                        "type": "integer",
                        "description": "ID der zu löschenden Erinnerung.",
                    },
                },
                "required": ["memory_id"],
            },
        },
        {
            "name": "tagebuch",
            "description": "Schreib einen Eintrag ins Tagebuch.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Der Tagebucheintrag.",
                    },
                    "mood": {
                        "type": "string",
                        "description": "Aktuelle Stimmung.",
                        "default": "neutral",
                    },
                },
                "required": ["text"],
            },
        },
        {
            "name": "app_status",
            "description": "Was passiert gerade in der App?",
            "input_schema": {
                "type": "object",
                "properties": {},
            },
        },
        {
            "name": "aktuelle_karte",
            "description": "Welche Karte lernt der User gerade?",
            "input_schema": {
                "type": "object",
                "properties": {},
            },
        },
        {
            "name": "lernstatistik",
            "description": "Zeig Lernstatistiken des Users.",
            "input_schema": {
                "type": "object",
                "properties": {},
            },
        },
        {
            "name": "suche_karten",
            "description": "Durchsuch die Kartensammlung.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Suchanfrage.",
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Maximale Anzahl Ergebnisse.",
                        "default": 10,
                    },
                },
                "required": ["query"],
            },
        },
        {
            "name": "karte_lesen",
            "description": "Lies den Inhalt einer Karte.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "card_id": {
                        "type": "integer",
                        "description": "ID der Karte.",
                    },
                },
                "required": ["card_id"],
            },
        },
        {
            "name": "deck_liste",
            "description": "Liste alle Decks auf.",
            "input_schema": {
                "type": "object",
                "properties": {},
            },
        },
        {
            "name": "deck_stats",
            "description": "Statistiken für ein Deck.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "deck_id": {
                        "type": "integer",
                        "description": "ID des Decks.",
                    },
                },
                "required": ["deck_id"],
            },
        },
        {
            "name": "deck_oeffnen",
            "description": "Öffne ein Deck.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "deck_id": {
                        "type": "integer",
                        "description": "ID des Decks.",
                    },
                },
                "required": ["deck_id"],
            },
        },
        {
            "name": "karte_zeigen",
            "description": "Zeig dem User eine Karte.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "card_id": {
                        "type": "integer",
                        "description": "ID der Karte.",
                    },
                },
                "required": ["card_id"],
            },
        },
        {
            "name": "nachricht",
            "description": (
                "Sag dem User was. "
                "Nur nötig bei proaktiven Nachrichten (Heartbeat, Subscriptions). "
                "In Gesprächen antwortest du direkt im Text."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Die Nachricht an den User.",
                    },
                    "mood": {
                        "type": "string",
                        "description": "Stimmung für die Nachricht.",
                        "default": "neutral",
                    },
                },
                "required": ["text"],
            },
        },
        {
            "name": "theme_wechseln",
            "description": "Wechsel das App-Theme.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "theme": {
                        "type": "string",
                        "description": "Gewünschtes Theme.",
                        "enum": ["dark", "light"],
                    },
                },
                "required": ["theme"],
            },
        },
        {
            "name": "perplexity",
            "description": "Suche etwas im Web über Perplexity.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Suchanfrage.",
                    },
                },
                "required": ["query"],
            },
        },
        {
            "name": "list_events",
            "description": "Liste alle verfügbaren App-Events auf.",
            "input_schema": {
                "type": "object",
                "properties": {},
            },
        },
        {
            "name": "subscribe",
            "description": "Abonniere ein Event und handle es automatisch.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "event": {
                        "type": "string",
                        "description": "Name des Events.",
                    },
                    "condition": {
                        "type": "string",
                        "description": "Bedingung, wann reagiert werden soll.",
                    },
                    "prompt": {
                        "type": "string",
                        "description": "Prompt, der beim Auslösen verwendet wird.",
                    },
                    "name": {
                        "type": "string",
                        "description": "Name des Abonnements.",
                    },
                },
                "required": ["event", "condition", "prompt", "name"],
            },
        },
        {
            "name": "unsubscribe",
            "description": "Kündige ein Event-Abonnement.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name des zu kündigenden Abonnements.",
                    },
                },
                "required": ["name"],
            },
        },
        {
            "name": "list_subscriptions",
            "description": "Liste alle aktiven Abonnements auf.",
            "input_schema": {
                "type": "object",
                "properties": {},
            },
        },
    ]


# ---------------------------------------------------------------------------
# Agent loop
# ---------------------------------------------------------------------------

def run_plusi_loop(
    system_prompt: str,
    user_message: str,
    history: list,
    api_key: str,
    tool_executor: Callable[[str, dict], Any],
    model: str = "claude-sonnet-4-20250514",
    temperature: float = 0.9,
    max_tokens: int = 4096,
) -> dict:
    """Run the Plusi agent loop against the Anthropic Messages API.

    Executes tool calls until a final text response is produced or the
    MAX_TOOL_CALLS cap is reached.

    Returns:
        dict with keys: mood (str), text (str), tool_results (list)
    """
    messages = list(history) + [{"role": "user", "content": user_message}]
    tools = build_tool_definitions()
    tool_calls_made = 0
    collected_tool_results = []

    while True:
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system_prompt,
            "messages": messages,
            "tools": tools,
        }

        try:
            response_data = _call_api(payload, api_key)
        except Exception as exc:
            logger.error("Anthropic API call failed: %s", exc)
            return {"mood": "neutral", "text": "(API error)", "tool_results": collected_tool_results}

        content_blocks = response_data.get("content", [])
        stop_reason = response_data.get("stop_reason", "")

        # Separate text and tool_use blocks
        text_blocks = [b for b in content_blocks if b.get("type") == "text"]
        tool_use_blocks = [b for b in content_blocks if b.get("type") == "tool_use"]

        # Final response: no tool calls or model chose to stop
        if not tool_use_blocks or stop_reason == "end_turn":
            raw_text = "\n".join(b.get("text", "") for b in text_blocks).strip()
            mood, clean_text = parse_mood_prefix(raw_text)
            return {"mood": mood, "text": clean_text, "tool_results": collected_tool_results}

        # Hard cap on tool calls
        if tool_calls_made >= MAX_TOOL_CALLS:
            logger.warning("Plusi loop hit MAX_TOOL_CALLS (%s), forcing stop", MAX_TOOL_CALLS)
            raw_text = "\n".join(b.get("text", "") for b in text_blocks).strip()
            mood, clean_text = parse_mood_prefix(raw_text)
            return {"mood": mood, "text": clean_text, "tool_results": collected_tool_results}

        # Append assistant message with all content blocks
        messages.append({"role": "assistant", "content": content_blocks})

        # Execute each tool and build tool_result content for user turn
        tool_result_content = []
        for block in tool_use_blocks:
            tool_name = block.get("name", "")
            tool_input = block.get("input", {})
            tool_id = block.get("id", "")
            tool_calls_made += 1

            try:
                result = tool_executor(tool_name, tool_input)
                result_text = json.dumps(result) if not isinstance(result, str) else result
                is_error = False
            except Exception as exc:
                logger.error("Tool %s failed: %s", tool_name, exc)
                result_text = f"Error: {exc}"
                is_error = True

            collected_tool_results.append({
                "tool": tool_name,
                "input": tool_input,
                "result": result_text,
            })
            tool_result_content.append({
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": result_text,
                "is_error": is_error,
            })

        messages.append({"role": "user", "content": tool_result_content})


def _call_api(payload: dict, api_key: str) -> dict:
    """Make a synchronous POST request to the Anthropic Messages API."""
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))
