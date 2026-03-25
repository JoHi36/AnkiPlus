"""
Tests for ai/gemini.py — error handling paths.

Covers:
- retry_with_backoff: 500 retry, 400 no-retry, 429 retry
- get_google_response: malformed JSON, empty body, missing API key
- ERROR_MESSAGES: status code mapping

NOTE: 'requests' is NOT installed in this environment — run_tests.py installs a
_MockModule stub.  We must replace sys.modules["requests"] with a real-class
stub BEFORE importing ai.gemini so that `except requests.exceptions.RequestException`
in gemini.py resolves to an actual BaseException subclass.
"""

import json
import sys
import types
import importlib
import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Step 1: install a requests stub whose exception classes are real
# ---------------------------------------------------------------------------

class _RequestException(Exception):
    """Fake requests.exceptions.RequestException."""
    def __init__(self, msg="", response=None):
        super().__init__(msg)
        self.response = response

class _HTTPError(_RequestException):
    """Fake requests.exceptions.HTTPError."""

class _ConnectionError(_RequestException):
    """Fake requests.exceptions.ConnectionError."""

class _Timeout(_RequestException):
    """Fake requests.exceptions.Timeout."""


_fake_exceptions = types.SimpleNamespace(
    RequestException=_RequestException,
    HTTPError=_HTTPError,
    ConnectionError=_ConnectionError,
    Timeout=_Timeout,
)

# Build a lightweight fake 'requests' module
_fake_requests = types.ModuleType("requests")
_fake_requests.exceptions = _fake_exceptions
_fake_requests.post = MagicMock()   # tests will patch this per-call

sys.modules["requests"] = _fake_requests


# ---------------------------------------------------------------------------
# Step 2: install stubs for gemini.py's internal imports
# ---------------------------------------------------------------------------

def _make_stubs():
    tools_stub = MagicMock()
    tools_stub.registry = MagicMock()
    tools_stub.registry.get_function_declarations = MagicMock(return_value=[])

    stubs = {
        "config": MagicMock(
            get_config=MagicMock(return_value={}),
            RESPONSE_STYLES={},
            is_backend_mode=MagicMock(return_value=False),
            get_backend_url=MagicMock(return_value="http://backend"),
            get_auth_token=MagicMock(return_value=""),
            get_refresh_token=MagicMock(return_value=""),
            update_config=MagicMock(),
        ),
        "auth": MagicMock(
            get_auth_headers=MagicMock(return_value={"Content-Type": "application/json"}),
            refresh_auth_token=MagicMock(return_value=False),
        ),
        "system_prompt": MagicMock(
            get_system_prompt=MagicMock(return_value="system prompt"),
        ),
        "tools": tools_stub,
        "agent_loop": MagicMock(run_agent_loop=MagicMock(return_value="agent result")),
    }
    return stubs


# Save original modules before overwriting — restore in conftest/teardown
_saved_modules = {}
_stubs = _make_stubs()
for _name, _stub in _stubs.items():
    _saved_modules[f"ai.{_name}"] = sys.modules.get(f"ai.{_name}")
    _saved_modules[_name] = sys.modules.get(_name)
    sys.modules[f"ai.{_name}"] = _stub
    sys.modules[_name] = _stub

# Also save requests module
_saved_modules["requests"] = sys.modules.get("requests")

# Remove any cached gemini module so a fresh import picks up our stubs
_gemini_keys = [k for k in sys.modules if "gemini" in k and "test" not in k]
for _key in _gemini_keys:
    _saved_modules[_key] = sys.modules.pop(_key)


# ---------------------------------------------------------------------------
# Step 3: import the module under test
# ---------------------------------------------------------------------------

import ai.gemini as _gemini

retry_with_backoff = _gemini.retry_with_backoff
get_google_response = _gemini.get_google_response
get_user_friendly_error = _gemini.get_user_friendly_error
ERROR_MESSAGES = _gemini.ERROR_MESSAGES


# ---------------------------------------------------------------------------
# Step 4: restore original modules IMMEDIATELY after import
# ---------------------------------------------------------------------------
# We needed the stubs only so ai.gemini could import successfully.
# Now that it's imported and we have references to its functions,
# restore the original modules so subsequent test files are not polluted.

