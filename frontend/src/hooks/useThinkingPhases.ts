/**
 * useThinkingPhases — maps N raw pipeline steps to 2-3 display phases.
 *
 * Phase 1: Kontextanalyse (from: orchestrating, router, kg_enrichment)
 * Phase 2: Wissensabgleich (from: sql_search, semantic_search, kg_search, merge)
 * Phase 3: Channel-specific (from: generating)
 * Optional: Web-Recherche (from: web_search)
 */

import { useMemo } from 'react';
import { useReasoningStore } from '../reasoning/store';

export interface ThinkingPhase {
  name: string;
  status: 'pending' | 'active' | 'done';
  data?: string;
  color?: string;
}

const PHASE1_STEPS = new Set(['orchestrating', 'router', 'kg_enrichment', 'strategy']);
const PHASE2_STEPS = new Set(['sql_search', 'semantic_search', 'kg_search', 'merge']);
const PHASE3_STEPS = new Set(['generating']);
const WEB_STEPS = new Set(['web_search']);

const PHASE3_NAMES: Record<string, string> = {
  tutor: 'Synthese',
  research: 'Strukturanalyse',
  prufer: 'Evaluation',
  plusi: 'Reflexion',
};

function deriveStatus(
  steps: Array<{ step: string; status: string }>,
  phaseSteps: Set<string>
): 'pending' | 'active' | 'done' {
  const matching = steps.filter(s => phaseSteps.has(s.step));
  if (matching.length === 0) return 'pending';
  if (matching.some(s => s.status === 'active')) return 'active';
  if (matching.every(s => s.status === 'done' || s.status === 'error')) return 'done';
  return 'active';
}

export function useThinkingPhases(
  streamId?: string,
  agentName?: string,
  agentColor?: string
): ThinkingPhase[] | null {
  const { state: store } = useReasoningStore();
  const stream = streamId ? store?.streams?.[streamId] : undefined;

  return useMemo(() => {
    if (!stream || stream.steps.length === 0) return null;

    const steps = stream.steps;
    const agent = agentName || stream.agentName || 'tutor';
    const color = agentColor || stream.agentColor;

    const p1Status = deriveStatus(steps, PHASE1_STEPS);
    const p2Status = deriveStatus(steps, PHASE2_STEPS);
    const p3Status = deriveStatus(steps, PHASE3_STEPS);

    if (p1Status === 'pending' && p2Status === 'pending' && p3Status === 'pending') return null;

    // Phase 1 data: KG term count
    let p1Data: string | undefined;
    const kgDone = steps.find(s => s.step === 'kg_enrichment' && s.status === 'done');
    if (kgDone && (kgDone as any).data) {
      const d = (kgDone as any).data;
      const termCount = (d.tier1_terms?.length || 0) + (d.tier2_terms?.length || 0) || d.total_hits || 0;
      if (termCount > 0) p1Data = `${termCount} Begriffe`;
    }

    // Phase 2 data: card count from merge
    let p2Data: string | undefined;
    const mergeDone = steps.find(s => s.step === 'merge' && s.status === 'done');
    if (mergeDone && (mergeDone as any).data) {
      const total = (mergeDone as any).data.total;
      if (total > 0) p2Data = `${total} Karten`;
    }

    const phases: ThinkingPhase[] = [];

    // Phase 1: Kontextanalyse
    if (p1Status !== 'pending' || p2Status !== 'pending' || p3Status !== 'pending') {
      phases.push({ name: 'Kontextanalyse', status: p1Status, data: p1Data, color });
    }

    // Phase 2: Wissensabgleich
    if (p2Status !== 'pending' || p1Status === 'done') {
      phases.push({ name: 'Wissensabgleich', status: p2Status, data: p2Data, color });
    }

    // Optional: Web-Recherche
    const webStep = steps.find(s => WEB_STEPS.has(s.step));
    if (webStep) {
      const webData = (webStep as any).data;
      const sourceCount = webData?.source_count || webData?.total_hits || 0;
      phases.push({
        name: 'Web-Recherche',
        status: webStep.status === 'done' ? 'done' : 'active',
        data: sourceCount > 0 ? `${sourceCount} Quellen` : undefined,
        color,
      });
    }

    // Phase 3: channel-specific
    const mcStep = steps.find(s => s.step === 'mc_generation');
    const phase3Name = mcStep ? 'MC-Synthese' : (PHASE3_NAMES[agent] || 'Synthese');
    if (p3Status !== 'pending' || p2Status === 'done') {
      phases.push({ name: phase3Name, status: p3Status, color });
    }

    return phases.length > 0 ? phases : null;
  }, [stream, streamId, agentName, agentColor]);
}
