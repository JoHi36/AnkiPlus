"""
PipelineTrace — structured logging for the RAG + generation pipeline.

Collects every step of a pipeline run with timing, input/output data,
and human-readable summaries. Designed to be passed as the `emit_step`
callback throughout the pipeline — no changes needed to existing code.

Usage:
    trace = PipelineTrace(agent="tutor", query="was ist glycin?")
    result = run_tutor(situation=query, emit_step=trace.step, ...)
    log = trace.to_dict()  # Full structured log
"""
import time
from typing import Any, Dict, List, Optional

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


class PipelineTrace:
    """Collects structured pipeline steps with automatic timing."""

    def __init__(self, agent: str = "tutor", query: str = "", card_context: Optional[dict] = None):
        self.agent = agent
        self.query = query
        self.card_context = card_context
        self.steps: List[Dict[str, Any]] = []
        self._active: Dict[str, float] = {}  # step_name → start_time
        self._started_at = time.time()
        self.response_text: str = ""
        self.citations: list = []
        self.source_count: int = 0

    def step(self, name_or_dict, status=None, data=None):
        """Record a pipeline step. Compatible with emit_step(name, status, data) signature.

        Also handles the dict-style emit: emit_step({"id": ..., "label": ..., "status": ...})
        """
        # Handle dict-style emit (used by some agents)
        if isinstance(name_or_dict, dict):
            name = name_or_dict.get("id", name_or_dict.get("label", "unknown"))
            status = name_or_dict.get("status", status or "active")
            data = {k: v for k, v in name_or_dict.items() if k not in ("id", "label", "status")}
        else:
            name = name_or_dict

        if status is None:
            status = "active"

        now = time.time()

        if status in ("running", "active"):
            self._active[name] = now
            # Also record as a step so we can see what's in progress
            self.steps.append({
                "name": name,
                "status": "running",
                "started_at_ms": int(now * 1000),
                "elapsed_ms": 0,
                "data": _safe_data(data),
                "summary": "",
            })
        elif status in ("done", "error"):
            started = self._active.pop(name, None)
            elapsed = int((now - started) * 1000) if started else 0

            # Find and update the running step, or create a new one
            updated = False
            for s in reversed(self.steps):
                if s["name"] == name and s["status"] == "running":
                    s["status"] = status
                    s["elapsed_ms"] = elapsed
                    s["data"] = _safe_data(data)
                    s["summary"] = _build_summary(name, status, data, elapsed)
                    updated = True
                    break

            if not updated:
                self.steps.append({
                    "name": name,
                    "status": status,
                    "started_at_ms": int(now * 1000),
                    "elapsed_ms": elapsed,
                    "data": _safe_data(data),
                    "summary": _build_summary(name, status, data, elapsed),
                })

    def set_response(self, text: str, citations: list):
        """Record the final response."""
        self.response_text = text
        self.citations = citations
        self.source_count = len(citations)

    def to_dict(self) -> dict:
        """Return the full structured trace."""
        total_ms = int((time.time() - self._started_at) * 1000)
        # Filter out running steps that were never completed (keep only done/error)
        completed_steps = [s for s in self.steps if s["status"] in ("done", "error")]
        return {
            "agent": self.agent,
            "query": self.query,
            "card_context": {
                "cardId": self.card_context.get("cardId") if self.card_context else None,
                "question": self.card_context.get("question", "")[:100] if self.card_context else None,
            },
            "total_ms": total_ms,
            "step_count": len(completed_steps),
            "source_count": self.source_count,
            "response_length": len(self.response_text),
            "steps": completed_steps,
            "response_preview": self.response_text[:500],
            "citations": self.citations[:20],  # Cap for JSON size
            "timestamp": int(self._started_at * 1000),
        }


def _safe_data(data: Any) -> dict:
    """Ensure data is a JSON-serializable dict."""
    if data is None:
        return {}
    if isinstance(data, dict):
        # Filter out non-serializable values
        safe = {}
        for k, v in data.items():
            try:
                import json
                json.dumps(v)
                safe[k] = v
            except (TypeError, ValueError):
                safe[k] = str(v)[:200]
        return safe
    return {"value": str(data)[:200]}


def _build_summary(name: str, status: str, data: Any, elapsed_ms: int) -> str:
    """Build a human-readable one-line summary for a step."""
    if not data or not isinstance(data, dict):
        return f"{name}: {status} ({elapsed_ms}ms)"

    if name == "router":
        intent = data.get("resolved_intent", "")[:60]
        return f"Intent: {intent}" if intent else f"Router: {status}"

    if name == "kg_enrichment":
        terms = data.get("tier1_terms", [])
        return f"{len(terms)} terms extracted" if terms else "No domain terms"

    if name == "sql_search":
        total = data.get("total_hits", 0)
        queries = data.get("queries", [])
        return f"{total} hits from {len(queries)} queries"

    if name == "semantic_search":
        total = data.get("total_hits", 0)
        return f"{total} semantic matches"

    if name == "kg_search":
        total = data.get("total_hits", 0)
        terms = data.get("terms", [])
        return f"{total} hits via {len(terms)} KG terms"

    if name == "merge":
        total = data.get("total", 0)
        conf = data.get("confidence", "")
        return f"{total} merged, confidence={conf}" if conf else f"{total} merged"

    if name == "reranker":
        relevant = data.get("relevant_count", "?")
        total = data.get("total_count", "?")
        web = data.get("web_search", False)
        return f"{relevant}/{total} relevant" + (", web search needed" if web else "")

    if name == "web_search":
        count = data.get("sources_count", 0)
        return f"{count} web sources found" if status == "done" else "Searching..."

    if name == "sources_ready":
        cits = data.get("citations", [])
        return f"{len(cits)} citations ready"

    if name == "generating":
        return "Generating response..."

    return f"{status} ({elapsed_ms}ms)"
