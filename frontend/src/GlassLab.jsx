import React, { useState, useEffect } from 'react';

/**
 * GlassLab — Idee A (Inline Autocomplete) vs C (Spotlight)
 * Access: npm run dev → localhost:3000?view=glass
 */

const cursorStyle = `@keyframes blink { 50% { opacity: 0; } }`;
function Cursor() {
  return <span style={{ width: 1.5, height: 18, background: 'var(--ds-accent)', display: 'inline-block', verticalAlign: 'text-bottom', animation: 'blink 1s step-end infinite' }} />;
}

function AgentChip({ label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 8px', borderRadius: 6, marginRight: 5,
      fontSize: 13, fontWeight: 600,
      background: 'var(--ds-accent)', color: '#fff',
      verticalAlign: 'baseline', lineHeight: '20px',
      userSelect: 'none',
    }}>{label}</span>
  );
}

/* Ghost text — the autocomplete suggestion */
function Ghost({ text }) {
  return (
    <span style={{
      color: 'var(--ds-text-muted)',
      opacity: 0.4,
      userSelect: 'none',
      pointerEvents: 'none',
    }}>{text}</span>
  );
}

function ActionRow() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      borderTop: '1px solid var(--ds-border-subtle)',
    }}>
      <button style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 4, height: 44, background: 'transparent', border: 'none',
        fontFamily: 'var(--ds-font-sans)', fontSize: 13, fontWeight: 600,
        color: 'var(--ds-text-primary)', cursor: 'pointer',
      }}>
        Schließen
        <kbd style={{ fontSize: 10, fontWeight: 500, color: 'var(--ds-text-muted)', background: 'var(--ds-bg-overlay)', borderRadius: 4, padding: '1px 5px' }}>ESC</kbd>
      </button>
      <div style={{ width: 1, height: 16, background: 'var(--ds-border-subtle)', flexShrink: 0 }} />
      <button style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 44, background: 'transparent', border: 'none',
        fontFamily: 'var(--ds-font-sans)', fontSize: 13, fontWeight: 500,
        color: 'var(--ds-text-tertiary)', cursor: 'pointer',
      }}>
        Übersicht
      </button>
    </div>
  );
}

