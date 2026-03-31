# Plusi Voice Conversation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold Option (⌥) key to record voice, release to send to Plusi, Plusi responds with Puck voice via Gemini TTS.

**Architecture:** Option key press/release detected by GlobalShortcutFilter → dispatches CustomEvents to React → React records audio via MediaRecorder API → sends base64 audio to Python via bridge message queue → Python calls Gemini Flash for STT → routes transcribed text to run_plusi() → Plusi responds with mood + text → Python calls Gemini TTS (Puck voice) with text + style instruction → base64 audio sent back to React → React plays audio. During processing, Plusi dock shows "thinking" mood.

**Tech Stack:** MediaRecorder API (frontend), Gemini Flash (STT), Gemini 2.5 Flash Preview TTS (TTS, Puck voice), PyQt6 QThread (async processing)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `ai/voice.py` | Gemini STT + TTS calls (transcribe audio, generate speech) |
| Create | `frontend/src/hooks/usePlusiVoice.ts` | Audio recording, playback, voice state machine |
| Modify | `ui/shortcut_filter.py` | Option key press/release → dispatch events to React |
| Modify | `ui/widget.py` | Handle `voiceAudio` message, wire up VoiceThread |
| Modify | `ui/bridge.py` | (Not needed — uses message queue, not @pyqtSlot) |
| Modify | `frontend/src/hooks/useAnki.js` | Add `sendVoiceAudio` bridge method |
| Modify | `frontend/src/App.jsx` | Wire usePlusiVoice hook, pass state to MascotShell |

---

### Task 1: Gemini Voice Module (ai/voice.py)

**Files:**
- Create: `ai/voice.py`
- Test: `tests/test_voice.py`

- [ ] **Step 1: Write tests for STT and TTS functions**

```python
# tests/test_voice.py
"""Tests for ai/voice.py — Gemini STT and TTS."""
import unittest
from unittest.mock import patch, MagicMock
import json
import base64

# Mock aqt before importing
import sys
sys.modules['aqt'] = MagicMock()
sys.modules['aqt.qt'] = MagicMock()

from ai.voice import transcribe_audio, generate_speech, PLUSI_VOICE, PLUSI_STYLE_INSTRUCTIONS


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

    def test_voice_constant(self):
        self.assertEqual(PLUSI_VOICE, "Puck")

    def test_style_instructions_exist(self):
        self.assertIn("neutral", PLUSI_STYLE_INSTRUCTIONS)
        self.assertIn("happy", PLUSI_STYLE_INSTRUCTIONS)
        self.assertIn("thinking", PLUSI_STYLE_INSTRUCTIONS)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_voice.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ai.voice'`

- [ ] **Step 3: Implement ai/voice.py**

```python
# ai/voice.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_voice.py -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ai/voice.py tests/test_voice.py
git commit -m "feat(voice): add Gemini STT + TTS module for Plusi voice conversations"
```

---

### Task 2: Option Key Detection in GlobalShortcutFilter

**Files:**
- Modify: `ui/shortcut_filter.py`

The GlobalShortcutFilter currently only handles `KeyPress` events. For Option-key hold-to-record, we need both `KeyPress` and `KeyRelease` for the Option (Alt) modifier key. On macOS, Qt.Key.Key_Alt is the Option key.

- [ ] **Step 1: Add Option key state tracking to GlobalShortcutFilter**

Add a `_voice_recording` flag and handle both press and release of the Option key. On press → dispatch `plusiVoiceStart` CustomEvent to the React webview. On release → dispatch `plusiVoiceStop`.

In `ui/shortcut_filter.py`, add to `__init__`:

```python
self._voice_recording = False
```

Replace the `eventFilter` method's first line check to also handle KeyRelease:

```python
def eventFilter(self, obj, event):
    """Main event filter -- intercepts KeyPress and KeyRelease events."""
    # --- Option key (Alt): hold-to-record for Plusi voice ---
    if event.type() == QEvent.Type.KeyRelease and event.key() == Qt.Key.Key_Alt:
        if self._voice_recording:
            self._voice_recording = False
            self._dispatch_voice_event('plusiVoiceStop')
            return True
        return super().eventFilter(obj, event)

    if event.type() != QEvent.Type.KeyPress:
        return super().eventFilter(obj, event)

    # --- Option (Alt) key alone: start Plusi voice recording ---
    if (event.key() == Qt.Key.Key_Alt and
            not event.modifiers() & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.MetaModifier) and
            not self._text_field_has_focus and
            not self._voice_recording and
            not event.isAutoRepeat()):
        self._voice_recording = True
        self._dispatch_voice_event('plusiVoiceStart')
        return True
```

