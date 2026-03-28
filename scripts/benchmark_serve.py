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
DESIGN_CSS_PATH = os.path.join(PROJECT_ROOT, "shared", "styles", "design-system.css")
HISTORY_DIR = os.path.join(PROJECT_ROOT, "benchmark", "history")

# ── HTML Dashboard ────────────────────────────────────────────────────────────

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AnkiPlus Dev Hub</title>
<link rel="stylesheet" href="/design-system.css">
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>mermaid.initialize({startOnLoad:false, theme:'dark', themeVariables:{primaryColor:'#0a84ff',primaryTextColor:'#e5e5ea',lineColor:'#636366',secondaryColor:'#1c1c1e',tertiaryColor:'#242426'}});</script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    /* Aliases → Design System tokens */
    --bg-deep:    var(--ds-bg-deep);
    --bg-card:    var(--ds-bg-canvas);
    --bg-hover:   var(--ds-bg-overlay);
    --border:     var(--ds-border-medium);
    --text:       var(--ds-text-primary);
    --text-muted: var(--ds-text-secondary);
    --green:      var(--ds-green);
    --yellow:     var(--ds-yellow);
    --red:        var(--ds-red);
    --blue:       var(--ds-accent);
    --purple:     var(--ds-purple);
    --mono:       var(--ds-font-mono);
    --sans:       var(--ds-font-sans);
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
    margin-bottom: 0;
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

  /* ── Sub-navigation ── */
  .subnav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0 16px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }
  .subnav-tabs {
    display: flex;
    gap: 4px;
  }
  .subnav-btn {
    padding: 6px 14px;
    border-radius: var(--ds-radius-sm);
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .subnav-btn:hover { background: var(--ds-hover-tint); color: var(--text); }
  .subnav-btn.active { background: var(--ds-active-tint); color: var(--text); }
  .subnav-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  /* ── Version picker ── */
  .version-picker {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .version-btn {
    padding: 5px 10px;
    border-radius: var(--ds-radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text-muted);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: background 0.12s;
  }
  .version-btn:hover { background: var(--bg-hover); color: var(--text); }
  .version-dropdown {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--ds-radius-md);
    box-shadow: var(--ds-shadow-md);
    min-width: 340px;
    max-height: 320px;
    overflow-y: auto;
    z-index: 50;
    padding: 6px;
  }
  .version-dropdown.open { display: block; }
  .version-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.1s;
    gap: 10px;
  }
  .version-item:hover { background: var(--ds-hover-tint); }
  .version-item.active { background: var(--ds-accent-10); }
  .version-ts { font-family: var(--mono); color: var(--text-muted); font-size: 11px; }
  .version-recall { font-family: var(--mono); font-weight: 600; min-width: 40px; text-align: right; }
  .version-config { font-size: 10px; color: var(--text-muted); }
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
  .btn.btn-primary:hover { opacity: 0.85; }
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
  .badge-direct    { background: var(--ds-accent-20); color: var(--ds-accent); }
  .badge-synonym   { background: color-mix(in srgb, var(--ds-purple) 20%, transparent); color: var(--ds-purple); }
  .badge-context   { background: var(--ds-yellow-20); color: var(--ds-yellow); }
  .badge-cross_deck{ background: var(--ds-green-20); color: var(--ds-green); }
  .badge-typo      { background: var(--ds-red-20); color: var(--ds-red); }

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
    border-color: var(--ds-text-tertiary);
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
    background: var(--ds-green-10);
    color: var(--green);
  }
  .status-fail {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: var(--ds-red-10);
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
    box-shadow: var(--ds-shadow-md);
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
    border: 2px solid var(--ds-text-tertiary);
    border-top-color: var(--ds-text-primary);
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
    background: var(--ds-red-10);
    border: 1px solid var(--ds-red-20);
    border-radius: var(--ds-radius-sm);
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
    <h1>AnkiPlus Dev Hub</h1>
  </div>
  <div class="header-right">
    <button class="btn btn-primary" id="tab-top-benchmarks" onclick="switchTopTab('benchmarks')">Benchmarks</button>
    <button class="btn" id="tab-top-design" onclick="switchTopTab('design')">Design System</button>
  </div>
</div>

<!-- Sub-nav for Benchmarks -->
<div class="subnav" id="subnav-benchmarks">
  <div class="subnav-tabs">
    <div class="version-picker" style="margin-right:12px">
      <button class="version-btn" id="version-btn" onclick="toggleVersionPicker()">current</button>
      <div class="version-dropdown" id="version-dropdown"></div>
    </div>
    <button class="subnav-btn active" id="sub-docs" onclick="switchSubTab('docs')">Docs</button>
    <button class="subnav-btn" id="sub-router" onclick="switchSubTab('router')">Router</button>
    <button class="subnav-btn" id="sub-retrieval" onclick="switchSubTab('retrieval')">Retrieval</button>
    <button class="subnav-btn" id="sub-generation" onclick="switchSubTab('generation')">Generation</button>
    <button class="subnav-btn" id="sub-livetest" onclick="switchSubTab('livetest')" style="margin-left:auto;color:var(--ds-accent)">Live Test</button>
  </div>
</div>

<div class="error-banner" id="error-banner"></div>

<!-- Docs Tab (hidden by default) -->
<div id="docs-panel" style="display:none;background:var(--ds-bg-canvas);border-radius:var(--ds-radius-lg);padding:24px 32px;border:1px solid var(--ds-border-medium);max-width:900px;margin:0 auto;font-size:var(--ds-text-md);line-height:1.8;color:var(--ds-text-primary)">
  <div id="docs-content" style="white-space:pre-wrap;font-family:var(--ds-font-sans)">Loading docs...</div>
  <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--ds-border-medium);font-size:var(--ds-text-xs);color:var(--ds-text-secondary)" id="docs-path"></div>
