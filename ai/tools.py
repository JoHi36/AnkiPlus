"""
tool_registry.py — Central registry for AI tool definitions.

Tools are registered as ToolDefinition instances and can be filtered
by agent, config toggles, and mode restrictions when generating
function declarations for AI providers.
"""

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Mermaid tool schema (migrated from ai_handler.py)
# ---------------------------------------------------------------------------

MERMAID_SCHEMA = {
    "name": "create_mermaid_diagram",
    "description": """Erstellt ein Mermaid-Diagramm zur Visualisierung von Konzepten, Prozessen oder Strukturen.

Unterstützte Diagrammtypen:
- flowchart: Flowcharts für Prozesse und Abläufe (graph TD, graph LR, etc.)
- sequenceDiagram: Sequenzdiagramme für Interaktionen zwischen Entitäten
- gantt: Gantt-Charts für Zeitpläne und Projektphasen
- classDiagram: Klassendiagramme für Strukturen und Hierarchien
- stateDiagram-v2: Zustandsdiagramme für Zustandsübergänge
- erDiagram: Entity-Relationship-Diagramme für Beziehungen
- pie: Kreisdiagramme für Verteilungen
- gitGraph: Git-Graphen für Versionskontrolle
- timeline: Timeline-Diagramme für zeitliche Abläufe
- journey: Journey-Diagramme für Prozesse mit Phasen
- mindmap: Mindmaps für hierarchische Strukturen
- quadrantChart: Quadrant-Charts für 2D-Klassifikationen
- requirement: Requirement-Diagramme für Anforderungen
- userJourney: User Journey für Nutzerpfade
- sankey-beta: Sankey-Diagramme für Flüsse und Mengen

WICHTIG: Mermaid akzeptiert NUR reinen Text - keine HTML-Tags oder Markdown-Formatierung im Code!
Verwende \\n für Zeilenumbrüche und Anführungszeichen für Labels mit Leerzeichen.

KRITISCH - FARBEN:
- Verwende KEINE expliziten Farben im Code (keine 'style' Statements, keine 'classDef' mit fill/stroke Farben)
- Verwende KEINE Farbnamen (z.B. orange, red, pink) oder Hex-Codes (z.B. #ff0000) im Diagramm-Code
- Verwende KEINE Subgraphs mit expliziten Farben
- Mermaid verwendet automatisch konsistente Farben basierend auf dem Theme (Grautöne mit Teal-Akzenten)
- Alle Knoten sollten die Standard-Farben verwenden - keine manuellen Farbzuweisungen nötig!""",
    "parameters": {
        "type": "object",
        "properties": {
            "diagram_type": {
                "type": "string",
                "enum": [
                    "flowchart", "sequenceDiagram", "gantt", "classDiagram",
                    "stateDiagram-v2", "erDiagram", "pie", "gitGraph",
                    "timeline", "journey", "mindmap", "quadrantChart",
                    "requirement", "userJourney", "sankey-beta"
                ],
                "description": "Der Typ des Mermaid-Diagramms"
            },
            "code": {
                "type": "string",
                "description": "Der Mermaid-Code für das Diagramm (ohne ```mermaid Markdown-Wrapper). WICHTIG: Nur reiner Text, keine HTML-Tags oder Markdown-Formatierung! Verwende \\n für Zeilenumbrüche."
            }
        },
        "required": ["diagram_type", "code"]
    }
}


# ---------------------------------------------------------------------------
# Execute function for Mermaid tool
# ---------------------------------------------------------------------------

def execute_mermaid(args: Dict[str, Any]) -> str:
    """Execute the Mermaid diagram tool.

    Args:
        args: Dict with 'diagram_type' and 'code' keys.

    Returns:
        A markdown fenced code block containing the Mermaid diagram code.
    """
    code = args.get("code", "")
    return f"```mermaid\n{code}\n```"


# ---------------------------------------------------------------------------
# ToolDefinition
# ---------------------------------------------------------------------------

