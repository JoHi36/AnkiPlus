import React from 'react';
import { StepRendererDef } from './types';
import { registerStepRenderer } from './stepRegistry';

/* ═══════════════════════════════════════════════════
   Default Step Renderers — extracted verbatim from
   ThoughtStream.tsx (v6) for the pluggable registry.
   ═══════════════════════════════════════════════════ */

/* ── Constants ── */

const MODE_LABELS: Record<string, string> = {
  both: 'Hybrid-Suche',
  sql: 'Keyword-Suche',
  semantic: 'Semantische Suche',
};

const RESPONSE_LENGTH_LABELS: Record<string, string> = {
  short: 'Kurz',
  medium: 'Mittel',
  long: 'Ausführlich',
};

const STEP_NAMES: Record<string, string> = {
  router: 'Analyse',
  orchestrating: 'Routing',
  sql_search: 'Keyword-Suche',
  semantic_search: 'Semantische Suche',
  merge: 'Zusammenführung',
  generating: 'Generierung',
};

/* ── getDoneLabel — per-step done label logic ── */

function getDoneLabel(step: string, data: Record<string, any>, status: string): string {
  if (status === 'error') return `${STEP_NAMES[step] || step} fehlgeschlagen`;
  switch (step) {
    case 'router':
    case 'orchestrating': {
      const rm = data.retrieval_mode || '';
      if (rm.startsWith('subagent:') || rm.startsWith('agent:')) {
        return 'Aufgabe zugewiesen';
      }
      const mode = MODE_LABELS[rm] || rm || '';
      const scope = data.scope_label || '';
      if (rm === 'plusi') return 'Plusi';
      if (!data.search_needed) return 'Direkte Antwort';
      return scope ? `${mode} · ${scope}` : mode || 'Anfrage analysiert';
    }
    case 'sql_search':
      return `${data.total_hits || 0} Keyword-Treffer`;
    case 'semantic_search':
      return `${data.total_hits || 0} semantische Treffer`;
    case 'merge': {
      const t = data.total || 0;
      const k = data.keyword_count || 0;
      const s = data.semantic_count || 0;
      return `${t} Quelle${t !== 1 ? 'n' : ''} kombiniert` + (k + s > 0 ? ` (${k}K + ${s}S)` : '');
    }
    case 'generating':
      return 'Antwort generiert';
    default:
      return step;
  }
}

/* ═══════════════════════════════════════════════════
   RENDERER COMPONENTS — verbatim from ThoughtStream
   ═══════════════════════════════════════════════════ */

