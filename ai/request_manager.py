"""
Shared AI Request Manager
Handles AI request lifecycle for both sidebar and overlay.
Only one active request at a time (mutual exclusion).
"""

import time

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

from aqt.qt import QThread, pyqtSignal


class AIRequestThread(QThread):
    """Thread for AI API requests with streaming."""
    chunk_signal = pyqtSignal(str, str, bool, bool)
    finished_signal = pyqtSignal(str)
    error_signal = pyqtSignal(str, str)
    metadata_signal = pyqtSignal(str, object, object, object)
    pipeline_signal = pyqtSignal(str, str, str, object)

    def __init__(self, ai_handler, text, context, history, mode, request_id, insights=None):
        super().__init__()
        self.ai_handler = ai_handler
        self.text = text
        self.context = context
        self.history = history
        self.mode = mode
        self.request_id = request_id
        self.insights = insights
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def run(self):
        try:
            def pipeline_callback(step, status, data):
                if self._cancelled:
                    return
                self.pipeline_signal.emit(self.request_id, step, status, data or {})

            self.ai_handler._pipeline_signal_callback = pipeline_callback

            def stream_callback(chunk, done, is_function_call=False, steps=None, citations=None, step_labels=None):
                if self._cancelled:
                    return
                self.chunk_signal.emit(self.request_id, chunk or "", done, is_function_call)
                if done and (steps or citations or step_labels):
                    self.metadata_signal.emit(self.request_id, steps or [], citations or [], step_labels or [])

            self.ai_handler.get_response_with_rag(
                self.text, context=self.context, history=self.history,
                mode=self.mode, callback=stream_callback,
                insights=self.insights
            )

            if not self._cancelled:
                self.finished_signal.emit(self.request_id)
        except Exception as e:
            if not self._cancelled:
                logger.exception("AIRequestThread: Exception: %s", str(e))
                self.error_signal.emit(self.request_id, str(e))
        finally:
            self.ai_handler._pipeline_signal_callback = None


class AIRequestManager:
    """Shared AI request handler. Only one active request at a time."""

    def __init__(self):
        self._current_thread = None
        self._current_caller = None

    def start_request(self, text, context, history, mode, callbacks, caller_id, insights=None):
        """Start an AI request, cancelling any active request first.

        callbacks dict keys:
          - on_chunk(request_id, chunk, done, is_function_call)
          - on_finished(request_id)
          - on_error(request_id, error)
          - on_metadata(request_id, steps, citations, step_labels) [optional]
          - on_pipeline(request_id, step, status, data) [optional]
        """
        if self._current_thread:
            try:
                self._current_thread.cancel()
            except (AttributeError, RuntimeError) as e:
                logger.debug("start_request: cancel previous thread error: %s", e)
            self._current_thread = None

        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler

        ai_handler = get_ai_handler()
        if not hasattr(ai_handler, 'get_response_with_rag'):
            if callbacks.get('on_error'):
                callbacks['on_error']('', 'AI handler does not support RAG')
            return

        request_id = "%s-%s" % (caller_id, int(time.time() * 1000))
        thread = AIRequestThread(ai_handler, text, context, history, mode, request_id, insights)

        thread.chunk_signal.connect(callbacks['on_chunk'])
        thread.finished_signal.connect(callbacks['on_finished'])
        thread.error_signal.connect(callbacks['on_error'])
        if callbacks.get('on_metadata'):
            thread.metadata_signal.connect(callbacks['on_metadata'])
        if callbacks.get('on_pipeline'):
            thread.pipeline_signal.connect(callbacks['on_pipeline'])
        thread.finished.connect(thread.deleteLater)

        self._current_thread = thread
        self._current_caller = caller_id
        thread.start()

    def cancel(self):
        """Cancel the current request."""
        if self._current_thread:
            try:
                self._current_thread.cancel()
            except (AttributeError, RuntimeError) as e:
                logger.debug("cancel: thread cancel error: %s", e)
            self._current_thread = None
            self._current_caller = None

    @property
    def is_busy(self):
        return self._current_thread is not None


_manager_instance = None

def get_request_manager():
    global _manager_instance
    if _manager_instance is None:
        _manager_instance = AIRequestManager()
    return _manager_instance