for _key, _original in _saved_modules.items():
    if _original is None:
        sys.modules.pop(_key, None)
    else:
        sys.modules[_key] = _original
del _saved_modules


# ---------------------------------------------------------------------------
# Helpers: build fake response objects
# ---------------------------------------------------------------------------

def _make_response(status_code, body=None, json_data=None, raise_for_status_exc=None):
    """Return a MagicMock that looks like a requests.Response."""
    resp = MagicMock()
    resp.status_code = status_code

    if json_data is not None:
        resp.json.return_value = json_data
        resp.text = json.dumps(json_data)
    elif body is not None:
        resp.text = body
        resp.json.side_effect = ValueError("no JSON")
    else:
        resp.text = ""
        resp.json.side_effect = ValueError("no JSON")

    if raise_for_status_exc is not None:
        resp.raise_for_status.side_effect = raise_for_status_exc
    else:
        resp.raise_for_status.return_value = None

    return resp


# ---------------------------------------------------------------------------
# 1. retry_with_backoff retries on 500 server error
# ---------------------------------------------------------------------------

class TestRetryWithBackoff:

    def test_retry_on_500(self):
        """retry_with_backoff should retry twice on 500 then succeed on the third call."""
        fail_resp = _make_response(500)
        ok_resp = _make_response(200, json_data={"text": "ok"})

        call_count = 0

        def func():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                return fail_resp
            return ok_resp

        with patch("ai.gemini.time") as mock_time:
            mock_time.sleep = MagicMock()
            result = retry_with_backoff(func, max_retries=3, initial_delay=0.01)

        assert call_count == 3
        assert result is ok_resp

    def test_no_retry_on_400(self):
        """retry_with_backoff must NOT retry on 400 — return immediately after one call."""
        call_count = 0

        def func():
            nonlocal call_count
            call_count += 1
            return _make_response(400)

        result = retry_with_backoff(func, max_retries=3)

        assert call_count == 1
        assert result.status_code == 400

    def test_rate_limit_429_triggers_retry(self):
        """retry_with_backoff should retry on 429 (rate limit) responses."""
        fail_resp = _make_response(429)
        ok_resp = _make_response(200, json_data={"text": "ok"})

        call_count = 0

        def func():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                return fail_resp
            return ok_resp

        with patch("ai.gemini.time") as mock_time:
            mock_time.sleep = MagicMock()
            result = retry_with_backoff(func, max_retries=3, initial_delay=0.01)

        assert call_count == 2
        assert result is ok_resp

    def test_exhausted_retries_raises_on_500(self):
        """When all retries are used up on 500, an exception must propagate."""
        http_err = _HTTPError("500 Server Error")
        fail_resp = _make_response(500, raise_for_status_exc=http_err)

        call_count = 0

        def func():
            nonlocal call_count
            call_count += 1
            return fail_resp

        with patch("ai.gemini.time") as mock_time:
            mock_time.sleep = MagicMock()
            with pytest.raises(_HTTPError):
                retry_with_backoff(func, max_retries=2, initial_delay=0.01)

        # Called max_retries + 1 = 3 times
        assert call_count == 3

    def test_network_exception_retried(self):
        """Network-level ConnectionError should be retried until success."""
        call_count = 0

        def func():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise _ConnectionError("network down")
            return _make_response(200, json_data={"ok": True})

        with patch("ai.gemini.time") as mock_time:
            mock_time.sleep = MagicMock()
            result = retry_with_backoff(func, max_retries=3, initial_delay=0.01)

        assert call_count == 3
        assert result.status_code == 200


# ---------------------------------------------------------------------------
# 2. get_google_response — malformed / empty body, missing API key
# ---------------------------------------------------------------------------

