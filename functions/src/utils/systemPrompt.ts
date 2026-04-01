/**
 * System Prompt Builder
 *
 * Selects the correct base prompt by agent name and injects
 * runtime context (insights, memory, Plusi state, etc.).
 */

import { TUTOR_PROMPT, HANDOFF_SECTION } from '../prompts/tutor';
import { PLUSI_SYSTEM_PROMPT, PLANNING_PROMPT } from '../prompts/plusi';
import { HELP_SYSTEM_PROMPT, HELP_CONTEXT } from '../prompts/help';
import { RESEARCH_PROMPT } from '../prompts/research';

export interface Insight {
  type: string;   // 'weakness' | 'strength' | etc.
  text: string;
}

export interface BuildSystemPromptParams {
  /** Agent identifier: 'tutor' | 'plusi' | 'help' | 'research' */
  agent: string;

  // ── Tutor-specific ──
  /** Card context (front/back text, deck info) */
  cardContext?: string;
  /** Per-card learning insights */
  insights?: Insight[];
  /** Legacy mode param (unused, kept for compat) */
  mode?: string;
  /** Response style preference */
  responseStyle?: string;
  /** Enabled tool names */
  tools?: string[];

  // ── Plusi-specific ──
  /** Plusi conversation vs autonomous mode */
  plusiMode?: 'conversation' | 'autonomous';
  /** Plusi memory serialized string */
  memoryContext?: string;
  /** Plusi internal state serialized string */
  internalState?: string;
  /** Plusi relationship/friendship context */
  relationshipContext?: string;
  /** Plusi current drive description */
  driveDescription?: string;
  /** Plusi next wake ISO timestamp info */
  nextWakeInfo?: string;
}

/**
 * Build the complete system prompt for a given agent.
 *
 * Mirrors the Python logic in:
 *   - ai/system_prompt.py  → get_system_prompt()
 *   - plusi/agent.py       → prompt assembly (~line 670)
 *   - ai/help_agent.py     → run_help()
 */
export function buildSystemPrompt(params: BuildSystemPromptParams): string {
  const { agent } = params;

  switch (agent) {
    case 'tutor':
      return buildTutorPrompt(params);
    case 'plusi':
      return buildPlusiPrompt(params);
    case 'help':
      return buildHelpPrompt(params);
    case 'research':
      return RESEARCH_PROMPT;
    default:
      // Fallback to tutor for unknown agents
      return buildTutorPrompt(params);
  }
}

// ── Tutor ────────────────────────────────────────────────────────────

function buildTutorPrompt(params: BuildSystemPromptParams): string {
  let prompt = TUTOR_PROMPT;

  // Inject current card context (question, answer, deck, tags, stats)
  if (params.cardContext) {
    prompt += `\n\nAKTUELLE KARTE:\n${params.cardContext}`;
  }

  // Inject RAG card context as LERNMATERIAL (numbered [1], [2], [3])
  // These are pre-formatted card texts from the RAG pipeline with [N] indices.
  // They must be injected as a block so Gemini sees the numbering.
  if (params.insights && params.insights.length > 0) {
    const hasNumberedCards = params.insights.some((i) => i.text.match(/^\[?\d+\]/));
    if (hasNumberedCards) {
      // RAG cards with [1], [2] numbering — inject as LERNMATERIAL block
      const cardsText = params.insights.map((i) => i.text).join('\n');
      prompt += `\n\nLERNMATERIAL (nummerierte Karten — verwende [N] Referenzen in deiner Antwort):\n${cardsText}`;
    } else {
      // Legacy insights (learned/weakness) — inject as before
      const insightsText = params.insights
        .map((i) => `- ${i.type === 'weakness' ? '[!] ' : ''}${i.text}`)
        .join('\n');
      prompt +=
        `\n\nBISHERIGE ERKENNTNISSE DES NUTZERS ZU DIESER KARTE:\n${insightsText}` +
        `\n\nBerücksichtige diese Erkenntnisse in deinen Antworten. Gehe besonders auf markierte Schwachpunkte [!] ein.`;
    }
  }

  // Always append handoff section
  prompt += HANDOFF_SECTION;

  return prompt;
}

// ── Plusi ────────────────────────────────────────────────────────────

function buildPlusiPrompt(params: BuildSystemPromptParams): string {
  const memoryContext = params.memoryContext ?? '';
  const internalState = params.internalState ?? '';
  const relationshipContext = params.relationshipContext ?? '';
  const driveDescription = params.driveDescription ?? '';
  const nextWakeInfo = params.nextWakeInfo ?? 'nicht gesetzt';

  // Mirrors the .replace() chain in plusi/agent.py (~line 670-675)
  return PLUSI_SYSTEM_PROMPT
    .replace('{memory_context}', memoryContext)
    .replace('{internal_state}', internalState)
    .replace('{relationship_context}', relationshipContext)
    .replace('{{drive_description}}', driveDescription)
    .replace('{{next_wake_info}}', nextWakeInfo);
}

// ── Help ─────────────────────────────────────────────────────────────

function buildHelpPrompt(params: BuildSystemPromptParams): string {
  let prompt = HELP_SYSTEM_PROMPT;

  // Append memory context if provided (mirrors run_help() in ai/help_agent.py)
  if (params.memoryContext) {
    prompt += `\n\nUSER-KONTEXT:\n${params.memoryContext}`;
  }

  return prompt;
}

// ── Re-exports for convenience ───────────────────────────────────────

export {
  TUTOR_PROMPT,
  HANDOFF_SECTION,
  PLUSI_SYSTEM_PROMPT,
  PLANNING_PROMPT,
  HELP_SYSTEM_PROMPT,
  HELP_CONTEXT,
  RESEARCH_PROMPT,
};