@dataclass
class ToolDefinition:
    """Describes a single AI tool available to an agent.

    Attributes:
        name: Unique tool name (must match schema['name']).
        schema: Gemini-format function declaration dict (name, description,
                parameters).
        execute_fn: Callable that receives the tool-call args dict and returns
                    a string result to be sent back to the model.
        category: Logical grouping of the tool (default: 'content').
        config_key: Key in ai_tools_config dict that toggles this tool on/off.
                    If None the tool is always enabled.
        agent: Which agent this tool belongs to (default: 'tutor').
        disabled_modes: List of mode strings in which this tool must not be
                        offered to the model (e.g. ['compact']).
    """

    name: str
    schema: Dict[str, Any]
    execute_fn: Callable[[Dict[str, Any]], Any]
    category: str = "content"
    config_key: Optional[str] = None
    agent: str = "tutor"
    disabled_modes: List[str] = field(default_factory=list)
    display_type: str = "markdown"     # "markdown" | "widget" | "silent"
    timeout_seconds: int = 30          # Per-tool timeout in seconds


# ---------------------------------------------------------------------------
# ToolRegistry
# ---------------------------------------------------------------------------

class ToolRegistry:
    """Central registry for ToolDefinition instances."""

    def __init__(self) -> None:
        self._tools: Dict[str, ToolDefinition] = {}

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, tool: ToolDefinition) -> None:
        """Register a ToolDefinition.

        Args:
            tool: The ToolDefinition to register.
        """
        self._tools[tool.name] = tool

    # ------------------------------------------------------------------
    # Lookup
    # ------------------------------------------------------------------

    def get(self, name: str) -> Optional[ToolDefinition]:
        """Return a ToolDefinition by name, or None if not found.

        Args:
            name: The tool name to look up.

        Returns:
            The matching ToolDefinition or None.
        """
        return self._tools.get(name)

    # ------------------------------------------------------------------
    # Function declaration generation
    # ------------------------------------------------------------------

    def get_function_declarations(
        self,
        agent: str,
        ai_tools_config: Dict[str, Any],
        mode: str,
    ) -> List[Dict[str, Any]]:
        """Return Gemini-format function declaration dicts for a given agent.

        Tools are excluded if:
        - They belong to a different agent.
        - Their config_key is present in ai_tools_config and evaluates to
          falsy.
        - The current mode appears in the tool's disabled_modes list.

        Args:
            agent: Agent identifier string (e.g. 'tutor').
            ai_tools_config: Mapping of config_key → bool/value from the
                             addon configuration.
            mode: Current UI/session mode string (e.g. 'compact').

        Returns:
            List of schema dicts suitable for passing to the Gemini API as
            function declarations.
        """
        declarations: List[Dict[str, Any]] = []

        for tool in self._tools.values():
            # Filter by agent
            if tool.agent != agent:
                continue

            # Filter by config toggle (only when a key is specified)
            if tool.config_key is not None:
                if not ai_tools_config.get(tool.config_key, True):
                    continue

            # Filter by disabled modes
            if mode in tool.disabled_modes:
                continue

            declarations.append(tool.schema)

        return declarations

    # ------------------------------------------------------------------
    # Listing
    # ------------------------------------------------------------------

    def list_tools(self, agent: str) -> List[str]:
        """Return the names of all tools registered for a given agent.

        Args:
            agent: Agent identifier string.

        Returns:
            List of tool name strings.
        """
        return [
            tool.name
            for tool in self._tools.values()
            if tool.agent == agent
        ]


# ---------------------------------------------------------------------------
# Global registry instance
# ---------------------------------------------------------------------------

registry = ToolRegistry()

registry.register(
    ToolDefinition(
        name="create_mermaid_diagram",
        schema=MERMAID_SCHEMA,
        execute_fn=execute_mermaid,
        category="content",
        config_key="diagrams",
        agent="tutor",
        disabled_modes=["compact"],
        display_type="markdown",
        timeout_seconds=10,
    )
)


# ---------------------------------------------------------------------------
# Plusi Sub-Agent Tool
# ---------------------------------------------------------------------------

