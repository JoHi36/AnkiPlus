import React from 'react';
import PlusiWidget from './PlusiWidget';
import CardListWidget from './CardListWidget';
import StatsWidget from './StatsWidget';
import ToolLoadingPlaceholder from './ToolLoadingPlaceholder';
import ToolErrorBadge from './ToolErrorBadge';

export default function ToolWidgetRenderer({ toolWidgets, bridge, isStreaming, isLastMessage }) {
  if (!toolWidgets || toolWidgets.length === 0) return null;

  const handleCardClick = (cardId) => {
    if (bridge && bridge.goToCard) {
      bridge.goToCard(String(cardId));
    }
  };

  return (
    <>
      {toolWidgets.map((tw, i) => {
        if (tw.displayType === 'loading') {
          return <ToolLoadingPlaceholder key={`loading-${i}`} toolName={tw.name} />;
        }
        if (tw.displayType === 'error') {
          return <ToolErrorBadge key={`error-${i}`} toolName={tw.name} error={tw.error} />;
        }
        if (tw.displayType === 'widget' && tw.result) {
          switch (tw.name) {
            case 'spawn_plusi':
              return (
                <PlusiWidget
                  key={`plusi-${i}`}
                  mood={tw.result.mood || 'neutral'}
                  text={tw.result.text || ''}
                  metaText={tw.result.meta || ''}
                  isLoading={false}
                  isFrozen={!isStreaming && !isLastMessage}
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
            default:
              return null;
          }
        }
        return null;
      })}
    </>
  );
}
