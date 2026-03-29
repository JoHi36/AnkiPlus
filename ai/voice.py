"""Gemini STT (transcription) and TTS (speech generation) for Plusi voice conversations.

Direct Gemini API calls from Python (no backend proxy needed).
STT: Gemini 2.0 Flash with inline audio data (multimodal).
TTS: Gemini 2.5 Flash TTS with Puck voice and mood-based style instructions.
"""
import time
import struct
import requests

try:
    from ..config import get_config
except ImportError:
    from config import get_config

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Gemini API base
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# Plusi's voice identity
PLUSI_VOICE = "Puck"
TTS_MODEL = "gemini-2.5-flash-preview-tts"
STT_MODEL = "gemini-2.5-flash"

# Mood → TTS style instruction mapping
PLUSI_STYLE_INSTRUCTIONS = {
    "neutral": (
        "Sprich entspannt, leise, mit trockenem Humor. Natürliches Sprechtempo, "
        "eher langsam als schnell. Pausen zwischen Gedanken. Wie ein kluger Freund "
        "der neben dir sitzt und leise kommentiert."
    ),
    "happy": (
        "Leicht wärmer als sonst, aber nicht übertrieben. Ein minimales Lächeln "
        "in der Stimme, das man fast überhört. Tempo etwas schneller."
    ),
    "excited": (
        "Schneller werdend, aufgeregt aber kontrolliert. Atemlos bei überraschenden "
        "Erkenntnissen. Energie in der Stimme, aber nie laut."
    ),
    "thinking": (
        "Langsam, nachdenklich. Pausen zwischen Satzteilen als würde der Gedanke "
        "gerade erst entstehen. Leise, nach innen gerichtet."
    ),
    "sleepy": (
        "Sehr leise, sehr langsam. Lange Pausen. Minimal. "
        "Die Stille zwischen den Worten ist der Inhalt."
    ),
    "annoyed": (
        "Flach, monoton, fast gelangweilt. Trocken. Keine Emotion forcieren. "
        "Die Komik kommt aus dem Fehlen jeder Dramatik."
    ),
    "flustered": (
        "Leicht aus dem Konzept, Tempo wechselt. Mal schneller, mal Pause. "
        "Wie jemand der überrascht wurde und es nicht zugeben will."
    ),
    "curious": (
        "Wach, aufmerksam. Leicht angehobene Intonation am Satzende. "
        "Interesse ohne Aufdringlichkeit."
    ),
    "proud": (
        "Minimal wärmer, kurze Pause vor dem Lob als ob es Überwindung kostet. "
        "Selbstironisch. Verletzlichkeit die sich als Coolness verkleidet."
    ),
    "surprised": (
        "Kurzer Moment der Stille, dann schneller. Ungeplant. "
        "Wie ein Gedanke der einen überrumpelt."
    ),
    "empathy": (
        "Weich, langsam. 'Hey' wie ein Klopfen an die Tür. "
        "Ehrlich, kein Nachdruck. Einfach da sein."
    ),
}

# Timeout for API calls (seconds)
STT_TIMEOUT = 30
TTS_TIMEOUT = 30

# Retry settings for 429 rate limits
MAX_RETRIES = 3
RETRY_DELAY_S = 2.0


def _get_api_key():
    """Get Google API key from config."""
    config = get_config()
    key = config.get("api_key", "")
    if not key:
        logger.warning("voice: no api_key in config")
    return key


