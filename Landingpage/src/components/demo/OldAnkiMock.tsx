import React from 'react';

/**
 * 1:1 mock of vanilla Anki's deck browser (Stapelübersicht).
 * Shown before the ParticlePlus intro transforms it into the modern DemoShell.
 */

const MENU_BAR: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 20, height: 36, flexShrink: 0,
  background: '#383838', borderBottom: '1px solid #222',
  fontSize: 13, fontWeight: 500, color: '#b0b0b0',
};

const TABLE_WRAP: React.CSSProperties = {
  margin: '24px auto 0', width: '80%', maxWidth: 560,
  border: '1px solid #444', borderRadius: 4, overflow: 'hidden',
};

const TH: React.CSSProperties = {
  padding: '8px 12px', fontSize: 12, fontWeight: 600,
  color: '#999', textAlign: 'left',
  borderBottom: '1px solid #444', background: '#333',
};

const TH_NUM: React.CSSProperties = { ...TH, textAlign: 'right', width: 60 };

const TD: React.CSSProperties = {
  padding: '7px 12px', fontSize: 13, color: '#ccc',
  borderBottom: '1px solid #3a3a3a',
};

const TD_NUM: React.CSSProperties = {
  ...TD, textAlign: 'right', fontFamily: 'ui-monospace, monospace', width: 60,
};

const DECKS = [
  { name: 'Anatomie',        indent: false, neu: 204, lernen: 12,  fällig: 1850 },
  { name: 'Biochemie',       indent: false, neu: 600, lernen: 3,   fällig: 3200 },
  { name: 'Physiologie',     indent: false, neu: 150, lernen: 8,   fällig: 920  },
  { name: 'Pharmakologie',   indent: false, neu: 90,  lernen: 26,  fällig: 540  },
  { name: 'Pathologie',      indent: false, neu: 320, lernen: 0,   fällig: 2100 },
  { name: 'Klinische Chemie', indent: true, neu: 45,  lernen: 2,   fällig: 180  },
];

const BOTTOM_BTN: React.CSSProperties = {
  padding: '4px 14px', fontSize: 11, fontWeight: 500,
  color: '#999', background: '#3a3a3a',
  border: '1px solid #555', borderRadius: 4,
};

export function OldAnkiMock() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: '#2d2d2d', overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      color: '#d4d4d4', userSelect: 'none',
    }}>

      {/* ── Menu Bar ── */}
      <div style={MENU_BAR}>
        {['Stapel', 'Hinzufügen', 'Kartenverwaltung', 'Statistiken'].map(item => (
          <span key={item}>{item}</span>
        ))}
        <span style={{ color: '#4a9eff' }}>Synchronisieren</span>
      </div>

      {/* ── Deck Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={TABLE_WRAP as any} cellSpacing={0} cellPadding={0}>
          <thead>
            <tr>
              <th style={TH}>Stapel</th>
              <th style={TH_NUM}>Neu</th>
              <th style={TH_NUM}>Lernen</th>
              <th style={TH_NUM}>Fällig</th>
            </tr>
          </thead>
          <tbody>
            {DECKS.map((d, i) => (
              <tr key={i}>
                <td style={TD}>
                  {d.indent ? '    ' : '+ '}{d.name}
                </td>
                <td style={{ ...TD_NUM, color: '#5b9aff' }}>{d.neu}</td>
                <td style={{ ...TD_NUM, color: d.lernen > 0 ? '#e05555' : '#666' }}>{d.lernen}</td>
                <td style={{ ...TD_NUM, color: '#45b065' }}>{d.fällig}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Stats */}
        <div style={{
          textAlign: 'center', marginTop: 20,
          fontSize: 12, color: '#777',
        }}>
          Heute 0 Karten in 0 Sekunden gelernt (0s/Karte)
        </div>
      </div>

      {/* ── Bottom Buttons ── */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 8,
        padding: '12px 16px', flexShrink: 0,
        borderTop: '1px solid #3a3a3a',
      }}>
        <button style={BOTTOM_BTN}>Stapel teilen</button>
        <button style={BOTTOM_BTN}>Stapel erstellen</button>
        <button style={BOTTOM_BTN}>Datei importieren</button>
      </div>
    </div>
  );
}
