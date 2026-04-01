import { Request, Response } from 'express';
import { createLogger } from '../utils/logging';

/**
 * Gemini API key — used for direct Gemini calls (TTS/STT).
 * OpenRouter doesn't support audio models, so we call Gemini directly.
 */
const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const STT_MODEL = 'gemini-2.0-flash';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

/**
 * POST /voice/transcribe
 * Transcribes audio using Gemini Flash (multimodal input).
 *
 * Request: { audio: string (base64), mimeType?: string }
 * Response: { text: string }
 */
export async function voiceTranscribeHandler(req: Request, res: Response): Promise<void> {
  const requestId = `vt-${Date.now()}`;
  const logger = createLogger(requestId);

  try {
    if (!GEMINI_API_KEY) {
      res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
      return;
    }

    const { audio, mimeType } = req.body;
    if (!audio) {
      res.status(400).json({ error: 'audio (base64) is required' });
      return;
    }

    const mime = mimeType || 'audio/webm';

    const url = `${GEMINI_BASE}/${STT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: mime,
              data: audio,
            },
          },
          {
            text: 'Transcribe this audio exactly. Return only the transcribed text, nothing else.',
          },
        ],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1024,
      },
    };

    logger.info('Voice transcribe request', { mimeType: mime, audioLength: audio.length });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Gemini STT error', { status: response.status, error: errorText });
      res.status(response.status).json({ error: `Gemini STT failed: ${response.status}` });
      return;
    }

    const result = await response.json() as any;
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    logger.info('Voice transcribe success', { textLength: text.length });
    res.json({ text: text.trim() });
  } catch (err: any) {
    logger.error('Voice transcribe error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /voice/speak
 * Generates speech audio using Gemini TTS (Puck voice).
 *
 * Request: { text: string, voice?: string, style?: string }
 * Response: { audio: string (base64 WAV) }
 *
 * Gemini TTS returns raw PCM (16-bit, 24kHz, mono).
 * We convert to WAV by prepending a 44-byte WAV header.
 */
export async function voiceSpeakHandler(req: Request, res: Response): Promise<void> {
  const requestId = `vs-${Date.now()}`;
  const logger = createLogger(requestId);

  try {
    if (!GEMINI_API_KEY) {
      res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
      return;
    }

    const { text, voice, style } = req.body;
    if (!text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const voiceName = voice || 'Puck';
    const styleInstruction = style || '';

    // Build the prompt: style instruction + text
    const prompt = styleInstruction
      ? `${styleInstruction}\n\n${text}`
      : text;

    const url = `${GEMINI_BASE}/${TTS_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [{
        parts: [{
          text: prompt,
        }],
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName,
            },
          },
        },
      },
    };

    logger.info('Voice speak request', { textLength: text.length, voice: voiceName });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Gemini TTS error', { status: response.status, error: errorText });
      res.status(response.status).json({ error: `Gemini TTS failed: ${response.status}` });
      return;
    }

    const result = await response.json() as any;
    const audioData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioData) {
      logger.error('Gemini TTS: no audio in response');
      res.status(500).json({ error: 'No audio generated' });
      return;
    }

    // Convert PCM base64 → WAV base64
    // Gemini TTS outputs: 16-bit signed LE PCM, 24000 Hz, mono
    const pcmBuffer = Buffer.from(audioData, 'base64');
    const wavBuffer = pcmToWav(pcmBuffer, 24000, 1, 16);
    const wavBase64 = wavBuffer.toString('base64');

    logger.info('Voice speak success', { pcmBytes: pcmBuffer.length, wavBytes: wavBuffer.length });
    res.json({ audio: wavBase64 });
  } catch (err: any) {
    logger.error('Voice speak error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
}

/**
 * Convert raw PCM data to WAV by prepending a 44-byte header.
 */
function pcmToWav(pcmData: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4);
  header.write('WAVE', 8);

  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);           // Subchunk1Size (PCM = 16)
  header.writeUInt16LE(1, 20);            // AudioFormat (PCM = 1)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
