"""
Agent Memory — persistent key-value storage per agent.

Every agent has private memory that survives app restarts.
Memory is stored in the card_sessions SQLite database.

Usage:
    memory = AgentMemory('tutor')
    memory.set('last_approach', 'analogy')
    approach = memory.get('last_approach')  # 'analogy'
    memory.get('missing_key', 'default')    # 'default'
"""

import json
import time

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


class AgentMemory:
    """Per-agent persistent key-value memory."""

    def __init__(self, agent_name):
        self.agent_name = agent_name
        self._ensure_table()

    def _get_db(self):
        try:
            from ..storage.card_sessions import _get_db
        except ImportError:
            from storage.card_sessions import _get_db
        return _get_db()

    def _ensure_table(self):
        """Create the agent_memory table if it doesn't exist."""
        try:
            db = self._get_db()
            db.execute("""
                CREATE TABLE IF NOT EXISTS agent_memory (
                    agent_name  TEXT NOT NULL,
                    key         TEXT NOT NULL,
                    value       TEXT NOT NULL,
                    updated_at  INTEGER NOT NULL,
                    PRIMARY KEY (agent_name, key)
                )
            """)
            db.commit()
        except Exception as e:
            logger.warning("Could not create agent_memory table: %s", e)

    def get(self, key, default=None):
        """Get a value from agent memory."""
        try:
            db = self._get_db()
            row = db.execute(
                "SELECT value FROM agent_memory WHERE agent_name = ? AND key = ?",
                (self.agent_name, key)
            ).fetchone()
            if row:
                return json.loads(row[0])
            return default
        except Exception as e:
            logger.warning("AgentMemory.get error (%s/%s): %s", self.agent_name, key, e)
            return default

    def set(self, key, value):
        """Set a value in agent memory."""
        try:
            db = self._get_db()
            db.execute("""
                INSERT OR REPLACE INTO agent_memory (agent_name, key, value, updated_at)
                VALUES (?, ?, ?, ?)
            """, (self.agent_name, key, json.dumps(value), int(time.time() * 1000)))
            db.commit()
        except Exception as e:
            logger.warning("AgentMemory.set error (%s/%s): %s", self.agent_name, key, e)

    def delete(self, key):
        """Delete a key from agent memory."""
        try:
            db = self._get_db()
            db.execute(
                "DELETE FROM agent_memory WHERE agent_name = ? AND key = ?",
                (self.agent_name, key)
            )
            db.commit()
        except Exception as e:
            logger.warning("AgentMemory.delete error (%s/%s): %s", self.agent_name, key, e)

    def get_all(self):
        """Get all key-value pairs for this agent."""
        try:
            db = self._get_db()
            rows = db.execute(
                "SELECT key, value FROM agent_memory WHERE agent_name = ?",
                (self.agent_name,)
            ).fetchall()
            return {row[0]: json.loads(row[1]) for row in rows}
        except Exception as e:
            logger.warning("AgentMemory.get_all error (%s): %s", self.agent_name, e)
            return {}

    def clear(self):
        """Clear all memory for this agent."""
        try:
            db = self._get_db()
            db.execute(
                "DELETE FROM agent_memory WHERE agent_name = ?",
                (self.agent_name,)
            )
            db.commit()
        except Exception as e:
            logger.warning("AgentMemory.clear error (%s): %s", self.agent_name, e)
