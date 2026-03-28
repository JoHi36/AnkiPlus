import React from 'react';

/**
 * Accurate mock of vanilla Anki's card reviewer (light theme).
 * Only the content area — title bar with dots is shared with DemoShell.
 */

export function OldAnkiMock() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: '#e8e8e8',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      color: '#333',
      userSelect: 'none',
    }}>

      {/* ── Anki Toolbar — centered, rounded, not full width ── */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        padding: '6px 16px 0',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 20,
          padding: '6px 24px',
          background: '#d5d5d5',
          borderRadius: 8,
          fontSize: 13, fontWeight: 500, color: '#444',
          border: '1px solid #bbb',
        }}>
          {['Stapelübersicht', 'Hinzufügen', 'Kartenverwaltung', 'Statistiken', 'Synchronisieren'].map(item => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>

      {/* ── Info row (timer, tags, etc.) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 16px',
        fontSize: 11, color: '#888', flexShrink: 0,
      }}>
        <span style={{ color: '#5a9', fontFamily: 'ui-monospace, monospace' }}>0:11</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ padding: '1px 6px', border: '1px solid #bbb', borderRadius: 3, fontSize: 10 }}>Tags</span>
          <span style={{ color: '#999' }}>AMBOSS</span>
          <span style={{ padding: '1px 6px', border: '1px solid #bbb', borderRadius: 3, fontSize: 10 }}>Note ID</span>
        </div>
        <span style={{ padding: '1px 6px', border: '1px solid #bbb', borderRadius: 3, fontSize: 10 }}>Errata</span>
      </div>

      {/* ── Progress gradient bar ── */}
      <div style={{
        height: 2, flexShrink: 0,
        background: 'linear-gradient(to right, #c44, #c84, #4a8)',
      }} />

      {/* ── Card content — white, centered ── */}
      <div style={{
        flex: 1, overflow: 'auto',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 40px',
        background: '#fafafa',
      }}>
        <p style={{
          fontSize: 20, lineHeight: 1.6, textAlign: 'center',
          maxWidth: 560, color: '#222',
        }}>
          Welche typischen <span style={{ color: '#4a9' }}>Befunde</span> zeigen sich
          in der <span style={{ color: '#c44' }}>Urinuntersuchung</span> bei der{' '}
          <span style={{ color: '#c44' }}>Lupusnephritis</span>?
        </p>

        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
          <p style={{ fontSize: 16, color: '#333' }}>
            ① Laborchemisch: <span style={{ color: '#c44', fontWeight: 600 }}>Proteinurie</span>
          </p>
          <p style={{ fontSize: 16, color: '#333' }}>
            ② Urinsediment: <span style={{ color: '#c44', fontWeight: 600 }}>Erythrozytenzylinder</span>
          </p>
          <p style={{ fontSize: 16, color: '#333' }}>
            ③ Urinsediment: <span style={{ color: '#c44', fontWeight: 600 }}>Akanthozyten</span>
          </p>
        </div>
      </div>

      {/* ── Bottom: rating buttons ── */}
      <div style={{
        flexShrink: 0, padding: '8px 16px 12px',
        background: '#e8e8e8',
        borderTop: '1px solid #ccc',
      }}>
        {/* Time labels */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 48,
          marginBottom: 4, fontSize: 11, color: '#888',
        }}>
          <span>&lt;1 min</span>
          <span>&lt;6 min</span>
          <span>&lt;10 min</span>
          <span>4 d</span>
        </div>

        {/* Buttons row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button style={{
            padding: '4px 14px', fontSize: 12, color: '#666',
            background: '#ddd', border: '1px solid #bbb', borderRadius: 4,
          }}>Bearbeiten</button>

          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { label: 'Nochmal', color: '#c44' },
              { label: 'Schwer', color: '#888' },
              { label: 'Gut',     color: '#4a8' },
              { label: 'Einfach', color: '#48c' },
            ].map(b => (
              <button key={b.label} style={{
                padding: '5px 18px', fontSize: 12, fontWeight: 500,
                color: '#555', background: '#ddd',
                border: '1px solid #bbb', borderRadius: 4,
              }}>{b.label}</button>
            ))}
          </div>

          <button style={{
            padding: '4px 14px', fontSize: 12, color: '#666',
            background: '#ddd', border: '1px solid #bbb', borderRadius: 4,
          }}>Mehr ▾</button>
        </div>
      </div>
    </div>
  );
}
