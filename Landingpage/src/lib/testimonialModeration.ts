/**
 * KI-Moderation Service für Testimonials
 * Prüft ob Testimonial app-bezogen ist, nicht toxisch ist und kein Spam enthält
 */

interface ModerationResult {
  approved: boolean;
  score: number; // 0-1, höher = besser
  reason?: string;
}

/**
 * Moderiert ein Testimonial mit Gemini API
 * @param text - Testimonial Text
 * @returns Moderation Result
 */
export async function moderateTestimonial(text: string): Promise<ModerationResult> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey === 'undefined') {
    // Fallback: Wenn keine API Key, automatisch ablehnen (sicherer)
    console.warn('⚠️ Gemini API Key nicht gefunden - Testimonial wird abgelehnt');
    return {
      approved: false,
      score: 0,
      reason: 'Moderation-Service nicht verfügbar'
    };
  }

  try {
    const prompt = `Du bist ein Moderator für Testimonials einer Lern-App namens "ANKI+". 

Prüfe das folgende Testimonial und bewerte es auf einer Skala von 0.0 bis 1.0:

Kriterien:
1. **App-Bezug (0.4 Punkte)**: Muss sich auf ANKI+ beziehen (mindestens 0.2 Punkte)
2. **Toxicity (0.3 Punkte)**: Keine Beleidigungen, Hassrede, Spam (0.3 Punkte wenn sauber)
3. **Qualität (0.3 Punkte)**: Sinnvoller, konstruktiver Inhalt (0.3 Punkte wenn gut)

Antworte NUR mit einem JSON-Objekt im Format:
{
  "score": 0.85,
  "approved": true,
  "reason": "Kurze Begründung"
}

Testimonial:
"${text}"

Antworte nur mit dem JSON, keine zusätzlichen Erklärungen.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 200,
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // Parse JSON aus Response (kann Markdown-Code-Blöcke enthalten)
    let moderationData: any;
    try {
      // Entferne mögliche Markdown-Code-Blöcke
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      moderationData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse moderation response:', responseText);
      // Fallback: Konservative Ablehnung
      return {
        approved: false,
        score: 0.3,
        reason: 'Moderation-Response konnte nicht verarbeitet werden'
      };
    }

    const score = Math.max(0, Math.min(1, moderationData.score || 0));
    const approved = score >= 0.8 && (moderationData.approved !== false);

    return {
      approved,
      score,
      reason: moderationData.reason || (approved ? 'Automatisch freigegeben' : 'Nicht den Kriterien entsprechend')
    };

  } catch (error: any) {
    console.error('❌ Moderation error:', error);
    // Bei Fehler: Konservativ ablehnen
    return {
      approved: false,
      score: 0.3,
      reason: 'Moderation-Fehler: ' + (error.message || 'Unbekannter Fehler')
    };
  }
}

/**
 * Validiert Testimonial Text (Basis-Validierung)
 */
export function validateTestimonialText(text: string): { valid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'Testimonial darf nicht leer sein' };
  }
  
  if (text.length > 500) {
    return { valid: false, error: 'Testimonial darf maximal 500 Zeichen lang sein' };
  }
  
  if (text.length < 20) {
    return { valid: false, error: 'Testimonial muss mindestens 20 Zeichen lang sein' };
  }
  
  return { valid: true };
}