</div>

<!-- Components Tab (hidden by default) -->
<div id="components-panel" style="display:none">
  <div id="components-frame-wrap" style="background:var(--ds-bg-canvas);border-radius:var(--ds-radius-lg);border:1px solid var(--ds-border-medium);overflow:hidden;height:calc(100vh - 120px)">
    <iframe id="components-iframe" src="about:blank" style="width:100%;height:100%;border:none;background:var(--ds-bg-deep)"></iframe>
  </div>
  <div id="components-offline" style="display:none;text-align:center;padding:80px 20px;color:var(--ds-text-secondary)">
    <div style="font-size:var(--ds-text-xl);margin-bottom:12px;color:var(--ds-text-primary)">Component Viewer not running</div>
    <div style="font-size:var(--ds-text-md)">Start the Vite dev server:</div>
    <code style="display:inline-block;margin-top:12px;padding:8px 16px;background:var(--ds-bg-deep);border-radius:var(--ds-radius-sm);font-family:var(--ds-font-mono);font-size:var(--ds-text-sm);color:var(--ds-accent)">cd frontend && npm run dev</code>
  </div>
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

<!-- Generation Tab (placeholder) -->
<div id="generation-panel" style="display:none">
  <div style="background:var(--ds-bg-canvas);border-radius:var(--ds-radius-lg);padding:48px 32px;border:1px solid var(--ds-border-medium);max-width:700px;margin:0 auto;text-align:center">
    <div style="font-size:var(--ds-text-xl);color:var(--ds-text-primary);margin-bottom:12px">Generation Evaluation</div>
    <div style="font-size:var(--ds-text-md);color:var(--ds-text-secondary);line-height:1.7">
      Bewertet die Antwortqualität des Tutor-Modells.<br>
      Input: Frage + gefundene Karten → Output: generierte Antwort.<br>
      Metriken: Vollständigkeit, Korrektheit, Quellennutzung.<br><br>
      <span style="color:var(--ds-text-tertiary)">Wird als nächster Schritt implementiert.</span>
    </div>
  </div>
</div>