function Section({ label, description, children }) {
  return (
    <div style={{ marginBottom: 56 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ds-text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--ds-text-tertiary)', marginBottom: 16, lineHeight: 1.5 }}>{description}</div>
      <div style={{ maxWidth: 480 }}>{children}</div>
    </div>
  );
}

function FlowArrow({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', color: 'var(--ds-text-muted)', fontSize: 11 }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12l7 7 7-7"/>
      </svg>
      {text}
    </div>
  );
}

function IdeaHeader({ title }) {
  return (
    <div style={{
      fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px',
      color: 'var(--ds-text-primary)',
      padding: '32px 0 8px',
      borderTop: '1px solid var(--ds-border-subtle)',
      marginTop: 24,
      marginBottom: 8,
    }}>
      {title}
    </div>
  );
}

export default function GlassLab() {
  const [theme, setTheme] = useState('dark');
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--ds-bg-deep)',
      padding: '40px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      transition: 'background 0.3s',
    }}>
      <style>{cursorStyle}</style>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--ds-text-primary)', marginBottom: 8 }}>
            A vs C
          </h1>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {['dark', 'light'].map(t => (
              <button key={t} onClick={() => setTheme(t)} style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: theme === t ? 'var(--ds-accent)' : 'var(--ds-hover-tint)',
                color: theme === t ? '#fff' : 'var(--ds-text-secondary)',
              }}>
                {t === 'dark' ? '● Dark' : '○ Light'}
              </button>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            IDEE A — Inline Ghost Autocomplete
            ═══════════════════════════════════════════ */}
        <IdeaHeader title="Idee A — Inline Ghost Autocomplete" />
        <p style={{ fontSize: 12, color: 'var(--ds-text-tertiary)', marginBottom: 24, lineHeight: 1.5 }}>
          Kein Popup, keine Liste. Der Vorschlag erscheint als ausgegrauer Ghost-Text direkt hinter dem Cursor. Tab = übernehmen. Weitertippen = filtern. ↑↓ = nächster Vorschlag.
        </p>

        <Section label="A1 — @ getippt" description="Erster Vorschlag erscheint sofort als Ghost. Tab übernimmt.">
          <div className="ds-input-dock">
            <div style={{ padding: '12px 16px', fontSize: 15, fontFamily: 'var(--ds-font-sans)', color: 'var(--ds-text-primary)', lineHeight: '22px' }}>
              @<Cursor /><Ghost text="Tutor" />
              <span style={{ float: 'right', fontSize: 10, color: 'var(--ds-text-muted)', lineHeight: '22px' }}>
                <kbd style={{ background: 'var(--ds-bg-overlay)', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>Tab</kbd>
                {' '}übernehmen{'  '}
                <kbd style={{ background: 'var(--ds-bg-overlay)', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>↑↓</kbd>
                {' '}wechseln
              </span>
            </div>
            <ActionRow />
          </div>
        </Section>

        <Section label="A2 — ↓ gedrückt" description="Nächster Vorschlag. Ghost wechselt.">
          <div className="ds-input-dock">
            <div style={{ padding: '12px 16px', fontSize: 15, fontFamily: 'var(--ds-font-sans)', color: 'var(--ds-text-primary)', lineHeight: '22px' }}>
              @<Cursor /><Ghost text="Research" />
            </div>
            <ActionRow />
          </div>
        </Section>

        <Section label="A3 — Buchstaben getippt" description="@Res filtert → Ghost passt sich an.">
          <div className="ds-input-dock">
            <div style={{ padding: '12px 16px', fontSize: 15, fontFamily: 'var(--ds-font-sans)', color: 'var(--ds-text-primary)', lineHeight: '22px' }}>
              @Res<Cursor /><Ghost text="earch" />
            </div>
            <ActionRow />
          </div>
        </Section>

        <Section label="A4 — Tab gedrückt → Chip" description="Ghost wird zum Chip. Sofort weitertippen.">
          <div className="ds-input-dock">
            <div style={{ padding: '12px 16px', fontSize: 15, fontFamily: 'var(--ds-font-sans)', color: 'var(--ds-text-primary)', lineHeight: '22px' }}>
              <AgentChip label="Research" /> <Cursor />
            </div>
            <ActionRow />
          </div>
        </Section>

        {/* ═══════════════════════════════════════════
            IDEE C — Spotlight
            ═══════════════════════════════════════════ */}
        <IdeaHeader title="Idee C — Spotlight (inline result)" />
        <p style={{ fontSize: 12, color: 'var(--ds-text-tertiary)', marginBottom: 24, lineHeight: 1.5 }}>
          Kein separater Container. Ein einzelner Treffer erscheint als dezente Zeile direkt unter dem Eingabetext, noch innerhalb des Docks. Wie Spotlight: tippen, bester Treffer, Enter.
        </p>

        <Section label="C1 — @ getippt" description="Erste Match-Zeile erscheint direkt unter dem Text. Gleicher visueller Raum.">
          <div className="ds-input-dock">
            <div style={{ padding: '12px 16px', fontSize: 15, fontFamily: 'var(--ds-font-sans)', color: 'var(--ds-text-primary)', lineHeight: '22px' }}>
              @<Cursor />
            </div>
            {/* Spotlight result — single line, inside the dock */}
            <div style={{
              display: 'flex', alignItems: 'center',
              padding: '6px 16px',
              background: 'var(--ds-hover-tint)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-text-primary)', fontFamily: 'var(--ds-font-sans)' }}>
                Tutor
              </span>
              <span style={{ fontSize: 11, color: 'var(--ds-text-muted)', marginLeft: 8 }}>
                Kartenbasiertes Lernen
              </span>
              <kbd style={{
                fontSize: 10, color: 'var(--ds-text-muted)', marginLeft: 'auto',
                background: 'var(--ds-bg-overlay)', borderRadius: 4, padding: '1px 5px',
              }}>Tab</kbd>
            </div>
            <ActionRow />
          </div>
        </Section>

        <Section label="C2 — ↓ gedrückt → nächster Treffer" description="Die Ergebniszeile wechselt. Immer nur ein Treffer sichtbar.">
          <div className="ds-input-dock">
            <div style={{ padding: '12px 16px', fontSize: 15, fontFamily: 'var(--ds-font-sans)', color: 'var(--ds-text-primary)', lineHeight: '22px' }}>
              @<Cursor />
            </div>
            <div style={{
              display: 'flex', alignItems: 'center',
              padding: '6px 16px',
              background: 'var(--ds-hover-tint)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-text-primary)', fontFamily: 'var(--ds-font-sans)' }}>
                Research
              </span>
              <span style={{ fontSize: 11, color: 'var(--ds-text-muted)', marginLeft: 8 }}>
                Web-Recherche mit Quellen
              </span>
              <kbd style={{
                fontSize: 10, color: 'var(--ds-text-muted)', marginLeft: 'auto',
                background: 'var(--ds-bg-overlay)', borderRadius: 4, padding: '1px 5px',
              }}>Tab</kbd>
            </div>
            <ActionRow />
          </div>
        </Section>

        <Section label="C3 — @Res getippt → gefiltert" description="Nur noch passende Treffer. Beschreibung hilft bei Unterscheidung.">
          <div className="ds-input-dock">
            <div style={{ padding: '12px 16px', fontSize: 15, fontFamily: 'var(--ds-font-sans)', color: 'var(--ds-text-primary)', lineHeight: '22px' }}>
              @Res<Cursor />
            </div>
            <div style={{
              display: 'flex', alignItems: 'center',
              padding: '6px 16px',
              background: 'var(--ds-hover-tint)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-text-primary)', fontFamily: 'var(--ds-font-sans)' }}>
                Research
              </span>
              <span style={{ fontSize: 11, color: 'var(--ds-text-muted)', marginLeft: 8 }}>
                Web-Recherche mit Quellen
              </span>
              <kbd style={{
                fontSize: 10, color: 'var(--ds-text-muted)', marginLeft: 'auto',
                background: 'var(--ds-bg-overlay)', borderRadius: 4, padding: '1px 5px',
              }}>Tab</kbd>
            </div>
            <ActionRow />
          </div>
        </Section>

        <Section label="C4 — Tab → Chip" description="Gleich wie A: Chip inline, weitertippen.">
          <div className="ds-input-dock">
            <div style={{ padding: '12px 16px', fontSize: 15, fontFamily: 'var(--ds-font-sans)', color: 'var(--ds-text-primary)', lineHeight: '22px' }}>
              <AgentChip label="Research" /> <Cursor />
            </div>
            <ActionRow />
          </div>
        </Section>

        {/* ═══════════════════════════════════════════
            IDEE C2 — Spotlight ohne Beschreibung
            ═══════════════════════════════════════════ */}
        <IdeaHeader title="Idee C (minimal) — Nur Name, keine Beschreibung" />
        <p style={{ fontSize: 12, color: 'var(--ds-text-tertiary)', marginBottom: 24, lineHeight: 1.5 }}>
          Noch cleaner: die Ergebniszeile zeigt nur den Namen. Maximal unsichtbar.
        </p>

        <Section label="C-min — @ getippt" description="Nur der Name. Dünnste mögliche Zeile.">
          <div className="ds-input-dock">
            <div style={{ padding: '12px 16px', fontSize: 15, fontFamily: 'var(--ds-font-sans)', color: 'var(--ds-text-primary)', lineHeight: '22px' }}>
              @<Cursor />
            </div>
            <div style={{
              display: 'flex', alignItems: 'center',
              padding: '5px 16px',
              background: 'var(--ds-hover-tint)',
            }}>
              <div style={{
                width: 4, height: 4, borderRadius: '50%',
                background: 'var(--ds-accent)', flexShrink: 0, marginRight: 8,
              }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-primary)', fontFamily: 'var(--ds-font-sans)' }}>
                Tutor
              </span>
              <kbd style={{
                fontSize: 10, color: 'var(--ds-text-muted)', marginLeft: 'auto',
                background: 'var(--ds-bg-overlay)', borderRadius: 4, padding: '1px 5px',
              }}>Tab</kbd>
            </div>
            <ActionRow />
          </div>
        </Section>

        {/* Summary */}
        <div style={{
          marginTop: 40, padding: '16px 20px', borderRadius: 12,
          background: 'var(--ds-hover-tint)', border: '1px solid var(--ds-border-subtle)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ds-text-muted)', marginBottom: 8 }}>
            Vergleich
          </div>
          <div style={{ fontSize: 12, color: 'var(--ds-text-tertiary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--ds-text-primary)' }}>A (Ghost)</strong> — Maximale Unsichtbarkeit. Null extra UI. Aber: man sieht keine Alternativen, muss ↑↓ blind drücken.<br /><br />
            <strong style={{ color: 'var(--ds-text-primary)' }}>C (Spotlight)</strong> — Ein Treffer als Zeile im Dock. Minimal aber mit Kontext (Name + optional Beschreibung). ↑↓ wechselt.<br /><br />
            <strong style={{ color: 'var(--ds-text-primary)' }}>C-min</strong> — Spotlight ohne Beschreibung. Dünnste Zeile. Nur Name + Dot.
          </div>
        </div>
      </div>
    </div>
  );
}
