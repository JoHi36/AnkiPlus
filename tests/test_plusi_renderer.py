"""Tests for Plusi character system mood data and renderer."""
import json
import os
import re
import unittest

RENDERER_PATH = os.path.join(os.path.dirname(__file__), '..', 'shared', 'plusi-renderer.js')

EXPECTED_MOODS = {
    'neutral', 'curious', 'thinking', 'annoyed', 'empathy',
    'happy', 'excited', 'surprised', 'flustered', 'proud', 'sleepy',
}
EXPECTED_ACTIVITIES = {'sleeping', 'reflecting', 'reading'}
ALL_STATES = EXPECTED_MOODS | EXPECTED_ACTIVITIES

REQUIRED_BODY_MOVES = {
    'float', 'hop', 'tilt', 'wiggle', 'droop', 'bounce',
    'spin', 'squish', 'pop', 'sway', 'puff-up', 'peek',
}


class TestPlusiRendererContent(unittest.TestCase):
    """Validate that plusi-renderer.js exists, is an IIFE, and contains
    all required mood definitions and body moves."""

    @classmethod
    def setUpClass(cls):
        with open(RENDERER_PATH, 'r', encoding='utf-8') as f:
            cls.js = f.read()

    def test_file_is_iife(self):
        self.assertTrue(self.js.strip().startswith('(function'),
                        "Renderer must be an IIFE")

    def test_exposes_create_plusi(self):
        self.assertIn('window.createPlusi', self.js)

    def test_exposes_get_plusi_color(self):
        self.assertIn('window.getPlusiColor', self.js)

    def test_all_moods_present(self):
        for mood in ALL_STATES:
            self.assertIn(f"'{mood}'", self.js,
                          f"Mood '{mood}' not found in renderer")

    def test_blush_removed(self):
        self.assertNotIn("'blush'", self.js,
                         "blush should be replaced by flustered")

    def test_all_body_moves_defined(self):
        for move in REQUIRED_BODY_MOVES:
            self.assertIn(move, self.js,
                          f"Body move '{move}' not in renderer")

    def test_unknown_mood_falls_back_to_neutral(self):
        # Verify fallback pattern exists
        self.assertIn('MOODS.neutral', self.js,
                      "Renderer must fall back to MOODS.neutral for unknown moods")


if __name__ == '__main__':
    unittest.main()
