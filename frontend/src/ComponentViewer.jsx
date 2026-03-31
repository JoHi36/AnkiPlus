import React, { useRef, useEffect, useState, useCallback } from 'react';
import TreeList from '../../shared/components/TreeList';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import StreamingChatMessage from './components/StreamingChatMessage';
import TopBar from './components/TopBar';
import ThoughtStream from './components/ThoughtStream';
import MultipleChoiceCard from './components/MultipleChoiceCard';
import { Button } from '../../shared/components/Button';
import CardWidget from './components/CardWidget';
import StatsWidget from './components/StatsWidget';
import CompactWidget from './components/CompactWidget';
import ImageWidget from './components/ImageWidget';
import MascotCharacter from './components/MascotCharacter';
import ReviewFeedback from './components/ReviewFeedback';
import { DockEvalResult, DockTimer, DockStars, DockLoading } from './components/ReviewerDock';
import SourceCard from './components/SourceCard';
import CitationBadge from './components/CitationBadge';
import CitationRef from '../../shared/components/CitationRef';
import AgenticCell from './components/AgenticCell';
import ThinkingIndicator from './components/ThinkingIndicator';
import { setRegistry } from '../../shared/config/subagentRegistry';

/**
 * ComponentViewer — Premium Design System Reference
 * Access via: npm run dev -> localhost:3000?view=components
 *
 * Apple HIG-quality presentation. The page itself embodies the design system:
 * same tokens, same materials, same typography. No hardcoded colors.
 */

/* ── Mobile detection hook ── */
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

const MOCK_BRIDGE = {
  sendMessage: () => {}, cancelRequest: () => {},
  goToCard: () => {}, openPreview: () => {},
};

/* ── Demo data for new showcases ── */

const DEMO_SOURCE_KEYWORD = {
  noteId: 1001,
  deckName: 'Medizin::Anatomie',
  front: 'Was ist der <b>Tractus iliotibialis</b>?',
  sources: ['keyword'],
};
const DEMO_SOURCE_SEMANTIC = {
  noteId: 1002,
  deckName: 'Medizin::Physiologie',
  front: 'Welche Muskeln stabilisieren das Kniegelenk lateral?',
  sources: ['semantic'],
};
const DEMO_SOURCE_DUAL = {
  noteId: 1003,
  deckName: 'Medizin::Anatomie',
  front: '{{c1::M. tensor fasciae latae}} inseriert am Tractus iliotibialis.',
  sources: ['keyword', 'semantic'],
};

const DEMO_CITATION = {
  noteId: 42,
  deckName: 'Medizin::Anatomie',
  front: 'Welche Funktion hat der <b>M. quadriceps femoris</b>?',
  sources: ['keyword'],
};

// Seed registry for AgenticCell demos
setRegistry([
  {
    name: 'tutor',
    label: '@Tutor',
    color: '#30D158',
    enabled: true,
    pipelineLabel: 'Tutor arbeitet...',
    iconType: 'letter',
    loadingHintTemplate: '@Tutor analysiert die Karte...',
  },
  {
    name: 'research',
    label: '@Research',
    color: '#0A84FF',
    enabled: true,
    pipelineLabel: 'Research arbeitet...',
    iconType: 'letter',
    loadingHintTemplate: '@Research durchsucht Quellen...',
  },
]);

const DOCK_LOADING_STEPS = [{ label: 'KI bewertet...' }];

const SOURCE_CARD_STYLE = { width: 192, height: 110 };
const SOURCE_CARDS_ROW_STYLE = { display: 'flex', gap: 'var(--ds-space-md)', flexWrap: 'wrap', alignItems: 'flex-start' };

/* ── Navigation structure ── */
const NAV = [
  { id: 'philosophy', label: 'Philosophy' },
  { id: 'foundations', label: 'Foundations', children: [
    { id: 'materials', label: 'Materials' },
    { id: 'typography', label: 'Typography' },
    { id: 'colors', label: 'Colors' },
    { id: 'spatial', label: 'Spatial System' },
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
    { id: 'reviewfeedback', label: 'ReviewFeedback' },
    { id: 'dockwidgets', label: 'Dock Widgets' },
    { id: 'sourcecard', label: 'SourceCard' },
    { id: 'citationref', label: 'CitationRef' },
    { id: 'citationbadge', label: 'CitationBadge (legacy)' },
    { id: 'agenticcell', label: 'AgenticCell' },
    { id: 'multiplechoice', label: 'MultipleChoiceCard' },
  ]},
  { id: 'blocks', label: 'Blocks', children: [
    { id: 'block-card', label: 'CardWidget' },
    { id: 'block-stats', label: 'StatsWidget' },
    { id: 'block-image', label: 'ImageWidget' },
    { id: 'block-compact', label: 'CompactWidget' },
  ]},
  { id: 'patterns', label: 'Patterns', children: [
    { id: 'deckbrowser', label: 'DeckBrowser' },
    { id: 'overview', label: 'Overview' },
  ]},
  { id: 'agents', label: 'Agents', children: [
    { id: 'agent-pipeline', label: 'Pipeline' },
    { id: 'agent-default', label: 'Default Agent' },
    { id: 'agent-tutor', label: '@Tutor' },
    { id: 'agent-research', label: '@Research' },
    { id: 'agent-plusi', label: '@Plusi' },
    { id: 'agent-help', label: '@Help' },
  ]},
];

/* ── Flatten nav for IntersectionObserver ── */
const ALL_SECTION_IDS = [];
NAV.forEach(item => {
  ALL_SECTION_IDS.push(item.id);
  if (item.children) item.children.forEach(c => ALL_SECTION_IDS.push(c.id));
});

