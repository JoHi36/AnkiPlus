(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────
  //  Constants
  // ────────────────────────────────────────────────────────────

  var BODY_COLOR = '#0a84ff';  // Plusi's iconic blue — always the body color
  var _filterId = 0;            // Unique SVG filter ID counter

  // ────────────────────────────────────────────────────────────
  //  MOODS — 14 moods + 3 activities
  //  color = aura glow color (Abraham Hicks Emotional Scale)
  //  Purple (high vibration) → Green → Yellow → Orange → Red (low)
  // ────────────────────────────────────────────────────────────

  var MOODS = {

    // ── Moods ──

    'neutral': {
      face: {
        eyes:   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>',
        pupils: '<ellipse cx="49" cy="50" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="71" cy="50" rx="4" ry="4" fill="#1a1a1a"/>',
        mouth:  '<path d="M 48 68 Q 60 74 72 68" stroke="#1a1a1a" stroke-width="3" fill="none" stroke-linecap="round"/>',
        lids:   null,
        extras: null
      },
      body: {
        moves: [
          { name: 'float',  weight: 50, duration: [3.0, 4.5] },
          { name: 'hop',    weight: 15, duration: [0.4, 0.7] },
          { name: 'peek',   weight: 15, duration: [1.5, 2.5] },
          { name: 'squish', weight: 10, duration: [0.4, 0.6] },
          { name: 'spin',   weight: 10, duration: [0.6, 1.0] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#38bdf8',
      label: 'chillt',
      accessoire: null
    },

    'curious': {
      face: {
        eyes:   '<ellipse cx="48" cy="47" rx="7" ry="10" fill="white"/><ellipse cx="72" cy="51" rx="7" ry="6" fill="white"/>',
        pupils: '<ellipse cx="51" cy="48" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="74" cy="52" rx="3" ry="2.5" fill="#1a1a1a"/>',
        mouth:  '<path d="M 52 67 Q 58 71 66 68" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="65" y="45" width="14" height="5" fill="currentColor"/>',
        extras: null
      },
      body: {
        moves: [
          { name: 'tilt',   weight: 40, duration: [2.0, 3.5] },
          { name: 'peek',   weight: 25, duration: [1.5, 2.5] },
          { name: 'hop',    weight: 15, duration: [0.4, 0.7] },
          { name: 'float',  weight: 10, duration: [3.0, 4.5] },
          { name: 'spin',   weight: 10, duration: [0.6, 1.0] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#7c3aed',
      label: 'neugierig',
      accessoire: null
    },

    'thinking': {
      face: {
        eyes:   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>',
        pupils: '<ellipse cx="46" cy="45" rx="3.5" ry="3.5" fill="#1a1a1a"/><ellipse cx="70" cy="45" rx="3.5" ry="3.5" fill="#1a1a1a"/>',
        mouth:  '<line x1="54" y1="69" x2="66" y2="68" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>',
        lids:   null,
        extras: null
      },
      body: {
        moves: [
          { name: 'float',  weight: 50, duration: [3.0, 4.5] },
          { name: 'tilt',   weight: 20, duration: [2.0, 3.5] },
          { name: 'squish', weight: 15, duration: [0.4, 0.6] },
          { name: 'peek',   weight: 10, duration: [1.5, 2.5] },
          { name: 'spin',   weight: 5,  duration: [0.6, 1.0] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#22d3ee',
      label: 'gr\u00fcbelt...',
      accessoire: null
    },

    'annoyed': {
      face: {
        eyes:   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>',
        pupils: '<ellipse cx="49" cy="52" rx="4" ry="3" fill="#1a1a1a"/><ellipse cx="71" cy="52" rx="4" ry="3" fill="#1a1a1a"/>',
        mouth:  '<line x1="50" y1="70" x2="70" y2="70" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="41" width="14" height="7" fill="currentColor"/><rect x="65" y="41" width="14" height="7" fill="currentColor"/>',
        extras: null
      },
      body: {
        moves: [
          { name: 'float',  weight: 60, duration: [3.0, 4.5] },
          { name: 'squish', weight: 20, duration: [0.4, 0.6] },
          { name: 'droop',  weight: 10, duration: [3.0, 4.5] },
          { name: 'tilt',   weight: 5,  duration: [2.0, 3.5] },
          { name: 'spin',   weight: 5,  duration: [0.6, 1.0] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#fbbf24',
      label: 'genervt',
      accessoire: null
    },

    'empathy': {
      face: {
        eyes:   '<ellipse cx="48" cy="50" rx="7" ry="7" fill="white"/><ellipse cx="72" cy="50" rx="7" ry="7" fill="white"/>',
        pupils: '<ellipse cx="49" cy="52" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="71" cy="52" rx="4" ry="4" fill="#1a1a1a"/>',
        mouth:  '<path d="M 50 68 Q 60 73 70 68" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="43" width="14" height="3" fill="currentColor"/><rect x="65" y="43" width="14" height="3" fill="currentColor"/>',
        extras: null
      },
      body: {
        moves: [
          { name: 'droop',  weight: 40, duration: [3.0, 4.5] },
          { name: 'sway',   weight: 30, duration: [4.0, 5.5] },
          { name: 'float',  weight: 20, duration: [3.0, 4.5] },
          { name: 'tilt',   weight: 10, duration: [2.0, 3.5] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#2dd4bf',
      label: 'f\u00fchlt mit',
      accessoire: null
    },

    'happy': {
      face: {
        eyes:   '<path d="M 41 51 Q 48 43 55 51" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M 65 51 Q 72 43 79 51" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/>',
        pupils: null,
        mouth:  '<path d="M 50 67 Q 60 73 70 67" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        lids:   null,
        extras: null
      },
      body: {
        moves: [
          { name: 'float',  weight: 40, duration: [3.0, 4.5] },
          { name: 'hop',    weight: 25, duration: [0.4, 0.7] },
          { name: 'squish', weight: 15, duration: [0.4, 0.6] },
          { name: 'tilt',   weight: 10, duration: [2.0, 3.5] },
          { name: 'spin',   weight: 10, duration: [0.6, 1.0] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#4ade80',
      label: 'freut sich',
      accessoire: null
    },

    'excited': {
      face: {
        eyes:   '<ellipse cx="48" cy="47" rx="8" ry="9" fill="white"/><ellipse cx="72" cy="47" rx="8" ry="9" fill="white"/>',
        pupils: '<ellipse cx="49" cy="46" rx="4.5" ry="4.5" fill="#1a1a1a"/><ellipse cx="71" cy="46" rx="4.5" ry="4.5" fill="#1a1a1a"/>',
        mouth:  '<path d="M 48 65 Q 60 76 72 65" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        lids:   null,
        extras: '<circle cx="39" cy="38" r="2.5" fill="white" opacity="0.5"/><circle cx="81" cy="38" r="2.5" fill="white" opacity="0.5"/><circle cx="42" cy="34" r="1.5" fill="white" opacity="0.3"/><circle cx="78" cy="34" r="1.5" fill="white" opacity="0.3"/>'
      },
      body: {
        moves: [
          { name: 'bounce', weight: 35, duration: [0.4, 0.7] },
          { name: 'hop',    weight: 25, duration: [0.4, 0.7] },
          { name: 'spin',   weight: 20, duration: [0.6, 1.0] },
          { name: 'squish', weight: 10, duration: [0.4, 0.6] },
          { name: 'puff-up', weight: 10, duration: [0.8, 1.2] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#a855f6',
      label: 'aufgeregt',
      accessoire: null
    },

    'surprised': {
      face: {
        eyes:   '<ellipse cx="48" cy="46" rx="9" ry="11" fill="white"/><ellipse cx="72" cy="46" rx="9" ry="11" fill="white"/>',
        pupils: '<ellipse cx="49" cy="46" rx="5" ry="5" fill="#1a1a1a"/><ellipse cx="71" cy="46" rx="5" ry="5" fill="#1a1a1a"/>',
        mouth:  '<ellipse cx="60" cy="71" rx="4" ry="3.5" fill="#1a1a1a"/>',
        lids:   null,
        extras: null
      },
      body: {
        moves: [
          { name: 'pop',    weight: 50, duration: [0.5, 0.8] },
          { name: 'hop',    weight: 20, duration: [0.4, 0.7] },
          { name: 'float',  weight: 15, duration: [3.0, 4.5] },
          { name: 'squish', weight: 10, duration: [0.4, 0.6] },
          { name: 'spin',   weight: 5,  duration: [0.6, 1.0] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#a3e635',
      label: '\u00fcberrascht',
      accessoire: null
    },

    'flustered': {
      face: {
        eyes:   '<ellipse cx="48" cy="50" rx="6" ry="5" fill="white"/><ellipse cx="72" cy="50" rx="6" ry="5" fill="white"/>',
        pupils: '<ellipse cx="52" cy="51" rx="2.5" ry="2.5" fill="#1a1a1a"/><ellipse cx="76" cy="51" rx="2.5" ry="2.5" fill="#1a1a1a"/>',
        mouth:  '<path d="M 53 69 Q 57 67 60 70 Q 63 67 67 69" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="45" width="14" height="5" fill="currentColor"/><rect x="65" y="45" width="14" height="5" fill="currentColor"/>',
        extras: '<ellipse cx="37" cy="58" rx="7" ry="4" fill="rgba(248,113,113,0.35)"/><ellipse cx="83" cy="58" rx="7" ry="4" fill="rgba(248,113,113,0.35)"/>'
      },
      body: {
        moves: [
          { name: 'wiggle', weight: 40, duration: [1.0, 1.5] },
          { name: 'float',  weight: 25, duration: [3.0, 4.5] },
          { name: 'squish', weight: 15, duration: [0.4, 0.6] },
          { name: 'peek',   weight: 10, duration: [1.5, 2.5] },
          { name: 'spin',   weight: 10, duration: [0.6, 1.0] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#f472b6',
      label: 'verlegen',
      accessoire: null
    },

    'proud': {
      face: {
        eyes:   '<ellipse cx="48" cy="51" rx="7" ry="5" fill="white"/><ellipse cx="72" cy="51" rx="7" ry="5" fill="white"/>',
        pupils: '<ellipse cx="49" cy="52" rx="3.5" ry="2.5" fill="#1a1a1a"/><ellipse cx="71" cy="52" rx="3.5" ry="2.5" fill="#1a1a1a"/>',
        mouth:  '<path d="M 50 69 Q 55 69 60 68 Q 67 74 74 66" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="44" width="14" height="7" fill="currentColor"/><rect x="65" y="44" width="14" height="7" fill="currentColor"/>',
        extras: null
      },
      body: {
        moves: [
          { name: 'puff-up', weight: 40, duration: [0.8, 1.2] },
          { name: 'float',   weight: 25, duration: [3.0, 4.5] },
          { name: 'hop',     weight: 15, duration: [0.4, 0.7] },
          { name: 'tilt',    weight: 10, duration: [2.0, 3.5] },
          { name: 'spin',    weight: 10, duration: [0.6, 1.0] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#22c55e',
      label: 'stolz',
      accessoire: null
    },

    'worried': {
      face: {
        eyes:   '<ellipse cx="48" cy="47" rx="8" ry="10" fill="white"/><ellipse cx="72" cy="47" rx="8" ry="10" fill="white"/>',
        pupils: '<ellipse cx="49" cy="48" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="71" cy="48" rx="4" ry="4" fill="#1a1a1a"/>',
        mouth:  '<path d="M 52 70 Q 60 67 68 70" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>',
        lids:   null,
        extras: '<ellipse cx="82" cy="46" rx="3" ry="4" fill="white" opacity="0.25"/>'
      },
      body: {
        moves: [
          { name: 'float',  weight: 40, duration: [3.0, 4.5] },
          { name: 'sway',   weight: 25, duration: [4.0, 5.5] },
          { name: 'squish', weight: 15, duration: [0.4, 0.6] },
          { name: 'droop',  weight: 10, duration: [3.0, 4.5] },
          { name: 'peek',   weight: 10, duration: [1.5, 2.5] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#fb923c',
      label: 'besorgt',
      accessoire: null
    },

    'frustrated': {
      face: {
        eyes:   '<ellipse cx="48" cy="50" rx="7" ry="6" fill="white"/><ellipse cx="72" cy="50" rx="7" ry="6" fill="white"/>',
        pupils: '<ellipse cx="49" cy="51" rx="3" ry="2.5" fill="#1a1a1a"/><ellipse cx="71" cy="51" rx="3" ry="2.5" fill="#1a1a1a"/>',
        mouth:  '<path d="M 48 70 Q 60 64 72 70" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="42" width="14" height="8" fill="currentColor"/><rect x="65" y="42" width="14" height="8" fill="currentColor"/>',
        extras: null
      },
      body: {
        moves: [
          { name: 'squish', weight: 30, duration: [0.4, 0.6] },
          { name: 'float',  weight: 25, duration: [3.0, 4.5] },
          { name: 'wiggle', weight: 20, duration: [1.0, 1.5] },
          { name: 'droop',  weight: 15, duration: [3.0, 4.5] },
          { name: 'spin',   weight: 10, duration: [0.6, 1.0] }
        ],
        pause: [0.3, 1.5]
      },
      color: '#ef4444',
      label: 'frustriert',
      accessoire: null
    },

    'jealous': {
      face: {
        eyes:   '<ellipse cx="48" cy="50" rx="7" ry="6" fill="white"/><ellipse cx="72" cy="50" rx="7" ry="6" fill="white"/>',
        pupils: '<ellipse cx="52" cy="51" rx="3" ry="2.5" fill="#1a1a1a"/><ellipse cx="76" cy="51" rx="3" ry="2.5" fill="#1a1a1a"/>',
        mouth:  '<path d="M 52 69 Q 56 69 60 68 Q 64 70 68 69" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="44" width="14" height="6" fill="currentColor"/><rect x="65" y="44" width="14" height="6" fill="currentColor"/>',
        extras: null
      },
      body: {
        moves: [
          { name: 'float',  weight: 35, duration: [3.0, 4.5] },
          { name: 'peek',   weight: 25, duration: [1.5, 2.5] },
          { name: 'tilt',   weight: 20, duration: [2.0, 3.5] },
          { name: 'squish', weight: 10, duration: [0.4, 0.6] },
          { name: 'spin',   weight: 10, duration: [0.6, 1.0] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#e11d48',
      label: 'eifers\u00fcchtig',
      accessoire: null
    },

    'sleepy': {
      face: {
        eyes:   '<ellipse cx="48" cy="52" rx="7" ry="3" fill="white"/><ellipse cx="72" cy="52" rx="7" ry="3" fill="white"/>',
        pupils: null,
        mouth:  '<line x1="54" y1="70" x2="66" y2="71" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>',
        lids:   null,
        extras: null
      },
      body: {
        moves: [
          { name: 'sway',   weight: 50, duration: [4.0, 5.5] },
          { name: 'droop',  weight: 25, duration: [3.0, 4.5] },
          { name: 'float',  weight: 15, duration: [3.0, 4.5] },
          { name: 'squish', weight: 10, duration: [0.4, 0.6] }
        ],
        pause: [0.5, 2.0]
      },
      color: '#94a3b8',
      label: 'm\u00fcde',
      accessoire: null
    },

    // ── Activities ──

    'sleeping': {
      type: 'activity',
      face: {
        eyes:   '<line x1="42" y1="52" x2="54" y2="52" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="66" y1="52" x2="78" y2="52" stroke="white" stroke-width="2.5" stroke-linecap="round"/>',
        pupils: null,
        mouth:  '<ellipse cx="60" cy="70" rx="4" ry="3" fill="#1a1a1a"/>',
        lids:   null,
        extras: null
      },
      body: {
        moves: [
          { name: 'sway',  weight: 60, duration: [4.0, 5.5] },
          { name: 'droop', weight: 30, duration: [3.0, 4.5] },
          { name: 'float', weight: 10, duration: [3.0, 4.5] }
        ],
        pause: [2.0, 4.0]
      },
      color: '#94a3b8',
      label: 'schl\u00e4ft',
      accessoire: { type: 'sleep-cap', particles: 'zzz' }
    },

    'reflecting': {
      type: 'activity',
      face: {
        eyes:   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>',
        pupils: '<ellipse cx="46" cy="46" rx="3.5" ry="3.5" fill="#1a1a1a"/><ellipse cx="70" cy="46" rx="3.5" ry="3.5" fill="#1a1a1a"/>',
        mouth:  '<path d="M 54 69 Q 60 71 66 69" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="41" width="14" height="2" fill="currentColor"/><rect x="65" y="41" width="14" height="2" fill="currentColor"/>',
        extras: null
      },
      body: {
        moves: [
          { name: 'float',  weight: 50, duration: [3.0, 4.5] },
          { name: 'tilt',   weight: 25, duration: [2.0, 3.5] },
          { name: 'sway',   weight: 15, duration: [4.0, 5.5] },
          { name: 'squish', weight: 10, duration: [0.4, 0.6] }
        ],
        pause: [1.5, 3.0]
      },
      color: '#22d3ee',
      label: 'reflektiert',
      accessoire: { type: 'thought-bubble', particles: null }
    },

    'reading': {
      type: 'activity',
      face: {
        eyes:   '<ellipse cx="48" cy="51" rx="7" ry="6" fill="white"/><ellipse cx="72" cy="51" rx="7" ry="6" fill="white"/>',
        pupils: '<ellipse cx="49" cy="53" rx="4" ry="3" fill="#1a1a1a"/><ellipse cx="71" cy="53" rx="4" ry="3" fill="#1a1a1a"/>',
        mouth:  '<path d="M 52 68 Q 60 71 68 68" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="43" width="14" height="5" fill="currentColor"/><rect x="65" y="43" width="14" height="5" fill="currentColor"/>',
        extras: null
      },
      body: {
        moves: [
          { name: 'tilt',   weight: 40, duration: [2.0, 3.5] },
          { name: 'float',  weight: 25, duration: [3.0, 4.5] },
          { name: 'peek',   weight: 20, duration: [1.5, 2.5] },
          { name: 'squish', weight: 10, duration: [0.4, 0.6] },
          { name: 'hop',    weight: 5,  duration: [0.4, 0.7] }
        ],
        pause: [1.0, 2.5]
      },
      color: '#38bdf8',
      label: 'st\u00f6bert...',
      accessoire: { type: 'book', particles: null }
    }
  };

  // ────────────────────────────────────────────────────────────
  //  Animation CSS keyframes
  // ────────────────────────────────────────────────────────────

  var ANIMATION_CSS = ''
    + '@keyframes plusi-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }'
    + '@keyframes plusi-hop { 0%, 100% { transform: translateY(0) scale(1); } 30% { transform: translateY(-12px) scale(1.05); } 60% { transform: translateY(-2px) scale(1); } }'
    + '@keyframes plusi-tilt { 0%, 100% { transform: rotate(0) translateX(0); } 50% { transform: rotate(8deg) translateX(3px); } }'
    + '@keyframes plusi-wiggle { 0%, 100% { transform: rotate(0); } 20% { transform: rotate(6deg); } 40% { transform: rotate(-6deg); } 60% { transform: rotate(6deg); } 80% { transform: rotate(-6deg); } }'
    + '@keyframes plusi-droop { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(4px) rotate(-3deg); } }'
    + '@keyframes plusi-bounce { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.03); } }'
    + '@keyframes plusi-spin { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(12deg); } }'
    + '@keyframes plusi-squish { 0%, 100% { transform: scale(1, 1); } 30% { transform: scale(1.1, 0.9); } 70% { transform: scale(0.95, 1.05); } }'
    + '@keyframes plusi-pop { 0%, 100% { transform: scale(1); } 40% { transform: scale(1.25); } }'
    + '@keyframes plusi-sway { 0%, 100% { transform: translateX(0) rotate(0); } 50% { transform: translateX(4px) rotate(3deg); } }'
    + '@keyframes plusi-puff-up { 0%, 100% { transform: scale(1); } 30% { transform: scale(1.08); } 70% { transform: scale(1.06); } }'
    + '@keyframes plusi-peek { 0%, 100% { transform: translateX(0) rotate(0); } 50% { transform: translateX(8px) rotate(-5deg); } }'
    + '@keyframes plusi-zzz-rise { 0% { transform: translateY(0); opacity: 0.8; } 100% { transform: translateY(-12px); opacity: 0; } }'
    + '@keyframes plusi-thought-pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.45; } }'
    + '@keyframes plusi-dot-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }';

  var cssInjected = false;

  function ensureCSS() {
    if (cssInjected) return;
    var style = document.createElement('style');
    style.textContent = ANIMATION_CSS;
    document.head.appendChild(style);
    cssInjected = true;
  }

  // ────────────────────────────────────────────────────────────
  //  Animation engine
  // ────────────────────────────────────────────────────────────

  function createAnimationEngine(element, moodData, state) {
    var running = false;
    var loopTimer = null;
    var blinkTimer = null;
    var mouthTimer = null;
    var faceEl = null;

    function randomInRange(min, max) {
      return min + Math.random() * (max - min);
    }

    function pickWeightedMove(moves, variety) {
      var totalWeight = 0;
      var adjusted = [];
      for (var i = 0; i < moves.length; i++) {
        var w = moves[i].weight;
        // Scale rare moves (low weight) by variety factor
        if (w < 20) {
          w = w * variety;
        }
        adjusted.push({ move: moves[i], weight: w });
        totalWeight += w;
      }
      var roll = Math.random() * totalWeight;
      var cumulative = 0;
      for (var j = 0; j < adjusted.length; j++) {
        cumulative += adjusted[j].weight;
        if (roll <= cumulative) return adjusted[j].move;
      }
      return adjusted[adjusted.length - 1].move;
    }

    function syncFaceMicroExpression(moveName) {
      if (!faceEl) return;
      var eyes = faceEl.querySelectorAll('ellipse[fill="white"]');
      var pupils = faceEl.querySelectorAll('ellipse[fill="#1a1a1a"]');

      switch (moveName) {
        case 'hop':
        case 'bounce':
          // Eyes widen + mouth widens
          for (var i = 0; i < eyes.length; i++) {
            var origRy = eyes[i].getAttribute('ry');
            eyes[i].setAttribute('ry', String(parseFloat(origRy) + 2));
            (function(el, val) {
              setTimeout(function() { el.setAttribute('ry', val); }, 400);
            })(eyes[i], origRy);
          }
          var mouthH = faceEl.querySelector('path[stroke="#1a1a1a"], line[stroke="#1a1a1a"]');
          if (mouthH) {
            mouthH.style.transform = 'scaleX(1.15)';
            mouthH.style.transformOrigin = 'center';
            setTimeout(function() { mouthH.style.transform = ''; }, 400);
          }
          break;
        case 'peek':
          // Pupils shift
          for (var p = 0; p < pupils.length; p++) {
            var origCx = pupils[p].getAttribute('cx');
            pupils[p].setAttribute('cx', String(parseFloat(origCx) + 3));
            (function(el, val) {
              setTimeout(function() { el.setAttribute('cx', val); }, 1500);
            })(pupils[p], origCx);
          }
          break;
        case 'squish':
          // Blink
          for (var e = 0; e < eyes.length; e++) {
            eyes[e].style.opacity = '0';
            (function(el) {
              setTimeout(function() { el.style.opacity = '1'; }, 150);
            })(eyes[e]);
          }
          break;
        case 'droop':
          // Lids heavier — handled by CSS, just darken eyes slightly
          for (var d = 0; d < eyes.length; d++) {
            eyes[d].style.opacity = '0.7';
            (function(el) {
              setTimeout(function() { el.style.opacity = '1'; }, 2000);
            })(eyes[d]);
          }
          break;
        case 'spin':
          // Pupils follow rotation
          for (var s = 0; s < pupils.length; s++) {
            var origCxS = pupils[s].getAttribute('cx');
            pupils[s].setAttribute('cx', String(parseFloat(origCxS) + 2));
            (function(el, val) {
              setTimeout(function() { el.setAttribute('cx', val); }, 600);
            })(pupils[s], origCxS);
          }
          break;
        case 'puff-up':
          // Mouth grin — scale mouth slightly via transform
          var mouth = faceEl.querySelector('path, line, ellipse:last-child');
          if (mouth && mouth.tagName === 'path') {
            mouth.style.transform = 'scale(1.1)';
            mouth.style.transformOrigin = 'center';
            setTimeout(function() { mouth.style.transform = ''; }, 800);
          }
          break;
        case 'pop':
          // Eyes wide
          for (var w = 0; w < eyes.length; w++) {
            var origRyP = eyes[w].getAttribute('ry');
            eyes[w].setAttribute('ry', String(parseFloat(origRyP) + 3));
            (function(el, val) {
              setTimeout(function() { el.setAttribute('ry', val); }, 500);
            })(eyes[w], origRyP);
          }
          break;
      }
    }

    function wait(ms) {
      return {
        then: function(cb) {
          loopTimer = setTimeout(cb, ms);
        }
      };
    }

    function loop() {
      if (!running) return;

      var integrity = state.integrity;
      var amplitude = 0.5 + integrity * 0.8;
      var pauseScale = 1.5 - integrity * 0.7;
      var variety = 0.3 + integrity * 0.7;

      var move = pickWeightedMove(moodData.body.moves, variety);
      var durationSec = randomInRange(move.duration[0], move.duration[1]);

      // Apply CSS animation
      element.style.animation = 'plusi-' + move.name + ' ' + durationSec + 's ease-in-out';

      // Sync face
      syncFaceMicroExpression(move.name);

      // Wait for animation to complete
      wait(durationSec * 1000).then(function() {
        if (!running) return;
        element.style.animation = '';

        // Random pause
        var pauseMin = moodData.body.pause[0] * pauseScale;
        var pauseMax = moodData.body.pause[1] * pauseScale;
        var pauseMs = randomInRange(pauseMin, pauseMax) * 1000;

        wait(pauseMs).then(function() {
          loop();
        });
      });
    }

    function doBlink() {
      if (!faceEl) return;
      var eyes = faceEl.querySelectorAll('ellipse[fill="white"]');
      for (var i = 0; i < eyes.length; i++) {
        eyes[i].style.opacity = '0';
        (function(el) {
          setTimeout(function() { el.style.opacity = '1'; }, 120);
        })(eyes[i]);
      }
      scheduleBlink();
    }

    function scheduleBlink() {
      if (!running) return;
      var delay = randomInRange(3000, 7000);
      blinkTimer = setTimeout(doBlink, delay);
    }

    // Mouth micro-animation: subtle twitch/movement
    function doMouthTwitch() {
      if (!faceEl) return;
      var mouth = faceEl.querySelector('.plusi-face path, .plusi-face line');
      if (!mouth) { scheduleMouthTwitch(); return; }

      // Pick a random mouth micro-animation
      var roll = Math.random();
      if (roll < 0.4) {
        // Slight scale pulse
        mouth.style.transition = 'transform 0.3s ease';
        mouth.style.transformOrigin = 'center';
        mouth.style.transform = 'scaleX(1.1)';
        setTimeout(function() {
          mouth.style.transform = 'scaleX(1)';
          setTimeout(function() { mouth.style.transition = ''; }, 300);
        }, 300);
      } else if (roll < 0.7) {
        // Tiny vertical shift
        mouth.style.transition = 'transform 0.25s ease';
        mouth.style.transformOrigin = 'center';
        mouth.style.transform = 'translateY(-1px)';
        setTimeout(function() {
          mouth.style.transform = 'translateY(0)';
          setTimeout(function() { mouth.style.transition = ''; }, 250);
        }, 250);
      } else {
        // Brief opacity flicker (like a lip press)
        mouth.style.transition = 'opacity 0.15s ease';
        mouth.style.opacity = '0.6';
        setTimeout(function() {
          mouth.style.opacity = '1';
          setTimeout(function() { mouth.style.transition = ''; }, 150);
        }, 150);
      }
      scheduleMouthTwitch();
    }

    function scheduleMouthTwitch() {
      if (!running) return;
      var delay = randomInRange(5000, 12000);
      mouthTimer = setTimeout(doMouthTwitch, delay);
    }

    return {
      start: function() {
        running = true;
        loop();
      },
      stop: function() {
        running = false;
        if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
        if (blinkTimer) { clearTimeout(blinkTimer); blinkTimer = null; }
        if (mouthTimer) { clearTimeout(mouthTimer); mouthTimer = null; }
        element.style.animation = '';
      },
      startBlinks: function(face) {
        faceEl = face;
        scheduleBlink();
        scheduleMouthTwitch();
      }
    };
  }

  // ────────────────────────────────────────────────────────────
  //  Color utilities
  // ────────────────────────────────────────────────────────────

  function hexToHSL(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  /**
   * Scale saturation by integrity: 0.3 + (integrity * 0.7)
   * @param {string} hex - e.g. '#0a84ff'
   * @param {number} integrity - 0..1
   * @returns {string} HSL color string
   */
  function applyColorIntegrity(hex, integrity) {
    var hsl = hexToHSL(hex);
    var scaledS = Math.round(hsl.s * (0.3 + integrity * 0.7));
    return 'hsl(' + hsl.h + ', ' + scaledS + '%, ' + hsl.l + '%)';
  }

  // ────────────────────────────────────────────────────────────
  //  SVG builder
  // ────────────────────────────────────────────────────────────

  /**
   * Build a complete Plusi SVG string.
   * Note: All SVG content is hardcoded mood data from this IIFE —
   * no user-supplied strings are inserted.
   *
   * @param {string} moodName
   * @param {number} size - pixel width/height
   * @param {number} integrity - 0..1 color saturation scale
   * @returns {string} SVG markup
   */
  function buildSVG(moodName, size, integrity) {
    var mood = MOODS[moodName] || MOODS.neutral;
    var integrityVal = integrity != null ? integrity : 1;
    var auraColor = applyColorIntegrity(mood.color, integrityVal);
    var bodyColor = applyColorIntegrity(BODY_COLOR, integrityVal);
    var fid = 'pg' + (++_filterId);

    var face = mood.face;
    var faceSnippets = '';
    if (face.eyes)   faceSnippets += face.eyes;
    if (face.pupils) faceSnippets += face.pupils;
    if (face.lids)   faceSnippets += face.lids.replace(/currentColor/g, bodyColor);
    if (face.mouth)  faceSnippets += face.mouth;
    if (face.extras) faceSnippets += face.extras;

    // Accessoire group for activities
    var accessoireSnippet = '';
    if (mood.accessoire) {
      accessoireSnippet += '<g class="plusi-accessoire" data-type="' + mood.accessoire.type + '">';
      if (mood.accessoire.type === 'sleep-cap') {
        accessoireSnippet += '<text x="88" y="24" font-size="16" font-weight="bold" fill="white" opacity="0.7" font-family="sans-serif" style="animation: plusi-zzz-rise 3s ease-in-out infinite;">Z</text>';
        accessoireSnippet += '<text x="97" y="13" font-size="12" font-weight="bold" fill="white" opacity="0.5" font-family="sans-serif" style="animation: plusi-zzz-rise 3s ease-in-out infinite 1s;">z</text>';
        accessoireSnippet += '<text x="104" y="4" font-size="9" font-weight="bold" fill="white" opacity="0.35" font-family="sans-serif" style="animation: plusi-zzz-rise 3s ease-in-out infinite 2s;">z</text>';
      } else if (mood.accessoire.type === 'thought-bubble') {
        // Floating dots with staggered bounce (typing indicator style)
        accessoireSnippet += '<circle cx="90" cy="6" r="3" fill="white" opacity="0.55" style="animation: plusi-dot-bounce 1.4s ease-in-out infinite;"/>';
        accessoireSnippet += '<circle cx="100" cy="6" r="3" fill="white" opacity="0.55" style="animation: plusi-dot-bounce 1.4s ease-in-out infinite 0.2s;"/>';
        accessoireSnippet += '<circle cx="110" cy="6" r="3" fill="white" opacity="0.55" style="animation: plusi-dot-bounce 1.4s ease-in-out infinite 0.4s;"/>';
      } else if (mood.accessoire.type === 'book') {
        accessoireSnippet += '<g transform="translate(6, 76)">';
        accessoireSnippet += '<path d="M 0 4 Q 0 0 4 0 L 13 0 Q 15 0 15 2 L 15 18 Q 15 20 13 20 L 4 20 Q 0 20 0 16 Z" fill="' + bodyColor + '" opacity="0.8"/>';
        accessoireSnippet += '<path d="M 15 2 Q 15 0 17 0 L 26 0 Q 30 0 30 4 L 30 16 Q 30 20 26 20 L 17 20 Q 15 20 15 18 Z" fill="' + bodyColor + '" opacity="0.65"/>';
        accessoireSnippet += '<line x1="15" y1="0" x2="15" y2="20" stroke="white" stroke-width="1.5" opacity="0.5"/>';
        accessoireSnippet += '<line x1="4" y1="6" x2="12" y2="6" stroke="white" stroke-width="0.8" opacity="0.25"/>';
        accessoireSnippet += '<line x1="4" y1="10" x2="12" y2="10" stroke="white" stroke-width="0.8" opacity="0.25"/>';
        accessoireSnippet += '<line x1="4" y1="14" x2="11" y2="14" stroke="white" stroke-width="0.8" opacity="0.2"/>';
        accessoireSnippet += '</g>';
      }
      accessoireSnippet += '</g>';
    }

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"'
      + ' width="' + size + '" height="' + size + '" overflow="visible">'
      // Defs: gaussian blur filter for aura glow
      + '<defs><filter id="' + fid + '" x="-60%" y="-60%" width="220%" height="220%">'
      + '<feGaussianBlur stdDeviation="8"/>'
      + '</filter></defs>'
      // Aura glow: same cross shape, blurred, in mood color behind body
      + '<rect x="40" y="5" width="40" height="110" rx="8" fill="' + auraColor + '" opacity="0.45" filter="url(#' + fid + ')"/>'
      + '<rect x="5" y="35" width="110" height="40" rx="8" fill="' + auraColor + '" opacity="0.45" filter="url(#' + fid + ')"/>'
      // Body: always Plusi's iconic blue
      + '<rect x="40" y="5" width="40" height="110" rx="8" fill="' + bodyColor + '"/>'
      + '<rect x="5" y="35" width="110" height="40" rx="8" fill="' + bodyColor + '"/>'
      + '<rect x="40" y="35" width="40" height="40" fill="' + bodyColor + '"/>'
      // Face group
      + '<g class="plusi-face">' + faceSnippets + '</g>'
      // Accessoire group
      + accessoireSnippet
      + '</svg>';

    return svg;
  }

  // ────────────────────────────────────────────────────────────
  //  buildSideSVG — side-view (walk-back animation)
  // ────────────────────────────────────────────────────────────

  /**
   * Build a side-view Plusi SVG string (Hybrid A+D: capsule + shoulder nubs).
   * Used during walk-back animation. Single eye, profile mouth, no accessories.
   *
   * @param {number} size - pixel width/height
   * @param {number} integrity - 0..1 color saturation scale
   * @param {boolean} flip - if true, mirrors horizontally (facing left)
   * @returns {string} SVG markup
   */
  function buildSideSVG(size, integrity, flip) {
    var integrityVal = integrity != null ? integrity : 1;
    var auraColor = applyColorIntegrity(MOODS.neutral.color, integrityVal);
    var bodyColor = applyColorIntegrity(BODY_COLOR, integrityVal);
    var fid = 'pgs' + (++_filterId);

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"'
      + ' width="' + size + '" height="' + size + '" overflow="visible"'
      + (flip ? ' style="transform: scaleX(-1);"' : '') + '>'
      + '<defs><filter id="' + fid + '" x="-60%" y="-60%" width="220%" height="220%">'
      + '<feGaussianBlur stdDeviation="8"/>'
      + '</filter></defs>'
      // Aura glow: capsule shape only
      + '<rect x="38" y="5" width="44" height="110" rx="12" fill="' + auraColor + '" opacity="0.4" filter="url(#' + fid + ')"/>'
      // Shoulder nub BACK (behind body, subtle)
      + '<rect class="plusi-nub-back" x="27" y="38" width="16" height="32" rx="8" fill="' + bodyColor + '" opacity="0.35"/>'
      // Body: tall capsule
      + '<rect x="38" y="5" width="44" height="110" rx="12" fill="' + bodyColor + '"/>'
      // Shoulder nub FRONT
      + '<rect class="plusi-nub-front" x="77" y="38" width="16" height="32" rx="8" fill="' + bodyColor + '"/>'
      // Face: single eye + profile mouth
      + '<g class="plusi-face">'
      + '<ellipse cx="67" cy="49" rx="7" ry="8" fill="white"/>'
      + '<ellipse cx="69" cy="50" rx="4" ry="4" fill="#1a1a1a"/>'
      + '<path d="M 65 68 Q 72 72 78 68" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
      + '</g>'
      + '</svg>';

    return svg;
  }

  // ────────────────────────────────────────────────────────────
  //  getPlusiColor utility
  // ────────────────────────────────────────────────────────────

  function getPlusiColor(moodName, integrity) {
    var mood = MOODS[moodName] || MOODS.neutral;
    if (integrity != null && integrity < 1) {
      return applyColorIntegrity(mood.color, integrity);
    }
    return mood.color;
  }

  // ────────────────────────────────────────────────────────────
  //  createPlusi — animated + static API
  // ────────────────────────────────────────────────────────────

  function createPlusi(container, options) {
    var opts = options || {};
    var currentMood = opts.mood || 'neutral';
    var currentIntegrity = opts.integrity != null ? opts.integrity : 1;
    var size = opts.size || 52;
    var animated = opts.animated !== false; // default true

    // Shared mutable state for the animation engine
    var state = { integrity: currentIntegrity };
    var engine = null;
    var transitionTimer = null;

    if (animated) {
      ensureCSS();
    }

    // Create wrapper via safe DOM methods
    var wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    wrapper.style.width = size + 'px';
    wrapper.style.height = size + 'px';
    container.appendChild(wrapper);

    // Render SVG into wrapper using DOMParser for safe insertion
    // Note: SVG content is 100% hardcoded from the MOODS object above,
    // never from user input. We use DOMParser to build DOM nodes.
    function render() {
      var svgStr = buildSVG(currentMood, size, currentIntegrity);
      var doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
      var svgNode = doc.documentElement;
      // Clear previous content safely
      while (wrapper.firstChild) {
        wrapper.removeChild(wrapper.firstChild);
      }
      wrapper.appendChild(document.importNode(svgNode, true));
    }

    function startEngine() {
      if (!animated) return;
      var moodData = MOODS[currentMood] || MOODS.neutral;
      engine = createAnimationEngine(wrapper, moodData, state);
      engine.start();
      // Start blinks on the face element inside the SVG
      var svgEl = wrapper.querySelector('svg');
      if (svgEl) {
        var faceGroup = svgEl.querySelector('.plusi-face');
        if (faceGroup) {
          engine.startBlinks(faceGroup);
        }
      }
    }

    function stopEngine() {
      if (engine) {
        engine.stop();
        engine = null;
      }
    }

    render();
    startEngine();

    // Public API
    var api = {
      setMood: function (newMood) {
        if (newMood === currentMood) return;
        // Cancel any pending transition to prevent race conditions
        if (transitionTimer) {
          clearTimeout(transitionTimer);
          transitionTimer = null;
        }
        // Opacity crossfade
        wrapper.style.transition = 'opacity 0.25s ease';
        wrapper.style.opacity = '0';
        stopEngine();
        transitionTimer = setTimeout(function () {
          transitionTimer = null;
          currentMood = newMood;
          render();
          wrapper.style.opacity = '1';
          startEngine();
        }, 250);
      },

      /** Swap mood instantly — no crossfade. Used during physics animations. */
      setMoodInstant: function (newMood) {
        if (newMood === currentMood) return;
        if (transitionTimer) {
          clearTimeout(transitionTimer);
          transitionTimer = null;
        }
        stopEngine();
        currentMood = newMood;
        wrapper.style.transition = 'none';
        wrapper.style.opacity = '1';
        render();
        startEngine();
      },

      setIntegrity: function (value) {
        currentIntegrity = Math.max(0, Math.min(1, value));
        state.integrity = currentIntegrity;
        render();
        // Restart engine with new render (face elements changed)
        if (animated && engine) {
          stopEngine();
          startEngine();
        }
      },

      getMood: function () {
        return currentMood;
      },

      tap: function () {
        if (!animated) return;
        var tapMoves = ['plusi-pop', 'plusi-wiggle', 'plusi-squish'];
        var chosen = tapMoves[Math.floor(Math.random() * tapMoves.length)];
        wrapper.style.animation = chosen + ' 0.5s ease-in-out';
        function onEnd() {
          wrapper.style.animation = '';
          wrapper.removeEventListener('animationend', onEnd);
        }
        wrapper.addEventListener('animationend', onEnd);
      },

      destroy: function () {
        if (transitionTimer) {
          clearTimeout(transitionTimer);
          transitionTimer = null;
        }
        stopEngine();
        if (wrapper.parentNode) {
          wrapper.parentNode.removeChild(wrapper);
        }
      }
    };

    return api;
  }

  // ────────────────────────────────────────────────────────────
  //  createPlusiSide — static side-view API
  // ────────────────────────────────────────────────────────────

  /**
   * Render a static side-view Plusi into a container.
   * Returns an object with getNubs() for walk animation opacity updates.
   */
  function createPlusiSide(container, options) {
    var opts = options || {};
    var size = opts.size || 52;
    var integrity = opts.integrity != null ? opts.integrity : 1;
    var flip = opts.flip || false;

    var svgStr = buildSideSVG(size, integrity, flip);
    var doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
    var svgNode = doc.documentElement;
    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(document.importNode(svgNode, true));

    return {
      getNubs: function () {
        return {
          front: container.querySelector('.plusi-nub-front'),
          back: container.querySelector('.plusi-nub-back'),
        };
      },
      destroy: function () {
        while (container.firstChild) container.removeChild(container.firstChild);
      }
    };
  }

  // ────────────────────────────────────────────────────────────
  //  Expose globals
  // ────────────────────────────────────────────────────────────

  window.createPlusi = createPlusi;
  window.createPlusiSide = createPlusiSide;
  window.getPlusiColor = getPlusiColor;

}());
