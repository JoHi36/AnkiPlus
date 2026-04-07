"""Tests for storage/kg_sync.py — event drain function."""

import json
import os
import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestKgSync(unittest.TestCase):
    """Test the drain_events function with mocked HTTP and imports."""

    def _make_drain(self, pending, backend_url="https://test.cloudfunctions.net",
                    post_response=None, post_side_effect=None):
        """Build drain_events with all dependencies mocked."""
        import storage.kg_sync as mod

        mock_mark = MagicMock()
        mock_delete = MagicMock()

        # Patch the lazy imports inside drain_events
        mock_kg_events = MagicMock()
        mock_kg_events.get_pending.return_value = pending
        mock_kg_events.mark_synced = mock_mark
        mock_kg_events.delete_synced = mock_delete

        mock_auth = MagicMock()
        mock_auth.get_auth_headers.return_value = {"Authorization": "Bearer test"}

        mock_config = MagicMock()
        mock_config.get_backend_url.return_value = backend_url

        mock_requests = MagicMock()
        if post_side_effect:
            mock_requests.post.side_effect = post_side_effect
        elif post_response:
            mock_requests.post.return_value = post_response
        else:
            resp = MagicMock()
            resp.ok = True
            resp.json.return_value = {"accepted": len(pending)}
            mock_requests.post.return_value = resp

        # Replace module-level imports
        mod.requests = mock_requests

        return mod, mock_kg_events, mock_auth, mock_config, mock_mark, mock_delete, mock_requests

    def test_drain_success(self):
        pending = [
            {"id": "a", "event_type": "card_embedded", "payload": {"x": 1}},
            {"id": "b", "event_type": "card_reviewed", "payload": {"y": 2}},
        ]

        mod, mock_kg, mock_auth, mock_cfg, mock_mark, mock_delete, mock_req = \
            self._make_drain(pending)

        with patch.dict("sys.modules", {
            "storage.kg_events": mock_kg,
            "ai.auth": mock_auth,
            "config": mock_cfg,
        }):
            result = mod.drain_events()

        mock_req.post.assert_called_once()
        body = mock_req.post.call_args.kwargs.get("json") or mock_req.post.call_args[1].get("json")
        self.assertEqual(len(body["events"]), 2)
        self.assertEqual(body["events"][0]["type"], "card_embedded")

    def test_drain_empty(self):
        mod, mock_kg, mock_auth, mock_cfg, mock_mark, mock_delete, mock_req = \
            self._make_drain([])

        with patch.dict("sys.modules", {
            "storage.kg_events": mock_kg,
            "ai.auth": mock_auth,
            "config": mock_cfg,
        }):
            result = mod.drain_events()

        self.assertEqual(result, 0)
        mock_req.post.assert_not_called()

    def test_drain_network_error(self):
        pending = [{"id": "a", "event_type": "test", "payload": {}}]

        mod, mock_kg, mock_auth, mock_cfg, mock_mark, mock_delete, mock_req = \
            self._make_drain(pending, post_side_effect=ConnectionError("offline"))

        with patch.dict("sys.modules", {
            "storage.kg_events": mock_kg,
            "ai.auth": mock_auth,
            "config": mock_cfg,
        }):
            result = mod.drain_events()

        self.assertEqual(result, 0)

    def test_drain_no_backend_url(self):
        pending = [{"id": "a", "event_type": "test", "payload": {}}]

        mod, mock_kg, mock_auth, mock_cfg, mock_mark, mock_delete, mock_req = \
            self._make_drain(pending, backend_url="")

        with patch.dict("sys.modules", {
            "storage.kg_events": mock_kg,
            "ai.auth": mock_auth,
            "config": mock_cfg,
        }):
            result = mod.drain_events()

        self.assertEqual(result, 0)
        mock_req.post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
