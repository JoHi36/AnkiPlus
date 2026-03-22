"""Memory layer — persistent user profile and agent state.

SharedMemory: facts about the user (study field, semester, strengths, weaknesses).
All agents read, Router writes (async, post-response).

AgentState: per-agent private state (diary, mood, etc.).
Only the owning agent reads/writes. Currently only Plusi has meaningful state.
"""

import json
import os
import re
from dataclasses import dataclass, field, asdict
from typing import Any, List

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


# ---------------------------------------------------------------------------
# Rule-based memory extraction (post-response)
# ---------------------------------------------------------------------------

@dataclass
class MemoryUpdate:
    """A single memory update extracted from conversation."""
    section: str   # 'profile', 'learning_patterns', 'preferences'
    key: str       # Field name
    value: Any     # New value


def extract_memory_signals(user_message: str, agent_output: str = '',
                           session_context: dict = None) -> List[MemoryUpdate]:
    """Extract memory-worthy signals from a user message using pattern matching.

    This is intentionally simple -- 5-10 rules that catch obvious signals.
    Memory builds up slowly over many sessions.

    Args:
        user_message: The user's original message
        agent_output: The agent's response (for future use)
        session_context: Session context dict

    Returns:
        List of MemoryUpdate to apply
    """
    updates: List[MemoryUpdate] = []
    msg = user_message.lower().strip()

    # Rule 1: Study field detection
    # "ich studiere Medizin" / "ich bin Medizinstudent" / "Studiengang: Jura"
    _GENERIC_WORDS = frozenset([
        'gerade', 'jetzt', 'noch', 'auch', 'das', 'die', 'der',
        'ein', 'eine', 'mal', 'mir', 'mich', 'hier', 'dort',
    ])
    study_patterns = [
        (r'(?:ich\s+)?studier(?:e|t)\s+(\w+)', 1),
        (r'(\w+)student(?:in)?', 1),
        (r'studiengang[:\s]+(\w+)', 1),
        (r'ich\s+(?:mache?|bin\s+in)\s+(?:der\s+)?(\w+)', 1),
    ]
    for pattern, group in study_patterns:
        match = re.search(pattern, msg, re.IGNORECASE)
        if match:
            field_name = match.group(group).capitalize()
            if field_name.lower() not in _GENERIC_WORDS:
                updates.append(MemoryUpdate('profile', 'study_field', field_name))
                break

    # Rule 2: Semester detection
    # "3. Semester" / "im 5. Semester" / "Semester 3"
    semester_match = re.search(
        r'(?:im\s+)?(\d+)\.\s*semester|semester\s*(\d+)', msg, re.IGNORECASE
    )
    if semester_match:
        sem = semester_match.group(1) or semester_match.group(2)
        updates.append(MemoryUpdate('profile', 'semester', f'{sem}. Semester'))

    # Rule 3: University detection
    # "Uni Heidelberg" / "an der TU München" / "Universität Zürich"
    uni_match = re.search(
        r'(?:uni(?:versität)?|th|tu|fh|hochschule)\s+(\w+(?:\s+\w+)?)',
        msg, re.IGNORECASE,
    )
    if uni_match:
        uni = uni_match.group(0).strip()
        uni = ' '.join(w.capitalize() for w in uni.split())
        updates.append(MemoryUpdate('profile', 'university', uni))

    # Rule 4: Exam goal detection
    # "ich lerne für das Physikum" / "Prüfung im August" / "Examen in 3 Monaten"
    exam_match = re.search(
        r'(?:lerne?\s+für\s+(?:das?\s+)?|vorbereitung\s+auf\s+(?:das?\s+)?)'
        r'(physikum|staatsexamen|examen|klausur|prüfung)'
        r'(?:\s+(?:im|in|am)\s+(\w+))?',
        msg, re.IGNORECASE,
    )
    if exam_match:
        exam = exam_match.group(1).capitalize()
        when = exam_match.group(2)
        goal = f'{exam} {when.capitalize()}' if when else exam
        updates.append(MemoryUpdate('profile', 'exam_goal', goal))

    # Rule 5: Language preference
    # Detected by checking for German- or English-specific high-frequency words.
    german_indicators = sum(
        1 for w in ['ich', 'und', 'der', 'die', 'das', 'ist', 'nicht']
        if w in msg.split()
    )
    if german_indicators >= 3:
        updates.append(MemoryUpdate('preferences', 'language', 'de'))
    elif not any(c in msg for c in 'äöüß') and msg.isascii():
        english_indicators = sum(
            1 for w in ['the', 'and', 'is', 'are', 'what', 'how']
            if w in msg.split()
        )
        if english_indicators >= 3:
            updates.append(MemoryUpdate('preferences', 'language', 'en'))

    return updates


def apply_memory_updates(updates: List[MemoryUpdate]):
    """Apply a list of memory updates."""
    if not updates:
        return
    for u in updates:
        update_memory_field(u.section, u.key, u.value)
    logger.info("Applied %d memory updates", len(updates))