Add the dispatch helper method to the class:

```python
def _dispatch_voice_event(self, event_name):
    """Dispatch a voice event to the React webview."""
    try:
        from .main_view import get_main_view
        mv = get_main_view()
        if mv._chatbot and mv._chatbot.web_view:
            js = f"window.dispatchEvent(new CustomEvent('{event_name}'));"
            mv._chatbot.web_view.page().runJavaScript(js)
    except (ImportError, AttributeError, RuntimeError) as e:
        logger.warning("Could not dispatch voice event %s: %s", event_name, e)
```

- [ ] **Step 2: Test manually in Anki** — Press Option, check browser console for `plusiVoiceStart` event, release Option, check for `plusiVoiceStop`.

- [ ] **Step 3: Commit**

```bash
git add ui/shortcut_filter.py
git commit -m "feat(voice): detect Option key hold/release for Plusi voice recording"
```

---

### Task 3: React Voice Hook (usePlusiVoice.ts)

**Files:**
- Create: `frontend/src/hooks/usePlusiVoice.ts`

This hook manages the full voice state machine:
- `idle` → `recording` (on plusiVoiceStart) → `processing` (on plusiVoiceStop) → `speaking` (audio plays) → `idle`

- [ ] **Step 1: Create the voice hook**

```typescript
// frontend/src/hooks/usePlusiVoice.ts
import { useState, useEffect, useRef, useCallback } from 'react';

type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking';

interface UsePlusiVoiceReturn {
  voiceState: VoiceState;
  /** Duration of current recording in ms (updated every 100ms) */
  recordingDuration: number;
}

// Minimum recording duration to avoid accidental taps (ms)
const MIN_RECORDING_MS = 300;

export default function usePlusiVoice(): UsePlusiVoiceReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const durationTimerRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = useCallback(async () => {
    if (voiceState !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setVoiceState('recording');
      setRecordingDuration(0);

      // Update duration every 100ms
      durationTimerRef.current = window.setInterval(() => {
        setRecordingDuration(Date.now() - startTimeRef.current);
      }, 100);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }, [voiceState]);

  const stopRecording = useCallback(() => {
    if (voiceState !== 'recording' || !mediaRecorderRef.current) return;

    window.clearInterval(durationTimerRef.current);
    const duration = Date.now() - startTimeRef.current;

    if (duration < MIN_RECORDING_MS) {
      // Too short — cancel
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
      setVoiceState('idle');
      setRecordingDuration(0);
      return;
    }

    const recorder = mediaRecorderRef.current;
    recorder.onstop = async () => {
      // Stop mic
      recorder.stream.getTracks().forEach(t => t.stop());

      const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
      chunksRef.current = [];

      // Convert to base64 and send to Python
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        if (window.ankiBridge) {
          window.ankiBridge.addMessage('voiceAudio', base64);
        }
      };
      reader.readAsDataURL(blob);
    };

    setVoiceState('processing');
    setRecordingDuration(0);
    recorder.stop();
  }, [voiceState]);

  // Listen for plusiVoiceStart / plusiVoiceStop from GlobalShortcutFilter
  useEffect(() => {
    const handleStart = () => startRecording();
    const handleStop = () => stopRecording();

    window.addEventListener('plusiVoiceStart', handleStart);
    window.addEventListener('plusiVoiceStop', handleStop);
    return () => {
      window.removeEventListener('plusiVoiceStart', handleStart);
      window.removeEventListener('plusiVoiceStop', handleStop);
    };
  }, [startRecording, stopRecording]);

  // Listen for Plusi voice response from Python
  useEffect(() => {
    const handleVoiceResponse = (e: CustomEvent) => {
      const { audio, mood } = e.detail?.data || e.detail || {};
      if (!audio) {
        setVoiceState('idle');
        return;
      }
      // Play audio
      setVoiceState('speaking');
      const audioSrc = `data:audio/mp3;base64,${audio}`;
      const player = new Audio(audioSrc);
      audioRef.current = player;
      player.onended = () => {
        setVoiceState('idle');
        audioRef.current = null;
      };
      player.onerror = () => {
        setVoiceState('idle');
        audioRef.current = null;
      };
      player.play();
    };

    window.addEventListener('plusiVoiceResponse', handleVoiceResponse as EventListener);
    return () => {
      window.removeEventListener('plusiVoiceResponse', handleVoiceResponse as EventListener);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.clearInterval(durationTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current.stop();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return { voiceState, recordingDuration };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/usePlusiVoice.ts
git commit -m "feat(voice): add usePlusiVoice hook with recording + playback state machine"
```