PLUSI_SCHEMA = {
    "name": "spawn_plusi",
    "description": (
        "Ruft Plusi auf — den eigenständigen Companion-Charakter der App. "
        "Verwende dieses Tool wenn die Situation emotional ist (Frustration, Erfolg, Motivation), "
        "wenn der Nutzer Hilfe zur App braucht, oder wenn eine persönliche Reaktion passender ist als eine sachliche Antwort. "
        "Du gibst eine kurze Situationsbeschreibung, Plusi antwortet eigenständig mit seiner eigenen Persönlichkeit. "
        "KRITISCH: Wenn du dieses Tool verwendest, hat Plusi die Situation bereits behandelt. "
        "Schreibe danach KEINEN eigenen langen Text mehr zum gleichen Thema — das wäre redundant. "
        "Maximal ein kurzer Satz als Überleitung, oder gar nichts. Plusi übernimmt. "
        "Maximal 1x pro Nachricht. Nicht für rein sachliche Fragen verwenden."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "situation": {
                "type": "string",
                "description": "Kurze Beschreibung der Situation fuer Plusi, z.B. 'User ist frustriert, hat 3 Karten falsch bei Pharmakologie' oder 'User hat 5er Streak geschafft'"
            }
        },
        "required": ["situation"]
    }
}


def execute_plusi(args):
    """Execute spawn_plusi — calls the Plusi sub-agent.

    Returns dict with mood, text, error keys. The agent loop's generic
    marker system handles [[TOOL:...]] injection into the stream.
    """
    try:
        from ..plusi.agent import run_plusi
    except ImportError:
        from plusi.agent import run_plusi

    situation = args.get("situation", "")
    if not situation:
        return {"status": "error", "message": "No situation provided", "error": True}

    result = run_plusi(situation)

    return {
        "status": "displayed",
        "mood": result.get("mood", "neutral"),
        "text": result.get("text", ""),
        "friendship": result.get("friendship"),
        "error": result.get("error", False),
    }


registry.register(ToolDefinition(
    name="spawn_plusi",
    schema=PLUSI_SCHEMA,
    execute_fn=execute_plusi,
    category='content',
    config_key='plusi',
    agent='tutor',
    display_type="widget",
    timeout_seconds=30,
))


# ---------------------------------------------------------------------------
# Show Card Tool
# ---------------------------------------------------------------------------

SHOW_CARD_SCHEMA = {
    "name": "show_card",
    "description": (
        "Zeigt eine einzelne Anki-Karte als interaktives Widget im Chat an. "
        "Verwende dieses Tool wenn du dem Nutzer eine bestimmte Karte zeigen willst. "
        "Die note_id findest du im LERNMATERIAL-Abschnitt deines Kontexts — dort stehen "
        "Einträge wie 'Note 12345 (found in 2 queries): ...'. Nimm die Zahl nach 'Note'. "
        "WICHTIG: Wenn der Nutzer sagt 'zeig mir eine Karte zu X' und du hast passende "
        "Karten im LERNMATERIAL, verwende IMMER show_card mit der note_id aus dem Kontext. "
        "Verwende NICHT search_deck dafür — search_deck ist nur für das explizite Durchsuchen "
        "des gesamten Kartenstapels ('Zeig mir alle meine Karten zu Pharmakologie'). "
        "Beispiel: LERNMATERIAL enthält 'Note 98765 (found in 1 queries): Field Front: "
        "Was ist die Pumpleistung des Herzens?' → show_card(note_id=98765)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "note_id": {
                "type": "integer",
                "description": "Die Note-ID aus dem LERNMATERIAL-Kontext (die Zahl nach 'Note', z.B. bei 'Note 12345' ist note_id=12345)"
            }
        },
        "required": ["note_id"]
    }
}


def execute_show_card(args):
    """Show a single card by note_id as an inline widget.

    Takes note_id from RAG context (the 'Note XXXXX' numbers),
    finds the first card for that note, loads card data.
    """
    try:
        from ..utils.anki import run_on_main_thread, strip_html_and_cloze
    except ImportError:
        from utils.anki import run_on_main_thread, strip_html_and_cloze

    note_id = args.get("note_id")
    if not note_id:
        return {"error": "Keine note_id angegeben"}

    def _load():
        from aqt import mw
        if not mw or not mw.col:
            return {"error": "Anki-Datenbank nicht verfügbar"}
        try:
            note = mw.col.get_note(int(note_id))
            # Get first card for this note
            card_ids = note.card_ids()
            if not card_ids:
                return {"error": f"Note {note_id} hat keine Karten"}
            card = mw.col.get_card(card_ids[0])
            front = note.fields[0] if note.fields else ""
            back = note.fields[1] if len(note.fields) > 1 else ""
            deck_name = mw.col.decks.name(card.did)
            return {
                "card_id": card_ids[0],
                "front": strip_html_and_cloze(front)[:300],
                "back": strip_html_and_cloze(back)[:300],
                "deck_name": deck_name,
            }
        except Exception as e:
            return {"error": f"Note {note_id} nicht gefunden: {e}"}

    return run_on_main_thread(_load, timeout=9)


