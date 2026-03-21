(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────
  //  MOODS — 11 moods + 3 activities
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
      color: '#0a84ff',
      label: 'chillt',
      accessoire: null
    },

    'curious': {
      face: {
        eyes:   '<ellipse cx="48" cy="48" rx="7" ry="9" fill="white"/><ellipse cx="72" cy="50" rx="7" ry="7" fill="white"/>',
        pupils: '<ellipse cx="49" cy="49" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="71" cy="52" rx="4" ry="3" fill="#1a1a1a"/>',
        mouth:  '<path d="M 50 68 Q 56 68 60 66 Q 64 64 68 66" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="65" y="43" width="14" height="5" fill="currentColor"/>',
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
      color: '#f59e0b',
      label: 'neugierig',
      accessoire: null
    },

    'thinking': {
      face: {
        eyes:   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>',
        pupils: '<ellipse cx="51" cy="47" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="75" cy="47" rx="4" ry="4" fill="#1a1a1a"/>',
        mouth:  '<path d="M 50 69 Q 60 72 70 69" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
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
      color: '#0a84ff',
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
      color: '#f87171',
      label: 'genervt',
      accessoire: null
    },

    'empathy': {
      face: {
        eyes:   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>',
        pupils: '<ellipse cx="49" cy="52" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="71" cy="52" rx="4" ry="4" fill="#1a1a1a"/>',
        mouth:  '<path d="M 50 70 Q 60 66 70 70" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="41" width="14" height="3" fill="currentColor"/><rect x="65" y="41" width="14" height="3" fill="currentColor"/>',
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
      color: '#818cf8',
      label: 'f\u00fchlt mit',
      accessoire: null
    },

    'happy': {
      face: {
        eyes:   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>',
        pupils: '<ellipse cx="49" cy="51" rx="4" ry="3.5" fill="#1a1a1a"/><ellipse cx="71" cy="51" rx="4" ry="3.5" fill="#1a1a1a"/>',
        mouth:  '<path d="M 46 66 Q 60 78 74 66" stroke="#1a1a1a" stroke-width="3" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="41" width="14" height="4" fill="currentColor"/><rect x="65" y="41" width="14" height="4" fill="currentColor"/>',
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
      color: '#34d399',
      label: 'freut sich',
      accessoire: null
    },

    'excited': {
      face: {
        eyes:   '<ellipse cx="48" cy="47" rx="8" ry="10" fill="white"/><ellipse cx="72" cy="47" rx="8" ry="10" fill="white"/>',
        pupils: '<ellipse cx="49" cy="48" rx="5" ry="5" fill="#1a1a1a"/><ellipse cx="71" cy="48" rx="5" ry="5" fill="#1a1a1a"/>',
        mouth:  '<ellipse cx="60" cy="70" rx="7" ry="6" fill="#1a1a1a"/>',
        lids:   null,
        extras: null
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
      color: '#a78bfa',
      label: 'aufgeregt',
      accessoire: null
    },

    'surprised': {
      face: {
        eyes:   '<ellipse cx="48" cy="46" rx="8" ry="10" fill="white"/><ellipse cx="72" cy="46" rx="8" ry="10" fill="white"/>',
        pupils: '<ellipse cx="49" cy="47" rx="5" ry="5" fill="#1a1a1a"/><ellipse cx="71" cy="47" rx="5" ry="5" fill="#1a1a1a"/>',
        mouth:  '<ellipse cx="60" cy="70" rx="5" ry="4" fill="#1a1a1a"/>',
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
      color: '#f59e0b',
      label: '\u00fcberrascht',
      accessoire: null
    },

    'flustered': {
      face: {
        eyes:   '<ellipse cx="48" cy="49" rx="7" ry="5" fill="white"/><ellipse cx="72" cy="49" rx="7" ry="5" fill="white"/>',
        pupils: '<ellipse cx="51" cy="50" rx="3" ry="3" fill="#1a1a1a"/><ellipse cx="69" cy="50" rx="3" ry="3" fill="#1a1a1a"/>',
        mouth:  '<path d="M 54 68 Q 57 66 60 68 Q 63 70 66 68" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="44" width="14" height="4" fill="currentColor"/><rect x="65" y="44" width="14" height="4" fill="currentColor"/>',
        extras: '<ellipse cx="38" cy="60" rx="6" ry="3" fill="rgba(248,113,113,0.3)"/><ellipse cx="82" cy="60" rx="6" ry="3" fill="rgba(248,113,113,0.3)"/>'
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
      color: '#f87171',
      label: 'verlegen',
      accessoire: null
    },

    'proud': {
      face: {
        eyes:   '<ellipse cx="48" cy="50" rx="7" ry="6" fill="white"/><ellipse cx="72" cy="50" rx="7" ry="6" fill="white"/>',
        pupils: '<ellipse cx="49" cy="51" rx="4" ry="3" fill="#1a1a1a"/><ellipse cx="71" cy="51" rx="4" ry="3" fill="#1a1a1a"/>',
        mouth:  '<path d="M 48 66 Q 54 74 60 68 Q 66 62 72 66" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="44" width="14" height="5" fill="currentColor"/><rect x="65" y="44" width="14" height="5" fill="currentColor"/>',
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
      color: '#34d399',
      label: 'stolz',
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
      color: '#6b7280',
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
      color: '#6b7280',
      label: 'schl\u00e4ft',
      accessoire: { type: 'sleep-cap', particles: 'zzz' }
    },

    'reflecting': {
      type: 'activity',
      face: {
        eyes:   '<ellipse cx="48" cy="50" rx="7" ry="6" fill="white"/><ellipse cx="72" cy="50" rx="7" ry="6" fill="white"/>',
        pupils: '<ellipse cx="50" cy="51" rx="4" ry="3" fill="#1a1a1a"/><ellipse cx="72" cy="51" rx="4" ry="3" fill="#1a1a1a"/>',
        mouth:  '<path d="M 50 69 Q 60 72 70 69" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        lids:   '<rect x="41" y="44" width="14" height="5" fill="currentColor"/><rect x="65" y="44" width="14" height="5" fill="currentColor"/>',
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
      color: '#818cf8',
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
      color: '#0a84ff',
      label: 'st\u00f6bert...',
      accessoire: { type: 'book', particles: null }
    }
  };

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
    var color = applyColorIntegrity(mood.color, integrity != null ? integrity : 1);

    var face = mood.face;
    var faceSnippets = '';
    if (face.eyes)   faceSnippets += face.eyes;
    if (face.pupils) faceSnippets += face.pupils;
    if (face.lids)   faceSnippets += face.lids.replace(/currentColor/g, color);
    if (face.mouth)  faceSnippets += face.mouth;
    if (face.extras) faceSnippets += face.extras;

    // Accessoire group for activities
    var accessoireSnippet = '';
    if (mood.accessoire) {
      accessoireSnippet += '<g class="plusi-accessoire" data-type="' + mood.accessoire.type + '">';
      if (mood.accessoire.type === 'sleep-cap') {
        accessoireSnippet += '<path d="M 35 20 Q 60 -5 85 20 L 80 35 Q 60 25 40 35 Z" fill="' + color + '" opacity="0.6"/>';
        accessoireSnippet += '<circle cx="60" cy="2" r="4" fill="' + color + '" opacity="0.8"/>';
      } else if (mood.accessoire.type === 'thought-bubble') {
        accessoireSnippet += '<circle cx="95" cy="20" r="10" fill="white" opacity="0.15"/>';
        accessoireSnippet += '<circle cx="85" cy="32" r="5" fill="white" opacity="0.1"/>';
        accessoireSnippet += '<circle cx="80" cy="38" r="3" fill="white" opacity="0.08"/>';
      } else if (mood.accessoire.type === 'book') {
        accessoireSnippet += '<rect x="15" y="80" width="24" height="18" rx="2" fill="' + color + '" opacity="0.5"/>';
        accessoireSnippet += '<line x1="27" y1="82" x2="27" y2="96" stroke="white" stroke-width="1" opacity="0.3"/>';
      }
      accessoireSnippet += '</g>';
    }

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"'
      + ' width="' + size + '" height="' + size + '">'
      // Body: plus-cross shape (3 rects)
      + '<rect x="40" y="5" width="40" height="110" rx="8" fill="' + color + '"/>'
      + '<rect x="5" y="35" width="110" height="40" rx="8" fill="' + color + '"/>'
      + '<rect x="40" y="35" width="40" height="40" fill="' + color + '"/>'
      // Face group
      + '<g class="plusi-face">' + faceSnippets + '</g>'
      // Accessoire group
      + accessoireSnippet
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
  //  createPlusi — static API
  // ────────────────────────────────────────────────────────────

  function createPlusi(container, options) {
    var opts = options || {};
    var currentMood = opts.mood || 'neutral';
    var currentIntegrity = opts.integrity != null ? opts.integrity : 1;
    var size = opts.size || 52;

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

    render();

    // Public API
    var api = {
      setMood: function (newMood) {
        if (newMood === currentMood) return;
        // Opacity crossfade
        wrapper.style.transition = 'opacity 0.25s ease';
        wrapper.style.opacity = '0';
        setTimeout(function () {
          currentMood = newMood;
          render();
          wrapper.style.opacity = '1';
        }, 250);
      },

      setIntegrity: function (value) {
        currentIntegrity = Math.max(0, Math.min(1, value));
        render();
      },

      getMood: function () {
        return currentMood;
      },

      tap: function () {
        // Placeholder — animation will be added in a later task
      },

      destroy: function () {
        if (wrapper.parentNode) {
          wrapper.parentNode.removeChild(wrapper);
        }
      }
    };

    return api;
  }

  // ────────────────────────────────────────────────────────────
  //  Expose globals
  // ────────────────────────────────────────────────────────────

  window.createPlusi = createPlusi;
  window.getPlusiColor = getPlusiColor;

}());