/* ── Router Details (done state) ── */
function RouterDetails({ data, agentColor }: { data: Record<string, any>; agentColor?: string }) {
  const retrievalMode = data.retrieval_mode || '';
  const isAgentRoute = retrievalMode.startsWith('subagent:') || retrievalMode.startsWith('agent:');
  const agentId = isAgentRoute ? retrievalMode.split(':')[1] : '';

  // Agent routing — show agent-specific tags with distinct icons
  if (isAgentRoute) {
    const agentLabel = agentId.charAt(0).toUpperCase() + agentId.slice(1);

    // Routing method: Auto (LLM decided), Direkt (@mention), Übergabe (handoff)
    const method = data.method || 'default';
    const routingValue = method === 'llm' ? 'Auto'
      : method === 'mention' || method === 'explicit' ? 'Direkt'
      : method === 'handoff' ? 'Übergabe'
      : method === 'heuristic' ? 'Auto'
      : 'Auto';

    // Context: what the agent can see
    const hasCard = data.has_card || (data.scope && data.scope !== 'none');
    const contextValue = hasCard ? 'Karte' : 'Frei';

    // SVG icon paths (16x16 viewBox)
    const routingIcon = 'M3 3v10M3 8h4l3-5h3M3 8h4l3 5h3';
    const agentIcon = 'M4 4L12 4M4 4L8 12M12 4L8 12M4 4a1.5 1.5 0 1 0 0-.01M12 4a1.5 1.5 0 1 0 0-.01M8 12a1.5 1.5 0 1 0 0-.01';
    const contextIcon = hasCard ? 'M2 3h12v10H2zM2 6h12' : 'M8 2v12M2 8h12';

    const tags = [
      { label: 'Routing', value: routingValue, icon: routingIcon, color: undefined as string | undefined },
      { label: 'Agent', value: agentLabel, icon: agentIcon, color: agentColor },
      { label: 'Kontext', value: contextValue, icon: contextIcon, color: undefined as string | undefined },
    ];

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {tags.map((tag) => (
          <div
            key={tag.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 5,
              background: tag.color ? `${tag.color}18` : 'var(--ds-hover-tint)',
              border: tag.color ? `1px solid ${tag.color}35` : 'none',
            }}
          >
            <svg width={10} height={10} viewBox="0 0 16 16" fill={tag.label === 'Agent' && tag.color ? tag.color : 'none'} stroke={tag.color || 'currentColor'} strokeWidth={tag.label === 'Agent' ? 1 : 1.2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: tag.color ? 0.8 : 0.25 }}>
              <path d={tag.icon} />
            </svg>
            <span style={{ color: 'var(--ds-text-muted)' }}>{tag.label}</span>
            <span style={{ color: tag.color || 'var(--ds-text-tertiary)', fontWeight: 500 }}>{tag.value}</span>
          </div>
        ))}
      </div>
    );
  }

  const isPlusi = retrievalMode === 'plusi';
  const tags = data.search_needed === false
    ? (isPlusi
      ? [
          { label: 'Modus', value: 'Plusi', icon: 'M8 2v12M2 8h12' },
          { label: 'Kontext', value: 'Nicht benötigt', icon: 'M2 3h12v10H2zM2 6h12' },
        ]
      : [
          { label: 'Strategie', value: 'Direkte Antwort', icon: 'M8 2v12M2 8h12' },
          { label: 'Kontext', value: 'Nicht benötigt', icon: 'M2 3h12v10H2zM2 6h12' },
          { label: 'Antwort', value: RESPONSE_LENGTH_LABELS[data.response_length] || 'Mittel', icon: 'M3 13V5h3v8M7 13V3h3v10M11 13V7h3v6' },
        ]
    )
    : [
        {
          label: 'Strategie',
          value: MODE_LABELS[data.retrieval_mode] || data.retrieval_mode || '—',
          icon: 'M8 2v12M2 8h12',
        },
        {
          label: 'Scope',
          value: data.scope_label || (data.scope === 'current' ? 'Aktueller Stapel' : 'Alle Stapel'),
          icon: 'M2 3h12v10H2zM2 6h12',
        },
        {
          label: 'Quellen',
          value: ({ low: 'Wenig (5)', medium: 'Mittel (10)', high: 'Viel (15)' } as Record<string, string>)[data.max_sources] || 'Mittel (10)',
          icon: 'M3 13V5h3v8M7 13V3h3v10M11 13V7h3v6',
        },
      ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {tags.map((tag) => (
        <div
          key={tag.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 5,
            background: 'var(--ds-hover-tint)',
          }}
        >
          <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.2 }}>
            <path d={tag.icon} />
          </svg>
          <span style={{ color: 'var(--ds-text-muted)' }}>{tag.label}</span>
          <span style={{ color: 'var(--ds-text-tertiary)', fontWeight: 500 }}>{tag.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Router Thinking (active state) — Skeleton tags matching done layout ── */
function RouterThinking() {
  const skeletonTags = [
    { label: 'Routing', width: 44, icon: 'M3 3v10M3 8h4l3-5h3M3 8h4l3 5h3' },
    { label: 'Agent', width: 64, icon: 'M4 4L12 4M4 4L8 12M12 4L8 12M4 4a1.5 1.5 0 1 0 0-.01M12 4a1.5 1.5 0 1 0 0-.01M8 12a1.5 1.5 0 1 0 0-.01' },
    { label: 'Kontext', width: 44, icon: 'M2 3h12v10H2zM2 6h12' },
  ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {skeletonTags.map((tag) => (
        <div
          key={tag.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 5,
            background: 'var(--ds-hover-tint)',
          }}
        >
          <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.2 }}>
            <path d={tag.icon} />
          </svg>
          <span style={{ color: 'var(--ds-text-muted)' }}>{tag.label}</span>
          {/* Shimmer placeholder for value */}
          <div
            style={{
              width: tag.width,
              height: 10,
              borderRadius: 3,
              background: 'linear-gradient(90deg, var(--ds-hover-tint), var(--ds-active-tint), var(--ds-hover-tint))',
              backgroundSize: '200% 100%',
              animation: 'ts-shimmerWave 2s ease-in-out infinite',
            }}
          />
        </div>
      ))}
    </div>
  );
}

