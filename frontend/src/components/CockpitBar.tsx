import React from 'react';

interface CockpitBarProps {
  deckName?: string | null;
  cardCount?: number;
  onStartLearning?: () => void;
  onClose?: () => void;
  animationState: 'hidden' | 'emerging' | 'visible' | 'reversing';
}

const COCKPIT_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 18,
  transform: 'translateX(-50%)',
  height: 44,
  borderRadius: 14,
  display: 'flex',
  alignItems: 'center',
  padding: '0 18px',
  gap: 10,
  zIndex: 7,
  whiteSpace: 'nowrap',
};

const COUNT_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  background: 'var(--ds-bg-overlay)',
  padding: '2px 8px',
  borderRadius: 5,
};

const DIVIDER_STYLE: React.CSSProperties = {
  width: 1,
  height: 13,
  background: 'var(--ds-border-subtle)',
};

const LEARN_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ds-accent)',
  fontWeight: 500,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: 'inherit',
};

const ESC_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  background: 'var(--ds-bg-overlay)',
  padding: '2px 7px',
  borderRadius: 5,
  fontWeight: 500,
};

export default function CockpitBar({
  deckName,
  cardCount,
  onStartLearning,
  onClose,
  animationState,
}: CockpitBarProps) {
  if (animationState === 'hidden') return null;

  const animClass =
    animationState === 'emerging' ? 'cockpit-emerge' :
    animationState === 'reversing' ? 'cockpit-reverse' :
    '';

  return (
    <>
      <div
        className={`ds-frosted ${animClass}`}
        style={{
          ...COCKPIT_STYLE,
          opacity: animationState === 'visible' ? 1 : undefined,
        }}
      >
        {deckName ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--ds-text-tertiary)' }}>📚</span>
            <span style={{ fontSize: 13, color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
              {deckName}
            </span>
            {cardCount != null && <span style={COUNT_STYLE}>{cardCount}</span>}
            <span style={DIVIDER_STYLE} />
            <button style={LEARN_STYLE} onClick={onStartLearning}>
              Lernen ↵
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, color: 'var(--ds-text-tertiary)', fontWeight: 500 }}>
              Keine Auswahl
            </span>
            <kbd style={ESC_STYLE} onClick={onClose}>ESC</kbd>
          </>
        )}
      </div>
      <style>{`
        .cockpit-emerge {
          opacity: 0;
          filter: brightness(0.2);
          transform: translateX(-50%) scaleX(0.88) scaleY(0.5);
          animation: cockpitEmerge 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.02s forwards;
        }
        .cockpit-reverse {
          animation: cockpitReverse 0.35s cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        @keyframes cockpitEmerge {
          0%   { opacity: 0;    top: 56px; transform: translateX(-50%) scaleX(0.88) scaleY(0.5); filter: brightness(0.2); }
          20%  { opacity: 0.7;  top: 50px; transform: translateX(-50%) scaleX(0.91) scaleY(0.64); filter: brightness(0.5); }
          36%  { opacity: 0.88; top: 38px; transform: translateX(-50%) scaleX(0.95) scaleY(0.84); filter: brightness(0.8); }
          52%  { opacity: 0.98; top: 22px; transform: translateX(-50%) scaleX(0.99) scaleY(0.98); filter: brightness(0.97); }
          60%  { opacity: 1;    top: 17px; transform: translateX(-50%) scaleX(1.0) scaleY(1.0); filter: brightness(1); }
          68%  { opacity: 1;    top: 14px; transform: translateX(-50%) scaleX(1.012) scaleY(1.03); filter: brightness(1.05); }
          84%  { opacity: 1;    top: 18px; transform: translateX(-50%) scaleX(1.002) scaleY(1.004); filter: brightness(1.0); }
          100% { opacity: 1;    top: 18px; transform: translateX(-50%) scaleX(1) scaleY(1); filter: brightness(1); }
        }
        @keyframes cockpitReverse {
          0%   { opacity: 1; top: 18px; transform: translateX(-50%) scaleX(1) scaleY(1); filter: brightness(1); }
          40%  { opacity: 0.7; top: 30px; transform: translateX(-50%) scaleX(0.95) scaleY(0.8); filter: brightness(0.6); }
          70%  { opacity: 0.3; top: 45px; transform: translateX(-50%) scaleX(0.90) scaleY(0.6); filter: brightness(0.3); }
          100% { opacity: 0;   top: 56px; transform: translateX(-50%) scaleX(0.88) scaleY(0.5); filter: brightness(0.2); }
        }
      `}</style>
    </>
  );
}
