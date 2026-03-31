"""plusi/agent.py — Plusi Agent, tool-based companion using Claude Sonnet."""

import json
import struct

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

try:
    from ..config import get_config
except ImportError:
    from config import get_config

try:
    from .soul import build_system_prompt
except ImportError:
    from plusi.soul import build_system_prompt

try:
    from .anthropic_loop import run_plusi_loop
except ImportError:
    from plusi.anthropic_loop import run_plusi_loop

try:
    from .memory import PlusiMemory
except ImportError:
    from plusi.memory import PlusiMemory

try:
    from .tools import init_tools, execute_tool
except ImportError:
    from plusi.tools import init_tools, execute_tool

try:
    from .event_bus import EventBus
except ImportError:
    from plusi.event_bus import EventBus

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Module-level singletons
# ---------------------------------------------------------------------------

_memory = None
_initialized = False

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_EMBEDDING_DIM = 768
_ZERO_EMBEDDING = struct.pack(f"{_EMBEDDING_DIM}f", *([0.0] * _EMBEDDING_DIM))


def _get_memory() -> PlusiMemory:
    """Lazy singleton for PlusiMemory."""
    global _memory
    if _memory is None:
        _memory = PlusiMemory()
        logger.info("plusi/agent: PlusiMemory initialised")
    return _memory


def _get_embed_fn():
    """Return a callable str -> bytes that produces an embedding vector.

    Tries to resolve the EmbeddingManager from ai.embeddings or the addon
    __init__ module. Falls back to a zero vector on any failure.
    """
    def embed(text: str) -> bytes:
        try:
            # Primary: get embedding manager from addon __init__
            try:
                import importlib
                init_mod = importlib.import_module("AnkiPlus_main")
                if hasattr(init_mod, "get_embedding_manager"):
                    em = init_mod.get_embedding_manager()
                    if em is not None:
                        floats = em.embed_texts([text[:2000]])
                        if floats and len(floats) > 0:
                            vec = floats[0]
                            return struct.pack(f"{len(vec)}f", *vec)
            except Exception:
                pass

            # Fallback: direct import of EmbeddingManager
            try:
                try:
                    from ..ai.embeddings import EmbeddingManager  # type: ignore
                except ImportError:
                    from ai.embeddings import EmbeddingManager  # type: ignore
                em = EmbeddingManager.__new__(EmbeddingManager)
                # Attempt to use an already-initialised instance via handler module
                try:
                    try:
                        from ..ai import handler as ai_handler  # type: ignore
                    except ImportError:
                        from ai import handler as ai_handler  # type: ignore
                    instance = getattr(ai_handler, "_embedding_manager", None)
                    if instance is not None:
                        floats = instance.embed_texts([text[:2000]])
                        if floats and len(floats) > 0:
                            vec = floats[0]
                            return struct.pack(f"{len(vec)}f", *vec)
                except Exception:
                    pass
            except Exception:
                pass

        except Exception as exc:
            logger.warning("plusi/agent: embed_fn failed: %s", exc)

        # Final fallback: zero vector
        logger.debug("plusi/agent: embed_fn returning zero vector")
        return _ZERO_EMBEDDING

    return embed


def _get_api_key() -> str:
    """Return Anthropic API key, falling back to dev_openrouter_key."""
    config = get_config()
    key = config.get("anthropic_api_key", "").strip()
    if key:
        return key
    fallback = config.get("dev_openrouter_key", "").strip()
    if fallback:
        logger.debug("plusi/agent: using dev_openrouter_key as Anthropic key fallback")
    return fallback


def _ensure_init() -> None:
    """One-time initialisation: create memory and wire up tools."""
    global _initialized
    if _initialized:
        return
    mem = _get_memory()
    embed_fn = _get_embed_fn()
    init_tools(mem, embed_fn, event_bus=EventBus.get())
    _initialized = True
    logger.info("plusi/agent: init complete")


# ---------------------------------------------------------------------------
# Main entry points
# ---------------------------------------------------------------------------

def run_plusi(situation: str, emit_step=None, **kwargs) -> dict:
    """Run Plusi for a given situation string.

    Parameters
    ----------
    situation:  The triggering context / user message.
    emit_step:  Optional callable(step_dict) for streaming progress
                to the UI (e.g. mood sync).
    **kwargs:   Reserved for future use.

    Returns
    -------
    dict with keys: mood, text, tool_results, proactive_messages
    """
    _ensure_init()

    # Resolve API key
    api_key = _get_api_key()
    if not api_key:
        logger.warning("plusi/agent: no API key configured")
        return {
            "mood": "neutral",
            "text": "",
            "tool_results": [],
            "proactive_messages": [],
            "error": "No API key configured (set anthropic_api_key or dev_openrouter_key)",
        }

    mem = _get_memory()
    embed_fn = _get_embed_fn()

    # Passive recall: embed the situation and find relevant memories
    recall_memories = []
    try:
        query_embedding = embed_fn(situation[:2000])
        recall_memories = mem.recall(query_embedding, limit=5)
        logger.debug("plusi/agent: recalled %d memories", len(recall_memories))
    except Exception as exc:
        logger.warning("plusi/agent: passive recall failed: %s", exc)

    # Load recent conversation history (last 10 entries)
    history = []
    try:
        history = mem.load_history(limit=10)
    except Exception as exc:
        logger.warning("plusi/agent: load_history failed: %s", exc)

    # Build system prompt with recall context
    system_prompt = build_system_prompt(recall_memories, history)

    # Run the Anthropic agent loop
    result = run_plusi_loop(
        system_prompt=system_prompt,
        user_message=situation,
        history=history,
        api_key=api_key,
        tool_executor=execute_tool,
        temperature=0.9,
    )

    mood = result.get("mood", "neutral")
    text = result.get("text", "")
    tool_results = result.get("tool_results", [])

    # Extract proactive messages from nachricht tool calls
    proactive_messages = [
        tr for tr in tool_results
        if tr.get("tool") == "nachricht"
    ]

    # Persist this interaction
    try:
        mem.save_interaction(context=situation, response=text, mood=mood)
    except Exception as exc:
        logger.warning("plusi/agent: save_interaction failed: %s", exc)

    # Sync mood to dock if an emitter is provided
    if emit_step is not None:
        try:
            emit_step({"type": "mood", "mood": mood})
        except Exception as exc:
            logger.warning("plusi/agent: emit_step failed: %s", exc)

    return {
        "mood": mood,
        "text": text,
        "tool_results": tool_results,
        "proactive_messages": proactive_messages,
    }


def wake_plusi(prompt: str, context=None, source: str = "subscription") -> dict:
    """Wake Plusi from a subscription or heartbeat event.

    Parameters
    ----------
    prompt:   The wake-up prompt text.
    context:  Optional dict with event payload / context data.
              Serialised as JSON and appended to the prompt.
    source:   Origin label (e.g. "subscription", "heartbeat").

    Returns
    -------
    dict from run_plusi() — mood, text, tool_results, proactive_messages.
    """
    full_prompt = prompt
    if context is not None:
        try:
            full_prompt = f"{prompt}\n\nKontext: {json.dumps(context, ensure_ascii=False)}"
        except (TypeError, ValueError) as exc:
            logger.warning("plusi/agent: wake_plusi context serialisation failed: %s", exc)

    logger.info("plusi/agent: wake_plusi source=%s", source)
    return run_plusi(full_prompt)
