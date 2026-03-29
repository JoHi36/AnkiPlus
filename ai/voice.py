"""Gemini STT (transcription) and TTS (speech generation) for Plusi voice conversations.

STT: Sends audio to backend /voice/transcribe → Gemini Flash transcription.
TTS: Sends text + style to backend /voice/speak → Gemini 2.5 Flash TTS (Puck voice).
"""
import requests
import base64

try:
    from ..config import get_backend_url, get_auth_token
except ImportError:
    from config import get_backend_url, get_auth_token

try:
    from ..ai.auth import get_auth_headers
except ImportError:
    try:
        from ai.auth import get_auth_headers
    except ImportError:
        def get_auth_headers():
            return {"Content-Type": "application/json"}

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Plusi's voice identity
PLUSI_VOICE = "Puck"
TTS_MODEL = "gemini-2.5-flash-preview-tts"
STT_MODEL = "gemini-2.0-flash"

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
STT_TIMEOUT = 15
TTS_TIMEOUT = 20


def transcribe_audio(audio_base64):
    """Transcribe audio using Gemini Flash via backend.

    Args:
        audio_base64: Base64-encoded audio data (webm/opus from MediaRecorder).

    Returns:
        Transcribed text string, or None on error.
    """
    backend_url = get_backend_url()
    if not backend_url:
        logger.warning("voice transcribe: no backend URL")
        return None

    try:
        url = f"{backend_url}/voice/transcribe"
        payload = {
            "audio": audio_base64,
            "model": STT_MODEL,
        }
        headers = get_auth_headers()
        response = requests.post(url, json=payload, headers=headers, timeout=STT_TIMEOUT)
        response.raise_for_status()
        result = response.json()
        text = result.get("text", "").strip()
        logger.info("voice transcribe: %d chars", len(text))
        return text if text else None
    except Exception as e:
        logger.exception("voice transcribe error: %s", e)
        return None


def generate_speech(text, mood="neutral"):
    """Generate speech audio using Gemini TTS via backend.

    Args:
        text: Text for Plusi to speak.
        mood: Plusi's current mood (determines speaking style).

    Returns:
        Base64-encoded audio data (mp3/wav), or None on error.
    """
    backend_url = get_backend_url()
    if not backend_url:
        logger.warning("voice speak: no backend URL")
        return None

    style = PLUSI_STYLE_INSTRUCTIONS.get(mood, PLUSI_STYLE_INSTRUCTIONS["neutral"])

    try:
        url = f"{backend_url}/voice/speak"
        payload = {
            "text": text,
            "voice": PLUSI_VOICE,
            "model": TTS_MODEL,
            "style": style,
        }
        headers = get_auth_headers()
        response = requests.post(url, json=payload, headers=headers, timeout=TTS_TIMEOUT)
        response.raise_for_status()
        result = response.json()
        audio = result.get("audio")
        if audio:
            logger.info("voice speak: generated audio for %d chars text, mood=%s", len(text), mood)
        return audio
    except Exception as e:
        logger.exception("voice speak error: %s", e)
        return None