---

### Task 4: Python Voice Handler in Widget

**Files:**
- Modify: `ui/widget.py`

Wire up the `voiceAudio` message type to a new QThread that handles the full pipeline: STT → Plusi → TTS → send audio back.

- [ ] **Step 1: Add VoiceThread class to widget.py**

Add after the `SubagentThread` class (around line 200):

```python
class VoiceThread(QThread):
    """Thread for Plusi voice pipeline: STT → Plusi agent → TTS."""
    result_signal = pyqtSignal(object)  # {"audio": base64, "mood": str, "text": str}
    mood_signal = pyqtSignal(str)       # Intermediate mood updates for dock
    error_signal = pyqtSignal(str)      # Error message

    def __init__(self, audio_base64):
        super().__init__()
        self.audio_base64 = audio_base64

    def run(self):
        try:
            try:
                from ..ai.voice import transcribe_audio, generate_speech
            except ImportError:
                from ai.voice import transcribe_audio, generate_speech

            # Step 1: STT
            self.mood_signal.emit('thinking')
            text = transcribe_audio(self.audio_base64)
            if not text:
                self.error_signal.emit("Konnte Sprache nicht erkennen.")
                return

            logger.info("voice pipeline: transcribed '%s'", text[:80])

            # Step 2: Run Plusi agent
            try:
                from ..plusi.agent import run_plusi
            except ImportError:
                from plusi.agent import run_plusi

            result = run_plusi(situation=f"[Voice message from user]: {text}")
            mood = result.get('mood', 'neutral')
            plusi_text = result.get('text', '')

            if not plusi_text:
                self.result_signal.emit({"audio": None, "mood": mood, "text": ""})
                return

            self.mood_signal.emit(mood)
            logger.info("voice pipeline: plusi responded mood=%s len=%d", mood, len(plusi_text))

            # Step 3: TTS
            audio_b64 = generate_speech(plusi_text, mood=mood)
            self.result_signal.emit({
                "audio": audio_b64,
                "mood": mood,
                "text": plusi_text,
            })
        except Exception as e:
            logger.exception("voice pipeline error: %s", e)
            self.error_signal.emit(str(e))
```

- [ ] **Step 2: Add voice message handler and response methods**

Add to `_get_message_handler` dict in widget.py (in the handlers dict, after the Media section):

```python
# Voice
'voiceAudio': self._msg_voice_audio,
```

Add the handler method:

```python
def _msg_voice_audio(self, data):
    """Handle voice audio from React: run STT → Plusi → TTS pipeline."""
    if not data or not isinstance(data, str):
        logger.warning("voice: invalid audio data")
        return

    # Show thinking state on Plusi dock
    try:
        from .setup import get_chatbot_widget
        try:
            from ..plusi.dock import sync_mood
        except ImportError:
            from plusi.dock import sync_mood
        sync_mood('thinking')
    except (ImportError, AttributeError):
        pass

    thread = VoiceThread(data)
    thread.mood_signal.connect(self._on_voice_mood)
    thread.result_signal.connect(self._on_voice_result)
    thread.error_signal.connect(self._on_voice_error)
    thread.finished.connect(lambda: self._cleanup_voice_thread())
    self._voice_thread = thread
    thread.start()

def _on_voice_mood(self, mood):
    """Update Plusi dock mood during voice pipeline."""
    try:
        try:
            from ..plusi.dock import sync_mood
        except ImportError:
            from plusi.dock import sync_mood
        sync_mood(mood)
    except (ImportError, AttributeError):
        pass

def _on_voice_result(self, result):
    """Send voice response audio to React frontend."""
    self._send_to_frontend_with_event(
        "plusiVoiceResponse",
        {"type": "plusiVoiceResponse", "data": result},
        "plusiVoiceResponse"
    )
    # Sync final mood
    mood = result.get('mood', 'neutral') if result else 'neutral'
    self._on_voice_mood(mood)

def _on_voice_error(self, error_msg):
    """Handle voice pipeline error."""
    logger.error("voice pipeline error: %s", error_msg)
    self._send_to_frontend_with_event(
        "plusiVoiceResponse",
        {"type": "plusiVoiceResponse", "data": {"audio": None, "mood": "neutral", "text": ""}},
        "plusiVoiceResponse"
    )
    # Reset Plusi mood
    self._on_voice_mood('neutral')

def _cleanup_voice_thread(self):
    """Cleanup after voice thread completes."""
    if hasattr(self, '_voice_thread'):
        self._voice_thread = None
```