<!-- Live Test Tab -->
<div id="livetest-panel" style="display:none">
  <div style="background:var(--ds-bg-canvas);border-radius:var(--ds-radius-lg);padding:32px;border:1px solid var(--ds-border-medium);max-width:700px;margin:0 auto">
    <div style="font-size:var(--ds-text-xl);color:var(--ds-text-primary);margin-bottom:16px">Live Test</div>
    <div style="font-size:var(--ds-text-sm);color:var(--ds-text-secondary);margin-bottom:16px">Teste die Retrieval-Pipeline mit einer einzelnen Frage.</div>
    <div style="display:flex;gap:8px;margin-bottom:20px">
      <input id="livetest-input" type="text" placeholder="z.B. Wie lang ist der Dünndarm?" style="flex:1;padding:10px 14px;border-radius:var(--ds-radius-sm);border:1px solid var(--ds-border-medium);background:var(--ds-bg-deep);color:var(--ds-text-primary);font-family:var(--ds-font-sans);font-size:var(--ds-text-md);outline:none">
      <button class="btn btn-primary" onclick="runLiveTest()" id="livetest-btn">Suchen</button>
    </div>
    <pre id="livetest-output" style="font-family:var(--ds-font-mono);font-size:var(--ds-text-sm);color:var(--ds-text-secondary);white-space:pre-wrap;line-height:1.6;max-height:500px;overflow-y:auto;background:var(--ds-bg-deep);border-radius:var(--ds-radius-sm);padding:16px;display:none"></pre>
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
// ── Two-level navigation ──

let _topTab = 'benchmarks';
let _subTab = 'docs';
let _versionDocs = null; // docs snapshot from selected version

function switchTopTab(tab) {
  _topTab = tab;
  // Top buttons
  document.getElementById('tab-top-benchmarks').classList.toggle('btn-primary', tab === 'benchmarks');
  document.getElementById('tab-top-design').classList.toggle('btn-primary', tab === 'design');
  document.getElementById('tab-top-benchmarks').classList.toggle('btn', true);
  document.getElementById('tab-top-design').classList.toggle('btn', true);
  // Sub-nav visibility
  document.getElementById('subnav-benchmarks').style.display = tab === 'benchmarks' ? 'flex' : 'none';
  // Hide all panels
  ['benchmark', 'router', 'docs', 'components'].forEach(function(p) {
    var el = document.getElementById(p + '-panel');
    if (el) el.style.display = 'none';
  });
  if (tab === 'design') {
    document.getElementById('components-panel').style.display = 'block';
    loadComponents();
  } else {
    switchSubTab(_subTab);
  }
}

function switchSubTab(tab) {
  _subTab = tab;
  // Sub buttons
  ['docs', 'router', 'retrieval', 'generation', 'livetest'].forEach(function(s) {
    var btn = document.getElementById('sub-' + s);
    if (btn) btn.classList.toggle('active', s === tab);
  });
  // Hide all panels
  ['docs', 'router', 'benchmark', 'generation', 'livetest'].forEach(function(p) {
    var panel = document.getElementById(p + '-panel');
    if (panel) panel.style.display = 'none';
  });
  // Show selected
  var panelMap = { docs: 'docs', router: 'router', retrieval: 'benchmark', generation: 'generation', livetest: 'livetest' };
  var panel = document.getElementById(panelMap[tab] + '-panel');
  if (panel) panel.style.display = 'block';
  // Load data
  if (tab === 'router') loadRouterResults();
  if (tab === 'docs') loadDocs();
  if (tab === 'retrieval') {
    if (_data) {
      renderSummary(_data.aggregate);
      renderFilters();
      renderTable(_data.cases || []);
    } else {
      loadResults();
    }
  }
}

function loadComponents() {
  var iframe = document.getElementById('components-iframe');
  var wrap = document.getElementById('components-frame-wrap');
  var offline = document.getElementById('components-offline');
  var url = 'http://localhost:3000/?view=components';
  fetch(url, {mode: 'no-cors', cache: 'no-cache'}).then(function() {
    iframe.src = url;
    wrap.style.display = 'block';
    offline.style.display = 'none';
  }).catch(function() {
    wrap.style.display = 'none';
    offline.style.display = 'block';
  });
}

