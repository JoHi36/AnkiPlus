import React, { useRef, useEffect, useState, useCallback } from 'react';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import StreamingChatMessage from './components/StreamingChatMessage';
import TopBar from './components/TopBar';
import ThoughtStream from './components/ThoughtStream';
import MultipleChoiceCard from './components/MultipleChoiceCard';

/**
 * ComponentViewer — Premium Design System Reference
 * Access via: npm run dev -> localhost:3000?view=components
 *
 * Apple HIG-quality presentation. The page itself embodies the design system:
 * same tokens, same materials, same typography. No hardcoded colors.
 */

const MOCK_BRIDGE = {
  sendMessage: () => {}, cancelRequest: () => {},
  goToCard: () => {}, openPreview: () => {},
};

/* ── Navigation structure ── */
const NAV = [
  { id: 'philosophy', label: 'Philosophy' },
  { id: 'foundations', label: 'Foundations', children: [
    { id: 'colors', label: 'Colors' },
    { id: 'typography', label: 'Typography' },
    { id: 'spacing', label: 'Spacing' },
    { id: 'materials', label: 'Materials' },
    { id: 'shadows', label: 'Shadows' },
    { id: 'radius', label: 'Radius' },
  ]},
  { id: 'primitives', label: 'Primitives', children: [
    { id: 'badges', label: 'Badges' },
    { id: 'buttons', label: 'Buttons' },
  ]},
  { id: 'components', label: 'Components', children: [
    { id: 'chatinput', label: 'ChatInput' },
    { id: 'topbar', label: 'TopBar' },
    { id: 'thoughtstream', label: 'ThoughtStream' },
    { id: 'chatmessage', label: 'ChatMessage' },
    { id: 'multiplechoice', label: 'MultipleChoiceCard' },
  ]},
  { id: 'patterns', label: 'Patterns', children: [
    { id: 'deckbrowser', label: 'DeckBrowser' },
    { id: 'overview', label: 'Overview' },
  ]},
  { id: 'plusi', label: 'Plusi', children: [
    { id: 'agentcolors', label: 'Agent Colors' },
    { id: 'brand', label: 'Brand' },
  ]},
];

/* ── Flatten nav for IntersectionObserver ── */
const ALL_SECTION_IDS = [];
NAV.forEach(item => {
  ALL_SECTION_IDS.push(item.id);
  if (item.children) item.children.forEach(c => ALL_SECTION_IDS.push(c.id));
});

/* ── Color swatch data ── */
const BG_COLORS = [
  { name: 'Deep', token: '--ds-bg-deep', desc: 'Chat panel, diary' },
  { name: 'Canvas', token: '--ds-bg-canvas', desc: 'Main surface' },
  { name: 'Frosted', token: '--ds-bg-frosted', desc: 'Input docks, glass' },
  { name: 'Overlay', token: '--ds-bg-overlay', desc: 'Tooltips, popovers' },
];

const SEMANTIC_COLORS = [
  { name: 'Accent', token: '--ds-accent', desc: 'Primary actions' },
  { name: 'Green', token: '--ds-green', desc: 'Success, Good' },
  { name: 'Yellow', token: '--ds-yellow', desc: 'Warning, Hard' },
  { name: 'Red', token: '--ds-red', desc: 'Error, Again' },
  { name: 'Purple', token: '--ds-purple', desc: 'Plusi, Deep Mode' },
];

const TEXT_COLORS = [
  { name: 'Primary', token: '--ds-text-primary', desc: 'Headlines, body' },
  { name: 'Secondary', token: '--ds-text-secondary', desc: 'Descriptions' },
  { name: 'Tertiary', token: '--ds-text-tertiary', desc: 'Inactive tabs' },
  { name: 'Placeholder', token: '--ds-text-placeholder', desc: 'Input hints' },
  { name: 'Muted', token: '--ds-text-muted', desc: 'Keyboard hints' },
];

const BORDER_COLORS = [
  { name: 'Subtle', token: '--ds-border-subtle', desc: '6% opacity' },
  { name: 'Medium', token: '--ds-border-medium', desc: '12% opacity' },
];

const TINT_COLORS = [
  { name: 'Hover', token: '--ds-hover-tint', desc: 'Hover state' },
  { name: 'Active', token: '--ds-active-tint', desc: 'Active state' },
  { name: 'Green Tint', token: '--ds-green-tint', desc: 'Correct' },
  { name: 'Red Tint', token: '--ds-red-tint', desc: 'Incorrect' },
];

const STAT_COLORS = [
  { name: 'New', token: '--ds-stat-new', desc: 'New cards' },
  { name: 'Learning', token: '--ds-stat-learning', desc: 'In progress' },
  { name: 'Review', token: '--ds-stat-review', desc: 'Review due' },
];

