import React from 'react';
import PlusiWidget from './PlusiWidget';
import CardWidget from './CardWidget';
import CardListWidget from './CardListWidget';
import StatsWidget from './StatsWidget';
import ToolLoadingPlaceholder from './ToolLoadingPlaceholder';
import ImageWidget from './ImageWidget';
import ToolErrorBadge from './ToolErrorBadge';

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
                  friendship={tw.result.friendship || null}
                  isLoading={false}
                  isFrozen={!isStreaming && !isLastMessage}
                />
              );
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
            default:
              return null;
          }
        }
        return null;
      })}
    </>
  );
}