def _pcm_to_wav_base64(pcm_base64):
    """Convert raw PCM base64 (16-bit, 24kHz, mono) to WAV base64."""
    import base64
    pcm_data = base64.b64decode(pcm_base64)

    sample_rate = 24000
    channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * channels * (bits_per_sample // 8)
    block_align = channels * (bits_per_sample // 8)
    data_size = len(pcm_data)

    # 44-byte WAV header
    header = struct.pack('<4sI4s4sIHHIIHH4sI',
        b'RIFF',
        data_size + 36,
        b'WAVE',
        b'fmt ',
        16,             # Subchunk1Size (PCM)
        1,              # AudioFormat (PCM = 1)
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b'data',
        data_size,
    )

    wav_data = header + pcm_data
    return base64.b64encode(wav_data).decode()


def transcribe_audio(audio_base64):
    """Transcribe audio using Gemini Flash directly.

    Args:
        audio_base64: Base64-encoded audio data (webm/opus from MediaRecorder).

    Returns:
        Transcribed text string, or None on error.
    """
    api_key = _get_api_key()
    if not api_key:
        return None

    url = f"{GEMINI_BASE}/{STT_MODEL}:generateContent?key={api_key}"
    payload = {
        "contents": [{
            "parts": [
                {
                    "inlineData": {
                        "mimeType": "audio/webm",
                        "data": audio_base64,
                    },
                },
                {
                    "text": "Transcribe this audio exactly. Return only the transcribed text, nothing else.",
                },
            ],
        }],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 1024,
        },
    }

    for attempt in range(MAX_RETRIES + 1):
        try:
            response = requests.post(url, json=payload, timeout=STT_TIMEOUT)
            if response.status_code == 429 and attempt < MAX_RETRIES:
                delay = RETRY_DELAY_S * (attempt + 1)
                logger.warning("voice transcribe: 429 rate limit, retry %d/%d in %.1fs", attempt + 1, MAX_RETRIES, delay)
                time.sleep(delay)
                continue
            response.raise_for_status()
            result = response.json()
            text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
            logger.info("voice transcribe: %d chars", len(text))
            return text if text else None
        except Exception as e:
            if attempt < MAX_RETRIES and '429' in str(e):
                time.sleep(RETRY_DELAY_S * (attempt + 1))
                continue
            logger.exception("voice transcribe error: %s", e)
            return None
    return None


def generate_speech(text, mood="neutral"):
    """Generate speech audio using Gemini TTS directly.

    Args:
        text: Text for Plusi to speak.
        mood: Plusi's current mood (determines speaking style).

    Returns:
        Base64-encoded WAV audio data, or None on error.
    """
    api_key = _get_api_key()
    if not api_key:
        return None

    style = PLUSI_STYLE_INSTRUCTIONS.get(mood, PLUSI_STYLE_INSTRUCTIONS["neutral"])

    # Build prompt: style instruction + text
    prompt = f"{style}\n\n{text}"

    url = f"{GEMINI_BASE}/{TTS_MODEL}:generateContent?key={api_key}"
    payload = {
        "contents": [{
            "parts": [{
                "text": prompt,
            }],
        }],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": PLUSI_VOICE,
                    },
                },
            },
        },
    }

    for attempt in range(MAX_RETRIES + 1):
        try:
            response = requests.post(url, json=payload, timeout=TTS_TIMEOUT)
            if response.status_code == 429 and attempt < MAX_RETRIES:
                delay = RETRY_DELAY_S * (attempt + 1)
                logger.warning("voice speak: 429 rate limit, retry %d/%d in %.1fs", attempt + 1, MAX_RETRIES, delay)
                time.sleep(delay)
                continue
            response.raise_for_status()
            result = response.json()
            pcm_base64 = (result.get("candidates", [{}])[0]
                          .get("content", {})
                          .get("parts", [{}])[0]
                          .get("inlineData", {})
                          .get("data"))
            if not pcm_base64:
                logger.error("voice speak: no audio in response")
                return None

            # Convert PCM to WAV for browser playback
            wav_base64 = _pcm_to_wav_base64(pcm_base64)
            logger.info("voice speak: generated audio for %d chars text, mood=%s", len(text), mood)
            return wav_base64
        except Exception as e:
            if attempt < MAX_RETRIES and '429' in str(e):
                time.sleep(RETRY_DELAY_S * (attempt + 1))
                continue
            logger.exception("voice speak error: %s", e)
            return None
    return None
