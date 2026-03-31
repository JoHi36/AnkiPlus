import React from 'react';
import ProgressBar from './ProgressBar';
import RatingButtons from './RatingButtons';
import CardHTML from './CardHTML';

const CONTAINER_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
};

const DIVIDER_STYLE = {
  height: 1,
  background: 'var(--ds-border)',
  margin: '0 var(--ds-space-lg)',
};

const AnswerScreen = ({ card, progress, mode, onRate }) => (
  <div style={CONTAINER_STYLE}>
    <ProgressBar deck={card.deck} current={progress.current} total={progress.total} />

    {mode === 'solo' && (
      <>
        <CardHTML html={card.frontHtml} />
        <div style={DIVIDER_STYLE} />
        <CardHTML html={card.backHtml} />
      </>
    )}

    <div style={{ marginTop: 'auto' }}>
      <RatingButtons onRate={onRate} />
    </div>
  </div>
);

export default React.memo(AnswerScreen);
