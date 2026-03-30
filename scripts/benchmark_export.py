#!/usr/bin/env python3
"""Export benchmark dashboard as a self-contained static HTML file.

Usage:
  python3 scripts/benchmark_export.py
  # Creates benchmark/dashboard.html (~2-3MB, all data embedded)
  # Open in any browser, share with anyone, no server needed.
"""
import json
import os
import re
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

RESULTS_PATH = os.path.join(PROJECT_ROOT, "benchmark", "results.json")
ROUTER_RESULTS_PATH = os.path.join(PROJECT_ROOT, "benchmark", "router_results.json")
DOCS_PATH = os.path.join(PROJECT_ROOT, "docs", "reference", "RETRIEVAL_SYSTEM.md")
DESIGN_CSS_PATH = os.path.join(PROJECT_ROOT, "shared", "styles", "design-system.css")
HISTORY_DIR = os.path.join(PROJECT_ROOT, "benchmark", "history")
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "benchmark", "dashboard.html")


def load_json_file(path):
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def load_history():
    versions = []
    history_data = {}
    if not os.path.isdir(HISTORY_DIR):
        return versions, history_data
    for fname in sorted(os.listdir(HISTORY_DIR), reverse=True):
        if not fname.endswith(".json"):
            continue
        fpath = os.path.join(HISTORY_DIR, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                raw = f.read()
                data = json.loads(raw)
            history_data[fname] = raw
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
    return versions, history_data


def main():
    # Import the dashboard HTML from benchmark_serve
    serve_path = os.path.join(PROJECT_ROOT, "scripts", "benchmark_serve.py")
    with open(serve_path, "r", encoding="utf-8") as f:
        serve_code = f.read()

    # Extract DASHBOARD_HTML
    match = re.search(r'DASHBOARD_HTML\s*=\s*"""(.*?)"""', serve_code, re.DOTALL)
    if not match:
        print("ERROR: Could not extract DASHBOARD_HTML from benchmark_serve.py")
        sys.exit(1)
    html = match.group(1)

    # Import _render_markdown from benchmark_serve
    from benchmark_serve import _render_markdown

    # Load all data
    results_json = load_json_file(RESULTS_PATH) or "{}"
    router_json = load_json_file(ROUTER_RESULTS_PATH) or "[]"
    docs_md = load_json_file(DOCS_PATH) or ""
    docs_html = _render_markdown(docs_md) if docs_md else ""
    gen_results_path = os.path.join(PROJECT_ROOT, "benchmark", "generation_results.json")
    gen_json = load_json_file(gen_results_path) or "{}"
    css = load_json_file(DESIGN_CSS_PATH) or ""
    versions, history_data = load_history()

    # Build embedded data script
    data_script = """
<script>
// ── Embedded data (static export) ──
window.__STATIC_EXPORT__ = true;
window.__EMBEDDED_RESULTS__ = %s;
window.__EMBEDDED_ROUTER__ = %s;
window.__EMBEDDED_HISTORY__ = %s;
window.__EMBEDDED_HISTORY_DATA__ = %s;
window.__EMBEDDED_DOCS__ = %s;
window.__EMBEDDED_GENERATION__ = %s;
</script>
""" % (
        results_json,
        router_json,
        json.dumps({"versions": versions}),
        json.dumps(history_data),
        json.dumps(docs_html),
        gen_json,
    )

    # Build fetch interceptor that returns embedded data
    interceptor = """
<script>
// Override fetch to return embedded data in static export
if (window.__STATIC_EXPORT__) {
    const _origFetch = window.fetch;
    window.fetch = function(url, opts) {
        if (typeof url === 'string') {
            if (url === '/api/results') return Promise.resolve(new Response(JSON.stringify(window.__EMBEDDED_RESULTS__), {status: 200, headers: {'Content-Type': 'application/json'}}));
            if (url === '/api/router_results') return Promise.resolve(new Response(JSON.stringify(window.__EMBEDDED_ROUTER__), {status: 200, headers: {'Content-Type': 'application/json'}}));
            if (url === '/api/history') return Promise.resolve(new Response(JSON.stringify(window.__EMBEDDED_HISTORY__), {status: 200, headers: {'Content-Type': 'application/json'}}));
            if (url === '/api/docs') return Promise.resolve(new Response(JSON.stringify({html: window.__EMBEDDED_DOCS__, path: 'embedded'}), {status: 200, headers: {'Content-Type': 'application/json'}}));
            if (url === '/api/generation_results') return Promise.resolve(new Response(JSON.stringify(window.__EMBEDDED_GENERATION__), {status: 200, headers: {'Content-Type': 'application/json'}}));
            if (url.startsWith('/api/history/')) {
                const fname = url.split('/api/history/')[1];
                const data = window.__EMBEDDED_HISTORY_DATA__[fname];
                if (data) return Promise.resolve(new Response(data, {status: 200, headers: {'Content-Type': 'application/json'}}));
                return Promise.resolve(new Response('Not found', {status: 404}));
            }
            // POST endpoints disabled in static export
            if (url.startsWith('/api/run') || url === '/api/generate' || url === '/api/live_test' || url === '/api/render_markdown') {
                return Promise.resolve(new Response(JSON.stringify({error: 'Not available in static export'}), {status: 501, headers: {'Content-Type': 'application/json'}}));
            }
        }
        return _origFetch(url, opts);
    };
}
</script>
"""

    # Inline the CSS
    html = html.replace(
        '<link rel="stylesheet" href="/design-system.css">',
        '<style>\n%s\n</style>' % css
    )

    # Inject data + interceptor before closing </head>
    html = html.replace('</head>', data_script + interceptor + '</head>')

    # Add static export banner
    banner = """
<div style="position:fixed;bottom:12px;right:12px;background:var(--ds-bg-overlay, #333);color:var(--ds-text-secondary, #aaa);padding:6px 12px;border-radius:8px;font-size:12px;z-index:9999;opacity:0.7;">
Static Export — Run <code>benchmark_serve.py</code> for live features
</div>
"""
    html = html.replace('</body>', banner + '</body>')

    # Write output
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write("<!DOCTYPE html>\n<html lang=\"en\">\n")
        f.write(html)

    size_kb = os.path.getsize(OUTPUT_PATH) // 1024
    print(f"Exported to: {OUTPUT_PATH}")
    print(f"Size: {size_kb} KB")
    print(f"Open in browser or share the file directly.")


if __name__ == "__main__":
    main()