/* ── Materials — the three surfaces ── */
const MATERIALS = [
  {
    name: 'Deep',
    token: '--ds-bg-deep',
    className: '',
    desc: 'Wo KI passiert.',
    detail: 'Der dunkelste Layer. Chat-Panel, Agent-Responses, Plusi-Diary, ThoughtStream. Deep signalisiert: hier arbeitet das System für dich.',
  },
  {
    name: 'Canvas',
    token: '--ds-bg-canvas',
    className: 'ds-borderless',
    desc: 'Wo Content lebt.',
    detail: 'Die neutrale Arbeitsfläche. Karten-Inhalte, Deck-Listen, Session-Verläufe. Canvas tritt zurück und lässt den Inhalt sprechen.',
  },
  {
    name: 'Frosted',
    token: '--ds-bg-frosted',
    className: 'ds-frosted',
    desc: 'Wo du interagierst.',
    detail: 'Frosted Glass mit Backdrop-Blur. Input-Docks, Suchfelder, Tool-Paletten. Frosted hebt interaktive Elemente hervor.',
  },
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

/* ── Spatial System — container recipes ── */
const CONTAINER_RECIPES = [
  {
    name: 'Frosted Glass',
    desc: 'Input-Docks, Dropdowns, Action-Container',
    className: 'ds-frosted',
    tokens: ['radius-lg', 'gradient', 'blur(40px)', 'inset highlights'],
  },
  {
    name: 'Content Card',
    desc: 'Stats, Karten, Bilder, Listen',
    className: 'ds-borderless',
    tokens: ['radius-lg', 'border-subtle'],
  },
  {
    name: 'Interactive',
    desc: 'MC Options, Buttons, ThoughtSteps',
    className: null,
    tokens: ['radius-md', 'hover-tint'],
  },
  {
    name: 'Compact',
    desc: 'Tabs, Badges, Pills, Keyboard-Hints',
    className: null,
    tokens: ['radius-sm'],
  },
];

const SPACING_SCALE = [
  { token: '--ds-space-xs',  value: '4' },
  { token: '--ds-space-sm',  value: '8' },
  { token: '--ds-space-md',  value: '12' },
  { token: '--ds-space-lg',  value: '16' },
  { token: '--ds-space-xl',  value: '24' },
  { token: '--ds-space-2xl', value: '32' },
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

function ColorRow({ name, token, desc, compact }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: compact ? 'var(--ds-space-sm)' : 'var(--ds-space-md)',
      padding: 'var(--ds-space-sm) 0',
    }}>
      <ColorCircle token={token} size={compact ? 24 : 32} />
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
      {!compact && (
        <code style={{
          fontSize: 'var(--ds-text-xs)',
          fontFamily: 'var(--ds-font-mono)',
          color: 'var(--ds-text-muted)',
        }}>{token}</code>
      )}
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
      padding: 'var(--ds-space-lg)',
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
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeFont, setActiveFont] = useState('--ds-font-sans');
  const isMobile = useIsMobile();

  /* ── Plusi widget controls ── */
  const [plusiMood, setPlusiMood] = useState('neutral');
  const [plusiSize, setPlusiSize] = useState(52);
  const [bubbleProto, setBubbleProto] = useState({ a: 'response', b: 'response', c: 'response' });

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
  }, [theme]);

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
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

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

      {/* ════════ SIDEBAR TOGGLE ════════ */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          position: 'fixed', top: 'var(--ds-space-lg)', left: 'var(--ds-space-lg)',
          zIndex: 200,
          width: isMobile ? 40 : 34, height: isMobile ? 40 : 34,
          borderRadius: 'var(--ds-radius-md)',
          background: sidebarOpen ? 'transparent' : 'var(--ds-bg-frosted)',
          backdropFilter: sidebarOpen ? 'none' : 'blur(20px)',
          WebkitBackdropFilter: sidebarOpen ? 'none' : 'blur(20px)',
          border: sidebarOpen ? 'none' : '1px solid var(--ds-border-subtle)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--ds-text-tertiary)',
          transition: 'all var(--ds-duration) var(--ds-ease)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {sidebarOpen
            ? <path d="M4 4l10 10M14 4L4 14" />
            : <><path d="M3 5h12" /><path d="M3 9h12" /><path d="M3 13h12" /></>
          }
        </svg>
      </button>

      {/* ════════ FLOATING THEME TOGGLE (mobile) ════════ */}
      {isMobile && (
        <button
          onClick={toggleTheme}
          style={{
            position: 'fixed', top: 'var(--ds-space-lg)', right: 'var(--ds-space-lg)',
            zIndex: 200,
            width: 40, height: 40,
            borderRadius: 'var(--ds-radius-md)',
            background: 'var(--ds-bg-frosted)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--ds-border-subtle)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15,
            transition: 'all var(--ds-duration) var(--ds-ease)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ds-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {theme === 'dark'
              ? <><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></>
              : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            }
          </svg>
        </button>
      )}

      {/* ════════ SIDEBAR BACKDROP (mobile) ════════ */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 140,
            background: 'color-mix(in srgb, black 50%, transparent)',
            transition: 'opacity 0.25s ease',
          }}
        />
      )}

      {/* ════════ SIDEBAR ════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: isMobile ? '75vw' : 200,
        maxWidth: 280,
        background: 'var(--ds-bg-canvas)',
        borderRight: '1px solid var(--ds-border-subtle)',
        padding: 'var(--ds-space-xl) 0',
        overflowY: 'auto',
        zIndex: 150,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        WebkitOverflowScrolling: 'touch',
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
            Invisible <span style={{ color: 'var(--ds-accent)' }}>Addiction</span>
          </div>
          <div style={{
            fontSize: 'var(--ds-text-xs)',
            color: 'var(--ds-text-muted)',
            marginTop: 2,
          }}>Anki.plus Design System</div>
        </div>

        {/* Theme toggle */}
        <div style={{ padding: '0 var(--ds-space-xl)', marginBottom: 'var(--ds-space-lg)' }}>
          <button
            onClick={toggleTheme}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 'var(--ds-space-sm)',
              width: '100%',
              background: 'var(--ds-hover-tint)', border: 'none',
              borderRadius: 'var(--ds-radius-sm)',
              padding: 'var(--ds-space-sm) var(--ds-space-md)',
              cursor: 'pointer',
              fontSize: 'var(--ds-text-xs)', fontWeight: 500,
              fontFamily: 'var(--ds-font-sans)',
              color: 'var(--ds-text-secondary)',
              transition: 'background var(--ds-duration) var(--ds-ease)',
            }}
          >
            <span style={{ fontSize: 14 }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
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
                display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 'var(--ds-space-sm) var(--ds-space-xl)',
                fontSize: 'var(--ds-text-sm)', fontWeight: 600,
                fontFamily: 'var(--ds-font-sans)',
                color: isActive(section)
                  ? 'var(--ds-text-primary)'
                  : 'var(--ds-text-secondary)',
                transition: 'color var(--ds-duration) var(--ds-ease)',
                borderLeft: isActive(section)
                  ? '2px solid var(--ds-accent)'
                  : '2px solid transparent',
                marginLeft: -1,
              }}
            >{section.label}</button>

            {section.children && section.children.map(child => (
              <button
                key={child.id}
                onClick={() => scrollTo(child.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: activeId === child.id ? 'var(--ds-hover-tint)' : 'none',
                  border: 'none', cursor: 'pointer',
                  padding: '3px var(--ds-space-xl) 3px 36px',
                  fontSize: 'var(--ds-text-xs)', fontWeight: 500,
                  fontFamily: 'var(--ds-font-sans)',
                  color: activeId === child.id
                    ? 'var(--ds-accent)'
                    : 'var(--ds-text-tertiary)',
                  transition: 'all var(--ds-duration) var(--ds-ease)',
                  borderRadius: 'var(--ds-radius-sm)',
                  margin: '0 var(--ds-space-sm)',
                }}
              >{child.label}</button>
            ))}
          </div>
        ))}
      </nav>

      {/* ════════ CONTENT ════════ */}
      <main style={{
        marginLeft: (sidebarOpen && !isMobile) ? 200 : 0,
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        padding: isMobile
          ? 'var(--ds-space-lg) var(--ds-space-md)'
          : 'var(--ds-space-2xl) var(--ds-space-xl)',
        transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div style={{ maxWidth: 760, width: '100%' }}>

          {/* ──────────── PHILOSOPHY — Full Screen Hero ──────────── */}
          <div
            ref={el => { if (sectionRefs.current) sectionRefs.current['philosophy'] = el; }}
            id="philosophy"
            style={{
              height: '100dvh',
              minHeight: '100vh',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              marginLeft: isMobile ? 'calc(-1 * var(--ds-space-md))' : 'calc(-1 * var(--ds-space-xl))',
              marginRight: isMobile ? 'calc(-1 * var(--ds-space-md))' : 'calc(-1 * var(--ds-space-xl))',
              marginTop: isMobile ? 'calc(-1 * var(--ds-space-lg))' : 'calc(-1 * var(--ds-space-2xl))',
              overflow: 'hidden',
              background: 'var(--ds-bg-canvas)',
              color: 'var(--ds-text-primary)',
            }}
          >
            {/* ── Ambient accent glow from bottom ── */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: [
                'radial-gradient(ellipse 90% 45% at 50% 100%, var(--ds-accent-20), transparent 70%)',
                'radial-gradient(ellipse 50% 30% at 35% 95%, var(--ds-accent-10), transparent 55%)',
              ].join(', '),
            }} />

            {/* ── Dot grid + Ghost Plus — single SVG, one coordinate system ── */}
            <div style={{
              position: 'absolute',
              top: '30%', left: 0, right: 0,
              display: 'flex', justifyContent: 'center',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}>
              {(() => {
                /* Everything in grid units. 1 unit = 16px.
                   Plus: 10×10 cells, arms 2 wide (x 4→6, y 4→6).
                   Dots: drawn at every integer coordinate.
                   ViewBox extends 8 cells beyond plus on each side for fade.
                   r=0.5 = radius-sm. Perimeter ≈ 37.4. */
                const margin = 40;
                const vb = `${-margin} ${-margin} ${10 + margin * 2} ${10 + margin * 2}`;
                const svgSize = (10 + margin * 2) * 16; // 960px
                const r = 0.5;
                const d = [
                  `M 4.5,0 L 5.5,0`,
                  `A ${r},${r} 0 0 1 6,0.5  L 6,3.5`,
                  `A ${r},${r} 0 0 0 6.5,4  L 9.5,4`,
                  `A ${r},${r} 0 0 1 10,4.5  L 10,5.5`,
                  `A ${r},${r} 0 0 1 9.5,6  L 6.5,6`,
                  `A ${r},${r} 0 0 0 6,6.5  L 6,9.5`,
                  `A ${r},${r} 0 0 1 5.5,10  L 4.5,10`,
                  `A ${r},${r} 0 0 1 4,9.5  L 4,6.5`,
                  `A ${r},${r} 0 0 0 3.5,6  L 0.5,6`,
                  `A ${r},${r} 0 0 1 0,5.5  L 0,4.5`,
                  `A ${r},${r} 0 0 1 0.5,4  L 3.5,4`,
                  `A ${r},${r} 0 0 0 4,3.5  L 4,0.5`,
                  `A ${r},${r} 0 0 1 4.5,0 Z`,
                ].join(' ');
                const perim = 37.4;
                const seg = 6;
                const dash = `${seg} ${perim - seg}`;
                const half = perim / 2;
                const total = 10 + margin * 2;
                /* Dot rect extends far beyond SVG bounds — hero overflow:hidden clips */
                const dotSpan = 200;
                const dotOff = -95;
                return (
                  <svg viewBox={vb} fill="none" style={{ width: svgSize, height: svgSize, overflow: 'visible' }}>
                    <defs>
                      <filter id="plus-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="0.2" />
                      </filter>
                      <pattern id="dot-grid" x="0" y="0" width="1" height="1" patternUnits="userSpaceOnUse">
                        <circle cx="0" cy="0" r="0.09" fill="var(--ds-border-medium)" />
                      </pattern>
                      <linearGradient id="dot-fade" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="white" stopOpacity="0" />
                        <stop offset="30%" stopColor="white" stopOpacity="0" />
                        <stop offset="45%" stopColor="white" stopOpacity="0.5" />
                        <stop offset="60%" stopColor="white" stopOpacity="1" />
                        <stop offset="100%" stopColor="white" stopOpacity="1" />
                      </linearGradient>
                      <mask id="fade-mask">
                        <rect x={dotOff} y={dotOff} width={dotSpan} height={dotSpan} fill="url(#dot-fade)" />
                      </mask>
                    </defs>
                    {/* Grid — pattern + vertical fade, extends far beyond SVG for full hero coverage */}
                    <rect x={dotOff} y={dotOff} width={dotSpan} height={dotSpan} fill="url(#dot-grid)" mask="url(#fade-mask)" />
                    {/* Snake 1 */}
                    <path d={d} stroke="var(--ds-accent)" strokeWidth="0.2" strokeDasharray={dash} strokeLinecap="round" opacity="0.25" filter="url(#plus-glow)">
                      <animate attributeName="stroke-dashoffset" values={`0;${-perim}`} dur="10s" repeatCount="indefinite" />
                    </path>
                    <path d={d} stroke="var(--ds-accent)" strokeWidth="0.06" strokeDasharray={dash} strokeLinecap="round" opacity="0.6">
                      <animate attributeName="stroke-dashoffset" values={`0;${-perim}`} dur="10s" repeatCount="indefinite" />
                    </path>
                    {/* Snake 2 — offset half */}
                    <path d={d} stroke="var(--ds-accent)" strokeWidth="0.2" strokeDasharray={dash} strokeLinecap="round" opacity="0.25" filter="url(#plus-glow)">
                      <animate attributeName="stroke-dashoffset" values={`${-half};${-half - perim}`} dur="10s" repeatCount="indefinite" />
                    </path>
                    <path d={d} stroke="var(--ds-accent)" strokeWidth="0.06" strokeDasharray={dash} strokeLinecap="round" opacity="0.6">
                      <animate attributeName="stroke-dashoffset" values={`${-half};${-half - perim}`} dur="10s" repeatCount="indefinite" />
                    </path>
                  </svg>
                );
              })()}

            </div>


            {/* ── Content — bottom-left ── */}
            <div style={{
              position: 'relative', zIndex: 1,
              padding: isMobile
                ? '0 var(--ds-space-lg) var(--ds-space-xl)'
                : '0 var(--ds-space-2xl) var(--ds-space-2xl)',
            }}>
              {/* Brand color */}
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                gap: 'var(--ds-space-sm)',
                marginBottom: 'var(--ds-space-xl)',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--ds-accent)',
                }} />
                <span style={{
                  fontSize: 11, fontWeight: 500,
                  fontFamily: 'var(--ds-font-mono)',
                  color: 'var(--ds-accent)',
                  letterSpacing: '0.02em',
                }}>Brand Color</span>
                <span style={{
                  fontSize: 11,
                  fontFamily: 'var(--ds-font-mono)',
                  color: 'var(--ds-text-muted)',
                }}>#0A84FF</span>
              </div>

              {/* System name */}
              <h1 style={{
                fontSize: isMobile ? 34 : 'clamp(40px, 5.5vw, 64px)',
                fontWeight: 700,
                color: 'var(--ds-text-primary)',
                lineHeight: 1.05,
                letterSpacing: '-0.04em',
                margin: 0,
                fontFamily: 'var(--ds-font-sans)',
              }}>
                Invisible{isMobile ? ' ' : <br />}
                <span style={{ color: 'var(--ds-accent)' }}>Addiction.</span>
              </h1>

              {/* Subtitle */}
              <div style={{
                fontSize: 'var(--ds-text-sm)',
                color: 'var(--ds-text-tertiary)',
                marginTop: 'var(--ds-space-lg)',
                fontFamily: 'var(--ds-font-sans)',
                letterSpacing: '0.01em',
              }}>
                Anki.plus Design System
              </div>
            </div>
          </div>

          {/* ──────────── PHILOSOPHY ──────────── */}
          <div style={{ padding: 'var(--ds-space-2xl) 0' }}>

            {/* Two pillars */}
            <div style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: isMobile ? 'var(--ds-space-2xl)' : 'var(--ds-space-2xl)',
              marginBottom: 'var(--ds-space-2xl)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 'var(--ds-text-xl)', fontWeight: 700,
                  color: 'var(--ds-text-primary)',
                  letterSpacing: '-0.02em',
                  marginBottom: 'var(--ds-space-md)',
                }}>Invisible</div>
                <div style={{
                  fontSize: 'var(--ds-text-md)',
                  color: 'var(--ds-text-secondary)',
                  lineHeight: 1.7,
                }}>
                  Das Interface verschwindet. Was bleibt, ist der Inhalt.
                  Clean, reduziert, so selbstverständlich, dass man es nicht bemerkt.
                  Kein Element existiert ohne Grund.
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 'var(--ds-text-xl)', fontWeight: 700,
                  color: 'var(--ds-accent)',
                  letterSpacing: '-0.02em',
                  marginBottom: 'var(--ds-space-md)',
                }}>Addiction</div>
                <div style={{
                  fontSize: 'var(--ds-text-md)',
                  color: 'var(--ds-text-secondary)',
                  lineHeight: 1.7,
                }}>
                  Jede Interaktion fühlt sich unvermeidlich an.
                  Smooth, magisch, faszinierend — man will nicht mehr aufhören.
                  Das System erzeugt Gewohnheit durch Qualität.
                </div>
              </div>
            </div>

            {/* Table of Contents — same TreeList component as DeckBrowser */}
            <div className="ds-borderless" style={{
              padding: 'var(--ds-space-md) 0',
              overflow: 'hidden',
            }}>
              <TreeList
                items={NAV.filter(s => s.id !== 'philosophy')}
                header="Inhalt"
                onItemClick={(item) => scrollTo(item.id)}
                renderRight={(item) => item.children ? (
                  <span style={{
                    fontSize: 10,
                    color: 'var(--ds-text-muted)',
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{item.children.length}</span>
                ) : null}
              />
            </div>
          </div>

          {/* ──────────── FOUNDATIONS ──────────── */}
          <SectionHeader id="foundations" label="Foundations" refs={sectionRefs} />

          {/* Materials — Philosophy + Three Cards */}
          <SubHeader id="materials" label="Materials" refs={sectionRefs} />

          {/* Material philosophy (was the old Philosophy section) */}
          <div style={{
            textAlign: 'center',
            padding: 'var(--ds-space-xl) 0 var(--ds-space-2xl)',
          }}>
            <div style={{
              fontSize: 'var(--ds-text-xl)', fontWeight: 600,
              color: 'var(--ds-text-primary)',
              lineHeight: 1.4,
              marginBottom: 'var(--ds-space-md)',
            }}>
              Drei Materialien. Jede Oberfläche hat eine Aufgabe.
            </div>
            <div style={{
              fontSize: 'var(--ds-text-sm)',
              color: 'var(--ds-text-tertiary)',
              lineHeight: 1.7,
              maxWidth: 500,
              margin: '0 auto',
            }}>
              Deep — wo die KI arbeitet. Canvas — wo Content lebt.
              Frosted — wo du interagierst. Farbe ist reserviert für Bedeutung.
            </div>
          </div>

          {/* Three material cards side by side */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--ds-space-md)',
            marginBottom: 'var(--ds-space-md)',
          }}>
            {/* Deep — clean, nothing extra */}
            <div style={{
              background: 'var(--ds-bg-deep)',
              borderRadius: 'var(--ds-radius-lg)',
              border: '1px solid var(--ds-border-subtle)',
              aspectRatio: isMobile ? '2.5 / 1' : '1',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 'var(--ds-space-sm)',
            }}>
              <div style={{ fontSize: 'var(--ds-text-xl)', fontWeight: 700, color: 'var(--ds-text-primary)', letterSpacing: '-0.02em' }}>Deep</div>
              <code style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)', fontFamily: 'var(--ds-font-mono)' }}>--ds-bg-deep</code>
            </div>

            {/* Canvas — dot grid with radial fade */}
            <div style={{
              background: 'var(--ds-bg-canvas)',
              borderRadius: 'var(--ds-radius-lg)',
              border: '1px solid var(--ds-border-subtle)',
              aspectRatio: isMobile ? '2.5 / 1' : '1',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 'var(--ds-space-sm)',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Dot grid */}
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'radial-gradient(circle, var(--ds-border-medium) 1px, transparent 1px)',
                backgroundSize: '16px 16px',
                maskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black 20%, transparent 70%)',
                WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black 20%, transparent 70%)',
                opacity: 0.6,
              }} />
              <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--ds-text-xl)', fontWeight: 700, color: 'var(--ds-text-primary)', letterSpacing: '-0.02em' }}>Canvas</div>
                <code style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)', fontFamily: 'var(--ds-font-mono)' }}>--ds-bg-canvas</code>
              </div>
            </div>

            {/* Frosted — glass over content to show the material effect */}
            <div style={{
              aspectRatio: isMobile ? '2.5 / 1' : '1',
              position: 'relative', overflow: 'hidden',
              borderRadius: 'var(--ds-radius-lg)',
            }}>
              {/* Content behind the glass */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 16px', gap: 6 }}>
                {['Anatomie', 'Biochemie', 'Physiologie', 'Biologie', 'Chemie', 'Physik'].map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ds-text-secondary)', borderBottom: '1px solid var(--ds-border-subtle)', paddingBottom: 4 }}>
                    <span>{t}</span>
                    <span style={{ color: 'var(--ds-green)', fontFamily: 'ui-monospace', fontWeight: 600, fontSize: 10 }}>{[632, 307, 575, 269, 310, 1064][i]}</span>
                  </div>
                ))}
              </div>
              {/* Glass overlay */}
              <div className="ds-frosted" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--ds-space-sm)' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 'var(--ds-text-xl)', fontWeight: 700, color: 'var(--ds-text-primary)', letterSpacing: '-0.02em' }}>Frosted</div>
                  <code style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)', fontFamily: 'var(--ds-font-mono)' }}>--ds-bg-frosted</code>
                </div>
              </div>
            </div>
          </div>

          {/* Deep → Floating progression — tapered line */}
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: 'var(--ds-space-md) var(--ds-space-lg)',
            gap: 'var(--ds-space-md)',
          }}>
            <span style={{
              fontSize: 'var(--ds-text-xs)', fontWeight: 600,
              color: 'var(--ds-text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              flexShrink: 0,
            }}>Grounded</span>
            <div style={{
              flex: 1, height: 4, position: 'relative',
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              {/* Tapered shape: thin left → thick right */}
              <svg width="100%" height="4" viewBox="0 0 100 4" preserveAspectRatio="none" style={{ display: 'block' }}>
                <defs>
                  <linearGradient id="taper-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="var(--ds-border-subtle)" />
                    <stop offset="50%" stopColor="var(--ds-accent)" />
                    <stop offset="100%" stopColor="var(--ds-accent)" />
                  </linearGradient>
                </defs>
                <polygon points="0,1.5 100,0 100,4 0,2.5" fill="url(#taper-grad)" />
              </svg>
            </div>
            <span style={{
              fontSize: 'var(--ds-text-xs)', fontWeight: 600,
              color: 'var(--ds-text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              flexShrink: 0,
            }}>Floating</span>
          </div>

          {/* Typography */}
          <SubHeader id="typography" label="Typography" refs={sectionRefs} />

          {/* Font selector — clickable tabs at top */}
          <div style={{
            display: 'flex', gap: 'var(--ds-space-sm)',
            marginBottom: 'var(--ds-space-xl)',
            ...(isMobile && { overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }),
          }}>
            {[
              { font: '--ds-font-sans', name: 'SF Pro', role: 'UI' },
              { font: '--ds-font-brand', name: 'Space Grotesk', role: 'Brand' },
              { font: '--ds-font-mono', name: 'SF Mono', role: 'Code' },
            ].map(f => {
              const isActive = activeFont === f.font;
              return (
                <button
                  key={f.font}
                  onClick={() => setActiveFont(f.font)}
                  style={{
                    flex: isMobile ? 'none' : 1,
                    minWidth: isMobile ? 100 : undefined,
                    padding: isMobile ? 'var(--ds-space-md) var(--ds-space-md)' : 'var(--ds-space-lg) var(--ds-space-md)',
                    borderRadius: 'var(--ds-radius-md)',
                    border: isActive ? '1px solid var(--ds-accent-50)' : '1px solid var(--ds-border-subtle)',
                    background: isActive ? 'var(--ds-accent-10)' : 'var(--ds-bg-canvas)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all var(--ds-duration) var(--ds-ease)',
                    fontFamily: 'var(--ds-font-sans)',
                  }}
                >
                  <div style={{
                    fontFamily: `var(${f.font})`,
                    fontSize: 'var(--ds-text-xl)',
                    fontWeight: 600,
                    color: isActive ? 'var(--ds-accent)' : 'var(--ds-text-primary)',
                    letterSpacing: f.font === '--ds-font-mono' ? '0.05em' : '-0.02em',
                    marginBottom: 'var(--ds-space-xs)',
                  }}>Aa</div>
                  <div style={{
                    fontSize: 'var(--ds-text-xs)',
                    color: isActive ? 'var(--ds-accent)' : 'var(--ds-text-tertiary)',
                    fontWeight: 500,
                  }}>{f.name}</div>
                  <div style={{
                    fontSize: 9,
                    color: 'var(--ds-text-muted)',
                    fontFamily: 'var(--ds-font-mono)',
                    marginTop: 2,
                  }}>{f.role}</div>
                </button>
              );
            })}
          </div>

          {/* Type scale in active font */}
          <Showcase>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                { size: '--ds-text-2xl', color: '--ds-text-primary', weight: 700, text: 'Major headline', role: 'Hero', px: '20' },
                { size: '--ds-text-xl', color: '--ds-text-primary', weight: 600, text: 'Section headline', role: 'Titles', px: '18' },
                { size: '--ds-text-lg', color: '--ds-text-primary', weight: 400, text: 'Der Tractus iliotibialis ist eine kräftige Sehnenplatte.', role: 'Body', px: '15' },
                { size: '--ds-text-md', color: '--ds-text-secondary', weight: 500, text: 'Card content and descriptions', role: 'Cards', px: '14' },
                { size: '--ds-text-base', color: '--ds-text-secondary', weight: 400, text: 'Supplementary descriptions', role: 'Meta', px: '13' },
                { size: '--ds-text-sm', color: '--ds-text-tertiary', weight: 500, text: 'Buttons, timestamps, labels', role: 'Controls', px: '12' },
                { size: '--ds-text-xs', color: '--ds-text-muted', weight: 500, text: 'KEYBOARD HINTS · TOKENS', role: 'System', px: '11' },
              ].map((row, i, arr) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'baseline',
                  padding: isMobile ? 'var(--ds-space-sm) 0' : 'var(--ds-space-md) 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--ds-border-subtle)' : 'none',
                  gap: isMobile ? 'var(--ds-space-sm)' : 'var(--ds-space-md)',
                }}>
                  <div style={{
                    width: 20, flexShrink: 0,
                    fontSize: 'var(--ds-text-xs)',
                    fontFamily: 'var(--ds-font-mono)',
                    color: 'var(--ds-text-muted)',
                    textAlign: 'right',
                  }}>{row.px}</div>
                  <div style={{
                    flex: 1,
                    fontSize: `var(${row.size})`,
                    fontWeight: row.weight,
                    color: `var(${row.color})`,
                    fontFamily: `var(${activeFont})`,
                    lineHeight: 1.4,
                    transition: 'font-family 0.15s ease',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>{row.text}</div>
                  {!isMobile && (
                    <div style={{
                      fontSize: 'var(--ds-text-xs)',
                      color: 'var(--ds-text-muted)',
                      flexShrink: 0,
                      fontFamily: 'var(--ds-font-mono)',
                    }}>{row.role}</div>
                  )}
                </div>
              ))}
            </div>
          </Showcase>

          {/* Colors — Semantic, Borders, Tints, Stats */}
          <SubHeader id="colors" label="Colors" refs={sectionRefs} />
          <Showcase label="Semantic">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--ds-space-sm)' }}>
              {SEMANTIC_COLORS.map(c => <ColorRow key={c.token} {...c} compact={isMobile} />)}
            </div>
          </Showcase>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--ds-space-lg)' }}>
            <Showcase label="Borders">
              {BORDER_COLORS.map(c => <ColorRow key={c.token} {...c} compact={isMobile} />)}
            </Showcase>
            <Showcase label="Tints">
              {TINT_COLORS.map(c => <ColorRow key={c.token} {...c} compact={isMobile} />)}
            </Showcase>
          </div>
          <Showcase label="Stats">
            <div style={{ display: 'flex', gap: isMobile ? 'var(--ds-space-md)' : 'var(--ds-space-xl)', flexWrap: 'wrap' }}>
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

          {/* ── Spatial System ── */}
          <SubHeader id="spatial" label="Spatial System" refs={sectionRefs} />

          {/* Container Recipes — each card IS its own recipe */}
          <div style={{
            display: 'flex', flexDirection: 'column',
            gap: 'var(--ds-space-md)',
            marginBottom: 'var(--ds-space-xl)',
          }}>
            {/* Frosted Glass */}
            <div className="ds-frosted" style={{
              padding: 'var(--ds-space-lg)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--ds-space-sm)',
            }}>
              <div>
                <div style={{ fontSize: 'var(--ds-text-md)', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                  Frosted Glass
                </div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)', marginTop: 2 }}>
                  Input-Docks, Dropdowns
                </div>
              </div>
              <div style={{
                fontSize: isMobile ? 8 : 9, color: 'var(--ds-text-muted)',
                fontFamily: 'var(--ds-font-mono)',
                textAlign: 'right', lineHeight: 1.6,
              }}>
                radius-lg · border-medium<br />shadow-md · blur(20)
              </div>
            </div>

            {/* Content Card */}
            <div className="ds-borderless" style={{
              padding: 'var(--ds-space-lg)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--ds-space-sm)',
            }}>
              <div>
                <div style={{ fontSize: 'var(--ds-text-md)', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                  Content Card
                </div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)', marginTop: 2 }}>
                  Stats, Karten, Bilder
                </div>
              </div>
              <div style={{
                fontSize: isMobile ? 8 : 9, color: 'var(--ds-text-muted)',
                fontFamily: 'var(--ds-font-mono)',
                textAlign: 'right',
              }}>
                radius-lg · border-subtle
              </div>
            </div>

            {/* Interactive */}
            <div style={{
              padding: 'var(--ds-space-md) var(--ds-space-lg)',
              borderRadius: 'var(--ds-radius-md)',
              background: 'var(--ds-hover-tint)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--ds-space-sm)',
            }}>
              <div>
                <div style={{ fontSize: 'var(--ds-text-md)', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                  Interactive
                </div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)', marginTop: 2 }}>
                  Options, Buttons, Steps
                </div>
              </div>
              <div style={{
                fontSize: isMobile ? 8 : 9, color: 'var(--ds-text-muted)',
                fontFamily: 'var(--ds-font-mono)',
                textAlign: 'right',
              }}>
                radius-md · hover-tint
              </div>
            </div>

            {/* Compact */}
            <div style={{
              padding: 'var(--ds-space-sm) var(--ds-space-lg)',
              borderRadius: 'var(--ds-radius-sm)',
              background: 'var(--ds-hover-tint)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--ds-space-sm)',
            }}>
              <div>
                <div style={{ fontSize: 'var(--ds-text-sm)', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                  Compact
                </div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)', marginTop: 2 }}>
                  Tabs, Badges, Pills
                </div>
              </div>
              <div style={{
                fontSize: isMobile ? 8 : 9, color: 'var(--ds-text-muted)',
                fontFamily: 'var(--ds-font-mono)',
              }}>
                radius-sm
              </div>
            </div>
          </div>

          {/* Spacing — compact bar strip */}
          <div style={{
            display: 'flex', alignItems: 'flex-end',
            gap: isMobile ? 6 : 'var(--ds-space-sm)',
            paddingBottom: 'var(--ds-space-xl)',
          }}>
            <span style={{
              fontSize: 9, fontWeight: 600, color: 'var(--ds-text-muted)',
              fontFamily: 'var(--ds-font-mono)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              marginRight: 'var(--ds-space-sm)',
              paddingBottom: 2,
            }}>Space</span>
            {SPACING_SCALE.map(s => (
              <div key={s.token} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 3,
              }}>
                <div style={{
                  width: isMobile ? 16 : 20,
                  height: `var(${s.token})`,
                  background: 'var(--ds-accent)',
                  borderRadius: 2,
                  opacity: 0.3,
                }} />
                <span style={{
                  fontSize: 8, color: 'var(--ds-text-muted)',
                  fontFamily: 'var(--ds-font-mono)',
                }}>{s.value}</span>
              </div>
            ))}
          </div>

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
          <Showcase label="Primary Button">
            <div style={{ display: 'flex', gap: 'var(--ds-space-md)', flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="primary" size="sm">Small</Button>
              <Button variant="primary" size="md">Medium</Button>
              <Button variant="primary" size="lg">Large</Button>
            </div>
            <VariantLabel>States</VariantLabel>
            <div style={{ display: 'flex', gap: 'var(--ds-space-md)', alignItems: 'center' }}>
              <Button variant="primary">Default</Button>
              <Button variant="primary" disabled>Disabled</Button>
            </div>
            <VariantLabel>CSS class (non-React)</VariantLabel>
            <div style={{ display: 'flex', gap: 'var(--ds-space-md)', alignItems: 'center' }}>
              <button className="ds-btn-primary">ds-btn-primary</button>
              <button className="ds-btn-primary" disabled>Disabled</button>
            </div>
          </Showcase>
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

          {/* ── Anatomy — technical blueprint, bleeds beyond content, generous height ── */}
          <div style={{
            position: 'relative',
            padding: isMobile ? 'var(--ds-space-2xl) 0' : '80px 0',
            marginBottom: 'var(--ds-space-xl)',
            marginLeft: 'calc(-50vw + 50%)',
            marginRight: 'calc(-50vw + 50%)',
            overflow: 'hidden',
          }}>
            {/* Technical grid — bleeds to viewport edges, fades out */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: `
                linear-gradient(var(--ds-border-subtle) 1px, transparent 1px),
                linear-gradient(90deg, var(--ds-border-subtle) 1px, transparent 1px)
              `,
              backgroundSize: '32px 32px',
              backgroundPosition: 'center center',
              opacity: 0.4,
              maskImage: 'radial-gradient(ellipse 60% 80% at 50% 50%, black 20%, transparent 65%)',
              WebkitMaskImage: 'radial-gradient(ellipse 60% 80% at 50% 50%, black 20%, transparent 65%)',
            }} />

            <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', padding: '0 var(--ds-space-xl)' }}>
              {/* Title */}
              <div style={{
                fontSize: 'var(--ds-text-xs)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--ds-text-muted)',
                marginBottom: 'var(--ds-space-2xl)',
                fontFamily: 'var(--ds-font-mono)',
              }}>Input System — Anatomy</div>

              {/* The actual ChatInput — full width */}
              <div style={{ marginBottom: 0 }}>
                <ChatInput
                  onSend={() => {}} isLoading={false} onStop={() => {}}
                  cardContext={null} isPremium={true}
                  actionPrimary={{ label: 'Weiter', shortcut: 'SPACE', onClick: () => {} }}
                  actionSecondary={{ label: 'Nachfragen', shortcut: '\u21B5', onClick: () => {} }}
                />
              </div>

              {/* Angular connector arrows + labels */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 0,
              }}>
                {/* Left connector + label */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {/* Vertical line down */}
                  <div style={{ width: 1, height: 24, background: 'var(--ds-text-tertiary)' }} />
                  {/* Horizontal + arrow */}
                  <svg width="120" height="20" viewBox="0 0 120 20" fill="none" style={{ display: 'block' }}>
                    <path d="M 60 0 L 60 10 L 20 10 L 20 18" stroke="var(--ds-text-tertiary)" strokeWidth="1" />
                    <path d="M 16 14 L 20 19 L 24 14" stroke="var(--ds-text-tertiary)" strokeWidth="1" fill="none" />
                  </svg>
                  {/* Label */}
                  <div style={{ textAlign: 'center', padding: 'var(--ds-space-sm) var(--ds-space-md)' }}>
                    <div style={{
                      fontSize: 'var(--ds-text-sm)', fontWeight: 600,
                      color: 'var(--ds-text-primary)',
                      marginBottom: 'var(--ds-space-xs)',
                    }}>Linke Taste</div>
                    <div style={{ display: 'flex', gap: 'var(--ds-space-md)', justifyContent: 'center' }}>
                      <div style={{ textAlign: 'center' }}>
                        <span className="ds-kbd" style={{ color: 'var(--ds-text-secondary)', fontSize: 11 }}>SPACE</span>
                        <div style={{ fontSize: 9, color: 'var(--ds-text-muted)', marginTop: 2 }}>Weiter</div>
                      </div>
                      <div style={{ width: 1, height: 24, background: 'var(--ds-border-subtle)' }} />
                      <div style={{ textAlign: 'center' }}>
                        <span className="ds-kbd" style={{ color: 'var(--ds-text-secondary)', fontSize: 11 }}>ESC</span>
                        <div style={{ fontSize: 9, color: 'var(--ds-text-muted)', marginTop: 2 }}>Schließen</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right connector + label */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {/* Vertical line down */}
                  <div style={{ width: 1, height: 24, background: 'var(--ds-accent)' }} />
                  {/* Horizontal + arrow */}
                  <svg width="120" height="20" viewBox="0 0 120 20" fill="none" style={{ display: 'block' }}>
                    <path d="M 60 0 L 60 10 L 100 10 L 100 18" stroke="var(--ds-accent)" strokeWidth="1" />
                    <path d="M 96 14 L 100 19 L 104 14" stroke="var(--ds-accent)" strokeWidth="1" fill="none" />
                  </svg>
                  {/* Label */}
                  <div style={{ textAlign: 'center', padding: 'var(--ds-space-sm) var(--ds-space-md)' }}>
                    <div style={{
                      fontSize: 'var(--ds-text-sm)', fontWeight: 600,
                      color: 'var(--ds-accent)',
                      marginBottom: 'var(--ds-space-xs)',
                    }}>Aktionstaste</div>
                    <div style={{ textAlign: 'center' }}>
                      <span className="ds-kbd" style={{ color: 'var(--ds-accent)', fontSize: 11 }}>{'\u21B5'} ENTER</span>
                      <div style={{ fontSize: 9, color: 'var(--ds-text-muted)', marginTop: 2 }}>Kontextabhängig</div>
                      <div style={{ fontSize: 9, color: 'var(--ds-text-muted)', marginTop: 1 }}>Nachfragen · Senden · MC</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Two Input Types ── */}
          <div style={{
            fontSize: 'var(--ds-text-xs)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--ds-text-muted)',
            marginBottom: 'var(--ds-space-md)',
            marginTop: 'var(--ds-space-lg)',
          }}>Typ 1 — Chat Input Dock</div>

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

          {/* Typ 2 — Search Input */}
          <div style={{
            fontSize: 'var(--ds-text-xs)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--ds-text-muted)',
            marginBottom: 'var(--ds-space-md)',
            marginTop: 'var(--ds-space-xl)',
          }}>Typ 2 — Search Input</div>

          <Showcase label="DeckBrowser Search">
            <div className="ds-frosted" style={{
              maxWidth: 440,
              padding: 'var(--ds-space-md) var(--ds-space-lg)',
              display: 'flex', alignItems: 'center', gap: 'var(--ds-space-sm)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ds-text-tertiary)" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <span style={{ fontSize: 'var(--ds-text-md)', color: 'var(--ds-text-placeholder)' }}>
                Frage stellen oder Stapel suchen...
              </span>
            </div>
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

          {/* ReviewFeedback */}
          <SubHeader id="reviewfeedback" label="Review Feedback" refs={sectionRefs} />
          <Showcase label="Score states">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-md)', maxWidth: 400 }}>
              <ReviewFeedback score={30} />
              <ReviewFeedback score={70} />
              <ReviewFeedback score={100} />
            </div>
          </Showcase>

          {/* Dock Widgets */}
          <SubHeader id="dockwidgets" label="Dock Widgets" refs={sectionRefs} />
          <Showcase label="DockLoading — AI evaluating">
            <DockLoading steps={DOCK_LOADING_STEPS} />
          </Showcase>
          <VariantLabel>DockEvalResult — score display</VariantLabel>
          <Showcase>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-sm)' }}>
              <DockEvalResult result={{ score: 20, feedback: 'Teilweise richtig, wichtige Details fehlen.' }} />
              <DockEvalResult result={{ score: 65, feedback: 'Gut! Kleiner Fehler bei der Innervation.' }} />
              <DockEvalResult result={{ score: 95, feedback: 'Ausgezeichnet!' }} />
            </div>
          </Showcase>
          <VariantLabel>DockTimer — elapsed + rating</VariantLabel>
          <Showcase>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-sm)' }}>
              <DockTimer frozenElapsed={4200} rating={1} onCycleRating={() => {}} />
              <DockTimer frozenElapsed={8900} rating={3} onCycleRating={() => {}} />
              <DockTimer frozenElapsed={12400} rating={4} onCycleRating={() => {}} />
            </div>
          </Showcase>
          <VariantLabel>DockStars — star count</VariantLabel>
          <Showcase>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-sm)' }}>
              <DockStars stars={1} rating={1} isResult={false} />
              <DockStars stars={2} rating={2} isResult={false} />
              <DockStars stars={3} rating={4} isResult={true} />
            </div>
          </Showcase>

          {/* SourceCard */}
          <SubHeader id="sourcecard" label="Source Card" refs={sectionRefs} />
          <Showcase label="Match types">
            <div style={SOURCE_CARDS_ROW_STYLE}>
              <div style={SOURCE_CARD_STYLE}>
                <SourceCard citation={DEMO_SOURCE_KEYWORD} index={1} />
              </div>
              <div style={SOURCE_CARD_STYLE}>
                <SourceCard citation={DEMO_SOURCE_SEMANTIC} index={2} />
              </div>
              <div style={SOURCE_CARD_STYLE}>
                <SourceCard citation={DEMO_SOURCE_DUAL} index={3} />
              </div>
            </div>
          </Showcase>

          {/* CitationRef — Design System */}
          <SubHeader id="citationref" label="CitationRef" refs={sectionRefs} />
          <Showcase label="Card citations (blue) — references Anki cards">
            <div style={{ fontSize: 'var(--ds-text-lg)', color: 'var(--ds-text-secondary)', lineHeight: 1.8 }}>
              Die <strong style={{ color: 'var(--ds-text-primary)' }}>Atmungskette</strong> findet in der inneren
              Mitochondrienmembran statt{' '}
              <CitationRef index={1} variant="card" onClick={() => {}} title="Karte: Atmungskette Lokalisation" />{' '}
              <CitationRef index={2} variant="card" onClick={() => {}} title="Karte: Komplex I-IV Übersicht" />.
              Dabei werden Elektronen über Enzymkomplexe{' '}
              <CitationRef index={3} variant="card" onClick={() => {}} title="Karte: Elektronentransportkette" />{' '}
              auf Sauerstoff übertragen.
            </div>
          </Showcase>
          <VariantLabel>Web citations (green) — references external sources</VariantLabel>
          <Showcase>
            <div style={{ fontSize: 'var(--ds-text-lg)', color: 'var(--ds-text-secondary)', lineHeight: 1.8 }}>
              Laut aktueller Forschung spielt die ATP-Synthase eine zentrale Rolle{' '}
              <CitationRef index={1} variant="web" onClick={() => {}} title="https://pubmed.ncbi.nlm.nih.gov/..." />{' '}
              <CitationRef index={2} variant="web" onClick={() => {}} title="https://nature.com/articles/..." />.
              Die rotatorische Katalyse wurde erstmals 1997 nachgewiesen{' '}
              <CitationRef index={3} variant="web" onClick={() => {}} title="Nobel Prize 1997" />.
            </div>
          </Showcase>
          <VariantLabel>Size variants</VariantLabel>
          <Showcase>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--ds-text-muted)' }}>sm (inline):</span>
              <CitationRef index={1} variant="card" size="sm" />
              <CitationRef index={2} variant="web" size="sm" />
              <span style={{ fontSize: 11, color: 'var(--ds-text-muted)', marginLeft: 12 }}>md (standalone):</span>
              <CitationRef index={1} variant="card" size="md" />
              <CitationRef index={2} variant="web" size="md" />
            </div>
          </Showcase>

          {/* CitationBadge (legacy) */}
          <SubHeader id="citationbadge" label="Citation Badge (legacy)" refs={sectionRefs} />
          <Showcase label="Inline citation pills">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-xs)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--ds-text-lg)', color: 'var(--ds-text-primary)' }}>
                Der Tractus iliotibialis
              </span>
              <CitationBadge cardId={42} citation={DEMO_CITATION} index={1} />
              <span style={{ fontSize: 'var(--ds-text-lg)', color: 'var(--ds-text-primary)' }}>
                stabilisiert das Kniegelenk
              </span>
              <CitationBadge cardId={43} citation={DEMO_SOURCE_SEMANTIC} index={2} />
              <CitationBadge cardId={44} citation={DEMO_SOURCE_KEYWORD} index={3} />
            </div>
          </Showcase>

          {/* AgenticCell */}
          <SubHeader id="agenticcell" label="Agentic Cell" refs={sectionRefs} />
          <Showcase label="Loading state">
            <AgenticCell agentName="tutor" isLoading={true} loadingHint="@Tutor analysiert die Karte..." />
          </Showcase>
          <VariantLabel>Loaded — with content</VariantLabel>
          <Showcase>
            <AgenticCell agentName="tutor" isLoading={false}>
              <div style={{ fontSize: 'var(--ds-text-base)', color: 'var(--ds-text-secondary)', lineHeight: 1.6 }}>
                Der <strong style={{ color: 'var(--ds-text-primary)' }}>M. quadriceps femoris</strong> besteht aus
                vier Köpfen und wird vom N. femoralis (L2–L4) innerviert.
              </div>
            </AgenticCell>
          </Showcase>
          <VariantLabel>Research agent</VariantLabel>
          <Showcase>
            <AgenticCell agentName="research" isLoading={false}>
              <div style={{ fontSize: 'var(--ds-text-base)', color: 'var(--ds-text-secondary)', lineHeight: 1.6 }}>
                Aktuelle Studien bestätigen den klinischen Zusammenhang zwischen
                IT-Band-Syndrom und lateralem Knieschmerz bei Läufern.
              </div>
            </AgenticCell>
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
                display: 'flex', gap: isMobile ? 'var(--ds-space-xl)' : 'var(--ds-space-2xl)',
                marginBottom: 'var(--ds-space-2xl)',
                flexWrap: 'wrap', justifyContent: 'center',
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

          {/* ──────────── BLOCKS (Agent-renderable widgets) ──────────── */}
          <SectionHeader id="blocks" label="Blocks" refs={sectionRefs} />
          <div style={{
            fontSize: 'var(--ds-text-md)',
            color: 'var(--ds-text-tertiary)',
            lineHeight: 1.7,
            marginBottom: 'var(--ds-space-xl)',
          }}>
            Blocks sind die UI-Komponenten, die ein AI-Agent im Chat rendern kann.
            Jedes Tool im System gibt strukturierte Daten zurück — das Frontend
            rendert sie als den passenden Block.
          </div>

          {/* CardWidget */}
          <SubHeader id="block-card" label="CardWidget" refs={sectionRefs} />
          <Showcase label="Single Card (show_card)">
            <div style={{ maxWidth: 400 }}>
              <CardWidget
                cardId={12345}
                front="Was ist der Tractus iliotibialis?"
                back="Eine kräftige Sehnenplatte an der Außenseite des Oberschenkels, verläuft vom Beckenkamm bis zum lateralen Tibiakondyl."
                deckName="Anatomie"
                onCardClick={() => {}}
              />
            </div>
          </Showcase>

          {/* StatsWidget */}
          <SubHeader id="block-stats" label="StatsWidget" refs={sectionRefs} />
          <Showcase label="Streak">
            <div style={{ maxWidth: 400 }}>
              <StatsWidget modules={[
                { type: 'streak', current: 12, best: 12, is_record: true },
              ]} />
            </div>
          </Showcase>
          <VariantLabel>Heatmap</VariantLabel>
          <Showcase>
            <div style={{ maxWidth: 400 }}>
              <StatsWidget modules={[
                { type: 'heatmap', days: [0,1,0,2,3,1,0,0,1,2,3,4,2,1,0,1,2,3,2,1,0,0,1,3,4,3,2,1,2,3], period: 30 },
              ]} />
            </div>
          </Showcase>
          <VariantLabel>Deck Overview</VariantLabel>
          <Showcase>
            <div style={{ maxWidth: 400 }}>
              <StatsWidget modules={[
                { type: 'deck_overview', name: 'Anatomie', total: 487, new_count: 42, learning_count: 3, review_count: 127 },
              ]} />
            </div>
          </Showcase>
          <VariantLabel>Combined (all modules)</VariantLabel>
          <Showcase>
            <div style={{ maxWidth: 400 }}>
              <StatsWidget modules={[
                { type: 'streak', current: 5, best: 12, is_record: false },
                { type: 'heatmap', days: [0,1,0,2,3,1,0,0,1,2,3,4,2,1,0,1,2,3,2,1,0,0,1,3,4,3,2,1,2,3], period: 30 },
                { type: 'deck_overview', name: 'Anatomie', total: 487, new_count: 42, learning_count: 3, review_count: 127 },
              ]} />
            </div>
          </Showcase>

          {/* ImageWidget */}
          <SubHeader id="block-image" label="ImageWidget" refs={sectionRefs} />
          <Showcase label="Image Result (search_image / show_card_media)">
            <div style={{ maxWidth: 400 }}>
              <ImageWidget
                data={{
                  description: 'Molekülstruktur: ATP',
                  source: 'pubchem',
                  dataUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE2MCIgZmlsbD0iIzFjMWMxZSIvPjx0ZXh0IHg9IjE2MCIgeT0iODAiIGZpbGw9IiM4ODgiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj5BVFAgTW9sZWN1bGUgKFBsYWNlaG9sZGVyKTwvdGV4dD48L3N2Zz4=',
                }}
                toolName="search_image"
              />
            </div>
          </Showcase>

          {/* CompactWidget */}
          <SubHeader id="block-compact" label="CompactWidget" refs={sectionRefs} />
          <Showcase label="Insight Extraction Prompt (compact)">
            <CompactWidget
              reason="Wir haben Enzymhemmung ausführlich besprochen"
              onConfirm={() => {}}
              onDismiss={() => {}}
            />
          </Showcase>

          {/* ──────────── AGENTS ──────────── */}
          <SectionHeader id="agents" label="Agents" refs={sectionRefs} />

          {/* Pipeline */}
          <SubHeader id="agent-pipeline" label="Pipeline" refs={sectionRefs} />
          <Showcase label="Shared Pipeline Components">
            <div style={{ fontSize: 'var(--ds-text-md)', color: 'var(--ds-text-secondary)', lineHeight: 1.7, marginBottom: 'var(--ds-space-lg)' }}>
              Every agent runs the same pipeline: routing determines which agent handles the request,
              rag_search retrieves relevant context, generating produces the response. ThoughtStream
              visualizes the live pipeline state while the agent is working.
            </div>
            <ThoughtStream
              pipelineSteps={[
                { step: 'routing', status: 'done', data: { agent: 'Tutor' }, timestamp: Date.now() - 2000 },
                { step: 'rag_search', status: 'done', data: { mode: 'semantic', count: 4 }, timestamp: Date.now() - 1000 },
                { step: 'generating', status: 'active', data: {}, timestamp: Date.now() },
              ]}
              pipelineGeneration={1}
              agentColor="var(--ds-text-secondary)"
              isStreaming={true}
            />
          </Showcase>
          <VariantLabel>Agent Badges</VariantLabel>
          <Showcase>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ds-space-sm)' }}>
              {[
                { label: '@Tutor', token: '--ds-green' },
                { label: '@Research', token: '--ds-accent' },
                { label: '@Plusi', token: '--ds-purple' },
                { label: '@Help', token: '--ds-text-secondary' },
              ].map(b => (
                <span key={b.label} style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '3px var(--ds-space-sm)',
                  borderRadius: 'var(--ds-radius-sm)',
                  background: 'var(--ds-hover-tint)',
                  border: `1px solid var(${b.token})`,
                  fontSize: 'var(--ds-text-xs)', fontWeight: 600,
                  color: `var(${b.token})`,
                  fontFamily: 'var(--ds-font-mono)',
                }}>{b.label}</span>
              ))}
            </div>
          </Showcase>

          {/* Default Agent */}
          <SubHeader id="agent-default" label="Default Agent" refs={sectionRefs} />
          <Showcase label="Base template — all agents inherit this">
            <div style={{ fontSize: 'var(--ds-text-md)', color: 'var(--ds-text-secondary)', lineHeight: 1.7, marginBottom: 'var(--ds-space-lg)' }}>
              The default agent uses <code style={{ fontFamily: 'var(--ds-font-mono)', color: 'var(--ds-text-muted)', fontSize: 'var(--ds-text-xs)' }}>--ds-text-secondary</code> as its color.
              All specialized agents override this with their own accent.
            </div>
            <ThoughtStream
              pipelineSteps={[
                { step: 'routing', status: 'done', data: { agent: 'Default' }, timestamp: Date.now() - 1500 },
                { step: 'generating', status: 'done', data: {}, timestamp: Date.now() - 500 },
              ]}
              pipelineGeneration={1}
              agentColor="var(--ds-text-secondary)"
              isStreaming={false}
            />
            <div style={{ marginTop: 'var(--ds-space-md)' }}>
              <ChatMessage
                message="Der **Tractus iliotibialis** ist eine kr\u00E4ftige Sehnenplatte an der Au\u00DFenseite des Oberschenkels."
                from="bot"
                cardContext={null}
                steps={[]} citations={{}} pipelineSteps={[]}
                bridge={MOCK_BRIDGE} isLastMessage={true}
              />
            </div>
          </Showcase>

          {/* @Tutor */}
          <SubHeader id="agent-tutor" label="@Tutor" refs={sectionRefs} />
          <Showcase>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-md)', marginBottom: 'var(--ds-space-lg)' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--ds-radius-sm)',
                background: 'var(--ds-hover-tint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 'var(--ds-text-md)', fontWeight: 700, color: 'var(--ds-green)' }}>T</span>
              </div>
              <div>
                <div style={{ fontSize: 'var(--ds-text-md)', fontWeight: 600, color: 'var(--ds-green)' }}>@Tutor</div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)' }}>Learning assistant — <code style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-text-xs)' }}>--ds-green</code></div>
              </div>
            </div>
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
            <div style={{ marginTop: 'var(--ds-space-md)' }}>
              <ChatMessage
                message="Gute Frage! Der **M. quadriceps femoris** besteht aus vier K\u00F6pfen: rectus femoris, vastus medialis, vastus lateralis und vastus intermedius."
                from="bot"
                cardContext={null}
                steps={[]} citations={{}} pipelineSteps={[]}
                bridge={MOCK_BRIDGE} isLastMessage={true}
              />
            </div>
          </Showcase>

          {/* @Research */}
          <SubHeader id="agent-research" label="@Research" refs={sectionRefs} />
          <Showcase>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-md)', marginBottom: 'var(--ds-space-lg)' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--ds-radius-sm)',
                background: 'var(--ds-hover-tint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 'var(--ds-text-md)', fontWeight: 700, color: 'var(--ds-accent)' }}>R</span>
              </div>
              <div>
                <div style={{ fontSize: 'var(--ds-text-md)', fontWeight: 600, color: 'var(--ds-accent)' }}>@Research</div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)' }}>Deep search + citations — <code style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-text-xs)' }}>--ds-accent</code></div>
              </div>
            </div>
            <ThoughtStream
              pipelineSteps={[
                { step: 'routing', status: 'done', data: { agent: 'Research' }, timestamp: Date.now() - 3000 },
                { step: 'rag_search', status: 'done', data: { mode: 'hybrid', count: 12 }, timestamp: Date.now() - 2000 },
                { step: 'generating', status: 'done', data: {}, timestamp: Date.now() - 500 },
              ]}
              pipelineGeneration={1}
              agentColor="var(--ds-accent)"
              isStreaming={false}
            />
          </Showcase>

          {/* @Plusi */}
          <SubHeader id="agent-plusi" label="@Plusi" refs={sectionRefs} />
          <Showcase>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-md)', marginBottom: 'var(--ds-space-lg)' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--ds-radius-sm)',
                background: 'var(--ds-hover-tint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 'var(--ds-text-md)', fontWeight: 700, color: 'var(--ds-purple)' }}>P</span>
              </div>
              <div>
                <div style={{ fontSize: 'var(--ds-text-md)', fontWeight: 600, color: 'var(--ds-purple)' }}>@Plusi</div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)' }}>Companion personality — <code style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-text-xs)' }}>--ds-purple</code></div>
              </div>
            </div>
          </Showcase>

          {/* Plusi Interactive Mascot Widget */}
          <VariantLabel>Interactive Mascot</VariantLabel>
          <Showcase>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 'var(--ds-space-xl)', alignItems: 'flex-start' }}>
              {/* Live preview */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 'var(--ds-space-md)',
                minWidth: 120,
              }}>
                <MascotCharacter mood={plusiMood} size={plusiSize} />
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-muted)', textAlign: 'center' }}>
                  {plusiMood} · {plusiSize}px
                </div>
              </div>

              {/* Controls */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-lg)' }}>
                {/* Size slider */}
                <div>
                  <div style={{ fontSize: 'var(--ds-text-xs)', fontWeight: 600, color: 'var(--ds-text-muted)', marginBottom: 'var(--ds-space-sm)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Size: {plusiSize}px
                  </div>
                  <input
                    type="range"
                    min={32}
                    max={120}
                    value={plusiSize}
                    onChange={e => setPlusiSize(Number(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: 'var(--ds-purple)',
                      cursor: 'pointer',
                    }}
                  />
                </div>

                {/* Mood selector */}
                <div>
                  <div style={{ fontSize: 'var(--ds-text-xs)', fontWeight: 600, color: 'var(--ds-text-muted)', marginBottom: 'var(--ds-space-sm)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Mood
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ds-space-xs)' }}>
                    {[
                      'neutral', 'curious', 'thinking', 'annoyed', 'empathy',
                      'happy', 'excited', 'surprised', 'flustered', 'proud',
                      'worried', 'frustrated', 'jealous', 'sleepy', 'sleeping',
                      'reflecting', 'reading',
                    ].map(mood => (
                      <button
                        key={mood}
                        onClick={() => setPlusiMood(mood)}
                        style={{
                          padding: '3px var(--ds-space-sm)',
                          borderRadius: 'var(--ds-radius-sm)',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 'var(--ds-text-xs)',
                          fontFamily: 'var(--ds-font-sans)',
                          fontWeight: plusiMood === mood ? 600 : 400,
                          background: plusiMood === mood ? 'var(--ds-purple)' : 'var(--ds-hover-tint)',
                          color: plusiMood === mood ? 'white' : 'var(--ds-text-secondary)',
                          transition: 'all var(--ds-duration) var(--ds-ease)',
                        }}
                      >
                        {mood}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Showcase>

          {/* Brand Typography — moved from old Plusi section */}
          <VariantLabel>Brand</VariantLabel>
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

          {/* ── Plusi Bubble — 4 States with SVG Snake Border ── */}
          <VariantLabel>Chat Bubble — 4 Zustände</VariantLabel>
          <style>{`
            @keyframes plusi-snake { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -1; } }
            @keyframes plusi-snake-reverse { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 1; } }
            @keyframes plusi-cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
            .plusi-bubble-scroll { overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
            .plusi-bubble-scroll::-webkit-scrollbar { display: none; }
            .plusi-md { font-size: 12.5px; line-height: 1.65; font-family: 'SF Mono', 'SFMono-Regular', 'Menlo', monospace; color: var(--ds-text-primary); letter-spacing: -0.02em; }
            .plusi-md strong { color: var(--ds-accent); font-weight: 600; }
            .plusi-md em { color: var(--ds-text-secondary); font-style: normal; opacity: 0.7; }
            .plusi-md code { font-size: 11.5px; padding: 1px 5px; border-radius: 4px; background: var(--ds-hover-tint); color: var(--ds-accent); }
            .plusi-md p { margin: 0 0 8px 0; }
            .plusi-md p:last-child { margin-bottom: 0; }
            .plusi-md ul, .plusi-md ol { margin: 4px 0; padding-left: 16px; }
            .plusi-md li { margin: 2px 0; }
            .plusi-md li::marker { color: var(--ds-text-muted); }
            .plusi-md a { color: var(--ds-accent); text-decoration: none; border-bottom: 1px solid var(--ds-accent-20); }
            .plusi-md blockquote { margin: 6px 0; padding: 4px 10px; border-left: 2px solid var(--ds-accent-30); color: var(--ds-text-secondary); font-style: italic; }
            .plusi-md hr { border: none; border-top: 1px solid var(--ds-border-subtle); margin: 8px 0; }
          `}</style>

          {/* State 1: Leer + Kein Fokus — WhatsApp tail RIGHT (user input) */}
          <Showcase>
            <div style={{ fontSize: 'var(--ds-text-xs)', fontWeight: 600, color: 'var(--ds-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--ds-space-md)' }}>Leer — kein Fokus (Tail rechts)</div>
            <div style={{ position: 'relative', width: '100%', minHeight: 140, background: 'var(--ds-bg-deep)', borderRadius: 'var(--ds-radius-lg)', padding: 'var(--ds-space-xl)', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ flexShrink: 0, marginRight: 12, zIndex: 2, marginBottom: 6 }}><MascotCharacter mood="neutral" size={48} /></div>
              <div style={{ position: 'relative' }}>
                <svg width={308} height={48} style={{ display: 'block' }}>
                  <path d="M 8 0 H 292 A 8 8 0 0 1 300 8 V 38 C 300 44 304 46 308 48 C 304 48 294 46 288 46 H 8 A 8 8 0 0 1 0 38 V 8 A 8 8 0 0 1 8 0 Z" fill="var(--ds-bg-frosted)" />
                  <path d="M 8 0 H 292 A 8 8 0 0 1 300 8 V 38 C 300 44 304 46 308 48 C 304 48 294 46 288 46 H 8 A 8 8 0 0 1 0 38 V 8 A 8 8 0 0 1 8 0 Z" fill="none" stroke="var(--ds-border-subtle)" strokeWidth="1" />
                </svg>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 8, bottom: 2, display: 'flex', alignItems: 'center', padding: '0 14px' }}>
                  <span className="plusi-md" style={{ color: 'var(--ds-text-muted)' }}>Schreib Plusi...</span>
                </div>
              </div>
            </div>
          </Showcase>

          {/* State 2: Leer + Fokus — WhatsApp tail RIGHT, dual snakes */}
          <Showcase>
            <div style={{ fontSize: 'var(--ds-text-xs)', fontWeight: 600, color: 'var(--ds-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--ds-space-md)' }}>Leer — Fokus (Dual Snake, Tail rechts)</div>
            <div style={{ position: 'relative', width: '100%', minHeight: 140, background: 'var(--ds-bg-deep)', borderRadius: 'var(--ds-radius-lg)', padding: 'var(--ds-space-xl)', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ flexShrink: 0, marginRight: 12, zIndex: 2, marginBottom: 6 }}><MascotCharacter mood="curious" size={48} /></div>
              <div style={{ position: 'relative' }}>
                <svg width={308} height={48} style={{ display: 'block' }}>
                  <path d="M 8 0 H 292 A 8 8 0 0 1 300 8 V 38 C 300 44 304 46 308 48 C 304 48 294 46 288 46 H 8 A 8 8 0 0 1 0 38 V 8 A 8 8 0 0 1 8 0 Z" fill="var(--ds-bg-frosted)" />
                  <path d="M 8 0 H 292 A 8 8 0 0 1 300 8 V 38 C 300 44 304 46 308 48 C 304 48 294 46 288 46 H 8 A 8 8 0 0 1 0 38 V 8 A 8 8 0 0 1 8 0 Z" fill="none" stroke="var(--ds-border-subtle)" strokeWidth="1" />
                  {/* Snake 1 — clockwise */}
                  <path d="M 8 0 H 292 A 8 8 0 0 1 300 8 V 38 C 300 44 304 46 308 48 C 304 48 294 46 288 46 H 8 A 8 8 0 0 1 0 38 V 8 A 8 8 0 0 1 8 0 Z" fill="none" stroke="var(--ds-accent)" strokeWidth="1" pathLength="1" strokeDasharray="0.08 0.92" strokeLinecap="round" opacity="0.45" style={{ animation: 'plusi-snake 4s linear infinite' }} />
                  {/* Snake 2 — counter-clockwise (opposite side) */}
                  <path d="M 8 0 H 292 A 8 8 0 0 1 300 8 V 38 C 300 44 304 46 308 48 C 304 48 294 46 288 46 H 8 A 8 8 0 0 1 0 38 V 8 A 8 8 0 0 1 8 0 Z" fill="none" stroke="var(--ds-accent)" strokeWidth="1" pathLength="1" strokeDasharray="0.08 0.92" strokeDashoffset="0.5" strokeLinecap="round" opacity="0.45" style={{ animation: 'plusi-snake 4s linear infinite' }} />
                </svg>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 8, bottom: 2, display: 'flex', alignItems: 'center', padding: '0 14px' }}>
                  <span className="plusi-md" style={{ color: 'var(--ds-text-placeholder)', animation: 'plusi-cursor-blink 1s step-end infinite' }}>|</span>
                </div>
              </div>
            </div>
          </Showcase>

          {/* State 3: Antwort — Tail links auf Mundhöhe (Plusi spricht), keine Snake */}
          <Showcase>
            <div style={{ fontSize: 'var(--ds-text-xs)', fontWeight: 600, color: 'var(--ds-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--ds-space-md)' }}>Antwort — Tail links (Plusi spricht)</div>
            <div style={{ position: 'relative', width: '100%', minHeight: 220, background: 'var(--ds-bg-deep)', borderRadius: 'var(--ds-radius-lg)', padding: 'var(--ds-space-xl)', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ flexShrink: 0, marginRight: 12, zIndex: 2, marginBottom: 6 }}><MascotCharacter mood={plusiMood} size={48} /></div>
              <div style={{ position: 'relative' }}>
                {/* Tail emerges from left side at y≈127 — aligned with Plusi's mouth (~25px from bottom) */}
                <svg width={312} height={152} style={{ display: 'block' }}>
                  <path d="M 20 0 H 304 A 8 8 0 0 1 312 8 V 142 A 8 8 0 0 1 304 150 H 20 A 8 8 0 0 1 12 142 V 135 C 12 132 6 129 2 127 C 6 125 12 122 12 119 V 8 A 8 8 0 0 1 20 0 Z" fill="var(--ds-bg-frosted)" />
                  <path d="M 20 0 H 304 A 8 8 0 0 1 312 8 V 142 A 8 8 0 0 1 304 150 H 20 A 8 8 0 0 1 12 142 V 135 C 12 132 6 129 2 127 C 6 125 12 122 12 119 V 8 A 8 8 0 0 1 20 0 Z" fill="none" stroke="var(--ds-border-subtle)" strokeWidth="1" />
                </svg>
                <div className="plusi-bubble-scroll" style={{ position: 'absolute', top: 0, left: 16, right: 0, bottom: 8, maxHeight: 150, padding: '12px 14px' }}>
                  <div className="plusi-md">
                    <p>Talgdrüsen produzieren Talg durch <strong>holokrine Sekretion</strong>. Bei dieser Art zerfällt die gesamte Drüsenzelle — ziemlich brutal eigentlich.</p>
                    <p>Die Endstücke bestehen aus <strong>ballenförmigen Epithelzellen</strong> mit Lipidtröpfchen. Basalzellen am Drüsenboden sorgen für den <code>Zellnachschub</code>.</p>
                    <p><em>Aber hey — dafür hast du geschmeidige Haut.</em></p>
                  </div>
                </div>
              </div>
            </div>
          </Showcase>

          {/* ── Plusi Markdown Showcase ── */}
          <VariantLabel>Plusi Markdown — Compact Format</VariantLabel>
          <Showcase>
            <div style={{ fontSize: 'var(--ds-text-xs)', fontWeight: 600, color: 'var(--ds-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--ds-space-md)' }}>Alle Elemente</div>
            <div style={{ maxWidth: 320, padding: '14px 16px', background: 'var(--ds-bg-frosted)', borderRadius: 8, border: '1px solid var(--ds-border-subtle)' }}>
              <div className="plusi-md">
                <p>Normaler Text in <strong>SF Mono</strong>. Keywords leuchten in <strong>Accent-Blau</strong>.</p>
                <p>Inline <code>code</code> für Fachbegriffe. <em>Kursiv für Nebenbemerkungen.</em></p>
                <blockquote>Blockquote — Plusi zitiert sich selbst</blockquote>
                <ul>
                  <li>Listen sind kompakt</li>
                  <li>Kein Abstand verschwendet</li>
                </ul>
                <hr />
                <p>Trenner für Gedankensprünge. <a href="#">Links</a> in Accent.</p>
              </div>
            </div>
            <div style={{ marginTop: 'var(--ds-space-lg)', fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--ds-text-secondary)' }}>Nicht unterstützt:</strong> Tabellen, H1-H6, Code-Blöcke, Bilder.
              Plusi redet in kompakten Absätzen — keine Strukturdokumente.
            </div>
          </Showcase>

          {/* @Help */}
          <SubHeader id="agent-help" label="@Help" refs={sectionRefs} />
          <Showcase>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-md)', marginBottom: 'var(--ds-space-md)' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--ds-radius-sm)',
                background: 'var(--ds-hover-tint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 'var(--ds-text-md)', fontWeight: 700, color: 'var(--ds-text-secondary)' }}>H</span>
              </div>
              <div>
                <div style={{ fontSize: 'var(--ds-text-md)', fontWeight: 600, color: 'var(--ds-text-secondary)' }}>@Help</div>
                <div style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)' }}>Meta / system help — <code style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-text-xs)' }}>--ds-text-secondary</code></div>
              </div>
            </div>
            <div style={{ fontSize: 'var(--ds-text-md)', color: 'var(--ds-text-secondary)', lineHeight: 1.7 }}>
              Answers questions about the app itself: shortcuts, features, how to use agents.
              Uses the neutral secondary color — no strong personality, just utility.
            </div>
          </Showcase>

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* ThinkingIndicator — Unified Reasoning Display Prototype     */}
          {/* ═══════════════════════════════════════════════════════════ */}

          <SubHeader id="thinking-indicator" label="Thinking Indicator (Bar)" refs={sectionRefs} />

          {/* --- Bar-style ThinkingIndicator using real component --- */}

          <VariantLabel>Tutor — Kontextanalyse (loading + skeleton)</VariantLabel>
          <Showcase>
            <div style={{ maxWidth: 560 }}>
              <ThinkingIndicator
                phases={[{ name: 'Kontextanalyse', status: 'active', color: 'var(--ds-accent)' }]}
                agentLabel="Tutor"
                showSkeleton
              />
            </div>
          </Showcase>

          <VariantLabel>Tutor — Wissensabgleich (active, Kontextanalyse done)</VariantLabel>
          <Showcase>
            <div style={{ maxWidth: 560 }}>
              <ThinkingIndicator
                phases={[
                  { name: 'Kontextanalyse', status: 'done', data: '23 Begriffe' },
                  { name: 'Wissensabgleich', status: 'active', color: 'var(--ds-accent)' },
                ]}
                agentLabel="Tutor"
                showSkeleton
              />
            </div>
          </Showcase>

          <VariantLabel>Tutor — Synthese (active, RAG done)</VariantLabel>
          <Showcase>
            <div style={{ maxWidth: 560 }}>
              <ThinkingIndicator
                phases={[
                  { name: 'Kontextanalyse', status: 'done', data: '23 Begriffe' },
                  { name: 'Wissensabgleich', status: 'done', data: '14 Karten' },
                  { name: 'Synthese', status: 'active', color: 'var(--ds-accent)' },
                ]}
                agentLabel="Tutor"
                showSkeleton
              />
            </div>
          </Showcase>

          <VariantLabel>Tutor — fertig (doneLabel: "6 Quellen")</VariantLabel>
          <Showcase>
            <div style={{ maxWidth: 560 }}>
              <ThinkingIndicator
                phases={[
                  { name: 'Kontextanalyse', status: 'done', data: '23 Begriffe' },
                  { name: 'Wissensabgleich', status: 'done', data: '14 Karten' },
                  { name: 'Synthese', status: 'done' },
                ]}
                agentLabel="Tutor"
                doneLabel="6 Quellen"
              />
              <div style={{ marginTop: 14, fontSize: 15, color: 'var(--ds-text-primary)', lineHeight: 1.65 }}>
                Die Zellschichten der Haut bestehen aus drei Hauptschichten:
                <strong> Epidermis</strong>, <strong>Dermis</strong> und <strong>Subkutis</strong>...
              </div>
            </div>
          </Showcase>

          <VariantLabel>Tutor — mit Web-Recherche</VariantLabel>
          <Showcase>
            <div style={{ maxWidth: 560 }}>
              <ThinkingIndicator
                phases={[
                  { name: 'Kontextanalyse', status: 'done', data: '12 Begriffe' },
                  { name: 'Wissensabgleich', status: 'done', data: '3 Karten' },
                  { name: 'Web-Recherche', status: 'done', data: '4 Quellen' },
                  { name: 'Synthese', status: 'active', color: 'var(--ds-accent)' },
                ]}
                agentLabel="Tutor"
                showSkeleton
              />
            </div>
          </Showcase>

          <VariantLabel>Research — Stapel</VariantLabel>
          <Showcase>
            <div style={{ maxWidth: 560 }}>
              <ThinkingIndicator
                phases={[
                  { name: 'Kontextanalyse', status: 'done', data: '38 Begriffe' },
                  { name: 'Wissensabgleich', status: 'done', data: '42 Karten' },
                  { name: 'Strukturanalyse', status: 'active', data: '5 Cluster', color: '#00D084' },
                ]}
                agentLabel="Research"
                showSkeleton
              />
            </div>
          </Showcase>

          <VariantLabel>Prüfer — Evaluation</VariantLabel>
          <Showcase>
            <div style={{ maxWidth: 560 }}>
              <ThinkingIndicator
                phases={[
                  { name: 'Kontextanalyse', status: 'done', data: '11 Begriffe' },
                  { name: 'Wissensabgleich', status: 'done', data: '8 Karten' },
                  { name: 'Evaluation', status: 'active', color: '#AF52DE' },
                ]}
                agentLabel="Prüfer"
              />
            </div>
          </Showcase>

          <VariantLabel>Plusi — Reflexion (kein RAG)</VariantLabel>
          <Showcase>
            <div style={{ maxWidth: 560 }}>
              <ThinkingIndicator
                phases={[{ name: 'Reflexion', status: 'active', color: 'var(--ds-accent)' }]}
                agentLabel="Plusi"
              />
            </div>
          </Showcase>

          {/* Compare all channels */}
          <VariantLabel>Vergleich — alle Kanäle</VariantLabel>
          <Showcase>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, maxWidth: 720 }}>
              <ThinkingIndicator phases={[{ name: 'Kontextanalyse', status: 'done', data: '23 Begriffe' }, { name: 'Wissensabgleich', status: 'done', data: '14 Karten' }, { name: 'Synthese', status: 'active', color: 'var(--ds-accent)' }]} agentLabel="Tutor" />
              <ThinkingIndicator phases={[{ name: 'Kontextanalyse', status: 'done', data: '38 Begriffe' }, { name: 'Wissensabgleich', status: 'done', data: '42 Karten' }, { name: 'Strukturanalyse', status: 'active', color: '#00D084' }]} agentLabel="Research" />
              <ThinkingIndicator phases={[{ name: 'Kontextanalyse', status: 'done', data: '11 Begriffe' }, { name: 'Evaluation', status: 'active', color: '#AF52DE' }]} agentLabel="Prüfer" />
              <ThinkingIndicator phases={[{ name: 'Reflexion', status: 'active', color: 'var(--ds-accent)' }]} agentLabel="Plusi" />
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
