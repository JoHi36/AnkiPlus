"""Memory layer — persistent user profile and agent state.

SharedMemory: facts about the user (study field, semester, strengths, weaknesses).
All agents read, Router writes (async, post-response).

AgentState: per-agent private state (diary, mood, etc.).
Only the owning agent reads/writes. Currently only Plusi has meaningful state.
"""

import json
import os
from dataclasses import dataclass, field, asdict
from typing import Any

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


@dataclass
class SharedMemory:
    """User profile built up over time. All agents read this."""
    profile: dict = field(default_factory=dict)
    # Expected keys: study_field, semester, university, language, exam_goal

    learning_patterns: dict = field(default_factory=dict)
    # Expected keys: strengths (list), weaknesses (list), preferred_style

    preferences: dict = field(default_factory=dict)
    # Expected keys: theme, response_style, language

    updated_at: str = ''

    def to_dict(self) -> dict:
        return asdict(self)

    def to_context_string(self) -> str:
        """Build a natural language summary for agent context injection.

        Returns a compact one-liner like:
        "User-Profil: Studiert: Medizin | Semester: 3 | Schwächen: Biochemie"
        """
        parts = []
        p = self.profile
        if p.get('study_field'):
            parts.append(f"Studiert: {p['study_field']}")
        if p.get('semester'):
            parts.append(f"Semester: {p['semester']}")
        if p.get('university'):
            parts.append(f"Uni: {p['university']}")
        if p.get('exam_goal'):
            parts.append(f"Ziel: {p['exam_goal']}")

        lp = self.learning_patterns
        if lp.get('strengths'):
            parts.append(f"Stärken: {', '.join(lp['strengths'])}")
        if lp.get('weaknesses'):
            parts.append(f"Schwächen: {', '.join(lp['weaknesses'])}")
        if lp.get('preferred_style'):
            parts.append(f"Bevorzugter Stil: {lp['preferred_style']}")

        if not parts:
            return ''
        return 'User-Profil: ' + ' | '.join(parts)


@dataclass
class AgentState:
    """Per-agent private state. Only the owning agent reads/writes."""
    agent_name: str = ''
    data: dict = field(default_factory=dict)
    updated_at: str = ''

    def to_dict(self) -> dict:
        return asdict(self)


def _get_memory_dir() -> str:
    """Get the directory for memory files.

    Uses Anki's addon user_files directory if available,
    otherwise falls back to the addon directory.
    """
    try:
        from aqt import mw
        if mw and mw.addonManager:
            addon_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            user_files = os.path.join(addon_dir, 'user_files')
            os.makedirs(user_files, exist_ok=True)
            return user_files
    except (ImportError, Exception):
        pass

    # Fallback: addon directory itself
    addon_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return addon_dir


def load_shared_memory() -> SharedMemory:
    """Load shared memory from disk. Returns empty memory if file doesn't exist."""
    path = os.path.join(_get_memory_dir(), 'shared_memory.json')
    try:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return SharedMemory(
                profile=data.get('profile', {}),
                learning_patterns=data.get('learning_patterns', {}),
                preferences=data.get('preferences', {}),
                updated_at=data.get('updated_at', ''),
            )
    except Exception as e:
        logger.warning("Failed to load shared memory: %s", e)
    return SharedMemory()


def save_shared_memory(memory: SharedMemory):
    """Save shared memory to disk."""
    from datetime import datetime, timezone
    memory.updated_at = datetime.now(timezone.utc).isoformat()
    path = os.path.join(_get_memory_dir(), 'shared_memory.json')
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(memory.to_dict(), f, ensure_ascii=False, indent=2)
        logger.debug("Shared memory saved to %s", path)
    except Exception as e:
        logger.warning("Failed to save shared memory: %s", e)


def update_memory_field(section: str, key: str, value: Any):
    """Atomic update of a single memory field.

    Args:
        section: 'profile', 'learning_patterns', or 'preferences'
        key: Field name within the section
        value: New value
    """
    memory = load_shared_memory()
    section_dict = getattr(memory, section, None)
    if section_dict is None or not isinstance(section_dict, dict):
        logger.warning("Invalid memory section: %s", section)
        return

    old_value = section_dict.get(key)
    if old_value == value:
        return  # No change

    section_dict[key] = value
    save_shared_memory(memory)
    logger.info("Memory updated: %s.%s = %s", section, key,
                str(value)[:50] if value else 'None')


def load_agent_state(agent_name: str) -> AgentState:
    """Load private state for a specific agent."""
    # Special case: Plusi has its own storage system (plusi/storage.py)
    if agent_name == 'plusi':
        return _load_plusi_state()

    path = os.path.join(_get_memory_dir(), f'agent_state_{agent_name}.json')
    try:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return AgentState(
                agent_name=agent_name,
                data=data.get('data', {}),
                updated_at=data.get('updated_at', ''),
            )
    except Exception as e:
        logger.warning("Failed to load agent state for %s: %s", agent_name, e)
    return AgentState(agent_name=agent_name)


def save_agent_state(state: AgentState):
    """Save private state for a specific agent."""
    # Plusi uses its own storage system — writes go through plusi/storage.py
    if state.agent_name == 'plusi':
        return

    from datetime import datetime, timezone
    state.updated_at = datetime.now(timezone.utc).isoformat()
    path = os.path.join(_get_memory_dir(), f'agent_state_{state.agent_name}.json')
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(state.to_dict(), f, ensure_ascii=False, indent=2)
        logger.debug("Agent state saved for %s", state.agent_name)
    except Exception as e:
        logger.warning("Failed to save agent state for %s: %s", state.agent_name, e)


def _load_plusi_state() -> AgentState:
    """Load Plusi state from its existing storage system.

    Plusi stores state in a SQLite database (plusi/plusi.db) using
    a key-value store with categories. We read the relevant categories
    and bundle them into an AgentState wrapper.
    """
    try:
        try:
            from ..plusi.storage import get_category
        except ImportError:
            from plusi.storage import get_category

        data = {
            'self': get_category('self'),
            'user': get_category('user'),
            'state': get_category('state'),
            'moments': get_category('moments'),
        }
        # Strip empty categories
        data = {k: v for k, v in data.items() if v}

        return AgentState(
            agent_name='plusi',
            data=data,
        )
    except Exception as e:
        logger.debug("Could not load Plusi state: %s", e)
        return AgentState(agent_name='plusi')
