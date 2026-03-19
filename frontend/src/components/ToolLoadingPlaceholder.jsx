import React from 'react';

const loadingLabels = {
  show_card: "Lädt Karte...",
  show_card_media: "Lädt Bild aus Karte...",
  search_deck: "Sucht Karten...",
  search_image: "Sucht Bild...",
  get_learning_stats: "Lädt Statistiken...",
  spawn_plusi: "Plusi denkt nach...",
};

export default function ToolLoadingPlaceholder({ toolName }) {
  const label = loadingLabels[toolName] || "Lädt...";

  return (
    <div style={{
      background: '#222224',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: '18px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)',
        animation: 'toolShimmer 2.5s infinite',
      }} />
      <div style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#0a84ff',
        animation: 'toolPulse 1.5s ease-in-out infinite',
      }} />
      <span style={{
        fontSize: 13,
        color: 'rgba(255,255,255,0.35)',
        fontWeight: 500,
      }}>{label}</span>
      <style>{`
        @keyframes toolShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes toolPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