/* ── SQL Tags ── */
function SqlTags({ data, isDone, animate = true }: { data: Record<string, any>; isDone: boolean; animate?: boolean }) {
  const queries = data.queries || [];
  if (queries.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {queries.map((q: any, i: number) => (
        <div
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 5,
            background: 'var(--ds-hover-tint)',
            color: 'var(--ds-text-secondary)',
            animation: animate ? `ts-pulseIn 0.3s ease-out ${i * 0.15}s both` : undefined,
          }}
        >
          <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.3 }}>
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <span>{q.text || q}</span>
          {isDone && typeof q.hits === 'number' && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: q.hits > 0 ? 'color-mix(in srgb, var(--ds-green) 60%, transparent)' : 'var(--ds-text-muted)',
              }}
            >
              {q.hits}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Semantic Chunks ── */
function SemanticChunks({ data, isDone, animate = true }: { data: Record<string, any>; isDone: boolean; animate?: boolean }) {
  const chunks = data.chunks || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginTop: 6 }}>
      {chunks.slice(0, 3).map((chunk: any, i: number) => (
        <div
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 8px',
            borderRadius: 6,
            background: 'var(--ds-hover-tint)',
            position: 'relative',
            overflow: 'hidden',
            maxWidth: '100%',
          }}
        >
          {/* Scan glow overlay when active */}
          {!isDone && animate && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                height: '100%',
                width: '40%',
                left: '-40%',
                background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--ds-accent) 8%, transparent), transparent)',
                animation: 'ts-scanGlow 2s ease-in-out infinite',
                pointerEvents: 'none',
              }}
            />
          )}
          <span
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: 'var(--ds-accent)',
              opacity: 0.7,
              minWidth: 36,
              flexShrink: 0,
            }}
          >
            {typeof chunk.score === 'number' ? chunk.score.toFixed(3) : '—'}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--ds-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              animation: animate ? `ts-fadeBlurIn 0.8s ease-out ${i * 0.3}s both` : undefined,
            }}
          >
            {chunk.snippet || chunk.text || ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Merge Bar ── */
function MergeBar({ data }: { data: Record<string, any> }) {
  const kw = data.keyword_count || 0;
  const sem = data.semantic_count || 0;
  const total = kw + sem;
  // Weight position: 0 = all keyword, 1 = all semantic
  const wp = typeof data.weight_position === 'number'
    ? data.weight_position
    : (total > 0 ? sem / total : 0.5);
  const wpPct = `${Math.round(wp * 100)}%`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'color-mix(in srgb, var(--ds-accent) 60%, transparent)', fontWeight: 600 }}>
        {kw}K
      </span>
      {/* Track */}
      <div style={{ flex: 1, position: 'relative', height: 5, display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 1.5,
            borderRadius: 1,
            background: `linear-gradient(90deg, color-mix(in srgb, var(--ds-accent) 30%, transparent) 0%, color-mix(in srgb, var(--ds-accent) 40%, transparent) ${wpPct}, color-mix(in srgb, var(--ds-green) 40%, transparent) ${wpPct}, var(--ds-green-30) 100%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: wpPct,
            transform: 'translateX(-50%)',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--ds-accent)',
            boxShadow: '0 0 6px color-mix(in srgb, var(--ds-accent) 40%, transparent)',
          }}
        />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'color-mix(in srgb, var(--ds-green) 60%, transparent)', fontWeight: 600 }}>
        {sem}S
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   REGISTRATION — wire all default step renderers
   ═══════════════════════════════════════════════════ */

const orchestratingDef: StepRendererDef = {
  id: 'orchestrating',
  label: 'Routing',
  activeTitle: 'Agent wird ausgewählt...',
  doneLabel: (data, status) => getDoneLabel('orchestrating', data, status),
  renderContent: ({ data, isDone, agentColor }) =>
    isDone
      ? <RouterDetails data={data} agentColor={agentColor} />
      : <RouterThinking />,
};

const routerDef: StepRendererDef = {
  ...orchestratingDef,
  id: 'router',
  label: 'Analyse',
  activeTitle: 'Suchstrategie wird festgelegt...',
  doneLabel: (data, status) => getDoneLabel('router', data, status),
};

const sqlSearchDef: StepRendererDef = {
  id: 'sql_search',
  label: 'Keyword-Suche',
  activeTitle: 'Durchsuche Karten...',
  doneLabel: (data, status) => getDoneLabel('sql_search', data, status),
  renderContent: ({ data, isDone, animate }) =>
    <SqlTags data={data} isDone={isDone} animate={animate} />,
};

const semanticSearchDef: StepRendererDef = {
  id: 'semantic_search',
  label: 'Semantische Suche',
  activeTitle: 'Semantische Suche...',
  doneLabel: (data, status) => getDoneLabel('semantic_search', data, status),
  renderContent: ({ data, isDone, animate }) =>
    <SemanticChunks data={data} isDone={isDone} animate={animate} />,
};

const mergeDef: StepRendererDef = {
  id: 'merge',
  label: 'Zusammenführung',
  activeTitle: 'Kombiniere Quellen...',
  doneLabel: (data, status) => getDoneLabel('merge', data, status),
  renderContent: ({ data, isDone }) =>
    isDone ? <MergeBar data={data} /> : null,
};

const strategyDef: StepRendererDef = {
  id: 'strategy',
  label: 'Strategie',
  activeTitle: 'Analysiere Anfrage...',
  doneLabel: (data, status) => {
    if (status === 'error') return 'Strategie fehlgeschlagen';
    if (!data.search_needed) return 'Direkte Antwort';
    const mode = MODE_LABELS[data.retrieval_mode] || data.retrieval_mode || 'Suche';
    const scope = data.scope === 'current_deck' ? 'im Deck' : data.scope === 'all_decks' ? 'alle Decks' : '';
    return scope ? `${mode} ${scope}` : mode;
  },
  renderContent: ({ data, isDone }) => {
    if (!isDone) return null;
    const tags: { label: string; value: string }[] = [];
    if (data.search_needed) {
      const mode = MODE_LABELS[data.retrieval_mode] || data.retrieval_mode || '';
      if (mode) tags.push({ label: 'Suche', value: mode });
      const scope = data.scope === 'current_deck' ? 'Deck' : data.scope === 'all_decks' ? 'Alle' : data.scope || '';
      if (scope) tags.push({ label: 'Bereich', value: scope });
    } else {
      tags.push({ label: 'Modus', value: 'Direkt' });
    }
    const length = RESPONSE_LENGTH_LABELS[data.response_length] || '';
    if (length) tags.push({ label: 'Länge', value: length });
    if (tags.length === 0) return null;
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        {tags.map((t, i) => (
          <span key={i} style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 6,
            background: 'var(--ds-hover-tint)', color: 'var(--ds-text-secondary)',
          }}>
            {t.label} <span style={{ fontWeight: 600 }}>{t.value}</span>
          </span>
        ))}
      </div>
    );
  },
};

const generatingDef: StepRendererDef = {
  id: 'generating',
  label: 'Generierung',
  activeTitle: 'Generiere Antwort...',
  doneLabel: (data, status) => getDoneLabel('generating', data, status),
  hidden: true,
};

const sourcesReadyDef: StepRendererDef = {
  id: 'sources_ready',
  label: 'Quellen',
  activeTitle: 'Quellen werden geladen...',
  doneLabel: (data, _status) => {
    const count = data.citations ? Object.keys(data.citations).length : 0;
    return `${count} Quellen gefunden`;
  },
  // Visible step — shows citation count after RAG completes
};

export function registerDefaultRenderers(): void {
  registerStepRenderer(orchestratingDef);
  registerStepRenderer(routerDef);
  registerStepRenderer(sqlSearchDef);
  registerStepRenderer(semanticSearchDef);
  registerStepRenderer(mergeDef);
  registerStepRenderer(strategyDef);
  registerStepRenderer(generatingDef);
  registerStepRenderer(sourcesReadyDef);
}