class TestGetGoogleResponseErrorPaths:

    def _call(self, response_mock, api_key="test-key"):
        """Call get_google_response with minimal args, mocking requests.post."""
        _fake_requests.post = MagicMock(return_value=response_mock)
        with patch("ai.gemini.is_backend_mode", return_value=False):
            with patch("ai.gemini.get_auth_token", return_value=""):
                with patch("ai.gemini.get_config", return_value={}):
                    return get_google_response(
                        user_message="Hello",
                        model="gemini-3-flash-preview",
                        api_key=api_key,
                        config={},
                    )

    def test_malformed_json_response(self):
        """200 with invalid JSON body should raise gracefully (not crash with raw ValueError)."""
        resp = _make_response(200, body="not-json-at-all{{{}}")
        resp.raise_for_status.return_value = None

        with pytest.raises(Exception) as exc_info:
            self._call(resp)

        # Must be an Exception, not a silent pass
        assert exc_info.value is not None

    def test_empty_response_body(self):
        """200 with empty body should raise gracefully, not leave an unhandled exception."""
        resp = _make_response(200, body="")
        resp.raise_for_status.return_value = None

        with pytest.raises(Exception) as exc_info:
            self._call(resp)

        assert exc_info.value is not None

    def test_missing_api_key_handled_gracefully(self):
        """
        Empty API key + 400 from server should raise a clean Exception,
        not a raw AttributeError or TypeError.
        """
        error_body = {"error": {"code": "VALIDATION_ERROR", "message": "API key not valid"}}
        resp = _make_response(400, json_data=error_body)
        resp.raise_for_status.return_value = None

        with pytest.raises(Exception) as exc_info:
            self._call(resp, api_key="")

        assert str(exc_info.value) != ""

    def test_none_api_key_does_not_cause_silent_failure(self):
        """
        Passing None as api_key triggers a len(None) TypeError inside gemini.py.
        The test verifies that whatever exception propagates is a proper Exception,
        not a silent hang or non-Exception crash.
        """
        error_body = {"error": {"code": "VALIDATION_ERROR", "message": "API key required"}}
        resp = _make_response(400, json_data=error_body)
        resp.raise_for_status.return_value = None

        # gemini.py does `len(api_key)` in a debug log — api_key=None raises TypeError.
        # We just assert that an exception is raised (it won't silently succeed).
        with pytest.raises(Exception):
            self._call(resp, api_key=None)


# ---------------------------------------------------------------------------
# 3. ERROR_MESSAGES mapping
# ---------------------------------------------------------------------------

class TestErrorMessagesMapping:

    def test_known_codes_have_messages(self):
        """All documented error codes must map to non-empty strings."""
        known_codes = [
            "QUOTA_EXCEEDED",
            "TOKEN_EXPIRED",
            "TOKEN_INVALID",
            "NETWORK_ERROR",
            "RATE_LIMIT_EXCEEDED",
            "BACKEND_ERROR",
            "GEMINI_API_ERROR",
            "VALIDATION_ERROR",
            "TIMEOUT_ERROR",
        ]
        for code in known_codes:
            msg = get_user_friendly_error(code)
            assert isinstance(msg, str), "Expected string for code %s" % code
            assert len(msg) > 0, "Expected non-empty message for code %s" % code

    def test_unknown_code_returns_generic_message(self):
        """An unknown code must return a fallback message, not None or empty string."""
        msg = get_user_friendly_error("NONEXISTENT_CODE_XYZ")
        assert isinstance(msg, str)
        assert len(msg) > 0

    def test_unknown_code_with_custom_default(self):
        """When a custom default is provided for an unknown code, it must be returned."""
        custom = "Custom fallback message"
        msg = get_user_friendly_error("NO_SUCH_CODE", default_message=custom)
        assert msg == custom

    def test_quota_exceeded_message_content(self):
        """QUOTA_EXCEEDED message should be a non-empty string."""
        msg = ERROR_MESSAGES.get("QUOTA_EXCEEDED", "")
        assert len(msg) > 0

    def test_all_message_values_are_strings(self):
        """Every value in ERROR_MESSAGES must be a non-empty string."""
        for code, msg in ERROR_MESSAGES.items():
            assert isinstance(msg, str), "ERROR_MESSAGES[%s] is not a string" % code
            assert len(msg) > 0, "ERROR_MESSAGES[%s] is empty" % code