- [ ] **Step 3: Commit**

```bash
git add ui/widget.py
git commit -m "feat(voice): add VoiceThread and voice message handler to widget"
```

---

### Task 5: Wire Voice Hook into App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Import and use the voice hook**

Add import near the top of App.jsx (after other hook imports):

```javascript
import usePlusiVoice from './hooks/usePlusiVoice';
```

Inside the main `AppContent` component (or wherever hooks are called), add:

```javascript
const { voiceState, recordingDuration } = usePlusiVoice();
```

Pass `voiceState` to `MascotShell` as a prop:

```jsx
<MascotShell
  // ...existing props
  voiceState={voiceState}
/>
```

- [ ] **Step 2: Update MascotShell to show voice state**

In `frontend/src/components/MascotShell.jsx`, accept the `voiceState` prop and show a visual indicator:

- `recording` → red pulsing ring around Plusi
- `processing` → thinking animation (existing mood system: set mood to 'thinking')
- `speaking` → subtle glow/pulse in accent color

Add to the component's outer container, when `voiceState === 'recording'`:

```jsx
{voiceState === 'recording' && (
  <div style={RECORDING_RING_STYLE} />
)}
```

With a module-level constant:

```javascript
const RECORDING_RING_STYLE = {
  position: 'absolute',
  inset: -4,
  borderRadius: '50%',
  border: '2px solid var(--ds-red)',
  animation: 'plusi-voice-pulse 1s ease-in-out infinite',
  pointerEvents: 'none',
};
```

Add keyframes via a `<style>` tag or in design-system.css:

```css
@keyframes plusi-voice-pulse {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/MascotShell.jsx
git commit -m "feat(voice): wire voice hook into App, show recording state on MascotShell"
```

---

### Task 6: Add Microphone Permission Handling

**Files:**
- Modify: `ui/main_view.py` (or wherever QWebEngineView permissions are configured)

QWebEngineView blocks microphone access by default. We need to grant the permission when requested.

- [ ] **Step 1: Find where QWebEngineView is created and add permission handler**

Look for where the chatbot's QWebEngineView is instantiated (in `ui/widget.py` or `ui/main_view.py`) and add:

```python
# Grant microphone permission for Plusi voice
def _handle_permission_request(self, origin, feature):
    """Auto-grant microphone permission for local content."""
    from PyQt6.QtWebEngineCore import QWebEnginePage
    if feature == QWebEnginePage.Feature.MediaAudioCapture:
        self.web_view.page().setFeaturePermission(
            origin, feature, QWebEnginePage.PermissionPolicy.PermissionGrantedByUser
        )
        logger.info("Granted microphone permission for Plusi voice")
    else:
        self.web_view.page().setFeaturePermission(
            origin, feature, QWebEnginePage.PermissionPolicy.PermissionDeniedByUser
        )
```

Connect it after the page is created:

```python
self.web_view.page().featurePermissionRequested.connect(self._handle_permission_request)
```

- [ ] **Step 2: Commit**

```bash
git add ui/widget.py
git commit -m "feat(voice): auto-grant microphone permission for Plusi voice"
```

---

### Task 7: Integration Test

**Files:** No new files — manual testing.

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Restart Anki and test the full pipeline**

1. Press and hold Option (⌥) — Plusi should show recording indicator (red ring)
2. Speak a sentence in German — e.g. "Hey Plusi, wie geht's dir?"
3. Release Option — Plusi should show "thinking" mood
4. Wait for response ��� Plusi should play back audio with Puck voice
5. Verify Plusi dock mood changes to match the response mood

- [ ] **Step 3: Edge cases to test**

- Very short press (<300ms) — should cancel, no recording sent
- Press while Plusi is already speaking — should ignore
- Press while text field has focus — should not trigger (text input takes priority)
- No microphone permission — should fail gracefully (no crash)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(voice): integration test fixes"
```

---

## Backend Dependency Note

This plan assumes the backend will provide two new endpoints:

1. **`POST /voice/transcribe`** — Receives `{ audio: base64, model: "gemini-2.0-flash" }`, returns `{ text: "..." }`
2. **`POST /voice/speak`** — Receives `{ text, voice: "Puck", model: "gemini-2.5-flash-preview-tts", style: "..." }`, returns `{ audio: base64 }`

These backend endpoints need to be implemented separately (Cloud Function or Vercel endpoint). The Python client code in `ai/voice.py` is ready to call them.
