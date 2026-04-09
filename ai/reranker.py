"""
Source Reranker — LLM-based relevance filter for RAG results.

After the RAG pipeline finds ~30 candidate cards, this module uses a fast
LLM (Gemini Flash) to evaluate which sources are actually relevant to the
user's question. Irrelevant sources are filtered out before reaching the
main generation model.

Also decides whether web search (Perplexity) should be triggered.

Runs inside the RAG pipeline flow, NOT as a post-processing step.
"""
import json
import time

try:
    from ..config import get_backend_url, get_auth_token
except ImportError:
    from config import get_backend_url, get_auth_token

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Model for reranking — lite model, no thinking, fast JSON classification
RERANKER_MODEL = "gemini-2.5-flash-lite"
RERANKER_TIMEOUT_S = 8

RERANKER_PROMPT = """Du bewertest Quellen für eine Lernfrage.

FRAGE: {question}

QUELLEN:
{sources}

Aufgabe:
1. Welche Quellen enthalten Informationen die zur Beantwortung der FRAGE relevant sind?
2. Kann die Frage VOLLSTÄNDIG aus den Quellen beantwortet werden?

Antworte NUR mit JSON, kein anderer Text:
{{"relevant": [1, 2, 4, 5, 8, 10, 13, 17, 21], "web_search": false}}

Regeln:
- "relevant": Liste ALLER Quellen-Nummern [N] die zur Frage passen — nicht nur die "besten"
  drei. Wenn 15 Quellen relevante Informationen enthalten, gib alle 15 zurück.
  Vollständigkeit ist wichtiger als Kürze: lieber 20 relevante Quellen als 3 ausgewählte.
- "web_search": true wenn:
  • KEINE Quelle die Frage beantwortet, ODER
  • die Quellen nur TEILWEISE antworten und wichtige Aspekte fehlen, ODER
  • die Frage nach aktuellen Studien, Leitlinien oder Daten fragt
- Relevanz-Schwelle: Die Quelle enthält einen echten Antwortteil (nicht nur thematisch nah).
  Sei streng bei dieser Schwelle — aber sobald eine Quelle darüber liegt, nimm sie auf.
- Eine leere Liste [] ist korrekt wenn wirklich nichts passt."""


