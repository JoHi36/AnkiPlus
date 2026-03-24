import React, { useState } from 'react';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import StreamingChatMessage from './components/StreamingChatMessage';
import TopBar from './components/TopBar';
import DeckBrowserView from './components/DeckBrowserView';
import OverviewView from './components/OverviewView';
import DeckProgressBar from './components/DeckProgressBar';
import ThoughtStream from './components/ThoughtStream';
import MultipleChoiceCard from './components/MultipleChoiceCard';
import InsightBullet from './components/InsightBullet';
import TokenBar from './components/TokenBar';
import CardRefChip from './components/CardRefChip';
import ContextTags from './components/ContextTags';
import SectionDivider from './components/SectionDivider';
import ErrorBoundary from './components/ErrorBoundary';

/**
 * ComponentViewer — Design System Reference
 * Access via: npm run dev → localhost:3000?view=components
 *
 * Shows all components with their variants, props, and names.
 */

const MOCK_BRIDGE = {
  sendMessage: () => {},
  cancelRequest: () => {},
  goToCard: () => {},
  openPreview: () => {},
};

const MOCK_DECK_DATA = {
  roots: [
    { id: 1, name: 'Anatomie', display: 'Anatomie', dueNew: 42, dueLearn: 3, dueReview: 127, mature: 800, young: 200, new: 42, total: 1042, children: [] },
    { id: 2, name: 'Physiologie', display: 'Physiologie', dueNew: 18, dueLearn: 1, dueReview: 85, mature: 500, young: 150, new: 18, total: 668, children: [] },
    { id: 3, name: 'Biochemie', display: 'Biochemie', dueNew: 5, dueLearn: 0, dueReview: 33, mature: 300, young: 80, new: 5, total: 385, children: [] },
  ],
  totalNew: 65, totalLearn: 4, totalReview: 245, totalDue: 314, isPremium: true,
};

function Section({ title, description, children }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--ds-text-primary)', marginBottom: 4 }}>
        {title}
      </h2>
      {description && (
        <p style={{ fontSize: 13, color: 'var(--ds-text-muted)', marginBottom: 16 }}>{description}</p>
      )}
      <div style={{
        padding: 24, borderRadius: 16,
        border: '1px solid var(--ds-border-subtle)',
        background: 'var(--ds-bg-canvas)',
      }}>
        {children}
      </div>
    </div>
  );
}

function Variant({ name, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
        color: 'var(--ds-text-muted)', marginBottom: 8,
      }}>
        {name}
      </div>
      {children}
    </div>
  );
}

function ColorSwatch({ name, variable }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 8,
        background: `var(${variable})`,
        border: '1px solid var(--ds-border-subtle)',
      }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-primary)' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--ds-text-muted)', fontFamily: 'monospace' }}>{variable}</div>
      </div>
    </div>
  );
}

