"""
anki_utils.py — Utilities for safe Anki API access from background threads.
"""

import re
import threading


def is_main_thread() -> bool:
    """True if the current thread is the Python main thread.

    For Anki addons the Python main thread IS the Qt main thread (Qt's
    event loop runs on it). Background QThreads run with a different
    Python threading.current_thread() identity, so this check distinguishes
    "I'm in the main event loop" from "I'm in a worker thread".

    Use this to make a function safe to call from either context: callers
    on a worker thread should marshal Anki API access via run_on_main_thread,
    callers already on the main thread can call the underlying work directly.
    Calling run_on_main_thread from the main thread DEADLOCKS — it posts a
    callback then waits on a threading.Event that the main thread itself
    needs to fire, which it can't because it's blocked on the wait.
    """
    return threading.current_thread() is threading.main_thread()


def run_on_main_thread(fn, timeout=14):
    """Run a function on the main Qt thread and wait for the result.

    Tool execute functions run in daemon threads (via _run_with_timeout in
    tool_executor.py), but Anki's mw.col is only safe on the main thread.
    This helper uses Anki's mw.taskman.run_on_main() to marshal the call,
    which is the official thread-safe way to post to the main thread.

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
    from aqt import mw

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

    # mw.taskman.run_on_main() is Anki's official API for posting
    # callbacks to the main thread from background threads.
    # Unlike QTimer.singleShot, this works reliably from any thread.
    mw.taskman.run_on_main(_on_main)
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