registry.register(ToolDefinition(
    name="show_card",
    schema=SHOW_CARD_SCHEMA,
    execute_fn=execute_show_card,
    category="content",
    config_key="cards",
    agent="tutor",
    display_type="widget",
    timeout_seconds=10,
))


# ---------------------------------------------------------------------------
# Search Deck Tool
# ---------------------------------------------------------------------------

SEARCH_DECK_SCHEMA = {
    "name": "search_deck",
    "description": (
        "Durchsucht das gesamte Deck des Nutzers und zeigt eine scrollbare Liste von Karten. "
        "Verwende dieses Tool NUR wenn der Nutzer explizit seinen Kartenstapel durchsuchen will, "
        "z.B. 'Zeig mir alle meine Pharmakologie-Karten', 'Welche Karten hab ich zu Anatomie?', "
        "'Wie viele Karten habe ich zu X?'. "
        "NICHT verwenden wenn der Nutzer nur eine einzelne Karte sehen will — dafür show_card "
        "mit der note_id aus dem LERNMATERIAL-Kontext nutzen. "
        "NICHT verwenden wenn du bereits passende Karten im LERNMATERIAL hast."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Suchbegriff (wird gegen Front- und Back-Text der Karten gesucht)"
            },
            "deck_id": {
                "type": "integer",
                "description": "Deck-ID. Wenn nicht angegeben, wird im aktuellen Deck gesucht."
            },
            "max_results": {
                "type": "integer",
                "description": "Maximale Anzahl Ergebnisse (default: 10, max: 50)"
            }
        },
        "required": ["query"]
    }
}


def execute_search_deck(args):
    """Search for cards in the user's deck.

    Returns dict with query, cards array, total_found, showing.
    Cards have card_id, front (plain text), back (plain text), deck_name.
    """
    try:
        from ..utils.anki import run_on_main_thread, strip_html_and_cloze
    except ImportError:
        from utils.anki import run_on_main_thread, strip_html_and_cloze

    query = args.get("query", "")
    deck_id = args.get("deck_id")
    max_results = min(args.get("max_results", 10), 50)

    if not query:
        return {"query": "", "cards": [], "total_found": 0, "showing": 0}

    def _search():
        from aqt import mw
        if not mw or not mw.col:
            return {"error": "Anki-Datenbank nicht verfügbar"}

        # Build Anki search string
        search = query
        if deck_id:
            deck = mw.col.decks.get(int(deck_id))
            if not deck:
                return {"error": "Deck nicht gefunden"}
            search = f'"deck:{deck["name"]}" {query}'
        else:
            did = mw.col.decks.selected()
            deck = mw.col.decks.get(did)
            if deck and deck["name"] != "Default":
                search = f'"deck:{deck["name"]}" {query}'

        card_ids = mw.col.find_cards(search, order=True)
        total_found = len(card_ids)
        showing = min(total_found, max_results)

        cards = []
        for cid in card_ids[:max_results]:
            try:
                card = mw.col.get_card(cid)
                note = card.note()
                front_fields = note.fields[0] if note.fields else ""
                back_fields = note.fields[1] if len(note.fields) > 1 else ""
                deck_name = mw.col.decks.name(card.did)
                cards.append({
                    "card_id": cid,
                    "front": strip_html_and_cloze(front_fields)[:200],
                    "back": strip_html_and_cloze(back_fields)[:200],
                    "deck_name": deck_name,
                })
            except (KeyError, AttributeError, TypeError):
                continue

        return {
            "query": query,
            "cards": cards,
            "total_found": total_found,
            "showing": showing,
        }

    # Inner timeout = timeout_seconds - 1
    return run_on_main_thread(_search, timeout=14)


