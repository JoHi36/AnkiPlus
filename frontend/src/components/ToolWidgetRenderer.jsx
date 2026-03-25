import React from 'react';
import PlusiContent, { PlusiMoodMeta } from './PlusiWidget';
import CardWidget from './CardWidget';
import CardListWidget from './CardListWidget';
import StatsWidget from './StatsWidget';
import ToolLoadingPlaceholder from './ToolLoadingPlaceholder';
import ImageWidget from './ImageWidget';
import ToolErrorBadge from './ToolErrorBadge';
import AgenticCell from './AgenticCell';
import ResearchContent from './ResearchContent';
import CompactWidget from './CompactWidget';
import ResearchSourceBadge from './ResearchSourceBadge';

export default function ToolWidgetRenderer({ toolWidgets, bridge, isStreaming, isLastMessage }) {
  if (!toolWidgets || toolWidgets.length === 0) return null;

  const handleCardClick = (cardId) => {
    if (bridge && bridge.openPreview) {
      bridge.openPreview(String(cardId));
    }
  };

  return (
    <>
      {toolWidgets.map((tw, i) => {
        // Agents using AgenticCell shell
        if (tw.name === 'search_web') {
          if (tw.displayType === 'loading') {
            return <AgenticCell key={`loading-${i}`} agentName="research" isLoading loadingHint={tw.loadingHint} />;
          }
          const toolUsed = tw.result?.tool_used || 'perplexity';
          return (
            <AgenticCell key={`widget-${i}`} agentName="research" headerMeta={<ResearchSourceBadge toolUsed={toolUsed} />}>
              <ResearchContent
                sources={tw.result?.sources}
                answer={tw.result?.answer}
                error={tw.result?.error}
              />
            </AgenticCell>
          );
        }
        if (tw.name === 'spawn_plusi' && tw.displayType === 'loading') {
          return <AgenticCell key={`loading-${i}`} agentName="plusi" isLoading />;
        }
        if (tw.name === 'agent_handoff' && tw.displayType === 'loading') {
          return <AgenticCell key={`loading-${i}`} agentName="research" isLoading loadingHint={tw.loadingHint} />;
        }
        if (tw.displayType === 'loading') {
          return <ToolLoadingPlaceholder key={`loading-${i}`} toolName={tw.name} />;
        }
        if (tw.displayType === 'error') {
          return <ToolErrorBadge key={`error-${i}`} toolName={tw.name} error={tw.error} />;
        }
        if (tw.displayType === 'widget' && tw.result) {
          switch (tw.name) {
            case 'spawn_plusi': {
              const plusiMood = tw.result.mood || 'neutral';
              const plusiColor = (typeof window.getPlusiColor === 'function')
                ? window.getPlusiColor(plusiMood)
                : '#0a84ff';
              return (
                <AgenticCell
                  key={`plusi-${i}`}
                  agentName="plusi"
                  headerMeta={<PlusiMoodMeta mood={plusiMood} color={plusiColor} />}
                >
                  <PlusiContent
                    mood={plusiMood}
                    text={tw.result.text || ''}
                    friendship={tw.result.friendship || null}
                    isFrozen={!isStreaming && !isLastMessage}
                  />
                </AgenticCell>
              );
            }
            case 'show_card':
              return (
                <CardWidget
                  key={`card-${i}`}
                  cardId={tw.result.card_id}
                  front={tw.result.front}
                  back={tw.result.back}
                  deckName={tw.result.deck_name}
                  onCardClick={handleCardClick}
                />
              );
            case 'search_deck':
              return (
                <CardListWidget
                  key={`cards-${i}`}
                  query={tw.result.query}
                  cards={tw.result.cards}
                  totalFound={tw.result.total_found}
                  showing={tw.result.showing}
                  onCardClick={handleCardClick}
                />
              );
            case 'get_learning_stats':
              return <StatsWidget key={`stats-${i}`} modules={tw.result.modules} />;
            case 'show_card_media':
              return <ImageWidget key={`media-${i}`} data={tw.result} toolName="show_card_media" />;
            case 'search_image':
              return <ImageWidget key={`img-${i}`} data={tw.result} toolName="search_image" />;
            case 'agent_handoff': {
              const handoffAgent = tw.result.agent || 'research';
              return (
                <AgenticCell key={`handoff-${i}`} agentName={handoffAgent}>
                  <ResearchContent
                    sources={tw.result.sources || []}
                    answer={tw.result.text || ''}
                  />
                </AgenticCell>
              );
            }
            case 'compact':
              return (
                <CompactWidget
                  key={`compact-${i}`}
                  reason={tw.result?.reason}
                  onConfirm={() => {
                    window.dispatchEvent(new CustomEvent('compactConfirmed'));
                  }}
                  onDismiss={() => {}}
                />
              );
            default:
              return null;
          }
        }
        return null;
      })}
    </>
  );
}
