"""Tests for ai/voice.py — Gemini STT and TTS (direct API calls)."""
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

from ai.voice import transcribe_audio, generate_speech, PLUSI_VOICE, PLUSI_STYLE_INSTRUCTIONS, _pcm_to_wav_base64

# Restore immediately to avoid polluting other test files
sys.modules.pop('aqt', None)
sys.modules.pop('aqt.qt', None)


class TestTranscribeAudio(unittest.TestCase):
    """Test STT via direct Gemini API."""

    @patch('ai.voice.requests.post')
    @patch('ai.voice._get_api_key', return_value='test-key')
    def test_transcribe_returns_text(self, mock_key, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "candidates": [{"content": {"parts": [{"text": "Hallo Plusi"}]}}]
            }
        )
        audio_b64 = base64.b64encode(b"fake-audio").decode()
        result = transcribe_audio(audio_b64)
        self.assertEqual(result, "Hallo Plusi")
        mock_post.assert_called_once()

    @patch('ai.voice.requests.post')
    @patch('ai.voice._get_api_key', return_value='test-key')
    def test_transcribe_error_returns_none(self, mock_key, mock_post):
        mock_post.side_effect = Exception("Network error")
        result = transcribe_audio("base64audio")
        self.assertIsNone(result)

    @patch('ai.voice._get_api_key', return_value='')
    def test_transcribe_no_api_key_returns_none(self, mock_key):
        result = transcribe_audio("base64audio")
        self.assertIsNone(result)

    @patch('ai.voice.requests.post')
    @patch('ai.voice._get_api_key', return_value='test-key')
    def test_transcribe_empty_text_returns_none(self, mock_key, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"candidates": [{"content": {"parts": [{"text": "  "}]}}]}
        )
        result = transcribe_audio("base64audio")
        self.assertIsNone(result)


class TestGenerateSpeech(unittest.TestCase):
    """Test TTS via direct Gemini API."""

    @patch('ai.voice.requests.post')
    @patch('ai.voice._get_api_key', return_value='test-key')
    def test_generate_speech_returns_wav(self, mock_key, mock_post):
        # Fake PCM data (4 bytes = 2 samples)
        pcm_data = b'\x00\x01\x00\x02'
        pcm_b64 = base64.b64encode(pcm_data).decode()
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "candidates": [{"content": {"parts": [{"inlineData": {"data": pcm_b64}}]}}]
            }
        )
        result = generate_speech("Hallo!", mood="happy")
        self.assertIsNotNone(result)
        # Decode and check WAV header
        wav_data = base64.b64decode(result)
        self.assertTrue(wav_data.startswith(b'RIFF'))
        self.assertIn(b'WAVE', wav_data[:12])

    @patch('ai.voice.requests.post')
    @patch('ai.voice._get_api_key', return_value='test-key')
    def test_generate_speech_error_returns_none(self, mock_key, mock_post):
        mock_post.side_effect = Exception("Timeout")
        result = generate_speech("Hallo!", mood="neutral")
        self.assertIsNone(result)

    @patch('ai.voice._get_api_key', return_value='')
    def test_generate_speech_no_api_key_returns_none(self, mock_key):
        result = generate_speech("Hallo!", mood="neutral")
        self.assertIsNone(result)


class TestVoiceConstants(unittest.TestCase):
    """Test module-level constants."""

    def test_voice_constant(self):
        self.assertEqual(PLUSI_VOICE, "Puck")

    def test_style_instructions_exist(self):
        self.assertIn("neutral", PLUSI_STYLE_INSTRUCTIONS)
        self.assertIn("happy", PLUSI_STYLE_INSTRUCTIONS)
        self.assertIn("thinking", PLUSI_STYLE_INSTRUCTIONS)

    def test_style_instructions_all_moods_non_empty(self):
        for mood, style in PLUSI_STYLE_INSTRUCTIONS.items():
            self.assertTrue(len(style) > 0, f"Style for {mood} is empty")


class TestPcmToWav(unittest.TestCase):
    """Test PCM→WAV conversion."""

    def test_wav_header_correct(self):
        pcm_data = b'\x00' * 100
        pcm_b64 = base64.b64encode(pcm_data).decode()
        wav_b64 = _pcm_to_wav_base64(pcm_b64)
        wav_data = base64.b64decode(wav_b64)
        # Check RIFF header
        self.assertEqual(wav_data[0:4], b'RIFF')
        self.assertEqual(wav_data[8:12], b'WAVE')
        self.assertEqual(wav_data[12:16], b'fmt ')
        self.assertEqual(wav_data[36:40], b'data')
        # Total size = 44 header + 100 PCM
        self.assertEqual(len(wav_data), 144)


if __name__ == '__main__':
    unittest.main()