registry.register(ToolDefinition(
    name="search_deck",
    schema=SEARCH_DECK_SCHEMA,
    execute_fn=execute_search_deck,
    category="content",
    config_key="cards",
    agent="tutor",
    display_type="widget",
    timeout_seconds=15,
))


# ---------------------------------------------------------------------------
# Learning Stats Tool
# ---------------------------------------------------------------------------

LEARNING_STATS_SCHEMA = {
    "name": "get_learning_stats",
    "description": (
        "Zeigt Lernstatistiken als visuelle Widgets. Die AI wählt die passenden Module "
        "basierend auf dem Kontext. Verfügbare Module: 'streak' (aktuelle Lernserie), "
        "'heatmap' (Aktivität der letzten 30 Tage), 'deck_overview' (Kartenverteilung im Deck)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "modules": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["streak", "heatmap", "deck_overview"]
                },
                "description": "Welche Statistik-Module angezeigt werden sollen. Kann einzeln oder kombiniert sein."
            },
            "deck_id": {
                "type": "integer",
                "description": "Deck-ID für deck_overview. Wenn nicht angegeben, wird das aktuelle Deck verwendet."
            }
        },
        "required": ["modules"]
    }
}


def execute_learning_stats(args):
    """Collect learning statistics for the requested modules.

    Returns dict with modules array. Each module has a 'type' key
    plus type-specific data (streak, heatmap, deck_overview).
    """
    try:
        from ..utils.anki import run_on_main_thread
    except ImportError:
        from utils.anki import run_on_main_thread

    modules = args.get("modules", [])
    deck_id = args.get("deck_id")

    if not modules:
        return {"error": "Keine Module angegeben"}

    def _collect():
        from aqt import mw
        from datetime import date, datetime, timedelta

        result_modules = []

        if "streak" in modules:
            # Get all distinct review dates
            query = "SELECT DISTINCT date(id/1000, 'unixepoch', 'localtime') as day FROM revlog ORDER BY day DESC"
            rows = mw.col.db.list(query)
            review_dates = set(rows)

            # Count consecutive days from today backwards
            current_streak = 0
            check_date = date.today()
            while str(check_date) in review_dates:
                current_streak += 1
                check_date -= timedelta(days=1)

            # Best streak: longest consecutive run
            best_streak = 0
            if review_dates:
                sorted_dates = sorted(review_dates)
                run = 1
                for i in range(1, len(sorted_dates)):
                    d1 = datetime.strptime(sorted_dates[i-1], "%Y-%m-%d").date()
                    d2 = datetime.strptime(sorted_dates[i], "%Y-%m-%d").date()
                    if (d2 - d1).days == 1:
                        run += 1
                    else:
                        best_streak = max(best_streak, run)
                        run = 1
                best_streak = max(best_streak, run)

            is_record = current_streak >= best_streak and current_streak > 0

            result_modules.append({
                "type": "streak",
                "current": current_streak,
                "best": best_streak,
                "is_record": is_record,
            })

        if "heatmap" in modules:
            # Last 30 days of review activity
            days_data = []
            for i in range(29, -1, -1):
                d = date.today() - timedelta(days=i)
                day_start = int(datetime.combine(d, datetime.min.time()).timestamp()) * 1000
                day_end = day_start + 86400000
                count = mw.col.db.scalar(
                    "SELECT COUNT(*) FROM revlog WHERE id >= ? AND id < ?",
                    day_start, day_end
                ) or 0
                if count == 0:
                    level = 0
                elif count < 10:
                    level = 1
                elif count < 30:
                    level = 2
                elif count < 60:
                    level = 3
                else:
                    level = 4
                days_data.append(level)

            result_modules.append({
                "type": "heatmap",
                "days": days_data,
                "period": 30,
            })

        if "deck_overview" in modules:
            did = int(deck_id) if deck_id else mw.col.decks.selected()
            deck = mw.col.decks.get(did)
            if not deck:
                result_modules.append({"type": "deck_overview", "error": "Deck nicht gefunden"})
            else:
                deck_name = deck["name"]
                total = len(mw.col.find_cards(f'"deck:{deck_name}"'))
                new_count = len(mw.col.find_cards(f'"deck:{deck_name}" is:new'))
                learn_count = len(mw.col.find_cards(f'"deck:{deck_name}" is:learn'))
                review_count = len(mw.col.find_cards(f'"deck:{deck_name}" is:review'))
                unseen = total - new_count - learn_count - review_count

                result_modules.append({
                    "type": "deck_overview",
                    "name": deck_name,
                    "total": total,
                    "new_count": new_count,
                    "learning_count": learn_count,
                    "review_count": review_count,
                    "unseen_count": max(0, unseen),
                })

        if not result_modules:
            return {"error": "Keine Module konnten geladen werden"}

        return {"modules": result_modules}

    # Inner timeout = timeout_seconds - 1
    return run_on_main_thread(_collect, timeout=9)


