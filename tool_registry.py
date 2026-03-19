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
