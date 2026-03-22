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
        background: on ? 'var(--ds-accent, #0a84ff)' : 'rgba(255,255,255,0.08)',
        opacity: disabled ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
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
        letterSpacing: '0.8px', color: 'var(--ds-text-tertiary, rgba(255,255,255,0.22))',
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
          border: '1px solid var(--ds-text-tertiary, rgba(255,255,255,0.22))',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, fontWeight: 700,
          color: 'var(--ds-text-tertiary, rgba(255,255,255,0.22))',
          cursor: 'help',
        }}>?</span>
      )}
      {showTip && tooltip && (
        <>
          <span style={{
            position: 'absolute', left: 12, top: '100%',
            width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderBottom: '5px solid var(--ds-bg-overlay, #3A3A3C)',
            zIndex: 21,
          }} />
          <span style={{
            position: 'absolute', left: 0, top: '100%', marginTop: 5,
            padding: '6px 10px', borderRadius: 6, maxWidth: 260,
            background: 'var(--ds-bg-overlay, #3A3A3C)',
            color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))',
            fontSize: 11, lineHeight: 1.5, whiteSpace: 'normal',
            zIndex: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
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

export default function ResearchMenu({ bridge, onNavigateBack }) {
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
      {/* Header with back arrow */}
      <div style={S.header}>
        <button
          onClick={onNavigateBack}
          style={S.backButton}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ds-text-primary, rgba(255,255,255,0.88))'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ds-text-secondary, rgba(255,255,255,0.45))'; }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span style={S.headerTitle}>Research Agent</span>
        {/* Spacer to balance the back button */}
        <div style={{ width: 28 }} />
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
                    ? '1px solid var(--ds-border-subtle, rgba(255,255,255,0.06))'
                    : 'none',
                }}
              >
                <div style={{ marginRight: 10, flexShrink: 0 }}>
                  <SourceLogo src={logo} alt={label} size={28} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))' }}>
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
                  <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))', marginTop: 1 }}>
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
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 0 16px',
  },
  headerTitle: {
    fontSize: 16, fontWeight: 600, textAlign: 'center',
    color: 'var(--ds-text-primary, rgba(255,255,255,0.88))',
  },
  backButton: {
    background: 'none', border: 'none', padding: 6, borderRadius: 6,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--ds-text-secondary, rgba(255,255,255,0.45))',
    transition: 'color 0.15s',
    width: 28, height: 28,
  },
  section: { marginBottom: 20 },
  card: {
    background: 'var(--ds-bg-canvas, rgba(255,255,255,0.03))',
    border: '1px solid var(--ds-border-subtle, rgba(255,255,255,0.06))',
    borderRadius: 12, overflow: 'hidden',
  },
  toolRow: {
    display: 'flex', alignItems: 'center', padding: '12px 16px',
  },
};
