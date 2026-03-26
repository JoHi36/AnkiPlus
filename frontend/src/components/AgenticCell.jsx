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

  const color = agent?.color || 'var(--ds-text-tertiary)';
  const label = agent?.label || agentName;
  const iconType = agent?.iconType || 'svg';
  const iconSvg = agent?.iconSvg || '';
  const badgeLogo = agent?.badgeLogo || '';
  const hintTemplate = agent?.loadingHintTemplate || `${label} arbeitet...`;

  const isTransparent = color === 'transparent';
  // Derive tinted backgrounds using color-mix (works with both hex and CSS vars)
  const tint10 = isTransparent ? 'var(--ds-hover-tint)' : `color-mix(in srgb, ${color} 10%, transparent)`;
  const tint6 = isTransparent ? 'var(--ds-hover-tint)' : `color-mix(in srgb, ${color} 6%, transparent)`;
  // Keep rgb for CSS custom property (used by .agent-cell-glow in CSS)
  const rgb = useMemo(() => {
    if (isTransparent) return '0, 0, 0';
    if (color.startsWith('var(') || color.startsWith('#') === false) return '0, 0, 0';
    return hexToRgb(color);
  }, [color, isTransparent]);
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
      window.createPlusi(emoteRef.current, { mood: 'neutral', size: 22, animated: false });
    }
  }, [iconType, agentName]);

  // Badge logo for the right meta slot (e.g. "Anki" text badge)
  const badgeLogoElement = useMemo(() => {
    if (badgeLogo === 'anki') {
      return (
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--ds-text-tertiary)',
          letterSpacing: '0.3px',
        }}>
          Anki
        </span>
      );
    }
    return null;
  }, [badgeLogo]);

  // Determine what goes in the right meta slot
  const rightMeta = headerMeta || badgeLogoElement;

  return (
    <div
      className="agent-cell"
      style={isTransparent ? {} : { '--agent-rgb': rgb, '--agent-color': color }}
      data-transparent={isTransparent ? 'true' : undefined}
    >
      <div className="agent-cell-glow" />

      <div className="agent-cell-top">
        <div className="agent-cell-top-left">
          {iconType === 'none' ? null : iconType === 'svg' && iconSvg ? (
            <div
              className="agent-cell-icon"
              style={{ background: tint10 }}
              ref={iconRef}
            />
          ) : iconType === 'emote' ? (
            <div className="agent-cell-emote" ref={emoteRef} />
          ) : (
            !isTransparent && (
              <div
                className="agent-cell-icon agent-cell-icon-letter"
                style={{ background: tint10, color }}
              >
                {label[0]}
              </div>
            )
          )}
          <span className="agent-cell-name" style={isTransparent ? {} : { color }}>
            {label}
          </span>
        </div>
        {rightMeta && (
          <div className="agent-cell-top-right">{rightMeta}</div>
        )}
        {isLoading && !rightMeta && (
          <div className="agent-cell-top-right">
            <div className="agent-cell-pulse-dot" style={{ background: isTransparent ? 'var(--ds-text-tertiary)' : color }} />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="agent-cell-content">
          <div className="agent-cell-loading-hint" style={isTransparent ? {} : { color }}>{hint}</div>
          <div className="agent-cell-shimmer" style={{ background: tint6 }} />
          <div className="agent-cell-shimmer" style={{ background: tint6, width: '78%' }} />
          <div className="agent-cell-shimmer" style={{ background: tint6, width: '85%' }} />
        </div>
      ) : (
        <div className="agent-cell-content">{children}</div>
      )}
    </div>
  );
}
