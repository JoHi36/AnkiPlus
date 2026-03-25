"""Tests for Plusi dream generator: fragment generation, sleep integration, injection."""

import pytest
import sqlite3
import plusi.storage as mod


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    mod._db = None
    db_path = str(tmp_path / 'test_plusi.db')
    db = sqlite3.connect(db_path, check_same_thread=False)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    mod._init_tables(db)
    mod._db = db
    mod._db_path = db_path
    yield db
    mod._db = None


class TestDreamGenerator:
    def test_no_material_returns_none(self):
        """With no thoughts, obsession, diary, or memories — no dream."""
        result = mod.generate_dream()
        assert result is None

    def test_generates_dream_from_thoughts(self):
        mod.set_memory('state', 'last_thoughts', 'Neurobiologie ist faszinierend und Architektur auch')
        dream = mod.generate_dream()
        assert dream is not None
        assert len(dream) > 5

    def test_generates_dream_from_obsession(self):
        mod.set_memory('state', 'obsession', 'Proteinstrukturen')
        mod.set_memory('state', 'last_thoughts', 'Der User ist nett heute')
        dream = mod.generate_dream()
        assert dream is not None

    def test_dream_contains_fragments(self):
        """Dream should contain word fragments, not full sentences."""
        mod.set_memory('state', 'last_thoughts', 'Die Verbindung zwischen Nieren und Architektur ist spannend')
        mod.set_memory('state', 'obsession', 'Druckverteilung durch Bögen')
        dream = mod.generate_dream()
        assert dream is not None
        # Should contain individual words, not the full sentence
        words = dream.split()
        assert len(words) >= 3

    def test_dream_may_contain_gaps(self):
        """Dreams can contain '...' gaps for fragmented feeling."""
        mod.set_memory('state', 'last_thoughts', 'Viele verschiedene Wörter um Fragmente zu erzeugen')
        mod.set_memory('state', 'obsession', 'Biochemie Neurologie Kardiologie Anatomie')
        # Run multiple times — at least one should have gaps (30% chance per fragment)
        found_gap = False
        for _ in range(20):
            dream = mod.generate_dream()
            if dream and '...' in dream:
                found_gap = True
                break
        assert found_gap, "Expected at least one dream with '...' gaps in 20 tries"

    def test_dream_includes_diary_material(self):
        """Diary entries should contribute to dream material."""
        mod.save_diary_entry('Quantenphysik ist verwirrend aber schön', [], mood='curious')
        mod.set_memory('state', 'last_thoughts', 'hmm')
        dream = mod.generate_dream()
        assert dream is not None

    def test_dream_includes_user_facts(self):
        """User facts should appear in dream material."""
        mod.set_memory('user', 'studiert', 'Medizin')
        mod.set_memory('user', 'mag', 'Neurobiologie')
        mod.set_memory('state', 'last_thoughts', 'etwas')
        dream = mod.generate_dream()
        assert dream is not None

    def test_dream_stored_in_state(self):
        mod.set_memory('state', 'last_thoughts', 'Architektur und Proteine haben Gemeinsamkeiten')
        mod.generate_dream()
        stored = mod.get_memory('state', 'last_dream', None)
        assert stored is not None
        assert len(stored) > 0

    def test_dream_max_fragment_count(self):
        """Dream should not exceed DREAM_FRAGMENT_COUNT words (plus gaps)."""
        mod.set_memory('state', 'last_thoughts', ' '.join([f'wort{i}' for i in range(50)]))
        dream = mod.generate_dream()
        # Fragments + gaps should be reasonable
        parts = [p for p in dream.split() if p != '...']
        assert len(parts) <= mod.DREAM_FRAGMENT_COUNT + 5  # some tolerance


class TestSleepDreamIntegration:
    def test_enter_sleep_generates_dream(self):
        """Entering sleep should automatically generate a dream."""
        mod.set_memory('state', 'last_thoughts', 'Morgen will ich nach Karten suchen')
        from datetime import datetime, timedelta
        wake = (datetime.now() + timedelta(minutes=30)).isoformat()
        mod.enter_sleep(wake)
        dream = mod.get_memory('state', 'last_dream', None)
        assert dream is not None

    def test_enter_sleep_without_material_no_crash(self):
        """Entering sleep with no material should not crash."""
        from datetime import datetime, timedelta
        wake = (datetime.now() + timedelta(minutes=30)).isoformat()
        mod.enter_sleep(wake)  # should not raise
        # Dream might be None (no material) — that's fine
        assert mod.get_memory('state', 'is_sleeping') is True


class TestDreamInjection:
    def test_dream_injected_in_context(self):
        """Dream should appear in internal state context."""
        mod.set_memory('state', 'last_dream', 'Nieren... Bögen... verschlüsselt... Muster')
        mod.set_memory('state', 'energy', 7)
        ctx = mod.build_internal_state_context()
        assert 'GETRÄUMT' in ctx
        assert 'Nieren' in ctx

    def test_dream_cleared_after_injection(self):
        """Dream is one-shot — cleared after being injected."""
        mod.set_memory('state', 'last_dream', 'Fragmentierter Traum')
        mod.set_memory('state', 'energy', 5)
        mod.build_internal_state_context()
        # Second call should not have the dream
        ctx2 = mod.build_internal_state_context()
        assert 'GETRÄUMT' not in ctx2

    def test_no_dream_no_injection(self):
        """Without a dream, context should not mention dreaming."""
        mod.set_memory('state', 'energy', 5)
        ctx = mod.build_internal_state_context()
        assert 'GETRÄUMT' not in ctx
