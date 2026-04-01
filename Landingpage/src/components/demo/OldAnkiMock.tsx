import React from 'react';

/**
 * Accurate mock of vanilla Anki's dark-mode card reviewer.
 * Title bar with dots is rendered by the parent (shared).
 * This component shows: centered toolbar + card content + bottom buttons.
 */

export function OldAnkiMock() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: '#2d2d2d',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      color: '#d4d4d4',
      userSelect: 'none',
    }}>

      {/* ── Title bar with dots ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 16px',
        background: '#383838',
        borderBottom: '1px solid #222',
        flexShrink: 0,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
      </div>

      {/* ── Anki Toolbar — notch style, hangs from header ── */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 16,
          padding: '6px 24px',
          background: '#383838',
          borderRadius: '0 0 10px 10px',
          fontSize: 12, fontWeight: 500, color: '#999',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {['Stapelübersicht', 'Hinzufügen', 'Kartenverwaltung', 'Statistiken', 'Synchronisieren'].map(item => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>

      {/* ── Info row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '3px 16px',
        fontSize: 10, color: '#666', flexShrink: 0,
      }}>
        <span style={{ color: '#5a9', fontFamily: 'ui-monospace, monospace' }}>0:08</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ padding: '1px 5px', border: '1px solid #555', borderRadius: 3, fontSize: 9, color: '#777' }}>Tags</span>
          <span style={{ color: '#777', fontSize: 10 }}>AMBOSS</span>
        </div>
        <span style={{ padding: '1px 5px', border: '1px solid #555', borderRadius: 3, fontSize: 9, color: '#777' }}>Errata</span>
      </div>

      {/* ── Gradient progress bar ── */}
      <div style={{ height: 2, flexShrink: 0, background: 'linear-gradient(to right, #c44, #c84, #4a8)' }} />

      {/* ── Card content ── */}
      <div style={{
        flex: 1, overflow: 'auto',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '28px 40px',
      }}>
        <p style={{
          fontSize: 19, lineHeight: 1.55, textAlign: 'center',
          maxWidth: 540, color: '#e0e0e0',
        }}>
          Welche typischen <span style={{ color: '#4a9' }}>Befunde</span> zeigen sich
          in der <span style={{ color: '#c44' }}>Urinuntersuchung</span> bei der{' '}
          <span style={{ color: '#c44' }}>Lupusnephritis</span>?
        </p>

        <div style={{ marginTop: 20, fontSize: 22, color: '#c84', fontWeight: 700 }}>[...]</div>
      </div>

      {/* ── Bottom: stats + buttons ── */}
      <div style={{ flexShrink: 0, padding: '6px 16px 10px', borderTop: '1px solid #3a3a3a' }}>
        {/* Card counts */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 4,
          marginBottom: 6, fontSize: 11, fontFamily: 'ui-monospace, monospace',
        }}>
          <span style={{ color: '#5b9aff' }}>204</span>
          <span style={{ color: '#555' }}>+</span>
          <span style={{ color: '#e05555' }}>12</span>
          <span style={{ color: '#555' }}>+</span>
          <span style={{ color: '#45b065' }}>1850</span>
        </div>

        {/* Button row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            padding: '3px 12px', fontSize: 11, color: '#888',
            background: '#383838', border: '1px solid #555', borderRadius: 4,
          }}>Bearbeiten</span>

          <button style={{
            padding: '5px 24px', fontSize: 12, fontWeight: 500,
            color: '#ccc', background: '#444', border: '1px solid #555',
            borderRadius: 4,
          }}>Antwort anzeigen</button>

          <span style={{
            padding: '3px 12px', fontSize: 11, color: '#888',
            background: '#383838', border: '1px solid #555', borderRadius: 4,
          }}>Mehr ▾</span>
        </div>
      </div>
    </div>
  );
}