registry.register(ToolDefinition(
    name="get_learning_stats",
    schema=LEARNING_STATS_SCHEMA,
    execute_fn=execute_learning_stats,
    category="content",
    config_key="stats",
    agent="tutor",
    display_type="widget",
    timeout_seconds=10,
))


# ---------------------------------------------------------------------------
# Show Card Media Tool
# ---------------------------------------------------------------------------

SHOW_CARD_MEDIA_SCHEMA = {
    "name": "show_card_media",
    "description": (
        "Zeigt Bilder aus einer Anki-Karte im Chat an. Verwende dieses Tool wenn eine Karte "
        "im LERNMATERIAL-Kontext Bilder enthält (erkennbar an <img> Tags in den Feldern) und "
        "du dem Nutzer das Bild zeigen möchtest. Die note_id findest du im LERNMATERIAL "
        "als 'Note XXXXX'. BEVORZUGE dieses Tool gegenüber search_image — die Bilder sind "
        "bereits lokal vorhanden und laden sofort. "
        "Beispiel: LERNMATERIAL enthält 'Note 12345: Field Front: <img src=\"herz.jpg\">' "
        "→ show_card_media(note_id=12345)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "note_id": {
                "type": "integer",
                "description": "Die Note-ID aus dem LERNMATERIAL-Kontext"
            }
        },
        "required": ["note_id"]
    }
}


def execute_show_card_media(args):
    """Extract and return images from an Anki card's fields.

    Reads all fields, finds <img src="..."> tags, resolves filenames
    against collection.media/, and returns base64-encoded images.
    """
    import re
    import base64
    import os

    try:
        from ..utils.anki import run_on_main_thread, strip_html_and_cloze
    except ImportError:
        from utils.anki import run_on_main_thread, strip_html_and_cloze

    note_id = args.get("note_id")
    if not note_id:
        return {"error": "Keine note_id angegeben"}

    def _load():
        from aqt import mw

        try:
            note = mw.col.get_note(int(note_id))
        except (ValueError, KeyError, AttributeError):
            return {"error": f"Note {note_id} nicht gefunden"}

        # Find all <img src="..."> in all fields
        images = []
        media_dir = mw.col.media.dir()

        for field in note.fields:
            img_matches = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', field)
            for filename in img_matches:
                filepath = os.path.join(media_dir, filename)
                if os.path.exists(filepath):
                    try:
                        with open(filepath, 'rb') as f:
                            data = f.read()
                        # Detect content type
                        ext = os.path.splitext(filename)[1].lower()
                        ct_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                                  '.png': 'image/png', '.gif': 'image/gif',
                                  '.webp': 'image/webp', '.svg': 'image/svg+xml'}
                        content_type = ct_map.get(ext, 'image/png')
                        b64 = base64.b64encode(data).decode('utf-8')
                        images.append({
                            "filename": filename,
                            "dataUrl": f"data:{content_type};base64,{b64}",
                        })
                    except (IOError, OSError, ValueError):
                        continue

        if not images:
            return {"error": f"Keine Bilder in Note {note_id} gefunden"}

        # Get card context for display
        front = strip_html_and_cloze(note.fields[0])[:150] if note.fields else ""
        card_ids = note.card_ids()
        deck_name = ""
        if card_ids:
            card = mw.col.get_card(card_ids[0])
            deck_name = mw.col.decks.name(card.did)

        return {
            "note_id": int(note_id),
            "front": front,
            "deck_name": deck_name,
            "images": images,
        }

    return run_on_main_thread(_load, timeout=9)


