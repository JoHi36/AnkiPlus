"""Tests for storage/kg_client.py — HTTP KG query client."""

import json
import os
import sys
import time
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestKgClient(unittest.TestCase):
    """Test the KG HTTP client with mocked responses."""

    def setUp(self):
        import storage.kg_client as mod
        mod._cache = {}  # Clear cache between tests

        # Pre-patch the lazy imports
        self.mock_auth = MagicMock()
        self.mock_auth.get_auth_headers.return_value = {"Authorization": "Bearer test"}

        self.mock_config = MagicMock()
        self.mock_config.get_backend_url.return_value = "https://test.cloudfunctions.net"

    def _patch_imports(self):
        return patch.dict("sys.modules", {
            "ai.auth": self.mock_auth,
            "config": self.mock_config,
        })

    def test_vector_search_cards(self):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "result": [
                {"content_hash": "abc", "text": "test card", "score": 0.95},
                {"content_hash": "def", "text": "other card", "score": 0.85},
            ]
        }

        import storage.kg_client as mod
        with self._patch_imports(), \
             patch.object(mod.requests, "post", return_value=mock_response):
            results = mod.vector_search_cards([0.1] * 10, top_k=5)

        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["content_hash"], "abc")

    def test_get_term_expansions_cached(self):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "result": [{"term": "Mitose", "weight": 15}]
        }

        import storage.kg_client as mod
        with self._patch_imports(), \
             patch.object(mod.requests, "post", return_value=mock_response) as mock_post:
            # First call — hits network
            r1 = mod.get_term_expansions("Zellzyklus")
            self.assertEqual(len(r1), 1)
            self.assertEqual(mock_post.call_count, 1)

            # Second call — cached
            r2 = mod.get_term_expansions("Zellzyklus")
            self.assertEqual(r2, r1)
            self.assertEqual(mock_post.call_count, 1)  # No new call

    def test_graceful_fallback_on_error(self):
        import storage.kg_client as mod
        with self._patch_imports(), \
             patch.object(mod.requests, "post", side_effect=Exception("offline")):
            result = mod.get_related_cards("abc123")
        self.assertEqual(result, [])

    def test_no_backend_url(self):
        self.mock_config.get_backend_url.return_value = ""
        import storage.kg_client as mod
        with self._patch_imports():
            result = mod.get_card_terms("abc123")
        self.assertEqual(result, [])

    def test_clear_cache(self):
        import storage.kg_client as mod
        mod._cache = {"key": (time.time(), [{"test": True}])}
        mod.clear_cache()
        self.assertEqual(mod._cache, {})


if __name__ == "__main__":
    unittest.main()