function loadDocs() {
  // Use version-specific docs if available, otherwise load current
  var url = '/api/docs';
  var sourceLabel = 'current';
  if (_versionDocs && _activeVersion) {
    url = '/api/render_markdown';
    sourceLabel = 'version: ' + _activeVersion;
  }

  var fetchPromise;
  if (_versionDocs && _activeVersion) {
    fetchPromise = fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({markdown: _versionDocs})
    });
  } else {
    fetchPromise = fetch(url);
  }

  fetchPromise.then(function(r) { return r.json(); }).then(function(data) {
    var el = document.getElementById('docs-content');
    var pathEl = document.getElementById('docs-path');
    // Server-rendered HTML from our own documentation files (trusted internal input,
    // generated by _render_markdown on the local server — not user-supplied content)
    el.innerHTML = data.html || '<p>No docs found</p>';  // nosec: trusted server-rendered docs
    el.style.whiteSpace = 'normal';
    el.style.fontFamily = "var(--ds-font-sans)";
    el.style.fontSize = 'var(--ds-text-md)';
    el.style.lineHeight = '1.7';
    if (pathEl) pathEl.textContent = 'Source: ' + sourceLabel;
    // Render Mermaid diagrams after inserting HTML
    if (typeof mermaid !== 'undefined') {
      mermaid.run({ nodes: el.querySelectorAll('.mermaid') });
    }
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

  // ── Pipeline Indicators card (simplified 4 indicators) ──
  const stepCard = el('div', 'metric-card');
  const sh = el('h3');
  sh.id = 'indicators-title';
  sh.style.cursor = 'pointer';
  sh.appendChild(safeText('Pipeline'));
  sh.addEventListener('click', function() {
    // Reset to overall indicators
    sh.textContent = '';
    sh.appendChild(safeText('Pipeline'));
    INDICATOR_KEYS.forEach(function(key, i) {
      var score = indData[key] != null ? indData[key] : 0;
      var rows = stepCard.querySelectorAll('.step-row');
      if (rows[i]) {
        var fill = rows[i].querySelector('.step-bar-fill');
        var scoreEl = rows[i].querySelector('.step-score');
        if (fill) { fill.style.width = pct(score); fill.style.background = scoreColor(score); }
        if (scoreEl) { scoreEl.textContent = pct(score); scoreEl.style.color = scoreColor(score); }
      }
    });
    catCard.querySelectorAll('.cat-row').forEach(function(r) { r.style.background = 'transparent'; });
  });
  stepCard.appendChild(sh);

  const INDICATOR_KEYS = ['begriffe', 'sql', 'semantic', 'ergebnis'];
  const INDICATOR_LABELS = {
    begriffe: 'Begriffe',
    sql: 'SQL Search',
    semantic: 'Semantic Search',
    ergebnis: 'Ergebnis',
  };
  const INDICATOR_TOOLTIPS = {
    begriffe: 'Finden wir die richtigen Suchbegriffe? (Term-Extraktion + KG-Expansion kombiniert)',
    sql: 'Findet die Keyword-Suche die Zielkarte? Top-10 = 100%, Top-50 = 50%, gefunden = 20%, nicht gefunden = 0%',
    semantic: 'Findet die Embedding-Suche die Zielkarte? Top-10 = 100%, Top-50 = 50%, Top-200 = 20%',
    ergebnis: 'Landet die Karte nach RRF-Fusion in den Top-10? Das Endergebnis.',
  };

  // Use indicators from aggregate (or fall back to by_step for old data)
  var indData = agg.indicators || {};

  INDICATOR_KEYS.forEach(key => {
    var score = indData[key] != null ? indData[key] : 0;
    // Fallback for old data without indicators
    if (!agg.indicators) {
      if (key === 'begriffe') score = Math.max(agg.by_step.term_extraction || 0, agg.by_step.kg_expansion || 0);
      else if (key === 'sql') score = agg.by_step.sql_search || 0;
      else if (key === 'semantic') score = agg.by_step.semantic_search || 0;
      else if (key === 'ergebnis') score = agg.by_step.rrf_ranking || 0;
    }
    const srow = el('div', 'step-row');

    const nameEl = el('div', 'step-name');
    nameEl.appendChild(safeText(INDICATOR_LABELS[key] || key));
    const stepTip = el('span', 'tip');
    stepTip.appendChild(safeText('?'));
    stepTip.setAttribute('data-tooltip', INDICATOR_TOOLTIPS[key] || '');
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

  // ── By Category card (clickable for drill-down) ──
  const catCard = el('div', 'metric-card');
  const ch = el('h3');
  ch.appendChild(safeText('By Category'));
  catCard.appendChild(ch);

  const byCat = agg.by_category || {};
  const byCatInd = agg.by_category_indicators || {};
  Object.entries(byCat).forEach(([cat, info]) => {
    const crow = el('div', 'cat-row');
    crow.style.cursor = 'pointer';
    crow.style.borderRadius = '6px';
    crow.style.padding = '4px 6px';
    crow.style.margin = '0 -6px';
    crow.addEventListener('click', function() {
      // Show per-category indicators in the Pipeline card
      var title = document.getElementById('indicators-title');
      title.textContent = '';
      title.appendChild(safeText('Pipeline · ' + cat));
      // Render category-specific indicators
      var catInd = byCatInd[cat] || {};
      stepCard.querySelectorAll('.step-row').forEach(function(r, i) {
        var key = INDICATOR_KEYS[i];
        var score = catInd[key] != null ? catInd[key] : 0;
        var fill = r.querySelector('.step-bar-fill');
        var scoreEl = r.querySelector('.step-score');
        if (fill) { fill.style.width = pct(score); fill.style.background = scoreColor(score); }
        if (scoreEl) { scoreEl.textContent = pct(score); scoreEl.style.color = scoreColor(score); }
      });
      // Highlight active category
      catCard.querySelectorAll('.cat-row').forEach(function(r) {
        r.style.background = 'transparent';
      });
      crow.style.background = 'var(--ds-active-tint)';
    });

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

async function handleRunRouter() {
  const btn = document.getElementById('btn-run');
  const spin = document.getElementById('spin-run');
  btn.disabled = true;
  spin.classList.add('active');
  hideError();
  try {
    const resp = await fetch('/api/run_router', { method: 'POST' });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error('Router run failed: ' + body);
    }
    await loadRouterResults();
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

// ── Version Picker ──────────────────────────────────────────────────────────

let _versions = [];
let _activeVersion = null; // null = current/latest

function toggleVersionPicker() {
  var dd = document.getElementById('version-dropdown');
  dd.classList.toggle('open');
  if (dd.classList.contains('open')) loadVersions();
}

// Close picker when clicking outside
document.addEventListener('click', function(e) {
  var picker = document.querySelector('.version-picker');
  if (picker && !picker.contains(e.target)) {
    document.getElementById('version-dropdown').classList.remove('open');
  }
});

async function loadVersions() {
  try {
    var resp = await fetch('/api/history');
    var data = await resp.json();
    _versions = data.versions || [];
    renderVersionDropdown();
  } catch(e) {}
}

function renderVersionDropdown() {
  var dd = document.getElementById('version-dropdown');
  dd.textContent = '';

  // "Current" item
  var cur = el('div', 'version-item' + (_activeVersion === null ? ' active' : ''));
  var curLabel = el('span', 'version-ts');
  curLabel.appendChild(safeText('current (latest)'));
  cur.appendChild(curLabel);
  cur.addEventListener('click', function() { loadVersionResults(null); });
  dd.appendChild(cur);

  _versions.forEach(function(v) {
    var item = el('div', 'version-item' + (_activeVersion === v.file ? ' active' : ''));

    var ts = el('span', 'version-ts');
    ts.appendChild(safeText(v.timestamp));
    item.appendChild(ts);

    var recall = el('span', 'version-recall');
    recall.style.color = scoreColor(v.recall_at_10);
    recall.appendChild(safeText(pct(v.recall_at_10)));
    item.appendChild(recall);

    var conf = el('span', 'version-config');
    var parts = [];
    if (v.config_summary) {
      if (v.config_summary.k_focus !== '—') parts.push('k_f=' + v.config_summary.k_focus);
      if (v.config_summary.focus_enabled === true) parts.push('focus');
      if (v.config_summary.embedding_fallback === true) parts.push('fb');
    }
    conf.appendChild(safeText(parts.join(' · ') || v.passed + '/' + v.total_cases));
    item.appendChild(conf);

    item.addEventListener('click', function() { loadVersionResults(v.file); });
    dd.appendChild(item);
  });
}

async function loadVersionResults(file) {
  _activeVersion = file;
  document.getElementById('version-dropdown').classList.remove('open');

  var url = file ? '/api/history/' + file : '/api/results';
  var btnLabel = file ? file.replace('.json','').substring(0,16) : 'current';
  document.getElementById('version-btn').textContent = btnLabel;

  try {
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    _data = await resp.json();
    renderSummary(_data.aggregate);
    renderFilters();
    renderTable(_data.cases || []);
    // Store version docs for the Docs tab
    _versionDocs = _data.docs_snapshot || null;
    hideError();
  } catch(err) {
    showError('Failed to load version: ' + err.message);
  }
}

// ── Live Test ───────────────────────────────────────────────────────────────

async function runLiveTest() {
  var input = document.getElementById('livetest-input');
  var output = document.getElementById('livetest-output');
  var btn = document.getElementById('livetest-btn');
  var query = input.value.trim();
  if (!query) return;

  btn.disabled = true;
  btn.textContent = '...';
  output.style.display = 'block';
  output.textContent = 'Running pipeline for: "' + query + '"...\n';

  try {
    var resp = await fetch('/api/live_test', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query: query})
    });
    var data = await resp.json();
    if (data.error) {
      output.textContent = 'Error: ' + data.error;
    } else {
      output.textContent = JSON.stringify(data, null, 2);
    }
  } catch(e) {
    output.textContent = 'Error: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Suchen';
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

loadResults();
switchSubTab('docs');
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
        "font-family:var(--ds-font-sans);"
        "color:var(--ds-text-primary);margin:20px 0 10px 0;font-weight:600;letter-spacing:-0.3px;"
    )
    _code_bg = "background:var(--ds-bg-deep);border:1px solid var(--ds-border-medium);border-radius:var(--ds-radius-sm);padding:16px 20px;"
    _inline_code = (
        "background:var(--ds-bg-overlay);padding:2px 6px;border-radius:4px;font-family:var(--ds-font-mono);"
        "font-size:var(--ds-text-sm);color:var(--ds-text-primary);"
    )
    _td_style = "padding:8px 14px;border-bottom:1px solid var(--ds-border-medium);font-size:var(--ds-text-base);"
    _th_style = (
        "padding:8px 14px;border-bottom:1px solid var(--ds-border-medium);font-size:var(--ds-text-xs);"
        "font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:var(--ds-text-secondary);text-align:left;"
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
                if code_lang == "mermaid":
                    # Mermaid diagram — render as <div class="mermaid"> for client-side rendering
                    html_parts.append(
                        '<div class="mermaid" style="margin:20px 0;background:var(--ds-bg-deep);'
                        'border:1px solid var(--ds-border-medium);border-radius:var(--ds-radius-md);padding:20px;">'
                        "%s</div>" % escaped
                    )
                else:
                    html_parts.append(
                        '<pre style="%sfont-family:var(--ds-font-mono);font-size:var(--ds-text-sm);'
                        'color:var(--ds-text-secondary);line-height:1.6;overflow-x:auto;margin:12px 0;white-space:pre-wrap;">'
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
                '<div style="padding:2px 0 2px 16px;font-size:var(--ds-text-md);line-height:1.7;">'
                '<span style="color:var(--ds-text-secondary);margin-right:8px;">&#x2022;</span>%s</div>'
                % _inline(stripped[2:])
            )
        # Numbered list items
        elif _re.match(r"^\d+\.\s", stripped):
            match = _re.match(r"^(\d+)\.\s(.*)", stripped)
            if match:
                html_parts.append(
                    '<div style="padding:2px 0 2px 16px;font-size:var(--ds-text-md);line-height:1.7;">'
                    '<span style="color:var(--ds-text-secondary);margin-right:8px;">%s.</span>%s</div>'
                    % (match.group(1), _inline(match.group(2)))
                )
        # Empty line = break
        elif stripped == "":
            html_parts.append("<br>")
        # Normal paragraph
        else:
            html_parts.append(
                '<p style="font-size:var(--ds-text-md);line-height:1.7;margin:4px 0;">%s</p>'
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

        elif self.path == "/design-system.css":
            if os.path.isfile(DESIGN_CSS_PATH):
                with open(DESIGN_CSS_PATH, "r", encoding="utf-8") as fh:
                    self._send(200, "text/css; charset=utf-8", fh.read())
            else:
                self._send(404, "text/plain", "design-system.css not found")

        elif self.path == "/api/history":
            # List all history files with summary info
            if not os.path.isdir(HISTORY_DIR):
                self._send_json(200, {"versions": []})
                return
            versions = []
            for fname in sorted(os.listdir(HISTORY_DIR), reverse=True):
                if not fname.endswith(".json"):
                    continue
                fpath = os.path.join(HISTORY_DIR, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as fh:
                        data = json.load(fh)
                    agg = data.get("aggregate", {})
                    overall = agg.get("overall", {})
                    conf = data.get("config", {})
                    versions.append({
                        "file": fname,
                        "timestamp": agg.get("timestamp", fname.replace(".json", "")),
                        "recall_at_10": overall.get("recall_at_k", 0),
                        "recall_at_3": overall.get("recall_at_3", 0),
                        "total_cases": overall.get("total_cases", 0),
                        "passed": overall.get("passed", 0),
                        "config_summary": {
                            "k_focus": conf.get("k_focus", "—"),
                            "focus_enabled": conf.get("focus_enabled", "—"),
                            "embedding_fallback": conf.get("embedding_fallback", "—"),
                        },
                    })
                except Exception:
                    continue
            self._send_json(200, {"versions": versions})

        elif self.path.startswith("/api/history/"):
            # Load a specific history file
            fname = self.path.split("/api/history/", 1)[1]
            if ".." in fname or "/" in fname:
                self._send_error_json(400, "Invalid filename")
                return
            fpath = os.path.join(HISTORY_DIR, fname)
            if not os.path.isfile(fpath):
                self._send_error_json(404, "History file not found")
                return
            try:
                with open(fpath, "r", encoding="utf-8") as fh:
                    self._send(200, "application/json", fh.read())
            except OSError as exc:
                self._send_error_json(500, str(exc))

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

        elif self.path == "/api/live_test":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length)) if length else {}
                query = body.get("query", "")
                if not query:
                    self._send_error_json(400, "query required")
                    return
                # Run single case through the benchmark pipeline
                result = subprocess.run(
                    [sys.executable, os.path.join(PROJECT_ROOT, "scripts", "benchmark_run.py"),
                     "--id", "__live__", "--live-query", query],
                    cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=60,
                )
                # For now, return a placeholder with the query
                self._send_json(200, {
                    "query": query,
                    "status": "Live test not yet connected to pipeline. Run eval_retrieval.py manually:",
                    "command": "python3 scripts/eval_retrieval.py \"%s\"" % query.replace('"', '\\"'),
                })
            except Exception as exc:
                self._send_error_json(500, str(exc))

        elif self.path == "/api/render_markdown":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length)) if length else {}
                md = body.get("markdown", "")
                rendered = _render_markdown(md)
                self._send_json(200, {"html": rendered})
            except Exception as exc:
                self._send_error_json(500, str(exc))

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
    print(f"AnkiPlus Dev Hub running at {url}")
    print("Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