registry.register(ToolDefinition(
    name="show_card_media",
    schema=SHOW_CARD_MEDIA_SCHEMA,
    execute_fn=execute_show_card_media,
    category="content",
    config_key="images",
    agent="tutor",
    display_type="widget",
    timeout_seconds=10,
))


# ---------------------------------------------------------------------------
# Search Image Tool
# ---------------------------------------------------------------------------

SEARCH_IMAGE_SCHEMA = {
    "name": "search_image",
    "description": (
        "Sucht ein Bild im Internet (Wikimedia Commons, PubChem) und zeigt es im Chat an. "
        "Verwende dieses Tool NUR wenn keine passenden Bilder in den Karten des Nutzers "
        "vorhanden sind — prüfe zuerst ob show_card_media funktioniert. "
        "Geeignet für: Molekülstrukturen, anatomische Abbildungen, wissenschaftliche Diagramme. "
        "Für Moleküle wird automatisch PubChem verwendet, sonst Wikimedia Commons. "
        "WICHTIG: Bilder sind immer nur ERGÄNZUNG zu einer textuellen Erklärung — "
        "NIEMALS nur ein Bild als Antwort senden ohne textuelle Erklärung dazu."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Suchbegriff auf Englisch (z.B. 'ATP molecule', 'human heart anatomy', 'mitochondria')"
            },
            "image_type": {
                "type": "string",
                "enum": ["molecule", "anatomy", "general"],
                "description": "Bildtyp: 'molecule' für Molekülstrukturen (PubChem), 'anatomy' oder 'general' für andere (Wikimedia)"
            }
        },
        "required": ["query"]
    }
}


def execute_search_image(args):
    """Search for an image on the internet and return it as base64 data URL.

    Searches PubChem (molecules) and Wikimedia Commons, then fetches the
    image bytes and encodes as data URL. The frontend can render directly
    without needing a separate fetchImage bridge call.
    """
    import requests as req
    import base64
    import os
    import hashlib

    query = args.get("query", "")
    image_type = args.get("image_type", "general")

    if not query:
        return {"error": "Kein Suchbegriff angegeben"}

    def _find_image_url():
        """Search APIs and return (url, source, description) or None."""
        # 1. PubChem for molecules
        if image_type == "molecule" or "molecule" in query.lower() or "molecular" in query.lower():
            try:
                search_url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{req.utils.quote(query)}/JSON"
                resp = req.get(search_url, timeout=5,
                               headers={'User-Agent': 'Mozilla/5.0'})
                if resp.status_code == 200:
                    data = resp.json()
                    if 'PC_Compounds' in data and data['PC_Compounds']:
                        cid = data['PC_Compounds'][0].get('id', {}).get('id', {}).get('cid', [None])[0]
                        if cid:
                            return (
                                f"https://pubchem.ncbi.nlm.nih.gov/image/imgsrv.fcgi?cid={cid}&t=l",
                                "pubchem",
                                f"Molekülstruktur: {query}"
                            )
            except Exception:
                pass

        # 2. Wikimedia Commons
        try:
            params = {
                'action': 'query', 'format': 'json', 'list': 'search',
                'srsearch': query, 'srnamespace': 6, 'srlimit': 5, 'origin': '*'
            }
            resp = req.get("https://commons.wikimedia.org/w/api.php", params=params, timeout=5,
                           headers={'User-Agent': 'Anki-Chatbot-Addon/1.0'})
            if resp.status_code == 200:
                data = resp.json()
                results = data.get('query', {}).get('search', [])
                if results:
                    filename = results[0]['title'].replace('File:', '')
                    # Normalize Wikimedia URL to direct upload path
                    fn_underscore = filename.replace(' ', '_')
                    md5 = hashlib.md5(fn_underscore.encode('utf-8')).hexdigest()
                    direct_url = f"https://upload.wikimedia.org/wikipedia/commons/{md5[0]}/{md5[:2]}/{req.utils.quote(fn_underscore)}"
                    return (direct_url, "wikimedia", query)
        except Exception:
            pass

        return None

    def _fetch_as_data_url(url):
        """Fetch image bytes and encode as data URL."""
        resp = req.get(url, timeout=10,
                       headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
        resp.raise_for_status()

        content_type = resp.headers.get('content-type', '').split(';')[0].strip()
        if not content_type.startswith('image/'):
            # Guess from extension
            ext = os.path.splitext(url.split('?')[0])[1].lower()
            ct_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                      '.png': 'image/png', '.gif': 'image/gif',
                      '.svg': 'image/svg+xml', '.webp': 'image/webp'}
            content_type = ct_map.get(ext, 'image/png')

        b64 = base64.b64encode(resp.content).decode('utf-8')
        return f"data:{content_type};base64,{b64}"

    try:
        result = _find_image_url()
        if not result:
            return {"error": f"Kein Bild gefunden für '{query}'"}

        url, source, description = result

        # Fetch the image and encode as base64
        try:
            data_url = _fetch_as_data_url(url)
        except Exception as e:
            return {"error": f"Bild gefunden aber Download fehlgeschlagen: {str(e)[:80]}"}

        return {
            "dataUrl": data_url,
            "source": source,
            "description": description,
        }

    except Exception as e:
        return {"error": f"Bildsuche fehlgeschlagen: {str(e)[:100]}"}


