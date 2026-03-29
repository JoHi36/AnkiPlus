"""Tests for ai/voice.py — Gemini STT and TTS."""
import unittest
from unittest.mock import patch, MagicMock
import json
import base64

# Mock aqt before importing
import sys
_aqt_mock = MagicMock()
_aqt_qt_mock = MagicMock()
sys.modules['aqt'] = _aqt_mock
sys.modules['aqt.qt'] = _aqt_qt_mock

from ai.voice import transcribe_audio, generate_speech, PLUSI_VOICE, PLUSI_STYLE_INSTRUCTIONS

# Restore immediately to avoid polluting other test files
sys.modules.pop('aqt', None)
sys.modules.pop('aqt.qt', None)


class TestTranscribeAudio(unittest.TestCase):
    """Test STT via Gemini Flash."""

    @patch('ai.voice.requests.post')
    @patch('ai.voice.get_auth_headers')
    @patch('ai.voice.get_backend_url', return_value='https://test.api')
    def test_transcribe_returns_text(self, mock_url, mock_headers, mock_post):
        mock_headers.return_value = {"Authorization": "Bearer tok"}
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"text": "Hallo Plusi"}
        )
        audio_b64 = base64.b64encode(b"fake-audio").decode()
        result = transcribe_audio(audio_b64)
        self.assertEqual(result, "Hallo Plusi")
        mock_post.assert_called_once()

    @patch('ai.voice.requests.post')
    @patch('ai.voice.get_auth_headers')
    @patch('ai.voice.get_backend_url', return_value='https://test.api')
    def test_transcribe_error_returns_none(self, mock_url, mock_headers, mock_post):
        mock_headers.return_value = {}
        mock_post.side_effect = Exception("Network error")
        result = transcribe_audio("base64audio")
        self.assertIsNone(result)

    @patch('ai.voice.get_backend_url', return_value=None)
    def test_transcribe_no_backend_url_returns_none(self, mock_url):
        result = transcribe_audio("base64audio")
        self.assertIsNone(result)

    @patch('ai.voice.requests.post')
    @patch('ai.voice.get_auth_headers')
    @patch('ai.voice.get_backend_url', return_value='https://test.api')
    def test_transcribe_empty_text_returns_none(self, mock_url, mock_headers, mock_post):
        mock_headers.return_value = {}
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"text": "   "}
        )
        result = transcribe_audio("base64audio")
        self.assertIsNone(result)


class TestGenerateSpeech(unittest.TestCase):
    """Test TTS via Gemini."""

    @patch('ai.voice.requests.post')
    @patch('ai.voice.get_auth_headers')
    @patch('ai.voice.get_backend_url', return_value='https://test.api')
    def test_generate_speech_returns_audio(self, mock_url, mock_headers, mock_post):
        mock_headers.return_value = {"Authorization": "Bearer tok"}
        fake_audio = base64.b64encode(b"audio-data").decode()
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"audio": fake_audio}
        )
        result = generate_speech("Hallo!", mood="happy")
        self.assertEqual(result, fake_audio)

    @patch('ai.voice.requests.post')
    @patch('ai.voice.get_auth_headers')
    @patch('ai.voice.get_backend_url', return_value='https://test.api')
    def test_generate_speech_error_returns_none(self, mock_url, mock_headers, mock_post):
        mock_headers.return_value = {}
        mock_post.side_effect = Exception("Timeout")
        result = generate_speech("Hallo!", mood="neutral")
        self.assertIsNone(result)

    @patch('ai.voice.get_backend_url', return_value=None)
    def test_generate_speech_no_backend_url_returns_none(self, mock_url):
        result = generate_speech("Hallo!", mood="neutral")
        self.assertIsNone(result)

    @patch('ai.voice.requests.post')
    @patch('ai.voice.get_auth_headers')
    @patch('ai.voice.get_backend_url', return_value='https://test.api')
    def test_generate_speech_unknown_mood_uses_neutral(self, mock_url, mock_headers, mock_post):
        """Unknown mood falls back to neutral style instructions."""
        mock_headers.return_value = {}
        fake_audio = base64.b64encode(b"audio-data").decode()
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"audio": fake_audio}
        )
        result = generate_speech("Test", mood="nonexistent_mood")
        self.assertEqual(result, fake_audio)
        # Verify the payload used neutral style
        call_kwargs = mock_post.call_args
        payload = call_kwargs[1]['json'] if 'json' in call_kwargs[1] else call_kwargs[0][1]
        self.assertEqual(payload['style'], PLUSI_STYLE_INSTRUCTIONS['neutral'])

    @patch('ai.voice.requests.post')
    @patch('ai.voice.get_auth_headers')
    @patch('ai.voice.get_backend_url', return_value='https://test.api')
    def test_generate_speech_sends_correct_payload(self, mock_url, mock_headers, mock_post):
        mock_headers.return_value = {}
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"audio": "abc123"}
        )
        generate_speech("Hallo!", mood="thinking")
        call_kwargs = mock_post.call_args
        payload = call_kwargs[1]['json']
        self.assertEqual(payload['voice'], 'Puck')
        self.assertIn('text', payload)
        self.assertIn('model', payload)
        self.assertIn('style', payload)
        self.assertEqual(payload['style'], PLUSI_STYLE_INSTRUCTIONS['thinking'])

    def test_voice_constant(self):
        self.assertEqual(PLUSI_VOICE, "Puck")

    def test_style_instructions_exist(self):
        self.assertIn("neutral", PLUSI_STYLE_INSTRUCTIONS)
        self.assertIn("happy", PLUSI_STYLE_INSTRUCTIONS)
        self.assertIn("thinking", PLUSI_STYLE_INSTRUCTIONS)

    def test_style_instructions_all_moods_non_empty(self):
        for mood, instruction in PLUSI_STYLE_INSTRUCTIONS.items():
            self.assertTrue(len(instruction) > 0, f"Style instruction for '{mood}' is empty")


if __name__ == '__main__':
    unittest.main()
