import React from 'react';

export default function TokenBar({ tokenInfo }) {
  if (!tokenInfo || tokenInfo.dailyRemaining === undefined) return null;

  const remaining = tokenInfo.dailyRemaining;
  const used = tokenInfo.used || 0;

  const formatTokens = (n) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString('de-DE');
  };

  return (
    <div className="px-3 py-1.5 flex items-center gap-2 text-[11px] text-[var(--ds-text-tertiary)]">
      <div className="flex-1 h-1 rounded-full bg-[var(--ds-border-subtle)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--ds-accent)] transition-all duration-300"
          style={{ width: remaining > 0 ? `${Math.min(100, (1 - remaining / (remaining + used)) * 100)}%` : '100%' }}
        />
      </div>
      <span>{formatTokens(remaining)} übrig</span>
    </div>
  );
}
