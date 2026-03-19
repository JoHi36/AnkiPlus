"""
anki_utils.py — Utilities for safe Anki API access from background threads.
"""

import re
import threading


def run_on_main_thread(fn, timeout=14):
    """Run a function on the main Qt thread and wait for the result.

    Tool execute functions run in daemon threads (via _run_with_timeout in
    tool_executor.py), but Anki's mw.col is only safe on the main thread.
    This helper uses QTimer.singleShot(0, ...) to marshal the call.

    Args:
        fn: Callable that takes no arguments and returns a value.
            All mw.col access must happen inside this callable.
        timeout: Max seconds to wait. Must be strictly less than the
                 tool's timeout_seconds (convention: timeout_seconds - 1).

    Returns:
        The return value of fn.

    Raises:
        TimeoutError: If the main thread doesn't respond in time.
        Exception: Any exception raised by fn.
    """
    from aqt.qt import QTimer

    result = {}
    error = {}
    done = threading.Event()

    def _on_main():
        try:
            result["value"] = fn()
        except Exception as e:
            error["value"] = e
        finally:
            done.set()

    QTimer.singleShot(0, _on_main)
    if not done.wait(timeout=timeout):
        raise TimeoutError("Main thread did not respond")
    if "value" in error:
        raise error["value"]
    return result["value"]


def strip_html_and_cloze(text):
    """Strip HTML tags and resolve cloze markup for display.

    '{{c1::answer::hint}}' → 'answer'
    '<b>bold</b>' → 'bold'
    """
    if not text:
        return ""
    # Resolve cloze: {{c1::answer::hint}} → answer, {{c1::answer}} → answer
    clean = re.sub(r'\{\{c\d+::(.*?)(?:::[^}]*)?\}\}', r'\1', text)
    # Strip HTML tags
    clean = re.sub(r'<[^>]+>', ' ', clean)
    # Collapse whitespace
    clean = re.sub(r'\s+', ' ', clean)
    # Strip HTML entities
    clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
    return clean.strip()
