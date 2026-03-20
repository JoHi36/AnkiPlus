"""
Pytest fixtures for AnkiPlus tests.
All aqt mocking is handled by run_tests.py.
"""

import sys
import os
import pytest

# Add project root to sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


@pytest.fixture
def tmp_db(tmp_path):
    """Provides a temporary SQLite database path for storage tests."""
    return str(tmp_path / "test_sessions.db")