def rerank_sources(
    question: str,
    context_lines: list,
    min_confidence: str = "medium",
    emit_step=None,
) -> dict:
    """Filter RAG sources by relevance using a fast LLM.

    Args:
        question: The user's question.
        context_lines: List of formatted context lines (e.g. "[1] (Deck) answer text").
        min_confidence: Minimum RAG confidence to consider reranking.
                        If "low", skip reranking and recommend web search directly.
        emit_step: Optional callback for pipeline visualization.

    Returns:
        {
            "relevant_indices": [1, 3, 7],     # Indices to keep
            "web_search": True/False,           # Whether to trigger web search
            "reranked": True,                   # Whether reranking was performed
        }
    """
    _emit = emit_step or (lambda step, status, data=None: None)

    # Skip reranking if confidence is already low (nothing useful found)
    if min_confidence == "low":
        return {"relevant_indices": [], "web_search": True, "reranked": False}

    # Need at least some sources to evaluate
    numbered_lines = [l for l in context_lines if l.strip().startswith('[')]
    if not numbered_lines:
        return {"relevant_indices": [], "web_search": True, "reranked": False}

    _emit("reranker", "running", {"sources": len(numbered_lines)})

    # Build source block (one line per source, already formatted)
    sources_text = '\n'.join(numbered_lines[:30])  # Cap at 30

    prompt = RERANKER_PROMPT.format(
        question=question[:300],
        sources=sources_text,
    )

    # [RAG-STATE 4/7] reranker — log what it actually sees
    logger.info("[RAG-STATE 4/7] reranker.question : %r", question[:200])
    logger.info("[RAG-STATE 4/7] reranker.sources  : %d lines (first 3 below)", len(numbered_lines))
    for _i, _ln in enumerate(numbered_lines[:3]):
        logger.info("[RAG-STATE 4/7]   src[%d] %s", _i + 1, _ln[:160])

    result_text = ''
    clean = ''
    try:
        import requests

        # Direct OpenRouter call — bypasses backend system prompt (like Router does)
        try:
            from ..config import get_config
        except ImportError:
            from config import get_config
        config = get_config() or {}
        openrouter_key = config.get('openrouter_api_key', '')
        if not openrouter_key:
            # Fallback: use backend /chat with override
            backend_url = get_backend_url()
            token = get_auth_token()
            if not backend_url:
                logger.warning("Reranker: no API key and no backend URL, skipping")
                return {"relevant_indices": list(range(1, len(numbered_lines) + 1)),
                        "web_search": False, "reranked": False}
            headers = {"Content-Type": "application/json"}
            if token:
                headers["Authorization"] = f"Bearer {token}"
            payload = {
                "message": prompt,
                "model": RERANKER_MODEL,
                "temperature": 0.0,
                "maxOutputTokens": 256,
                "history": [],
                "agent": "tutor",
                "mode": "compact",
                "stream": False,
                "systemPromptOverride": "Du bewertest Quellen. Antworte NUR mit validem JSON, kein anderer Text.",
            }
            t0 = time.time()
            response = requests.post(
                f"{backend_url}/chat", json=payload,
                headers=headers, timeout=RERANKER_TIMEOUT_S,
            )
            elapsed_ms = int((time.time() - t0) * 1000)
            response.raise_for_status()
            data = response.json()
            result_text = data.get("text", "")
        else:
            # Direct OpenRouter — no system prompt interference
            openrouter_model = f"google/{RERANKER_MODEL}"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {openrouter_key}",
            }
            payload = {
                "model": openrouter_model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.0,
                "max_tokens": 256,
            }
            t0 = time.time()
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                json=payload, headers=headers, timeout=RERANKER_TIMEOUT_S,
            )
            elapsed_ms = int((time.time() - t0) * 1000)
            response.raise_for_status()
            data = response.json()
            result_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")

        # Parse JSON response
        # Handle markdown code blocks: ```json ... ```
        clean = result_text.strip()
        if clean.startswith('```'):
            clean = clean.split('\n', 1)[-1]  # Remove first line
            clean = clean.rsplit('```', 1)[0]  # Remove last ```
            clean = clean.strip()

        parsed = json.loads(clean)
        relevant = parsed.get("relevant", [])
        web_search = parsed.get("web_search", False)

        # Validate indices
        max_idx = len(numbered_lines)
        relevant = [i for i in relevant if isinstance(i, int) and 1 <= i <= max_idx]

        logger.info("Reranker: %d/%d sources relevant, web_search=%s (%dms, model=%s)",
                    len(relevant), len(numbered_lines), web_search, elapsed_ms, RERANKER_MODEL)
        logger.info("[RAG-STATE 4/7] reranker.raw_json : %s", clean[:300] if clean else "(empty)")
        logger.info("[RAG-STATE 4/7] reranker.kept_idx : %s", relevant)

        _emit("reranker", "done", {
            "relevant_count": len(relevant),
            "total_count": len(numbered_lines),
            "web_search": web_search,
            "elapsed_ms": elapsed_ms,
        })

        return {
            "relevant_indices": relevant,
            "web_search": web_search,
            "reranked": True,
        }

    except json.JSONDecodeError as e:
        logger.warning("Reranker: failed to parse JSON: %s (response: %s)",
                       e, clean[:200] if clean else "empty")
        _emit("reranker", "error", {"reason": "json_parse"})
        # Fallback: keep all sources, no web search
        return {"relevant_indices": list(range(1, len(numbered_lines) + 1)),
                "web_search": False, "reranked": False}

    except Exception as e:
        logger.warning("Reranker: call failed: %s", e)
        _emit("reranker", "error", {"reason": str(e)[:100]})
        # Fallback: keep all sources, no web search
        return {"relevant_indices": list(range(1, len(numbered_lines) + 1)),
                "web_search": False, "reranked": False}
