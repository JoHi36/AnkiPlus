import React from 'react';
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
