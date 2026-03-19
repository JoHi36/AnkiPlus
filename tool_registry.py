"""
tool_registry.py — Central registry for AI tool definitions.

Tools are registered as ToolDefinition instances and can be filtered
by agent, config toggles, and mode restrictions when generating
function declarations for AI providers.
"""

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


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
        from .plusi_agent import run_plusi
        from .plusi_storage import get_memory
    except ImportError:
        from plusi_agent import run_plusi
        from plusi_storage import get_memory

    situation = args.get("situation", "")
    if not situation:
        return {"status": "error", "message": "No situation provided", "error": True}

    result = run_plusi(situation)

    return {
        "status": "displayed",
        "mood": result.get("mood", "neutral"),
        "text": result.get("text", ""),
        "error": result.get("error", False),
        "relationship_level": get_memory('relationship', 'level', 1),
        "interaction_count": get_memory('relationship', 'interactions', 0),
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
# Search Deck Tool
# ---------------------------------------------------------------------------

SEARCH_DECK_SCHEMA = {
    "name": "search_deck",
    "description": (
        "Sucht Karten im Deck des Nutzers. Verwende dieses Tool wenn der Nutzer "
        "nach bestimmten Karten fragt, Karten zu einem Thema sehen möchte, oder "
        "du relevante Karten zeigen willst. Gibt eine Liste mit Karten-Vorschauen zurück."
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
        from .anki_utils import run_on_main_thread, strip_html_and_cloze
    except ImportError:
        from anki_utils import run_on_main_thread, strip_html_and_cloze

    query = args.get("query", "")
    deck_id = args.get("deck_id")
    max_results = min(args.get("max_results", 10), 50)

    if not query:
        return {"query": "", "cards": [], "total_found": 0, "showing": 0}

    def _search():
        from aqt import mw

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
            except Exception:
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
    config_key=None,
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
        from .anki_utils import run_on_main_thread
    except ImportError:
        from anki_utils import run_on_main_thread

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
    config_key=None,
    agent="tutor",
    display_type="widget",
    timeout_seconds=10,
))