const TYPE_SCALE = [
  { token: '--ds-text-xs', size: '11px', label: 'XS', usage: 'Keyboard hints' },
  { token: '--ds-text-sm', size: '12px', label: 'SM', usage: 'Buttons, timestamps' },
  { token: '--ds-text-base', size: '13px', label: 'Base', usage: 'Descriptions' },
  { token: '--ds-text-md', size: '14px', label: 'MD', usage: 'Card content' },
  { token: '--ds-text-lg', size: '15px', label: 'LG', usage: 'Chat messages' },
  { token: '--ds-text-xl', size: '18px', label: 'XL', usage: 'Section headlines' },
  { token: '--ds-text-2xl', size: '20px', label: '2XL', usage: 'Major headlines' },
];

const SPACING = [
  { token: '--ds-space-xs', value: '4px' },
  { token: '--ds-space-sm', value: '8px' },
  { token: '--ds-space-md', value: '12px' },
  { token: '--ds-space-lg', value: '16px' },
  { token: '--ds-space-xl', value: '24px' },
  { token: '--ds-space-2xl', value: '32px' },
];

const RADII = [
  { token: '--ds-radius-sm', value: '8px', usage: 'Pills, badges' },
  { token: '--ds-radius-md', value: '12px', usage: 'Buttons, options' },
  { token: '--ds-radius-lg', value: '16px', usage: 'Cards, docks' },
  { token: '--ds-radius-xl', value: '22px', usage: 'Large sheets' },
];

const SHADOWS = [
  { token: '--ds-shadow-sm', label: 'Small' },
  { token: '--ds-shadow-md', label: 'Medium' },
  { token: '--ds-shadow-lg', label: 'Large' },
];

/* ── Reusable small components ── */

function ColorCircle({ token, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `var(${token})`,
      border: '1px solid var(--ds-border-subtle)',
      flexShrink: 0,
    }} />
  );
}

function ColorRow({ name, token, desc }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--ds-space-md)',
      padding: 'var(--ds-space-sm) 0',
    }}>
      <ColorCircle token={token} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--ds-text-base)', fontWeight: 500,
          color: 'var(--ds-text-primary)',
        }}>{name}</div>
        <div style={{
          fontSize: 'var(--ds-text-xs)',
          color: 'var(--ds-text-tertiary)',
        }}>{desc}</div>
      </div>
      <code style={{
        fontSize: 'var(--ds-text-xs)',
        fontFamily: 'var(--ds-font-mono)',
        color: 'var(--ds-text-muted)',
      }}>{token}</code>
    </div>
  );
}

function SectionHeader({ id, label, refs }) {
  return (
    <h2
      ref={el => { if (refs) refs.current[id] = el; }}
      id={id}
      style={{
        fontSize: 'var(--ds-text-xl)', fontWeight: 600,
        color: 'var(--ds-text-primary)',
        fontFamily: 'var(--ds-font-sans)',
        margin: 0, padding: 'var(--ds-space-2xl) 0 var(--ds-space-lg)',
      }}
    >{label}</h2>
  );
}

function SubHeader({ id, label, refs }) {
  return (
    <h3
      ref={el => { if (refs) refs.current[id] = el; }}
      id={id}
      style={{
        fontSize: 'var(--ds-text-base)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--ds-text-muted)',
        fontFamily: 'var(--ds-font-sans)',
        margin: 0,
        padding: 'var(--ds-space-xl) 0 var(--ds-space-md)',
      }}
    >{label}</h3>
  );
}

function Showcase({ label, children, style }) {
  return (
    <div className="ds-borderless" style={{
      padding: 'var(--ds-space-xl)',
      marginBottom: 'var(--ds-space-lg)',
      ...style,
    }}>
      {label && (
        <div style={{
          fontSize: 'var(--ds-text-xs)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--ds-text-muted)',
          marginBottom: 'var(--ds-space-lg)',
        }}>{label}</div>
      )}
      {children}
    </div>
  );
}

function VariantLabel({ children }) {
  return (
    <div style={{
      fontSize: 'var(--ds-text-xs)', fontWeight: 500,
      color: 'var(--ds-text-tertiary)',
      marginBottom: 'var(--ds-space-sm)',
      marginTop: 'var(--ds-space-lg)',
    }}>{children}</div>
  );
}


