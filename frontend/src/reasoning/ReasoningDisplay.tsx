import React from 'react';
import { useReasoningStream } from './useReasoningStream';
import FullReasoningDisplay from './FullReasoningDisplay';
import CompactReasoningDisplay from './CompactReasoningDisplay';
import type { ReasoningStep } from './types';

export interface ReasoningDisplayProps {
  streamId?: string;
  steps?: ReasoningStep[];
  mode?: 'full' | 'compact';
  hasOutput?: boolean;
  agentColor?: string;
  label?: string;
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
    citations,
    hasContent,
  } = useReasoningStream({ streamId, steps: staticSteps, mode, hasOutput });

  const agentColor = colorOverride || storeColor;

  if (!hasContent) return null;

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
