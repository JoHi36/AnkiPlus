import React, { useState, useEffect } from 'react';
import perplexitySmall from '../assets/perplexity-logo-small.png';
import pubmedSmall from '../assets/pubmed-logo-small.svg';
import wikipediaSmall from '../assets/wikipedia-logo-small.png';

function SourceLogo({ src, alt, size = 28 }) {
  return (
    <img
      src={src}
      alt={alt}
      style={{ height: size, width: size, objectFit: 'contain' }}
    />
  );
}

function Toggle({ on, onChange, disabled = false }) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      style={{
        width: 36, height: 20, borderRadius: 10, position: 'relative',
        cursor: disabled ? 'default' : 'pointer', border: 'none', transition: 'background 0.2s',
        background: on ? 'var(--ds-accent)' : 'var(--ds-hover-tint)',
        opacity: disabled ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: 'var(--ds-text-primary)',
        transition: 'left 0.2s', boxShadow: '0 1px 3px var(--ds-shadow-sm)',
      }} />
    </button>
  );
}

function SectionHeader({ title, tooltip }) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div
      style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.8px', color: 'var(--ds-text-tertiary)',
        marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 6, position: 'relative',
      }}
      onMouseEnter={() => tooltip && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      {title}
      {tooltip && (
        <span style={{
          width: 13, height: 13, borderRadius: '50%',
          border: '1px solid var(--ds-text-tertiary)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, fontWeight: 700,
          color: 'var(--ds-text-tertiary)',
          cursor: 'help',
        }}>?</span>
      )}
      {showTip && tooltip && (
        <>
          <span style={{
            position: 'absolute', left: 12, top: '100%',
            width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderBottom: '5px solid var(--ds-bg-overlay)',
            zIndex: 21,
          }} />
          <span style={{
            position: 'absolute', left: 0, top: '100%', marginTop: 5,
            padding: '6px 10px', borderRadius: 6, maxWidth: 260,
            background: 'var(--ds-bg-overlay)',
            color: 'var(--ds-text-secondary)',
            fontSize: 11, lineHeight: 1.5, whiteSpace: 'normal',
            zIndex: 20, boxShadow: '0 2px 10px var(--ds-shadow-md)',
            pointerEvents: 'none',
          }}>
            {tooltip}
          </span>
        </>
      )}
    </div>
  );
}

const SOURCES = [
  {
    key: 'perplexity',
    label: 'Perplexity',
    desc: 'Web-Suche — Standard für alle allgemeinen Fragen',
    badge: 'Standard',
    badgeColor: '#20B8CD',
    alwaysOn: true,
    logo: perplexitySmall,
  },
  {
    key: 'pubmed',
    label: 'PubMed',
    desc: 'Wissenschaftliche Studien — bei medizinischen Fragen',
    logo: pubmedSmall,
  },
  {
    key: 'wikipedia',
    label: 'Wikipedia',
    desc: 'Definitionen & Überblick — schnell und kostenlos',
    logo: wikipediaSmall,
  },
];

export default function ResearchMenu({ agent, bridge, onNavigateBack = null }) {
  const [sources, setSources] = useState({
    perplexity: true,
    pubmed: true,
    wikipedia: true,
  });

  useEffect(() => {
    window.ankiBridge?.addMessage('getResearchSources', null);
  }, []);

  useEffect(() => {
    function handleLoaded(e) {
      const data = e.detail?.data || e.detail;
      if (data) setSources(prev => ({ ...prev, ...data }));
    }
    window.addEventListener('ankiResearchSourcesLoaded', handleLoaded);
    return () => window.removeEventListener('ankiResearchSourcesLoaded', handleLoaded);
  }, []);

  const handleToggle = (key) => {
    setSources(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      window.ankiBridge?.addMessage('saveResearchSources', updated);
      return updated;
    });
  };

  const S = styles;

  return (
    <div style={S.container}>
      {/* Agent title */}
      <div style={S.agentTitle}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ds-text-primary)' }}>
            {agent?.label || agent?.name || 'Research Agent'}
          </div>
          {agent?.description && (
            <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary)', marginTop: 2 }}>
              {agent.description}
            </div>
          )}
        </div>
      </div>

      {/* Sources section */}
      <div style={S.section}>
        <SectionHeader
          title="Quellen"
          tooltip="Quellen werden automatisch anhand deiner Frage gewählt. Spezifische Quellen (PubMed, Wikipedia) haben Vorrang, wenn Schlüsselwörter erkannt werden. Perplexity ist der Fallback für alle anderen Fragen."
        />
        <div style={S.card}>
          {SOURCES.map((source, i) => {
            const { key, label, desc, badge, badgeColor, alwaysOn, logo } = source;
            return (
              <div
                key={key}
                style={{
                  ...S.toolRow,
                  borderBottom: i < SOURCES.length - 1
                    ? '1px solid var(--ds-border-subtle)'
                    : 'none',
                }}
              >
                <div style={{ marginRight: 10, flexShrink: 0 }}>
                  <SourceLogo src={logo} alt={label} size={28} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-secondary)' }}>
                      {label}
                    </span>
                    {badge && (
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                        background: `${badgeColor}22`,
                        color: badgeColor,
                      }}>
                        {badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary)', marginTop: 1 }}>
                    {desc}
                  </div>
                </div>
                <Toggle
                  on={alwaysOn ? true : !!sources[key]}
                  onChange={alwaysOn ? undefined : () => handleToggle(key)}
                  disabled={!!alwaysOn}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    flex: 1, display: 'flex', flexDirection: 'column',
    padding: '0 20px 140px', overflowY: 'auto',
  },
  agentTitle: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '20px 0 16px',
    marginBottom: 0,
  },
  section: { marginBottom: 20 },
  card: {
    background: 'var(--ds-bg-canvas)',
    border: '1px solid var(--ds-border-subtle)',
    borderRadius: 12, overflow: 'hidden',
  },
  toolRow: {
    display: 'flex', alignItems: 'center', padding: '12px 16px',
  },
};
