import React from 'react';
import { Play } from 'lucide-react';

/**
 * GraphBottomBar — contextual bottom bar for the Knowledge Graph view.
 *
 * Three states:
 *   Idle        — no selectedTerm, no searchResult → shows graph stats
 *   Search      — searchResult is set → shows matched terms + card count
 *   Term detail — selectedTerm is set → shows definition, connected terms, stack action
 *
 * Positioning: fixed at bottom, centered, max-width 700px.
 * Material: .ds-frosted (frosted glass).
 * All colors via var(--ds-*) tokens — no hardcoded values.
 */

/* ─── Small internal helpers ─── */

function StatusDot({ active }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: active ? 'var(--ds-green)' : 'var(--ds-text-muted)',
        flexShrink: 0,
        transition: 'background 0.3s',
        ...(active
          ? {}
          : {
              animation: 'graph-bar-pulse 1.6s ease-in-out infinite',
            }),
      }}
    />
  );
}

function Separator() {
  return (
    <span style={{ color: 'var(--ds-text-muted)', margin: '0 6px', userSelect: 'none' }}>
      ·
    </span>
  );
}

function StackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        background: 'var(--ds-accent)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'opacity 0.15s',
        lineHeight: 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
    >
      <Play size={12} strokeWidth={2.5} />
      Stapel starten
    </button>
  );
}

function TermChip({ term, onClick }) {
  return (
    <button
      onClick={() => onClick(term)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        background: 'var(--ds-hover-tint)',
        border: '1px solid var(--ds-border-subtle)',
        borderRadius: 8,
        color: 'var(--ds-text-secondary)',
        fontSize: 12,
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s, color 0.15s',
        lineHeight: 1.4,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--ds-active-tint)';
        e.currentTarget.style.color = 'var(--ds-text-primary)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--ds-hover-tint)';
        e.currentTarget.style.color = 'var(--ds-text-secondary)';
      }}
    >
      {term}
    </button>
  );
}

/* ─── Pulse placeholder for loading text ─── */
function PulseText({ width = 160 }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width,
        height: 13,
        borderRadius: 6,
        background: 'var(--ds-border-subtle)',
        animation: 'graph-bar-pulse 1.6s ease-in-out infinite',
        verticalAlign: 'middle',
      }}
    />
  );
}

/* ─── State 1: Idle ─── */
function IdleState({ status }) {
  const loaded = status !== null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      color: 'var(--ds-text-secondary)',
    }}>
      <StatusDot active={loaded} />
      {loaded ? (
        <>
          <span style={{ color: 'var(--ds-green)', fontWeight: 500 }}>Graph aktuell</span>
          <Separator />
          <span>
            {status.totalCards.toLocaleString('de-DE')} Karten
          </span>
          <Separator />
          <span>
            {status.totalTerms.toLocaleString('de-DE')} Terme
          </span>
          {status.pendingUpdates > 0 && (
            <>
              <Separator />
              <span style={{ color: 'var(--ds-yellow)' }}>
                {status.pendingUpdates} ausstehend
              </span>
            </>
          )}
        </>
      ) : (
        <PulseText width={220} />
      )}
    </div>
  );
}

/* ─── State 2: Search result ─── */
function SearchState({ searchResult, onStartStack }) {
  const { matchedTerms = [], cardIds = [], isQuestion } = searchResult;
  const cardCount = cardIds.length;

  const summary = matchedTerms.length > 0
    ? matchedTerms.slice(0, 3).join(', ') + (matchedTerms.length > 3 ? ` +${matchedTerms.length - 3}` : '')
    : (isQuestion ? 'Keine passenden Terme' : 'Keine Ergebnisse');

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--ds-text-primary)', fontWeight: 500 }}>
          {summary}
        </span>
        {cardCount > 0 && (
          <>
            <Separator />
            <span style={{ fontSize: 13, color: 'var(--ds-text-secondary)' }}>
              {cardCount} relevante {cardCount === 1 ? 'Karte' : 'Karten'}
            </span>
          </>
        )}
      </div>
      {cardCount > 0 && (
        <StackButton onClick={() => onStartStack(matchedTerms[0] || '', cardIds)} />
      )}
    </div>
  );
}

