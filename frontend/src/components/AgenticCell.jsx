import React, { useMemo, useRef, useEffect } from 'react';
import { getRegistry } from '../../../shared/config/subagentRegistry';

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

export default function AgenticCell({
  agentName,
  isLoading = false,
  loadingHint = '',
  headerMeta = null,
  children,
}) {
  const registry = getRegistry();
  const agent = registry.get(agentName);

  const color = agent?.color || '#888888';
  const label = agent?.label || agentName;
  const iconType = agent?.iconType || 'svg';
  const iconSvg = agent?.iconSvg || '';
  const hintTemplate = agent?.loadingHintTemplate || `${label} arbeitet...`;

  const rgb = useMemo(() => hexToRgb(color), [color]);
  const hint = loadingHint || hintTemplate;

  // Render SVG icon safely via ref (avoids dangerouslySetInnerHTML)
  const iconRef = useRef(null);
  useEffect(() => {
    if (iconRef.current && iconType === 'svg' && iconSvg) {
      iconRef.current.textContent = '';
      const template = document.createElement('template');
      template.innerHTML = iconSvg.trim();
      const svgEl = template.content.firstChild;
      if (svgEl) iconRef.current.appendChild(svgEl);
    }
  }, [iconType, iconSvg]);

  // For 'emote' type, use createPlusi if available
  const emoteRef = useRef(null);
  useEffect(() => {
    if (emoteRef.current && iconType === 'emote' && agentName === 'plusi' && window.createPlusi) {
      emoteRef.current.textContent = '';
      const svg = window.createPlusi('neutral', 22);
      if (svg) emoteRef.current.appendChild(svg);
    }
  }, [iconType, agentName]);

  return (
    <div
      className="agent-cell"
      style={{ '--agent-rgb': rgb, '--agent-color': color }}
    >
      <div className="agent-cell-glow" />

      <div className="agent-cell-header">
        <div className="agent-cell-header-left">
          {iconType === 'svg' && iconSvg ? (
            <div
              className="agent-cell-icon"
              style={{ background: `rgba(${rgb}, 0.10)` }}
              ref={iconRef}
            />
          ) : iconType === 'emote' ? (
            <div className="agent-cell-emote" ref={emoteRef} />
          ) : (
            <div
              className="agent-cell-icon agent-cell-icon-letter"
              style={{ background: `rgba(${rgb}, 0.10)`, color }}
            >
              {label[0]}
            </div>
          )}
          <span className="agent-cell-name" style={{ color }}>
            {label}
          </span>
        </div>
        {headerMeta && (
          <div className="agent-cell-header-right">{headerMeta}</div>
        )}
        {isLoading && !headerMeta && (
          <div className="agent-cell-header-right">
            <div className="agent-cell-pulse-dot" style={{ background: color }} />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="agent-cell-content">
          <div className="agent-cell-loading-hint" style={{ color }}>{hint}</div>
          <div className="agent-cell-shimmer" style={{ background: `rgba(${rgb}, 0.06)` }} />
          <div className="agent-cell-shimmer" style={{ background: `rgba(${rgb}, 0.06)`, width: '78%' }} />
          <div className="agent-cell-shimmer" style={{ background: `rgba(${rgb}, 0.06)`, width: '85%' }} />
        </div>
      ) : (
        <div className="agent-cell-content">{children}</div>
      )}
    </div>
  );
}
