#!/usr/bin/env python3
"""Benchmark Dashboard Server — serves a visual benchmark dashboard on localhost:8080.

Run from project root:
  python3 scripts/benchmark_serve.py
  # Open http://localhost:8080
"""
import json
import os
import re as _re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

# ── Path Setup ────────────────────────────────────────────────────────────────

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS_PATH = os.path.join(PROJECT_ROOT, "benchmark", "results.json")
ROUTER_RESULTS_PATH = os.path.join(PROJECT_ROOT, "benchmark", "router_results.json")
BENCHMARK_RUN_SCRIPT = os.path.join(PROJECT_ROOT, "scripts", "benchmark_run.py")
BENCHMARK_GENERATE_SCRIPT = os.path.join(PROJECT_ROOT, "scripts", "benchmark_generate.py")
BENCHMARK_ROUTER_SCRIPT = os.path.join(PROJECT_ROOT, "scripts", "benchmark_router.py")
DOCS_PATH = os.path.join(PROJECT_ROOT, "docs", "reference", "RETRIEVAL_SYSTEM.md")

# ── HTML Dashboard ────────────────────────────────────────────────────────────

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Retrieval Benchmark Dashboard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg-deep:    #141416;
    --bg-card:    #1c1c1e;
    --bg-hover:   #242426;
    --border:     #2c2c2e;
    --text:       #e5e5ea;
    --text-muted: #636366;
    --green:      #30d158;
    --yellow:     #ffd60a;
    --red:        #ff453a;
    --blue:       #0a84ff;
    --purple:     #bf5af2;
    --mono:       'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
    --sans:       -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  body {
    background: var(--bg-deep);
    color: var(--text);
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.5;
    min-height: 100vh;
    padding: 24px;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .header-left h1 {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.3px;
  }
  .header-left .timestamp {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .header-right {
    display: flex;
    gap: 8px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text);
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    text-decoration: none;
  }
  .btn:hover { background: var(--bg-hover); }
  .btn.btn-primary { background: var(--blue); border-color: var(--blue); color: #fff; }
  .btn.btn-primary:hover { background: #0070e0; border-color: #0070e0; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Summary row ── */
  .summary-row {
    display: grid;
    grid-template-columns: auto 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
    align-items: stretch;
  }

  /* ── Big recall card ── */
  .recall-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 160px;
  }
  .recall-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 8px;
  }
  .recall-value {
    font-family: var(--mono);
    font-size: 48px;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 6px;
  }
  .recall-sub {
    font-size: 12px;
    color: var(--text-muted);
  }
  .color-green { color: var(--green); }
  .color-yellow { color: var(--yellow); }
  .color-red { color: var(--red); }

  /* ── Step bars card ── */
  .metric-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px 20px;
  }
  .metric-card h3 {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 14px;
  }
  .step-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .step-row:last-child { margin-bottom: 0; }
  .step-name {
    width: 175px;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--mono);
    display: flex;
    align-items: center;
  }
  .step-bar-bg {
    flex: 1;
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .step-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
  }
  .step-score {
    width: 36px;
    text-align: right;
    font-size: 12px;
    font-family: var(--mono);
    flex-shrink: 0;
  }

  /* ── Category card ── */
  .cat-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .cat-row:last-child { margin-bottom: 0; }
  .cat-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
    min-width: 80px;
    text-align: center;
  }
  .cat-stats {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--mono);
    flex: 1;
  }
  .cat-recall {
    font-size: 13px;
    font-family: var(--mono);
    font-weight: 600;
  }

  /* Category colors */
  .badge-direct    { background: rgba(10, 132, 255, 0.2); color: #4da6ff; }
  .badge-synonym   { background: rgba(191, 90, 242, 0.2); color: #d08ef5; }
  .badge-context   { background: rgba(255, 214, 10, 0.2);  color: #ffd60a; }
  .badge-cross_deck{ background: rgba(48, 209, 88, 0.2);  color: #30d158; }
  .badge-typo      { background: rgba(255, 69, 58, 0.2);   color: #ff6b63; }

  /* ── Filter bar ── */
  .filter-bar {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .filter-btn {
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .filter-btn:hover { background: var(--bg-card); color: var(--text); }
  .filter-btn.active {
    background: var(--bg-card);
    color: var(--text);
    border-color: #555;
  }

  /* ── Table ── */
  .table-wrap {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  thead th {
    background: var(--bg-deep);
    padding: 10px 14px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--text-muted);
    text-align: left;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  tbody tr.data-row {
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.1s;
  }
  tbody tr.data-row:last-of-type { border-bottom: none; }
  tbody tr.data-row:hover { background: var(--bg-hover); }
  tbody td {
    padding: 10px 14px;
    vertical-align: middle;
  }
  .td-id {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .td-query {
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .td-rank {
    font-family: var(--mono);
    font-size: 12px;
    text-align: center;
  }
  .td-steps {
    white-space: nowrap;
  }
  /* ── Trace row ── */
  tr.trace-row td {
    padding: 0;
    background: var(--bg-deep);
    border-bottom: 1px solid var(--border);
  }
  .trace-inner {
    padding: 14px 20px;
    display: none;
  }
  .trace-inner.open {
    display: block;
  }
  .trace-pre {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-muted);
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.6;
    max-height: 400px;
    overflow-y: auto;
  }

  /* ── Status pill ── */
  .status-pass {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: rgba(48, 209, 88, 0.15);
    color: var(--green);
  }
  .status-fail {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: rgba(255, 69, 58, 0.15);
    color: var(--red);
  }

  /* ── Tooltip ── */
  .tip {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    font-size: 9px;
    font-weight: 700;
    color: var(--text-muted);
    cursor: default;
    margin-left: 5px;
    flex-shrink: 0;
    vertical-align: middle;
  }
  .tip::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 7px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-overlay, #3A3A3C);
    color: var(--text);
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.45;
    white-space: normal;
    width: 220px;
    padding: 8px 10px;
    border-radius: 7px;
    border: 1px solid var(--border);
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s ease;
    z-index: 100;
  }
  .tip:hover::after {
    opacity: 1;
  }

  /* ── Step dot (numbered) ── */
  .step-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    margin-right: 3px;
    vertical-align: middle;
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 700;
    color: var(--bg-deep);
    line-height: 1;
  }

  /* ── Spinner ── */
  .spinner {
    display: none;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner.active { display: inline-block; }

  /* ── Empty state ── */
  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-muted);
  }

  /* ── Error banner ── */
  .error-banner {
    display: none;
    background: rgba(255, 69, 58, 0.15);
    border: 1px solid rgba(255, 69, 58, 0.4);
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 16px;
    color: var(--red);
    font-size: 13px;
  }
  .error-banner.visible { display: block; }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>Retrieval Benchmark</h1>
    <div class="timestamp" id="timestamp">Loading…</div>
  </div>
  <div class="header-right">
    <div style="display:flex;gap:6px;margin-right:16px">
      <button class="btn btn-primary" style="font-size:13px" id="tab-benchmark" onclick="switchTab('benchmark')">Benchmark</button>
      <button class="btn" style="font-size:13px" id="tab-router" onclick="switchTab('router')">Router Test</button>
      <button class="btn" style="font-size:13px" id="tab-docs" onclick="switchTab('docs')">System Docs</button>
    </div>
    <button class="btn" id="btn-generate" onclick="handleGenerate()">
      <span class="spinner" id="spin-generate"></span>
      Regenerate Cases
    </button>
    <button class="btn btn-primary" id="btn-run" onclick="handleRun()">
      <span class="spinner" id="spin-run"></span>
      Re-Run Benchmark
    </button>
  </div>
</div>

<div class="error-banner" id="error-banner"></div>

<!-- Docs Tab (hidden by default) -->
<div id="docs-panel" style="display:none;background:#1c1c1e;border-radius:12px;padding:24px 32px;border:1px solid #2c2c2e;max-width:900px;margin:0 auto;font-size:14px;line-height:1.8;color:#e5e5e7">
  <div id="docs-content" style="white-space:pre-wrap;font-family:-apple-system,BlinkMacSystemFont,'SF Pro',sans-serif">Loading docs...</div>
  <div style="margin-top:16px;padding-top:12px;border-top:1px solid #2c2c2e;font-size:11px;color:#636366" id="docs-path"></div>
</div>

<!-- Router Tab (hidden by default) -->
<div id="router-panel" style="display:none">
  <div class="summary-row" id="router-summary-row">
    <!-- filled by JS -->
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Category</th>
          <th>Query</th>
          <th>Card Context</th>
          <th style="text-align:center">Coverage</th>
          <th style="text-align:center">Relevance</th>
        </tr>
      </thead>
      <tbody id="router-table-body">
        <tr><td colspan="6"><div class="empty-state">Loading router results...</div></td></tr>
      </tbody>
    </table>
  </div>
</div>

<!-- Benchmark Tab -->
<div id="benchmark-panel">

<div class="summary-row" id="summary-row">
  <!-- filled by JS -->
</div>

<div class="filter-bar" id="filter-bar">
  <!-- filled by JS -->
</div>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Category</th>
        <th>Query</th>
        <th style="text-align:center">Rank</th>
        <th>Steps</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody id="table-body">
      <tr><td colspan="6"><div class="empty-state">Loading results…</div></td></tr>
    </tbody>
  </table>
</div>

</div>

<script>
function switchTab(tab) {
  var bp = document.getElementById('benchmark-panel');
  var dp = document.getElementById('docs-panel');
  var rp = document.getElementById('router-panel');
  var tbtn = document.getElementById('tab-benchmark');
  var dbtn = document.getElementById('tab-docs');
  var rbtn = document.getElementById('tab-router');
  // Hide all panels
  bp.style.display = 'none';
  dp.style.display = 'none';
  rp.style.display = 'none';
  // Deactivate all tab buttons
  tbtn.classList.remove('btn-primary');
  dbtn.classList.remove('btn-primary');
  rbtn.classList.remove('btn-primary');
  if (tab === 'docs') {
    dp.style.display = 'block';
    dbtn.classList.add('btn-primary');
    loadDocs();
  } else if (tab === 'router') {
    rp.style.display = 'block';
    rbtn.classList.add('btn-primary');
    loadRouterResults();
  } else {
    bp.style.display = 'block';
    tbtn.classList.add('btn-primary');
  }
}

function loadDocs() {
  fetch('/api/docs').then(function(r) { return r.json(); }).then(function(data) {
    var el = document.getElementById('docs-content');
    var pathEl = document.getElementById('docs-path');
    // Server-rendered HTML from our own docs files (trusted input)
    el.innerHTML = data.html || '<p>No docs found</p>';
    el.style.whiteSpace = 'normal';
    el.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'SF Pro', sans-serif";
    el.style.fontSize = '14px';
    el.style.lineHeight = '1.7';
    if (pathEl) pathEl.textContent = 'Source: ' + (data.path || '');
  }).catch(function(e) {
    document.getElementById('docs-content').textContent = 'Failed to load: ' + e;
  });
}
</script>

<script>
// ── Constants ────────────────────────────────────────────────────────────────

const STEP_KEYS = ['term_extraction','kg_expansion','sql_search','semantic_search','rrf_ranking','confidence'];
const STEP_LABELS = {
  term_extraction:  '① term extraction',
  kg_expansion:     '② kg expansion',
  sql_search:       '③ sql search',
  semantic_search:  '④ semantic search',
  rrf_ranking:      '⑤ rrf ranking',
  confidence:       '⑥ confidence',
};
const STEP_NUMBERS = {
  term_extraction:  1,
  kg_expansion:     2,
  sql_search:       3,
  semantic_search:  4,
  rrf_ranking:      5,
  confidence:       6,
};
const STEP_TOOLTIPS = {
  term_extraction:  'Welche Wörter werden aus deiner Frage extrahiert? Score = Anteil der erwarteten Fachbegriffe gefunden.',
  kg_expansion:     'Findet das KG verwandte Begriffe? z.B. Dünndarm → Jejunum, Ileum. Score = Anteil gefundener Synonyme.',
  sql_search:       'Findet die Keyword-Suche die richtige Karte? Durchsucht alle Karten nach den generierten Suchbegriffen.',
  semantic_search:  'Findet die Embedding-Suche die richtige Karte? Vergleicht Bedeutung der Frage mit allen Karten-Embeddings.',
  rrf_ranking:      'Wie gut ist das finale Ranking? Kombiniert SQL + Semantic mathematisch. Score = 1/Rang der Zielkarte.',
  confidence:       'Erkennt das System ob es eine Antwort hat? High = Antwort da, Low = Web-Suche nötig.',
};
const CAT_TOOLTIPS = {
  direct:     'Frage nutzt gleiche Begriffe wie die Karte. Einfachster Fall.',
  synonym:    'Frage nutzt andere Fachbegriffe als die Karte. Testet KG-Expansion.',
  context:    'Vage Frage wie "Erkläre das genauer" + Kartenkontext. Testet Kontextverständnis.',
  cross_deck: 'Frage zu einer Karte in einem anderen Deck. Testet Collection-weite Suche.',
  typo:       'Frage mit Tippfehler im Fachbegriff. Testet Embedding-Fuzzy-Matching.',
};
const CATEGORY_FILTERS = ['all','pass','fail','direct','synonym','context','cross_deck','typo'];
const CAT_BADGE_CLASS = {
  direct:     'badge-direct',
  synonym:    'badge-synonym',
  context:    'badge-context',
  cross_deck: 'badge-cross_deck',
  typo:       'badge-typo',
};

// ── State ────────────────────────────────────────────────────────────────────

let _data = null;
let _activeFilter = 'all';

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(v) {
  if (v >= 0.8) return 'var(--green)';
  if (v >= 0.5) return 'var(--yellow)';
  return 'var(--red)';
}

function recallClass(v) {
  if (v >= 0.8) return 'color-green';
  if (v >= 0.5) return 'color-yellow';
  return 'color-red';
}

function pct(v) {
  return Math.round(v * 100) + '%';
}

function safeText(str) {
  // returns a Text node — never touches innerHTML
  return document.createTextNode(String(str == null ? '' : str));
}

function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

// ── Render: Summary Row ──────────────────────────────────────────────────────

function renderSummary(agg) {
  const row = document.getElementById('summary-row');
  row.textContent = '';

  const overall = agg.overall;

  // ── Recall card ──
  const recallCard = el('div', 'recall-card');
  const rl = el('div', 'recall-label');
  rl.appendChild(safeText('Recall@10'));
  const rlTip = el('span', 'tip');
  rlTip.appendChild(safeText('?'));
  rlTip.setAttribute('data-tooltip', 'Prozentsatz der Fragen, bei denen die richtige Karte in den Top-10 Ergebnissen landet. Höher = besser.');
  rl.appendChild(rlTip);
  recallCard.appendChild(rl);

  const rv = el('div', 'recall-value ' + recallClass(overall.recall_at_k));
  rv.appendChild(safeText(pct(overall.recall_at_k)));
  recallCard.appendChild(rv);

  const rs = el('div', 'recall-sub');
  rs.appendChild(safeText(overall.passed + ' / ' + overall.total_cases + ' passed  ·  MRR ' + overall.mrr.toFixed(3)));
  recallCard.appendChild(rs);

  // Top-3 quality reference line
  const top3 = overall.recall_at_3 != null ? overall.recall_at_3 : 0;
  const top3Count = overall.top3_passed != null ? overall.top3_passed : 0;
  const top3Line = el('div', 'recall-sub');
  top3Line.style.marginTop = '4px';
  top3Line.style.color = scoreColor(top3);
  top3Line.appendChild(safeText('Top-3: ' + pct(top3) + ' (' + top3Count + '/' + overall.total_cases + ')'));
  recallCard.appendChild(top3Line);

  row.appendChild(recallCard);

  // ── By Step card ──
  const stepCard = el('div', 'metric-card');
  const sh = el('h3');
  sh.appendChild(safeText('Pipeline Steps'));
  stepCard.appendChild(sh);

  STEP_KEYS.forEach(key => {
    const score = (agg.by_step && agg.by_step[key] != null) ? agg.by_step[key] : 0;
    const srow = el('div', 'step-row');

    const nameEl = el('div', 'step-name');
    nameEl.appendChild(safeText(STEP_LABELS[key] || key));
    const stepTip = el('span', 'tip');
    stepTip.appendChild(safeText('?'));
    stepTip.setAttribute('data-tooltip', STEP_TOOLTIPS[key] || '');
    nameEl.appendChild(stepTip);
    srow.appendChild(nameEl);

    const barBg = el('div', 'step-bar-bg');
    const barFill = el('div', 'step-bar-fill');
    barFill.style.width = pct(score);
    barFill.style.background = scoreColor(score);
    barBg.appendChild(barFill);
    srow.appendChild(barBg);

    const scoreEl = el('div', 'step-score');
    scoreEl.style.color = scoreColor(score);
    scoreEl.appendChild(safeText(pct(score)));
    srow.appendChild(scoreEl);

    stepCard.appendChild(srow);
  });
  row.appendChild(stepCard);

  // ── By Category card ──
  const catCard = el('div', 'metric-card');
  const ch = el('h3');
  ch.appendChild(safeText('By Category'));
  catCard.appendChild(ch);

  const byCat = agg.by_category || {};
  Object.entries(byCat).forEach(([cat, info]) => {
    const crow = el('div', 'cat-row');

    const badgeWrap = el('span');
    badgeWrap.style.display = 'inline-flex';
    badgeWrap.style.alignItems = 'center';
    const badge = el('span', 'cat-badge ' + (CAT_BADGE_CLASS[cat] || ''));
    badge.appendChild(safeText(cat));
    badgeWrap.appendChild(badge);
    if (CAT_TOOLTIPS[cat]) {
      const catTip = el('span', 'tip');
      catTip.appendChild(safeText('?'));
      catTip.setAttribute('data-tooltip', CAT_TOOLTIPS[cat]);
      badgeWrap.appendChild(catTip);
    }
    crow.appendChild(badgeWrap);

    const stats = el('span', 'cat-stats');
    stats.appendChild(safeText(info.passed + '/' + info.cases));
    crow.appendChild(stats);

    const recallEl = el('span', 'cat-recall');
    recallEl.style.color = scoreColor(info.recall);
    recallEl.appendChild(safeText(pct(info.recall)));
    crow.appendChild(recallEl);

    catCard.appendChild(crow);
  });
  row.appendChild(catCard);
}

// ── Render: Filter Bar ───────────────────────────────────────────────────────

function renderFilters() {
  const bar = document.getElementById('filter-bar');
  bar.textContent = '';
  CATEGORY_FILTERS.forEach(f => {
    const btn = el('button', 'filter-btn' + (f === _activeFilter ? ' active' : ''));
    btn.appendChild(safeText(f));
    btn.addEventListener('click', () => {
      _activeFilter = f;
      renderFilters();
      renderTable(_data.cases);
    });
    bar.appendChild(btn);
  });
}

// ── Render: Table ────────────────────────────────────────────────────────────

function getFilteredCases(cases) {
  return cases.filter(c => {
    if (_activeFilter === 'all')  return true;
    if (_activeFilter === 'pass') return c.overall_pass === true;
    if (_activeFilter === 'fail') return c.overall_pass === false;
    return c.category === _activeFilter;
  });
}

function renderTable(cases) {
  const tbody = document.getElementById('table-body');
  tbody.textContent = '';

  const filtered = getFilteredCases(cases);

  if (filtered.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.setAttribute('colspan', '6');
    const empty = el('div', 'empty-state');
    empty.appendChild(safeText('No cases match this filter.'));
    cell.appendChild(empty);
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  filtered.forEach(c => {
    // ── Data row ──
    const tr = el('tr', 'data-row');
    tr.dataset.id = c.id;

    // ID
    const tdId = el('td', 'td-id');
    tdId.appendChild(safeText(c.id));
    tr.appendChild(tdId);

    // Category badge
    const tdCat = document.createElement('td');
    const badge = el('span', 'cat-badge ' + (CAT_BADGE_CLASS[c.category] || ''));
    badge.appendChild(safeText(c.category));
    tdCat.appendChild(badge);
    tr.appendChild(tdCat);

    // Query
    const tdQ = el('td', 'td-query');
    tdQ.appendChild(safeText(c.query));
    tr.appendChild(tdQ);

    // Rank — color-coded: green (1-3), yellow (4-10), red (>10 or missing)
    const tdRank = el('td', 'td-rank');
    const rank = c.target_rank != null ? '#' + c.target_rank : '—';
    const rankColor = (c.target_rank != null && c.target_rank <= 3)
      ? 'var(--green)' : (c.target_rank != null && c.target_rank <= 10)
      ? 'var(--yellow)' : 'var(--red)';
    tdRank.style.color = rankColor;
    tdRank.appendChild(safeText(rank));
    tr.appendChild(tdRank);

    // Step dots (numbered)
    const tdSteps = el('td', 'td-steps');
    STEP_KEYS.forEach(key => {
      const step = (c.steps && c.steps[key]) ? c.steps[key] : null;
      const score = step ? (step.score != null ? step.score : 0) : 0;
      const dot = el('span', 'step-dot');
      dot.style.background = scoreColor(score);
      dot.appendChild(safeText(String(STEP_NUMBERS[key] || '')));
      dot.setAttribute('title', key + ': ' + pct(score));
      tdSteps.appendChild(dot);
    });
    tr.appendChild(tdSteps);

    // Status
    const tdStatus = document.createElement('td');
    const statusPill = el('span', c.overall_pass ? 'status-pass' : 'status-fail');
    statusPill.appendChild(safeText(c.overall_pass ? 'pass' : 'fail'));
    tdStatus.appendChild(statusPill);
    tr.appendChild(tdStatus);

    tbody.appendChild(tr);

    // ── Trace row (hidden by default) ──
    const traceRow = el('tr', 'trace-row');
    traceRow.dataset.traceFor = c.id;
    const traceTd = document.createElement('td');
    traceTd.setAttribute('colspan', '6');

    const traceInner = el('div', 'trace-inner');
    traceInner.id = 'trace-' + c.id;

    const pre = el('pre', 'trace-pre');
    pre.appendChild(safeText(JSON.stringify(c, null, 2)));
    traceInner.appendChild(pre);
    traceTd.appendChild(traceInner);
    traceRow.appendChild(traceTd);
    tbody.appendChild(traceRow);

    // Toggle on click
    tr.addEventListener('click', () => {
      const inner = document.getElementById('trace-' + c.id);
      if (inner) inner.classList.toggle('open');
    });
  });
}

// ── Load Results ─────────────────────────────────────────────────────────────

async function loadResults() {
  try {
    const resp = await fetch('/api/results');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    _data = await resp.json();

    const ts = document.getElementById('timestamp');
    ts.textContent = '';
    const tsText = (_data.aggregate && _data.aggregate.timestamp)
      ? 'Last run: ' + _data.aggregate.timestamp
      : 'Last run: unknown';
    ts.appendChild(document.createTextNode(tsText));

    renderSummary(_data.aggregate);
    renderFilters();
    renderTable(_data.cases || []);
    hideError();
  } catch (err) {
    showError('Failed to load results: ' + err.message);
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────

function showError(msg) {
  const banner = document.getElementById('error-banner');
  banner.textContent = '';
  banner.appendChild(document.createTextNode(msg));
  banner.classList.add('visible');
}

function hideError() {
  document.getElementById('error-banner').classList.remove('visible');
}

async function handleRun() {
  const btn = document.getElementById('btn-run');
  const spin = document.getElementById('spin-run');
  btn.disabled = true;
  spin.classList.add('active');
  hideError();
  try {
    const resp = await fetch('/api/run', { method: 'POST' });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error('Run failed: ' + body);
    }
    await loadResults();
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    spin.classList.remove('active');
  }
}

async function handleGenerate() {
  const btn = document.getElementById('btn-generate');
  const spin = document.getElementById('spin-generate');
  btn.disabled = true;
  spin.classList.add('active');
  hideError();
  try {
    const resp = await fetch('/api/generate', { method: 'POST' });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error('Generate failed: ' + body);
    }
    await loadResults();
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    spin.classList.remove('active');
  }
}

// ── Router Tab ───────────────────────────────────────────────────────────────

let _routerData = null;

function renderRouterSummary(agg) {
  const row = document.getElementById('router-summary-row');
  row.textContent = '';

  const overall = agg.overall || {};

  // ── Coverage card ──
  const covCard = el('div', 'recall-card');
  const covLabel = el('div', 'recall-label');
  covLabel.appendChild(safeText('Term Coverage'));
  const covTip = el('span', 'tip');
  covTip.appendChild(safeText('?'));
  covTip.setAttribute('data-tooltip', 'Anteil der erwarteten Fachbegriffe, die im Router-Output (resolved_intent / reasoning / queries) vorkommen.');
  covLabel.appendChild(covTip);
  covCard.appendChild(covLabel);

  const covVal = el('div', 'recall-value ' + recallClass(overall.avg_term_coverage || 0));
  covVal.appendChild(safeText(pct(overall.avg_term_coverage || 0)));
  covCard.appendChild(covVal);

  const covSub = el('div', 'recall-sub');
  covSub.appendChild(safeText((overall.successful || 0) + ' / ' + (overall.total_cases || 0) + ' successful'));
  covCard.appendChild(covSub);
  row.appendChild(covCard);

  // ── Relevance card ──
  const relCard = el('div', 'recall-card');
  const relLabel = el('div', 'recall-label');
  relLabel.appendChild(safeText('Relevance'));
  const relTip = el('span', 'tip');
  relTip.appendChild(safeText('?'));
  relTip.setAttribute('data-tooltip', 'Cosine Similarity zwischen Router-Output-Embedding und Expected-Terms-Embedding. Misst semantische Nähe.');
  relLabel.appendChild(relTip);
  relCard.appendChild(relLabel);

  const relVal = el('div', 'recall-value ' + recallClass(overall.avg_relevance || 0));
  relVal.appendChild(safeText(pct(overall.avg_relevance || 0)));
  relCard.appendChild(relVal);

  const relSub = el('div', 'recall-sub');
  relSub.appendChild(safeText((overall.errors || 0) + ' errors'));
  relCard.appendChild(relSub);
  row.appendChild(relCard);

  // ── By Category card ──
  const catCard = el('div', 'metric-card');
  const ch = el('h3');
  ch.appendChild(safeText('By Category'));
  catCard.appendChild(ch);

  const byCat = agg.by_category || {};
  Object.entries(byCat).forEach(function(entry) {
    var cat = entry[0], info = entry[1];
    const crow = el('div', 'cat-row');

    const badge = el('span', 'cat-badge ' + (CAT_BADGE_CLASS[cat] || ''));
    badge.appendChild(safeText(cat));
    crow.appendChild(badge);

    const stats = el('span', 'cat-stats');
    stats.appendChild(safeText(info.cases + ' cases'));
    crow.appendChild(stats);

    const covSpan = el('span', 'cat-recall');
    covSpan.style.color = scoreColor(info.avg_coverage || 0);
    covSpan.appendChild(safeText('cov ' + pct(info.avg_coverage || 0)));
    crow.appendChild(covSpan);

    const relSpan = el('span', 'cat-recall');
    relSpan.style.color = scoreColor(info.avg_relevance || 0);
    relSpan.style.marginLeft = '8px';
    relSpan.appendChild(safeText('rel ' + pct(info.avg_relevance || 0)));
    crow.appendChild(relSpan);

    catCard.appendChild(crow);
  });
  row.appendChild(catCard);
}

function renderRouterTable(cases) {
  const tbody = document.getElementById('router-table-body');
  tbody.textContent = '';

  if (!cases || cases.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.setAttribute('colspan', '6');
    const empty = el('div', 'empty-state');
    empty.appendChild(safeText('No router results yet. Run: python3 scripts/benchmark_router.py'));
    cell.appendChild(empty);
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  cases.forEach(function(c) {
    // ── Data row ──
    const tr = el('tr', 'data-row');
    tr.dataset.id = c.id;

    // ID
    const tdId = el('td', 'td-id');
    tdId.appendChild(safeText(c.id));
    tr.appendChild(tdId);

    // Category badge
    const tdCat = document.createElement('td');
    const badge = el('span', 'cat-badge ' + (CAT_BADGE_CLASS[c.category] || ''));
    badge.appendChild(safeText(c.category));
    tdCat.appendChild(badge);
    tr.appendChild(tdCat);

    // Query
    const tdQ = el('td', 'td-query');
    tdQ.appendChild(safeText(c.query));
    tr.appendChild(tdQ);

    // Card Context (short)
    const tdCtx = el('td', 'td-query');
    tdCtx.style.maxWidth = '180px';
    var ctxText = '';
    if (c.card_context && c.card_context.question) {
      ctxText = c.card_context.question;
    }
    tdCtx.appendChild(safeText(ctxText));
    tr.appendChild(tdCtx);

    // Coverage
    const tdCov = el('td', 'td-rank');
    var covColor = scoreColor(c.term_coverage || 0);
    tdCov.style.color = covColor;
    tdCov.appendChild(safeText(pct(c.term_coverage || 0)));
    tr.appendChild(tdCov);

    // Relevance
    const tdRel = el('td', 'td-rank');
    var relColor = scoreColor(c.relevance || 0);
    tdRel.style.color = relColor;
    tdRel.appendChild(safeText(pct(c.relevance || 0)));
    tr.appendChild(tdRel);

    tbody.appendChild(tr);

    // ── Trace row (hidden by default) ──
    const traceRow = el('tr', 'trace-row');
    traceRow.dataset.traceFor = c.id;
    const traceTd = document.createElement('td');
    traceTd.setAttribute('colspan', '6');

    const traceInner = el('div', 'trace-inner');
    traceInner.id = 'router-trace-' + c.id;

    const pre = el('pre', 'trace-pre');
    var traceData = {
      router_response: c.router_response || {},
      term_coverage: c.term_coverage,
      missed_terms: c.missed_terms || [],
      relevance: c.relevance,
    };
    if (c.error) traceData.error = c.error;
    pre.appendChild(safeText(JSON.stringify(traceData, null, 2)));
    traceInner.appendChild(pre);
    traceTd.appendChild(traceInner);
    traceRow.appendChild(traceTd);
    tbody.appendChild(traceRow);

    // Toggle on click
    tr.addEventListener('click', function() {
      var inner = document.getElementById('router-trace-' + c.id);
      if (inner) inner.classList.toggle('open');
    });
  });
}

async function loadRouterResults() {
  try {
    const resp = await fetch('/api/router_results');
    if (!resp.ok) {
      if (resp.status === 404) {
        renderRouterTable([]);
        return;
      }
      throw new Error('HTTP ' + resp.status);
    }
    _routerData = await resp.json();
    renderRouterSummary(_routerData.aggregate || {});
    renderRouterTable(_routerData.cases || []);
    hideError();
  } catch (err) {
    showError('Failed to load router results: ' + err.message);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

loadResults();
</script>
</body>
</html>
"""

# ── Markdown → HTML Renderer (stdlib only) ────────────────────────────────────


def _render_markdown(text):
    """Convert markdown to styled HTML.

    Only used for rendering our own documentation files (trusted input),
    so HTML safety is not a concern.  Handles: headings, bold, inline code,
    fenced code blocks, tables, bullet lists, and blank-line breaks.
    """
    lines = text.split("\n")
    html_parts = []
    in_code_block = False
    code_lang = ""
    code_lines = []
    in_table = False
    table_rows = []

    _h_style = (
        "font-family:-apple-system,BlinkMacSystemFont,'SF Pro',sans-serif;"
        "color:#e5e5ea;margin:20px 0 10px 0;font-weight:600;letter-spacing:-0.3px;"
    )
    _code_bg = "background:#141416;border:1px solid #2c2c2e;border-radius:8px;padding:16px 20px;"
    _inline_code = (
        "background:#242426;padding:2px 6px;border-radius:4px;font-family:'SF Mono',Menlo,monospace;"
        "font-size:12px;color:#e5e5ea;"
    )
    _td_style = "padding:8px 14px;border-bottom:1px solid #2c2c2e;font-size:13px;"
    _th_style = (
        "padding:8px 14px;border-bottom:1px solid #2c2c2e;font-size:11px;"
        "font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#636366;text-align:left;"
    )

    def _flush_table():
        if not table_rows:
            return ""
        out = '<table style="width:100%;border-collapse:collapse;margin:12px 0;">'
        for i, row_cells in enumerate(table_rows):
            # Skip separator rows (|---|---|)
            if all(_re.match(r"^[-:]+$", c.strip()) for c in row_cells):
                continue
            tag = "th" if i == 0 else "td"
            style = _th_style if i == 0 else _td_style
            out += "<tr>"
            for cell in row_cells:
                out += '<%s style="%s">%s</%s>' % (tag, style, cell.strip(), tag)
            out += "</tr>"
        out += "</table>"
        return out

    def _inline(line):
        """Process inline formatting: bold, inline code."""
        # Inline code first (so bold inside code is not processed)
        line = _re.sub(
            r"`([^`]+)`",
            r'<code style="%s">\1</code>' % _inline_code,
            line,
        )
        # Bold
        line = _re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", line)
        return line

    for line in lines:
        stripped = line.strip()

        # Fenced code blocks
        if stripped.startswith("```"):
            if in_code_block:
                # End code block
                escaped = "\n".join(code_lines)
                html_parts.append(
                    '<pre style="%sfont-family:\'SF Mono\',Menlo,monospace;font-size:12px;'
                    'color:#acb0b6;line-height:1.6;overflow-x:auto;margin:12px 0;white-space:pre-wrap;">'
                    "<code>%s</code></pre>" % (_code_bg, escaped)
                )
                code_lines = []
                in_code_block = False
            else:
                # Flush any open table
                if in_table:
                    html_parts.append(_flush_table())
                    table_rows = []
                    in_table = False
                in_code_block = True
                code_lang = stripped[3:].strip()
            continue

        if in_code_block:
            code_lines.append(line)
            continue

        # Table rows
        if "|" in stripped and stripped.startswith("|"):
            cells = [c for c in stripped.split("|")[1:-1]]  # strip outer empty cells
            if cells:
                if not in_table:
                    in_table = True
                table_rows.append(cells)
                continue

        # Flush table if we left table context
        if in_table:
            html_parts.append(_flush_table())
            table_rows = []
            in_table = False

        # Headings
        if stripped.startswith("### "):
            html_parts.append(
                '<h3 style="%sfont-size:15px;">%s</h3>' % (_h_style, _inline(stripped[4:]))
            )
        elif stripped.startswith("## "):
            html_parts.append(
                '<h2 style="%sfont-size:17px;margin-top:28px;">%s</h2>' % (_h_style, _inline(stripped[3:]))
            )
        elif stripped.startswith("# "):
            html_parts.append(
                '<h1 style="%sfont-size:22px;margin-top:32px;">%s</h1>' % (_h_style, _inline(stripped[2:]))
            )
        # Bullet list items
        elif stripped.startswith("- ") or stripped.startswith("* "):
            html_parts.append(
                '<div style="padding:2px 0 2px 16px;font-size:14px;line-height:1.7;">'
                '<span style="color:#636366;margin-right:8px;">&#x2022;</span>%s</div>'
                % _inline(stripped[2:])
            )
        # Numbered list items
        elif _re.match(r"^\d+\.\s", stripped):
            match = _re.match(r"^(\d+)\.\s(.*)", stripped)
            if match:
                html_parts.append(
                    '<div style="padding:2px 0 2px 16px;font-size:14px;line-height:1.7;">'
                    '<span style="color:#636366;margin-right:8px;">%s.</span>%s</div>'
                    % (match.group(1), _inline(match.group(2)))
                )
        # Empty line = break
        elif stripped == "":
            html_parts.append("<br>")
        # Normal paragraph
        else:
            html_parts.append(
                '<p style="font-size:14px;line-height:1.7;margin:4px 0;">%s</p>'
                % _inline(stripped)
            )

    # Flush remaining table
    if in_table:
        html_parts.append(_flush_table())

    return "\n".join(html_parts)


# ── HTTP Handler ──────────────────────────────────────────────────────────────


class BenchmarkHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):  # noqa: A002
        """Suppress default request logging; print cleaner output."""
        print(f"  {self.command} {self.path} → {args[1] if len(args) > 1 else '?'}")

    def _send(self, code, content_type, body):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, code, data):
        self._send(code, "application/json", json.dumps(data))

    def _send_error_json(self, code, message):
        self._send_json(code, {"error": message})

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self._send(200, "text/html; charset=utf-8", DASHBOARD_HTML)

        elif self.path == "/api/results":
            if not os.path.isfile(RESULTS_PATH):
                self._send_error_json(404, "results.json not found")
                return
            try:
                with open(RESULTS_PATH, "r", encoding="utf-8") as fh:
                    raw = fh.read()
                self._send(200, "application/json", raw)
            except OSError as exc:
                self._send_error_json(500, str(exc))

        elif self.path == "/api/router_results":
            if not os.path.isfile(ROUTER_RESULTS_PATH):
                self._send_error_json(404, "router_results.json not found")
                return
            try:
                with open(ROUTER_RESULTS_PATH, "r", encoding="utf-8") as fh:
                    raw = fh.read()
                self._send(200, "application/json", raw)
            except OSError as exc:
                self._send_error_json(500, str(exc))

        elif self.path == "/api/docs":
            if not os.path.isfile(DOCS_PATH):
                self._send_json(200, {"html": "<p>No docs found. Expected at: docs/reference/RETRIEVAL_SYSTEM.md</p>", "path": ""})
                return
            try:
                with open(DOCS_PATH, "r", encoding="utf-8") as fh:
                    content = fh.read()
                rendered_html = _render_markdown(content)
                self._send_json(200, {"html": rendered_html, "path": DOCS_PATH})
            except OSError as exc:
                self._send_error_json(500, str(exc))

        else:
            self._send(404, "text/plain", "Not found")

    def do_POST(self):
        if self.path == "/api/run":
            self._run_script(BENCHMARK_RUN_SCRIPT)

        elif self.path == "/api/generate":
            self._run_script(BENCHMARK_GENERATE_SCRIPT)

        elif self.path == "/api/run_router":
            self._run_script(BENCHMARK_ROUTER_SCRIPT)

        else:
            self._send(404, "text/plain", "Not found")

    def _run_script(self, script_path):
        if not os.path.isfile(script_path):
            self._send_error_json(404, f"Script not found: {script_path}")
            return
        try:
            result = subprocess.run(
                [sys.executable, script_path],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                timeout=300,
            )
            if result.returncode != 0:
                output = (result.stderr or result.stdout or "").strip()
                self._send_error_json(
                    500,
                    f"Script exited with code {result.returncode}: {output[:500]}",
                )
            else:
                self._send_json(200, {"ok": True, "stdout": result.stdout[-2000:]})
        except subprocess.TimeoutExpired:
            self._send_error_json(504, "Script timed out after 300 seconds")
        except OSError as exc:
            self._send_error_json(500, str(exc))


# ── Entry Point ───────────────────────────────────────────────────────────────


def main():
    host = "localhost"
    port = 8080
    server = HTTPServer((host, port), BenchmarkHandler)
    url = f"http://{host}:{port}"
    print(f"Benchmark Dashboard running at {url}")
    print("Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
