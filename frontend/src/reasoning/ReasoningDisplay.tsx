import React from 'react';
import { reasoningLog } from './debugLog';
import { useReasoningStream } from './useReasoningStream';
import FullReasoningDisplay from './FullReasoningDisplay';
import CompactReasoningDisplay from './CompactReasoningDisplay';
import ReasoningDots from './ReasoningDots';
import type { ReasoningStep } from './types';

export interface ReasoningDisplayProps {
  streamId?: string;
  steps?: ReasoningStep[];
  mode?: 'full' | 'compact' | 'dots';
  hasOutput?: boolean;
  agentColor?: string;
  label?: string;
  citations?: Record<string, any>;
  bridge?: any;
  onPreviewCard?: (citation: any) => void;
  hideCounter?: boolean;
}

export default function ReasoningDisplay({
  streamId,
  steps: staticSteps,
  mode = 'full',
  hasOutput = false,
  agentColor: colorOverride,
  label,
  citations: citationsProp,
  bridge,
  onPreviewCard,
  hideCounter,
}: ReasoningDisplayProps) {
  const {
    displaySteps,
    phase,
    isCollapsed,
    toggleCollapse,
    agentName,
    agentColor: storeColor,
    citations: storeCitations,
    hasContent,
  } = useReasoningStream({ streamId, steps: staticSteps, mode, hasOutput });

  const agentColor = colorOverride || storeColor;
  // Citations: prefer prop (from cell/message data), fall back to store
  const citations = (citationsProp && Object.keys(citationsProp).length > 0) ? citationsProp : storeCitations;

  reasoningLog(`Display mode=${mode} stream=${streamId} content=${hasContent} phase=${phase} steps=${displaySteps.length}`, displaySteps.map(s => `${s.step}:${s.status}`));

  if (!hasContent) return null;

  if (mode === 'dots') {
    return (
      <ReasoningDots
        displaySteps={displaySteps}
        phase={phase}
        agentColor={agentColor}
      />
    );
  }

  if (mode === 'compact') {
    return (
      <CompactReasoningDisplay
        displaySteps={displaySteps}
        phase={phase}
        agentColor={agentColor}
        showCounter={!hideCounter}
      />
    );
  }

  return (
    <FullReasoningDisplay
      displaySteps={displaySteps}
      phase={phase}
      isCollapsed={isCollapsed}
      toggleCollapse={toggleCollapse}
      agentColor={agentColor}
      label={label}
      citations={citations}
      hasOutput={hasOutput}
      isStreaming={Boolean(streamId && phase !== 'complete')}
      bridge={bridge}
      onPreviewCard={onPreviewCard}
    />
  );
}