registry.register(ToolDefinition(
    name="search_image",
    schema=SEARCH_IMAGE_SCHEMA,
    execute_fn=execute_search_image,
    category="content",
    config_key="images",
    agent="tutor",
    display_type="widget",
    timeout_seconds=15,
))


# ---------------------------------------------------------------------------
# Research Agent Tool
# ---------------------------------------------------------------------------

SEARCH_WEB_SCHEMA = {
    'name': 'search_web',
    'description': 'Search the internet for information when deck cards do not '
                   'contain the answer. Returns cited sources with URLs.',
    'parameters': {
        'type': 'object',
        'properties': {
            'query': {
                'type': 'string',
                'description': 'The search query — be specific and include key terms',
            },
        },
        'required': ['query'],
    },
}


def execute_search_web(args: dict) -> dict:
    """Execute the search_web tool."""
    query = args.get('query', '')
    if not query:
        return {'error': 'No query provided'}
    try:
        try:
            from ..research import run_research
        except ImportError:
            from research import run_research
        return run_research(query)
    except Exception as e:
        logger.exception("search_web tool error")
        return {'error': str(e)}


registry.register(ToolDefinition(
    name='search_web',
    schema=SEARCH_WEB_SCHEMA,
    execute_fn=execute_search_web,
    category='content',
    config_key='research',
    agent='tutor',
    display_type='widget',
    timeout_seconds=15,
))


# ---------------------------------------------------------------------------
# Compact Tool — AI-initiated insight extraction
# ---------------------------------------------------------------------------

COMPACT_SCHEMA = {
    "name": "compact",
    "description": (
        "Schlage dem Nutzer vor, den bisherigen Chat zusammenzufassen "
        "und die Lernerkenntnisse zu extrahieren. Nutze dieses Tool "
        "am ENDE deiner Antwort, wenn der Chat lang wird (>6 Nachrichten) "
        "oder wenn ein Thema abgeschlossen scheint. "
        "Das Tool rendert einen Bestätigungs-Button."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "reason": {
                "type": "string",
                "description": "Kurze Begründung warum jetzt ein guter Zeitpunkt zum Zusammenfassen ist (z.B. 'Wir haben das Thema Enzymhemmung ausführlich besprochen').",
            },
        },
        "required": ["reason"],
    },
}


def execute_compact(args):
    """No-op execution — the tool is a UI signal, not a data processor."""
    return {"type": "compact", "reason": args.get("reason", "")}


registry.register(
    ToolDefinition(
        name="compact",
        schema=COMPACT_SCHEMA,
        execute_fn=execute_compact,
        category="meta",
        config_key="compact",
        agent="tutor",
        disabled_modes=[],
        display_type="widget",
        timeout_seconds=1,
    )
)