/* ─── State 3: Selected term detail ─── */
function TermState({ selectedTerm, termDefinition, onStartStack, onTermClick, onRequestDefinition }) {
  const def = termDefinition;
  const isLoading = def?.loading === true;
  const hasError = !!def?.error;
  const hasDefinition = !isLoading && !hasError && def?.definition;
  const connectedTerms = def?.connectedTerms || [];
  const sourceCount = def?.sourceCount || 0;
  const cardIds = [];  // cards come from the hook; approximate by sourceCount

  // Request definition when term is selected and no definition loaded yet
  React.useEffect(() => {
    if (selectedTerm && !def && onRequestDefinition) {
      onRequestDefinition(selectedTerm);
    }
  }, [selectedTerm, def, onRequestDefinition]);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Term name + stack button row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ds-text-primary)' }}>
          {selectedTerm}
        </span>
        {sourceCount > 0 && (
          <StackButton onClick={() => onStartStack(selectedTerm, cardIds)} />
        )}
      </div>

      {/* Card count + decks row */}
      {(sourceCount > 0 || isLoading) && (
        <div style={{ fontSize: 13, color: 'var(--ds-text-secondary)' }}>
          {isLoading ? (
            <PulseText width={120} />
          ) : (
            <>
              {sourceCount} {sourceCount === 1 ? 'Karte' : 'Karten'}
              {def?.generatedBy && (
                <>
                  <Separator />
                  <span style={{ color: 'var(--ds-text-tertiary)' }}>
                    Generiert aus {sourceCount} {sourceCount === 1 ? 'Karte' : 'Karten'}
                  </span>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Definition block */}
      <div style={{ fontSize: 13, color: 'var(--ds-text-secondary)', lineHeight: 1.5 }}>
        {isLoading && <PulseText width="100%" />}
        {hasError && (
          <span style={{ color: 'var(--ds-text-tertiary)', fontStyle: 'italic' }}>
            {def.error}
          </span>
        )}
        {hasDefinition && (
          <span>{def.definition}</span>
        )}
        {!def && !isLoading && !hasError && (
          <PulseText width={200} />
        )}
      </div>

      {/* Connected terms row */}
      {connectedTerms.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--ds-text-tertiary)', flexShrink: 0 }}>
            Verbunden:
          </span>
          {connectedTerms.slice(0, 6).map(term => (
            <TermChip key={term} term={term} onClick={onTermClick} />
          ))}
          {connectedTerms.length > 6 && (
            <span style={{ fontSize: 12, color: 'var(--ds-text-muted)' }}>
              +{connectedTerms.length - 6}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─── */
export default function GraphBottomBar({
  status,
  selectedTerm,
  termDefinition,
  searchResult,
  onStartStack,
  onTermClick,
  onRequestDefinition,
}) {
  // Determine active state
  const isTermState = !!selectedTerm;
  const isSearchState = !isTermState && !!searchResult;

  return (
    <>
      <style>{`
        @keyframes graph-bar-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
      `}</style>

      <div
        className="ds-frosted"
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 48px)',
          maxWidth: 700,
          padding: '14px 20px',
          zIndex: 100,
          borderRadius: 16,
          boxShadow: 'var(--ds-shadow-lg)',
          transition: 'all 0.25s ease',
          boxSizing: 'border-box',
        }}
      >
        {isTermState && (
          <TermState
            selectedTerm={selectedTerm}
            termDefinition={termDefinition}
            onStartStack={onStartStack}
            onTermClick={onTermClick}
            onRequestDefinition={onRequestDefinition}
          />
        )}
        {isSearchState && (
          <SearchState
            searchResult={searchResult}
            onStartStack={onStartStack}
          />
        )}
        {!isTermState && !isSearchState && (
          <IdleState status={status} />
        )}
      </div>
    </>
  );
}