export default function ComponentViewer() {
  const [activeSection, setActiveSection] = useState('all');

  const sections = [
    { id: 'all', label: 'All' },
    { id: 'tokens', label: 'Tokens' },
    { id: 'input', label: 'Input' },
    { id: 'chat', label: 'Chat' },
    { id: 'navigation', label: 'Navigation' },
    { id: 'cards', label: 'Cards' },
    { id: 'data', label: 'Data Display' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--ds-bg-deep)',
      color: 'var(--ds-text-primary)',
      fontFamily: 'var(--ds-font-sans)',
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        padding: '16px 32px',
        background: 'var(--ds-bg-deep)',
        borderBottom: '1px solid var(--ds-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 24,
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ds-accent)', margin: 0 }}>
          AnKI+ Design System
        </h1>
        <div style={{ display: 'flex', gap: 4 }}>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
                background: activeSection === s.id ? 'var(--ds-accent)' : 'transparent',
                color: activeSection === s.id ? '#fff' : 'var(--ds-text-secondary)',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── DESIGN TOKENS ── */}
        {(activeSection === 'all' || activeSection === 'tokens') && (
          <>
            <Section title="Color Tokens" description="Alle Farben kommen aus CSS Custom Properties. Niemals Hex-Werte hardcoden.">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-text-secondary)', marginBottom: 12 }}>Backgrounds</h3>
                  <ColorSwatch name="Deep" variable="--ds-bg-deep" />
                  <ColorSwatch name="Canvas" variable="--ds-bg-canvas" />
                  <ColorSwatch name="Frosted" variable="--ds-bg-frosted" />
                  <ColorSwatch name="Overlay" variable="--ds-bg-overlay" />
                </div>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-text-secondary)', marginBottom: 12 }}>Semantic</h3>
                  <ColorSwatch name="Accent" variable="--ds-accent" />
                  <ColorSwatch name="Green" variable="--ds-green" />
                  <ColorSwatch name="Yellow" variable="--ds-yellow" />
                  <ColorSwatch name="Red" variable="--ds-red" />
                  <ColorSwatch name="Purple" variable="--ds-purple" />
                </div>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-text-secondary)', marginBottom: 12 }}>Text</h3>
                  <ColorSwatch name="Primary" variable="--ds-text-primary" />
                  <ColorSwatch name="Secondary" variable="--ds-text-secondary" />
                  <ColorSwatch name="Muted" variable="--ds-text-muted" />
                  <ColorSwatch name="Accent" variable="--ds-text-accent" />
                </div>
              </div>
            </Section>

            <Section title="Materials" description="Frosted Glass = Aktionselemente (Input, Buttons). Borderless = Content (Karten, Listen).">
              <div style={{ display: 'flex', gap: 24 }}>
                <div className="ds-frosted" style={{ flex: 1, padding: 24, borderRadius: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Frosted Glass</div>
                  <div style={{ fontSize: 11, color: 'var(--ds-text-muted)' }}>.ds-frosted</div>
                </div>
                <div className="ds-borderless" style={{ flex: 1, padding: 24, borderRadius: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Borderless</div>
                  <div style={{ fontSize: 11, color: 'var(--ds-text-muted)' }}>.ds-borderless</div>
                </div>
              </div>
            </Section>
          </>
        )}

        {/* ── INPUT COMPONENTS ── */}
        {(activeSection === 'all' || activeSection === 'input') && (
          <>
            <Section title="ChatInput" description="Das zentrale Input-Element. Wird für Chat, Reviewer, FreeChat wiederverwendet. Verschiedene Action-Buttons konfigurierbar.">
              <Variant name="Session Chat (Default)">
                <ChatInput
                  onSend={() => {}}
                  isLoading={false}
                  onStop={() => {}}
                  cardContext={null}
                  isPremium={true}
                  actionPrimary={{ label: 'Weiter', shortcut: 'SPACE', onClick: () => {} }}
                  actionSecondary={{ label: 'Agent Studio', shortcut: '↵', onClick: () => {} }}
                />
              </Variant>
              <Variant name="Reviewer — Question State">
                <ChatInput
                  onSend={() => {}}
                  isLoading={false}
                  onStop={() => {}}
                  cardContext={null}
                  isPremium={true}
                  placeholder="Antwort eingeben..."
                  actionPrimary={{ label: 'Show Answer', shortcut: 'SPACE', onClick: () => {} }}
                  actionSecondary={{ label: 'Multiple Choice', shortcut: '↵', onClick: () => {} }}
                />
              </Variant>
              <Variant name="Reviewer — Answer State">
                <ChatInput
                  onSend={() => {}}
                  isLoading={false}
                  onStop={() => {}}
                  cardContext={null}
                  isPremium={true}
                  actionPrimary={{ label: 'Weiter', shortcut: 'SPACE', onClick: () => {} }}
                  actionSecondary={{ label: 'Nachfragen', shortcut: '↵', onClick: () => {} }}
                />
              </Variant>
              <Variant name="Loading State">
                <ChatInput
                  onSend={() => {}}
                  isLoading={true}
                  onStop={() => {}}
                  cardContext={null}
                  isPremium={true}
                />
              </Variant>
              <Variant name="FreeChat (Close Action)">
                <ChatInput
                  onSend={() => {}}
                  isLoading={false}
                  onStop={() => {}}
                  cardContext={null}
                  isPremium={true}
                  onClose={() => {}}
                  actionPrimary={{ label: 'Schließen', shortcut: '⌴', onClick: () => {} }}
                  actionSecondary={{ label: 'Senden', shortcut: '↵', onClick: () => {} }}
                />
              </Variant>
            </Section>
          </>
        )}

        {/* ── CHAT COMPONENTS ── */}
        {(activeSection === 'all' || activeSection === 'chat') && (
          <>
            <Section title="ChatMessage" description="Nachrichten-Bubble für User und Bot.">
              <Variant name="User Message">
                <ChatMessage
                  message="Was ist der Tractus iliotibialis?"
                  from="user"
                  cardContext={null}
                  steps={[]} citations={{}} pipelineSteps={[]}
                  bridge={MOCK_BRIDGE} isLastMessage={false}
                />
              </Variant>
              <Variant name="Bot Message">
                <ChatMessage
                  message="Der **Tractus iliotibialis** ist eine kräftige Sehnenplatte an der Außenseite des Oberschenkels. Er verläuft vom Beckenkamm bis zum lateralen Tibiakondyl."
                  from="bot"
                  cardContext={null}
                  steps={[]} citations={{}} pipelineSteps={[]}
                  bridge={MOCK_BRIDGE} isLastMessage={true}
                />
              </Variant>
              <Variant name="Streaming Message">
                <StreamingChatMessage
                  message="Der Tractus iliotibialis ist eine kräftige..."
                  isStreaming={true}
                  cardContext={null}
                  steps={[]} citations={{}} pipelineSteps={[]}
                  bridge={MOCK_BRIDGE}
                />
              </Variant>
            </Section>

            <Section title="ThoughtStream" description="Pipeline-Schritte während AI-Verarbeitung.">
              <Variant name="Active">
                <ThoughtStream steps={[
                  { label: 'Routing Agent', status: 'done' },
                  { label: 'Agent Tutor', status: 'done' },
                  { label: 'Modus Direkt', status: 'active' },
                ]} />
              </Variant>
            </Section>
          </>
        )}

        {/* ── NAVIGATION COMPONENTS ── */}
        {(activeSection === 'all' || activeSection === 'navigation') && (
          <>
            <Section title="TopBar" description="Globale Navigation — Stapel / Session / Statistik.">
              <Variant name="DeckBrowser State">
                <TopBar
                  activeView="deckBrowser" ankiState="deckBrowser"
                  messageCount={0} totalDue={314}
                  deckName="" dueNew={65} dueLearning={4} dueReview={245}
                  onTabClick={() => {}} onSidebarToggle={() => {}}
                />
              </Variant>
              <Variant name="Review State">
                <TopBar
                  activeView="review" ankiState="review"
                  messageCount={5} totalDue={314}
                  deckName="Anatomie" dueNew={42} dueLearning={3} dueReview={127}
                  onTabClick={() => {}} onSidebarToggle={() => {}}
                />
              </Variant>
            </Section>

            <Section title="SectionDivider" description="Trenner zwischen Chat-Sektionen mit Karten-Info.">
              <SectionDivider
                title="Tractus iliotibialis"
                cardId={123}
                bridge={MOCK_BRIDGE}
              />
            </Section>
          </>
        )}

        {/* ── CARD COMPONENTS ── */}
        {(activeSection === 'all' || activeSection === 'cards') && (
          <>
            <Section title="DeckProgressBar" description="Fortschrittsbalken für Deck-Karten.">
              <Variant name="Mixed Progress">
                <DeckProgressBar mature={800} young={200} newCount={42} total={1042} />
              </Variant>
              <Variant name="All New">
                <DeckProgressBar mature={0} young={0} newCount={100} total={100} />
              </Variant>
              <Variant name="All Mature">
                <DeckProgressBar mature={500} young={0} newCount={0} total={500} />
              </Variant>
            </Section>

            <Section title="CardRefChip" description="Inline-Referenz zu einer Karte.">
              <CardRefChip cardId={123} front="Tractus iliotibialis" bridge={MOCK_BRIDGE} />
            </Section>

            <Section title="ContextTags" description="Tags unter User-Nachrichten.">
              <ContextTags deckName="Anatomie" cardFront="Tractus iliotibialis" cardId={123} bridge={MOCK_BRIDGE} />
            </Section>
          </>
        )}

        {/* ── DATA DISPLAY ── */}
        {(activeSection === 'all' || activeSection === 'data') && (
          <>
            <Section title="DeckBrowserView" description="Deck-Übersicht mit allen Decks.">
              <div style={{ height: 400, overflow: 'auto' }}>
                <DeckBrowserView data={MOCK_DECK_DATA} isPremium={true} />
              </div>
            </Section>

            <Section title="OverviewView" description="Einzelnes Deck — Due Counts + Lernen-Button.">
              <OverviewView
                data={{ deckId: 1, deckName: 'Anatomie', dueNew: 42, dueLearning: 3, dueReview: 127 }}
                onStudy={() => {}} onBack={() => {}} onOptions={() => {}}
              />
            </Section>

            <Section title="InsightBullet" description="Einzelner Lernpunkt aus der Insights-Analyse.">
              <InsightBullet
                text="Der Tractus iliotibialis stabilisiert das Knie bei Extension."
                type="key_concept"
              />
            </Section>
          </>
        )}

        {/* ── COMPONENT INDEX ── */}
        <Section title="Component Index" description="Alle 70 Komponenten mit Dateiname.">
          <div style={{ columns: 3, gap: 16, fontSize: 12, fontFamily: 'monospace', color: 'var(--ds-text-secondary)' }}>
            {[
              'AccountBadge', 'AgentCard', 'AgentStudio', 'AgentWidgetSlot', 'AgenticCell',
              'AutonomyCard', 'CardContext', 'CardListWidget', 'CardPreviewModal', 'CardRefChip',
              'CardWidget', 'ChatInput', 'ChatMessage', 'CitationBadge', 'CompactWidget',
              'ContextSurface', 'ContextTags', 'DeckBrowser', 'DeckBrowserView', 'DeckNode',
              'DeckProgressBar', 'DeckSearchBar', 'DeckSectionDivider', 'DiaryStream', 'ErrorBoundary',
              'FreeChatSearchBar', 'Header', 'ImageWidget', 'InsightBullet', 'InsightsDashboard',
              'LoadingIndicator', 'MascotCharacter', 'MascotShell', 'MiniChart', 'MultipleChoiceCard',
              'OverviewView', 'PaywallModal', 'PersonalityGrid', 'PlusiDock', 'PlusiMenu',
              'PlusiWidget', 'QuotaLimitDialog', 'ResearchContent', 'ResearchMenu', 'ResearchSourceBadge',
              'ReviewFeedback', 'ReviewResult', 'ReviewTrailIndicator', 'SectionDivider', 'SectionDropdown',
              'SectionNavigation', 'SessionOverview', 'SettingsButton', 'SettingsSidebar', 'SourceCard',
              'SourcesCarousel', 'StandardSubMenu', 'StatsWidget', 'StreamingChatMessage',
              'SystemIntelligenceBox', 'ThoughtStream', 'TokenBar', 'TokenBudgetSlider',
              'ToolErrorBadge', 'ToolLoadingPlaceholder', 'ToolTogglePopup', 'ToolWidgetRenderer',
              'TopBar', 'WebCitationBadge',
            ].map(name => (
              <div key={name} style={{ padding: '2px 0' }}>{name}.jsx</div>
            ))}
          </div>
        </Section>

      </div>
    </div>
  );
}
