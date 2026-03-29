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
      // Microphone access denied or unavailable — fail silently
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
      const audioSrc = `data:audio/wav;base64,${audio}`;
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