/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function ComponentViewer() {
  const sectionRefs = useRef({});
  const [activeId, setActiveId] = useState('philosophy');

  /* ── IntersectionObserver for scroll-based sidebar highlight ── */
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );
    Object.values(sectionRefs.current).forEach(el => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollTo = useCallback((id) => {
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  /* ── Is a nav item or any of its children active? ── */
  const isActive = (item) => {
    if (item.id === activeId) return true;
    if (item.children) return item.children.some(c => c.id === activeId);
    return false;
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--ds-bg-deep)',
      color: 'var(--ds-text-primary)',
      fontFamily: 'var(--ds-font-sans)',
    }}>

      {/* ════════ SIDEBAR ════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 200,
        background: 'var(--ds-bg-canvas)',
        borderRight: '1px solid var(--ds-border-subtle)',
        padding: 'var(--ds-space-xl) 0',
        overflowY: 'auto',
        zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{
          padding: '0 var(--ds-space-xl)',
          marginBottom: 'var(--ds-space-2xl)',
        }}>
          <div style={{
            fontSize: 'var(--ds-text-md)', fontWeight: 700,
            color: 'var(--ds-text-primary)', letterSpacing: '-0.02em',
          }}>
            AnKI+ <span style={{ color: 'var(--ds-accent)' }}>Design</span>
          </div>
          <div style={{
            fontSize: 'var(--ds-text-xs)',
            color: 'var(--ds-text-muted)',
            marginTop: 2,
          }}>System Reference</div>
        </div>

        {/* Nav items */}
        {NAV.map((section, si) => (
          <div key={section.id}>
            {si > 0 && (
              <div style={{
                height: 1,
                background: 'var(--ds-border-subtle)',
                margin: 'var(--ds-space-sm) var(--ds-space-xl)',
              }} />
            )}
            <button
              onClick={() => scrollTo(section.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 'var(--ds-space-sm) var(--ds-space-xl)',
                fontSize: 'var(--ds-text-sm)', fontWeight: 600,
                fontFamily: 'var(--ds-font-sans)',
                color: isActive(section)
                  ? 'var(--ds-text-primary)'
                  : 'var(--ds-text-secondary)',
                transition: 'color var(--ds-duration) var(--ds-ease)',
              }}
            >{section.label}</button>

            {section.children && section.children.map(child => (
              <button
                key={child.id}
                onClick={() => scrollTo(child.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '3px var(--ds-space-xl) 3px 36px',
                  fontSize: 'var(--ds-text-xs)', fontWeight: 500,
                  fontFamily: 'var(--ds-font-sans)',
                  color: activeId === child.id
                    ? 'var(--ds-accent)'
                    : 'var(--ds-text-tertiary)',
                  transition: 'color var(--ds-duration) var(--ds-ease)',
                }}
              >{child.label}</button>
            ))}
          </div>
        ))}
      </nav>

      {/* ════════ CONTENT ════════ */}
      <main style={{
        marginLeft: 200,
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        padding: 'var(--ds-space-2xl) var(--ds-space-xl)',
      }}>
        <div style={{ maxWidth: 760, width: '100%' }}>

          {/* ──────────── PHILOSOPHY ──────────── */}
          <SectionHeader id="philosophy" label="Philosophy" refs={sectionRefs} />
          <Showcase>
            <div style={{
              fontSize: 'var(--ds-text-xl)', fontWeight: 500,
              color: 'var(--ds-text-primary)',
              lineHeight: 1.5,
              marginBottom: 'var(--ds-space-xl)',
            }}>
              Material = Function.<br />
              <span style={{ color: 'var(--ds-text-secondary)' }}>
                Frosted Glass for actions. Borderless for content.
              </span>
            </div>
            <div style={{
              fontSize: 'var(--ds-text-md)',
              color: 'var(--ds-text-tertiary)',
              lineHeight: 1.7,
            }}>
              Every surface communicates its purpose through its visual weight.
              Deep backgrounds recede. Canvas surfaces stay neutral.
              Frosted glass elevates interactive docks. Overlays float.
              Color is reserved for meaning — never decoration.
            </div>
          </Showcase>

          {/* ──────────── FOUNDATIONS ──────────── */}
          <SectionHeader id="foundations" label="Foundations" refs={sectionRefs} />

          {/* Colors */}
          <SubHeader id="colors" label="Colors" refs={sectionRefs} />
          <Showcase label="Backgrounds">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--ds-space-sm)' }}>
              {BG_COLORS.map(c => <ColorRow key={c.token} {...c} />)}
            </div>
          </Showcase>
          <Showcase label="Semantic">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--ds-space-sm)' }}>
              {SEMANTIC_COLORS.map(c => <ColorRow key={c.token} {...c} />)}
            </div>
          </Showcase>
          <Showcase label="Text Hierarchy">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-xs)' }}>
              {TEXT_COLORS.map(c => <ColorRow key={c.token} {...c} />)}
            </div>
          </Showcase>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--ds-space-lg)' }}>
            <Showcase label="Borders">
              {BORDER_COLORS.map(c => <ColorRow key={c.token} {...c} />)}
            </Showcase>
            <Showcase label="Tints">
              {TINT_COLORS.map(c => <ColorRow key={c.token} {...c} />)}
            </Showcase>
          </div>
          <Showcase label="Stats">
            <div style={{ display: 'flex', gap: 'var(--ds-space-xl)' }}>
              {STAT_COLORS.map(c => (
                <div key={c.token} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-sm)' }}>
                  <ColorCircle token={c.token} size={24} />
                  <div>
                    <div style={{ fontSize: 'var(--ds-text-sm)', fontWeight: 500, color: 'var(--ds-text-primary)' }}>{c.name}</div>
                    <code style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)', fontFamily: 'var(--ds-font-mono)' }}>{c.token}</code>
                  </div>
                </div>
              ))}
            </div>
          </Showcase>

          {/* Typography */}
          <SubHeader id="typography" label="Typography" refs={sectionRefs} />
          <Showcase label="Type Scale">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-lg)' }}>
              {TYPE_SCALE.map(t => (
                <div key={t.token} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--ds-space-lg)' }}>
                  <code style={{
                    fontSize: 'var(--ds-text-xs)', fontFamily: 'var(--ds-font-mono)',
                    color: 'var(--ds-text-muted)', width: 130, flexShrink: 0,
                  }}>{t.token}</code>
                  <span style={{
                    fontSize: `var(${t.token})`,
                    color: 'var(--ds-text-primary)',
                    fontFamily: 'var(--ds-font-sans)',
                  }}>
                    {t.size} — {t.usage}
                  </span>
                </div>
              ))}
            </div>
          </Showcase>
          <Showcase label="Font Families">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-xl)' }}>
              <div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)', marginBottom: 'var(--ds-space-xs)' }}>
                  --ds-font-sans (UI default)
                </div>
                <div style={{ fontFamily: 'var(--ds-font-sans)', fontSize: 'var(--ds-text-lg)', color: 'var(--ds-text-primary)' }}>
                  SF Pro — The quick brown fox jumps over the lazy dog
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)', marginBottom: 'var(--ds-space-xs)' }}>
                  --ds-font-brand (Plusi + Brand only)
                </div>
                <div style={{ fontFamily: 'var(--ds-font-brand)', fontSize: 'var(--ds-text-lg)', color: 'var(--ds-text-primary)' }}>
                  Space Grotesk — The quick brown fox jumps over the lazy dog
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)', marginBottom: 'var(--ds-space-xs)' }}>
                  --ds-font-mono (Code, stats)
                </div>
                <div style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-text-lg)', color: 'var(--ds-text-primary)' }}>
                  SF Mono — 0123456789 ABCDEF
                </div>
              </div>
            </div>
          </Showcase>

          {/* Spacing */}
          <SubHeader id="spacing" label="Spacing" refs={sectionRefs} />
          <Showcase label="Base-4 Scale">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-md)' }}>
              {SPACING.map(s => (
                <div key={s.token} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-lg)' }}>
                  <code style={{
                    fontSize: 'var(--ds-text-xs)', fontFamily: 'var(--ds-font-mono)',
                    color: 'var(--ds-text-muted)', width: 130, flexShrink: 0,
                  }}>{s.token}</code>
                  <div style={{
                    width: `var(${s.token})`,
                    height: 'var(--ds-space-sm)',
                    background: 'var(--ds-accent)',
                    borderRadius: 2,
                    opacity: 0.6,
                    transition: 'width var(--ds-duration) var(--ds-ease)',
                  }} />
                  <span style={{
                    fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)',
                    fontFamily: 'var(--ds-font-mono)',
                  }}>{s.value}</span>
                </div>
              ))}
            </div>
          </Showcase>

          {/* Materials */}
          <SubHeader id="materials" label="Materials" refs={sectionRefs} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--ds-space-lg)' }}>
            <div className="ds-frosted" style={{
              padding: 'var(--ds-space-xl)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 'var(--ds-space-sm)',
            }}>
              <div style={{ fontSize: 'var(--ds-text-md)', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                Frosted Glass
              </div>
              <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)' }}>
                .ds-frosted
              </div>
              <div style={{
                fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)',
                textAlign: 'center', marginTop: 'var(--ds-space-sm)',
              }}>
                Actions: input docks, search bars, tool palettes
              </div>
            </div>
            <div className="ds-borderless" style={{
              padding: 'var(--ds-space-xl)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 'var(--ds-space-sm)',
            }}>
              <div style={{ fontSize: 'var(--ds-text-md)', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                Borderless
              </div>
              <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)' }}>
                .ds-borderless
              </div>
              <div style={{
                fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)',
                textAlign: 'center', marginTop: 'var(--ds-space-sm)',
              }}>
                Content: cards, deck lists, session history
              </div>
            </div>
          </div>

          {/* Shadows */}
          <SubHeader id="shadows" label="Shadows" refs={sectionRefs} />
          <Showcase>
            <div style={{ display: 'flex', gap: 'var(--ds-space-xl)', justifyContent: 'center' }}>
              {SHADOWS.map(s => (
                <div key={s.token} style={{
                  width: 100, height: 100,
                  background: 'var(--ds-bg-canvas)',
                  borderRadius: 'var(--ds-radius-lg)',
                  boxShadow: `var(${s.token})`,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 'var(--ds-space-xs)',
                }}>
                  <div style={{ fontSize: 'var(--ds-text-sm)', fontWeight: 500, color: 'var(--ds-text-primary)' }}>
                    {s.label}
                  </div>
                  <code style={{ fontSize: 9, color: 'var(--ds-text-muted)', fontFamily: 'var(--ds-font-mono)' }}>
                    {s.token}
                  </code>
                </div>
              ))}
            </div>
          </Showcase>

          {/* Radius */}
          <SubHeader id="radius" label="Border Radius" refs={sectionRefs} />
          <Showcase>
            <div style={{ display: 'flex', gap: 'var(--ds-space-xl)', alignItems: 'flex-end', justifyContent: 'center' }}>
              {RADII.map(r => (
                <div key={r.token} style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 64, height: 64,
                    border: '2px solid var(--ds-border-medium)',
                    borderRadius: `var(${r.token})`,
                    marginBottom: 'var(--ds-space-sm)',
                  }} />
                  <div style={{ fontSize: 'var(--ds-text-xs)', fontWeight: 500, color: 'var(--ds-text-primary)' }}>
                    {r.value}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--ds-text-muted)', fontFamily: 'var(--ds-font-mono)' }}>
                    {r.token}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--ds-text-tertiary)', marginTop: 2 }}>
                    {r.usage}
                  </div>
                </div>
              ))}
            </div>
          </Showcase>

          {/* ──────────── PRIMITIVES ──────────── */}
          <SectionHeader id="primitives" label="Primitives" refs={sectionRefs} />

          {/* Badges */}
          <SubHeader id="badges" label="Badges" refs={sectionRefs} />
          <Showcase label="Rating Badges">
            <div style={{ display: 'flex', gap: 'var(--ds-space-md)', flexWrap: 'wrap' }}>
              {[
                { label: 'Again', token: '--ds-rate-again', shortcut: '1' },
                { label: 'Hard', token: '--ds-rate-hard', shortcut: '2' },
                { label: 'Good', token: '--ds-rate-good', shortcut: '3' },
                { label: 'Easy', token: '--ds-rate-easy', shortcut: '4' },
              ].map(b => (
                <div key={b.label} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--ds-space-sm)',
                  padding: 'var(--ds-space-sm) var(--ds-space-md)',
                  borderRadius: 'var(--ds-radius-sm)',
                  background: 'var(--ds-hover-tint)',
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: `var(${b.token})`,
                  }} />
                  <span style={{
                    fontSize: 'var(--ds-text-sm)', fontWeight: 600,
                    color: `var(${b.token})`,
                  }}>{b.label}</span>
                  <span className="ds-kbd">{b.shortcut}</span>
                </div>
              ))}
            </div>
          </Showcase>
          <Showcase label="Agent Badges">
            <div style={{ display: 'flex', gap: 'var(--ds-space-md)', flexWrap: 'wrap' }}>
              {[
                { label: '@Tutor', color: 'var(--ds-green)' },
                { label: '@Research', color: 'var(--ds-accent)' },
                { label: '@Plusi', color: 'var(--ds-purple)' },
                { label: '@Help', color: 'var(--ds-text-secondary)' },
              ].map(a => (
                <span key={a.label} style={{
                  fontSize: 'var(--ds-text-sm)', fontWeight: 600,
                  color: a.color,
                  padding: 'var(--ds-space-xs) var(--ds-space-md)',
                  borderRadius: 'var(--ds-radius-sm)',
                  background: 'var(--ds-hover-tint)',
                }}>{a.label}</span>
              ))}
            </div>
          </Showcase>
          <Showcase label="Stat Badges">
            <div style={{ display: 'flex', gap: 'var(--ds-space-md)' }}>
              {[
                { label: 'Neu', token: '--ds-stat-new', count: 42 },
                { label: 'Lernen', token: '--ds-stat-learning', count: 3 },
                { label: 'Wiederholen', token: '--ds-stat-review', count: 127 },
              ].map(s => (
                <span key={s.label} style={{
                  fontFamily: 'var(--ds-font-mono)',
                  fontSize: 'var(--ds-text-xs)', fontWeight: 600,
                  color: `var(${s.token})`,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {s.count} {s.label}
                </span>
              ))}
            </div>
          </Showcase>
          <Showcase label="Keyboard Hints">
            <div style={{ display: 'flex', gap: 'var(--ds-space-lg)', alignItems: 'center' }}>
              {['SPACE', 'ESC', '1', '2', '3', '4'].map(k => (
                <span key={k} className="ds-kbd">{k}</span>
              ))}
              <span style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)', marginLeft: 'var(--ds-space-sm)' }}>
                .ds-kbd
              </span>
            </div>
          </Showcase>

          {/* Buttons */}
          <SubHeader id="buttons" label="Buttons" refs={sectionRefs} />
          <Showcase label="Multiple Choice Options">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-xs)', maxWidth: 400 }}>
              <button className="ds-mc-option">
                <span style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-text-sm)', color: 'var(--ds-text-muted)' }}>A</span>
                Default state
              </button>
              <button className="ds-mc-option correct">
                <span style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-text-sm)' }}>B</span>
                Correct answer
              </button>
              <button className="ds-mc-option wrong">
                <span style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-text-sm)' }}>C</span>
                Wrong answer
              </button>
            </div>
          </Showcase>
          <Showcase label="Tab Bar">
            <div className="ds-tab-bar" style={{ maxWidth: 300 }}>
              <button className="ds-tab active">Stapel</button>
              <button className="ds-tab">Session</button>
              <button className="ds-tab">Statistik</button>
            </div>
          </Showcase>
          <Showcase label="Thought Steps">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-xs)', maxWidth: 400 }}>
              <div className="ds-thought-step">
                <span className="ds-thought-icon" style={{ fontSize: 'var(--ds-text-sm)' }}>&#10003;</span>
                <span className="ds-thought-text">Routing Agent</span>
              </div>
              <div className="ds-thought-step ds-thought-active">
                <span className="ds-thought-icon" style={{ fontSize: 'var(--ds-text-sm)' }}>&#8226;</span>
                <span className="ds-thought-text">Searching knowledge base...</span>
              </div>
            </div>
          </Showcase>

          {/* ──────────── COMPONENTS ──────────── */}
          <SectionHeader id="components" label="Components" refs={sectionRefs} />

          {/* ChatInput */}
          <SubHeader id="chatinput" label="ChatInput" refs={sectionRefs} />
          <Showcase label="Session (Default)">
            <ChatInput
              onSend={() => {}} isLoading={false} onStop={() => {}}
              cardContext={null} isPremium={true}
              actionPrimary={{ label: 'Weiter', shortcut: 'SPACE', onClick: () => {} }}
              actionSecondary={{ label: 'Agent Studio', shortcut: '\u21B5', onClick: () => {} }}
            />
          </Showcase>
          <VariantLabel>Reviewer — Question</VariantLabel>
          <Showcase>
            <ChatInput
              onSend={() => {}} isLoading={false} onStop={() => {}}
              cardContext={null} isPremium={true}
              placeholder="Antwort eingeben..."
              actionPrimary={{ label: 'Show Answer', shortcut: 'SPACE', onClick: () => {} }}
              actionSecondary={{ label: 'Multiple Choice', shortcut: '\u21B5', onClick: () => {} }}
            />
          </Showcase>
          <VariantLabel>Reviewer — Answer</VariantLabel>
          <Showcase>
            <ChatInput
              onSend={() => {}} isLoading={false} onStop={() => {}}
              cardContext={null} isPremium={true}
              actionPrimary={{ label: 'Weiter', shortcut: 'SPACE', onClick: () => {} }}
              actionSecondary={{ label: 'Nachfragen', shortcut: '\u21B5', onClick: () => {} }}
            />
          </Showcase>
          <VariantLabel>FreeChat</VariantLabel>
          <Showcase>
            <ChatInput
              onSend={() => {}} isLoading={false} onStop={() => {}}
              cardContext={null} isPremium={true}
              onClose={() => {}}
              actionPrimary={{ label: 'Schlie\u00DFen', shortcut: '\u2334', onClick: () => {} }}
              actionSecondary={{ label: 'Senden', shortcut: '\u21B5', onClick: () => {} }}
            />
          </Showcase>

          {/* TopBar */}
          <SubHeader id="topbar" label="TopBar" refs={sectionRefs} />
          <Showcase label="DeckBrowser State">
            <TopBar
              activeView="deckBrowser" ankiState="deckBrowser"
              messageCount={0} totalDue={314}
              deckName="" dueNew={65} dueLearning={4} dueReview={245}
              onTabClick={() => {}} onSidebarToggle={() => {}}
            />
          </Showcase>
          <VariantLabel>Review State</VariantLabel>
          <Showcase>
            <TopBar
              activeView="review" ankiState="review"
              messageCount={5} totalDue={314}
              deckName="Anatomie" dueNew={42} dueLearning={3} dueReview={127}
              onTabClick={() => {}} onSidebarToggle={() => {}}
            />
          </Showcase>

          {/* ThoughtStream */}
          <SubHeader id="thoughtstream" label="ThoughtStream" refs={sectionRefs} />
          <Showcase label="Active Pipeline">
            <ThoughtStream
              pipelineSteps={[
                { step: 'routing', status: 'done', data: { agent: 'Tutor' }, timestamp: Date.now() - 2000 },
                { step: 'rag_search', status: 'done', data: { mode: 'semantic', count: 4 }, timestamp: Date.now() - 1000 },
                { step: 'generating', status: 'active', data: {}, timestamp: Date.now() },
              ]}
              pipelineGeneration={1}
              agentColor="var(--ds-green)"
              isStreaming={true}
            />
          </Showcase>

          {/* ChatMessage */}
          <SubHeader id="chatmessage" label="ChatMessage" refs={sectionRefs} />
          <Showcase label="User Message">
            <ChatMessage
              message="Was ist der Tractus iliotibialis?"
              from="user"
              cardContext={null}
              steps={[]} citations={{}} pipelineSteps={[]}
              bridge={MOCK_BRIDGE} isLastMessage={false}
            />
          </Showcase>
          <VariantLabel>Bot Message</VariantLabel>
          <Showcase>
            <ChatMessage
              message="Der **Tractus iliotibialis** ist eine kr\u00E4ftige Sehnenplatte an der Au\u00DFenseite des Oberschenkels. Er verl\u00E4uft vom Beckenkamm bis zum lateralen Tibiakondyl und stabilisiert das Kniegelenk bei der Extension."
              from="bot"
              cardContext={null}
              steps={[]} citations={{}} pipelineSteps={[]}
              bridge={MOCK_BRIDGE} isLastMessage={true}
            />
          </Showcase>
          <VariantLabel>Streaming</VariantLabel>
          <Showcase>
            <StreamingChatMessage
              message="Der Tractus iliotibialis ist eine kr\u00E4ftige..."
              isStreaming={true}
              cardContext={null}
              steps={[]} citations={{}} pipelineSteps={[]}
              bridge={MOCK_BRIDGE}
            />
          </Showcase>

          {/* MultipleChoiceCard */}
          <SubHeader id="multiplechoice" label="MultipleChoiceCard" refs={sectionRefs} />
          <Showcase label="Quiz Interface">
            <MultipleChoiceCard
              question="Welcher Muskel wird vom N. femoralis innerviert?"
              options={[
                { letter: 'A', text: 'M. biceps femoris', isCorrect: false, explanation: 'Wird vom N. ischiadicus innerviert.' },
                { letter: 'B', text: 'M. quadriceps femoris', isCorrect: true, explanation: 'Korrekt! Der N. femoralis innerviert den M. quadriceps femoris.' },
                { letter: 'C', text: 'M. gluteus maximus', isCorrect: false, explanation: 'Wird vom N. gluteus inferior innerviert.' },
                { letter: 'D', text: 'M. gastrocnemius', isCorrect: false, explanation: 'Wird vom N. tibialis innerviert.' },
              ]}
            />
          </Showcase>

          {/* ──────────── PATTERNS ──────────── */}
          <SectionHeader id="patterns" label="Patterns" refs={sectionRefs} />

          {/* DeckBrowser pattern */}
          <SubHeader id="deckbrowser" label="DeckBrowser" refs={sectionRefs} />
          <Showcase label="Deck List Pattern">
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: 'var(--ds-space-xl)',
            }}>
              <div style={{
                fontSize: 'var(--ds-text-2xl)', fontWeight: 700,
                letterSpacing: '-0.5px', color: 'var(--ds-text-primary)',
                marginBottom: 'var(--ds-space-lg)', textAlign: 'center',
              }}>
                Anki<span style={{ color: 'var(--ds-accent)' }}>.plus</span>
              </div>

              {/* Mock search bar */}
              <div className="ds-frosted" style={{
                width: '100%', maxWidth: 440,
                padding: 'var(--ds-space-md) var(--ds-space-lg)',
                marginBottom: 'var(--ds-space-xl)',
                display: 'flex', alignItems: 'center', gap: 'var(--ds-space-sm)',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ds-text-tertiary)" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <span style={{ fontSize: 'var(--ds-text-md)', color: 'var(--ds-text-placeholder)' }}>
                  Frage stellen oder Stapel suchen...
                </span>
              </div>

              {/* Deck items */}
              <div style={{ width: '100%', maxWidth: 440 }}>
                {[
                  { name: 'Anatomie', stats: { n: 42, l: 3, r: 127 } },
                  { name: 'Physiologie', stats: { n: 18, l: 1, r: 85 } },
                  { name: 'Biochemie', stats: { n: 5, l: 0, r: 33 } },
                ].map((deck, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center',
                    padding: 'var(--ds-space-md) var(--ds-space-lg)',
                    borderRadius: 'var(--ds-radius-md)',
                    cursor: 'pointer',
                    transition: 'background var(--ds-duration) var(--ds-ease)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--ds-hover-tint)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{
                      flex: 1, fontSize: 'var(--ds-text-md)', fontWeight: 500,
                      color: 'var(--ds-text-primary)',
                    }}>{deck.name}</span>
                    <div style={{ display: 'flex', gap: 'var(--ds-space-md)' }}>
                      {deck.stats.n > 0 && <span style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-text-xs)', fontWeight: 600, color: 'var(--ds-stat-new)', fontVariantNumeric: 'tabular-nums' }}>{deck.stats.n}</span>}
                      {deck.stats.l > 0 && <span style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-text-xs)', fontWeight: 600, color: 'var(--ds-stat-learning)', fontVariantNumeric: 'tabular-nums' }}>{deck.stats.l}</span>}
                      {deck.stats.r > 0 && <span style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-text-xs)', fontWeight: 600, color: 'var(--ds-stat-review)', fontVariantNumeric: 'tabular-nums' }}>{deck.stats.r}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Showcase>

          {/* Overview pattern */}
          <SubHeader id="overview" label="Overview" refs={sectionRefs} />
          <Showcase label="Study Overview Pattern">
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: 'var(--ds-space-2xl) var(--ds-space-xl)',
            }}>
              <div style={{
                fontSize: 'var(--ds-text-2xl)', fontWeight: 600,
                color: 'var(--ds-text-primary)', marginBottom: 'var(--ds-space-xl)',
              }}>Anatomie</div>

              <div style={{
                display: 'flex', gap: 'var(--ds-space-2xl)',
                marginBottom: 'var(--ds-space-2xl)',
              }}>
                {[
                  { label: 'Neu', count: 42, token: '--ds-stat-new' },
                  { label: 'Lernen', count: 3, token: '--ds-stat-learning' },
                  { label: 'Wiederholen', count: 127, token: '--ds-stat-review' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: 'var(--ds-text-2xl)', fontWeight: 700,
                      fontFamily: 'var(--ds-font-mono)', fontVariantNumeric: 'tabular-nums',
                      color: `var(${s.token})`,
                    }}>{s.count}</div>
                    <div style={{
                      fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      marginTop: 'var(--ds-space-xs)',
                    }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <button style={{
                background: 'var(--ds-accent)', color: 'white',
                border: 'none', borderRadius: 'var(--ds-radius-md)',
                padding: 'var(--ds-space-md) var(--ds-space-2xl)',
                fontSize: 'var(--ds-text-md)', fontWeight: 600,
                fontFamily: 'var(--ds-font-sans)', cursor: 'pointer',
              }}>Jetzt lernen</button>
            </div>
          </Showcase>

          {/* ──────────── PLUSI ──────────── */}
          <SectionHeader id="plusi" label="Plusi" refs={sectionRefs} />

          {/* Agent Colors */}
          <SubHeader id="agentcolors" label="Agent Colors" refs={sectionRefs} />
          <Showcase>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-lg)' }}>
              {[
                { agent: '@Tutor', desc: 'Learning assistant', token: '--ds-green' },
                { agent: '@Research', desc: 'Deep search + citations', token: '--ds-accent' },
                { agent: '@Plusi', desc: 'Companion personality', token: '--ds-purple' },
                { agent: '@Help', desc: 'Meta / system help', token: '--ds-text-secondary' },
              ].map(a => (
                <div key={a.agent} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--ds-space-lg)',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 'var(--ds-radius-sm)',
                    background: 'var(--ds-hover-tint)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{
                      fontSize: 'var(--ds-text-md)', fontWeight: 700,
                      color: `var(${a.token})`,
                    }}>{a.agent[1]}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 'var(--ds-text-md)', fontWeight: 600,
                      color: `var(${a.token})`,
                    }}>{a.agent}</div>
                    <div style={{
                      fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)',
                    }}>{a.desc}</div>
                  </div>
                  <code style={{
                    fontSize: 'var(--ds-text-xs)', fontFamily: 'var(--ds-font-mono)',
                    color: 'var(--ds-text-muted)',
                  }}>{a.token}</code>
                </div>
              ))}
            </div>
          </Showcase>

          {/* Brand */}
          <SubHeader id="brand" label="Brand Typography" refs={sectionRefs} />
          <Showcase>
            <div style={{
              fontFamily: 'var(--ds-font-brand)',
              display: 'flex', flexDirection: 'column',
              gap: 'var(--ds-space-xl)',
            }}>
              <div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)', marginBottom: 'var(--ds-space-xs)', fontFamily: 'var(--ds-font-sans)' }}>
                  Brand headline (Space Grotesk)
                </div>
                <div style={{
                  fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px',
                  color: 'var(--ds-text-primary)',
                }}>
                  Anki<span style={{ color: 'var(--ds-accent)' }}>.plus</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)', marginBottom: 'var(--ds-space-xs)', fontFamily: 'var(--ds-font-sans)' }}>
                  Plusi identity
                </div>
                <div style={{
                  fontSize: 'var(--ds-text-xl)', fontWeight: 600,
                  color: 'var(--ds-purple)',
                }}>
                  Hey, ich bin Plusi
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)', marginBottom: 'var(--ds-space-xs)', fontFamily: 'var(--ds-font-sans)' }}>
                  Brand color
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-md)' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 'var(--ds-radius-md)',
                    background: 'var(--ds-purple)',
                  }} />
                  <div>
                    <div style={{ fontSize: 'var(--ds-text-md)', fontWeight: 600, color: 'var(--ds-purple)' }}>
                      --ds-purple
                    </div>
                    <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)', fontFamily: 'var(--ds-font-sans)' }}>
                      Reserved for Plusi + brand elements
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Showcase>

          {/* Footer */}
          <div style={{
            padding: 'var(--ds-space-2xl) 0',
            textAlign: 'center',
            color: 'var(--ds-text-muted)',
            fontSize: 'var(--ds-text-xs)',
          }}>
            AnKI+ Design System
          </div>

        </div>
      </main>
    </div>
  );
}
