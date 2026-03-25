"""
Tests for ai/auth.py — token management, auth headers, refresh logic.

Covers:
- get_auth_headers: no token, with token
- refresh_auth_token: missing refresh token, network error
- ensure_valid_token: expired token detection

NOTE: auth.py imports 'requests' at module level. run_tests.py installs a
_MockModule stub for requests when the real package is absent. We need
requests.exceptions to carry real exception classes so 'except Exception'
in auth.py resolves correctly. We install a minimal stub BEFORE importing
ai.auth, then restore sys.modules IMMEDIATELY after import.
"""

import sys
import types
import importlib
import json
import base64
import time
import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Step 1: build a requests stub with real exception classes
# ---------------------------------------------------------------------------

class _RequestException(Exception):
    """Fake requests.exceptions.RequestException."""


_fake_exceptions = types.SimpleNamespace(
    RequestException=_RequestException,
)

_fake_requests = types.ModuleType("requests")
_fake_requests.exceptions = _fake_exceptions
_fake_requests.post = MagicMock()


# ---------------------------------------------------------------------------
# Step 2: install stubs for auth.py's internal imports
# ---------------------------------------------------------------------------

_config_stub = MagicMock()
_config_stub.get_config = MagicMock(return_value={})
_config_stub.update_config = MagicMock()
_config_stub.get_auth_token = MagicMock(return_value="")
_config_stub.get_refresh_token = MagicMock(return_value="")
_config_stub.get_backend_url = MagicMock(return_value="http://backend.test")
_config_stub.get_or_create_device_id = MagicMock(return_value="device-abc-123")

_logging_stub = MagicMock()
_logging_stub.get_logger = MagicMock(return_value=MagicMock())

_saved_modules = {}

_stubs_to_install = {
    "requests": _fake_requests,
    "config": _config_stub,
    "ai.config": _config_stub,
    "utils.logging": _logging_stub,
    "utils": MagicMock(logging=_logging_stub),
}

for _name, _stub in _stubs_to_install.items():
    _saved_modules[_name] = sys.modules.get(_name)
    sys.modules[_name] = _stub

# Remove any cached auth module so a fresh import picks up our stubs
_auth_keys = [k for k in sys.modules if "auth" in k and "test" not in k]
for _key in _auth_keys:
    _saved_modules[_key] = sys.modules.pop(_key)


# ---------------------------------------------------------------------------
# Step 3: import the module under test
# ---------------------------------------------------------------------------

import ai.auth as _auth

get_auth_headers = _auth.get_auth_headers
refresh_auth_token = _auth.refresh_auth_token
ensure_valid_token = _auth.ensure_valid_token


# ---------------------------------------------------------------------------
# Step 4: restore original modules IMMEDIATELY after import
# ---------------------------------------------------------------------------

for _key, _original in _saved_modules.items():
    if _original is None:
        sys.modules.pop(_key, None)
    else:
        sys.modules[_key] = _original
del _saved_modules


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_jwt(exp: int) -> str:
    """Build a minimal valid-looking JWT with the given exp timestamp."""
    header = base64.urlsafe_b64encode(b'{"alg":"RS256"}').rstrip(b"=").decode()
    payload_data = json.dumps({"exp": exp, "sub": "user-1"}).encode()
    payload = base64.urlsafe_b64encode(payload_data).rstrip(b"=").decode()
    return f"{header}.{payload}.fakesignature"


def _make_response(status_code, json_data=None):
    resp = MagicMock()
    resp.status_code = status_code
    if json_data is not None:
        resp.json.return_value = json_data
    else:
        resp.json.side_effect = ValueError("no JSON")
    return resp


# ---------------------------------------------------------------------------
# 1. get_auth_headers — no token
# ---------------------------------------------------------------------------

class TestGetAuthHeadersNoToken:

    def test_returns_content_type_header(self):
        """When no auth token exists, headers still include Content-Type."""
        with patch.object(_auth, "get_or_create_device_id", return_value="dev-id"), \
             patch.object(_auth, "ensure_valid_token", return_value=False), \
             patch.object(_auth, "get_auth_token", return_value=""):
            headers = get_auth_headers()

        assert "Content-Type" in headers
        assert headers["Content-Type"] == "application/json"

    def test_no_authorization_header_when_no_token(self):
        """When auth token is empty, Authorization header must NOT be present."""
        with patch.object(_auth, "get_or_create_device_id", return_value="dev-id"), \
             patch.object(_auth, "ensure_valid_token", return_value=False), \
             patch.object(_auth, "get_auth_token", return_value=""):
            headers = get_auth_headers()

        assert "Authorization" not in headers

    def test_device_id_header_included(self):
        """X-Device-Id header must always be present regardless of auth state."""
        with patch.object(_auth, "get_or_create_device_id", return_value="test-device-xyz"), \
             patch.object(_auth, "ensure_valid_token", return_value=False), \
             patch.object(_auth, "get_auth_token", return_value=""):
            headers = get_auth_headers()

        assert "X-Device-Id" in headers
        assert headers["X-Device-Id"] == "test-device-xyz"


# ---------------------------------------------------------------------------
# 2. get_auth_headers — with token
# ---------------------------------------------------------------------------

class TestGetAuthHeadersWithToken:

    def test_authorization_bearer_present(self):
        """When auth token exists, Authorization: Bearer <token> is in headers."""
        token = "eyJhbGciOiJSUzI1NiJ9.payload.sig"
        with patch.object(_auth, "get_or_create_device_id", return_value="dev-id"), \
             patch.object(_auth, "ensure_valid_token", return_value=True), \
             patch.object(_auth, "get_auth_token", return_value=token):
            headers = get_auth_headers()

        assert "Authorization" in headers
        assert headers["Authorization"] == f"Bearer {token}"

    def test_authorization_format_is_bearer(self):
        """Authorization value must start with 'Bearer ' (capital B, one space)."""
        token = "some-valid-jwt"
        with patch.object(_auth, "get_or_create_device_id", return_value="dev-id"), \
             patch.object(_auth, "ensure_valid_token", return_value=True), \
             patch.object(_auth, "get_auth_token", return_value=token):
            headers = get_auth_headers()

        assert headers["Authorization"].startswith("Bearer ")


# ---------------------------------------------------------------------------
# 3. refresh_auth_token — missing refresh token
# ---------------------------------------------------------------------------

class TestRefreshTokenMissing:

    def test_returns_false_when_no_refresh_token(self):
        """When get_refresh_token() returns empty string, refresh_auth_token returns False."""
        with patch.object(_auth, "get_refresh_token", return_value=""), \
             patch.object(_auth, "get_backend_url", return_value="http://backend.test"):
            result = refresh_auth_token()

        assert result is False

    def test_returns_false_when_refresh_token_is_none(self):
        """When get_refresh_token() returns None, refresh_auth_token returns False."""
        with patch.object(_auth, "get_refresh_token", return_value=None), \
             patch.object(_auth, "get_backend_url", return_value="http://backend.test"):
            result = refresh_auth_token()

        assert result is False

    def test_no_network_request_when_no_refresh_token(self):
        """When refresh token is absent, no HTTP request should be made."""
        with patch.object(_auth, "get_refresh_token", return_value=""), \
             patch.object(_auth, "get_backend_url", return_value="http://backend.test"), \
             patch("ai.auth.requests") as mock_requests:
            refresh_auth_token()

        mock_requests.post.assert_not_called()


# ---------------------------------------------------------------------------
# 4. refresh_auth_token — network error
# ---------------------------------------------------------------------------

class TestRefreshTokenNetworkError:

    def test_returns_false_on_connection_error(self):
        """Network ConnectionError during refresh must be caught and return False."""
        with patch.object(_auth, "get_refresh_token", return_value="valid-refresh-token"), \
             patch.object(_auth, "get_backend_url", return_value="http://backend.test"), \
             patch("ai.auth.requests") as mock_requests:
            mock_requests.post.side_effect = ConnectionError("Network unreachable")
            result = refresh_auth_token()

        assert result is False

    def test_returns_false_on_timeout(self):
        """Timeout during refresh must be caught and return False."""
        with patch.object(_auth, "get_refresh_token", return_value="valid-refresh-token"), \
             patch.object(_auth, "get_backend_url", return_value="http://backend.test"), \
             patch("ai.auth.requests") as mock_requests:
            mock_requests.post.side_effect = TimeoutError("Request timed out")
            result = refresh_auth_token()

        assert result is False

    def test_returns_false_on_401_response(self):
        """401 from server (invalid refresh token) must cause refresh to return False."""
        with patch.object(_auth, "get_refresh_token", return_value="expired-refresh-token"), \
             patch.object(_auth, "get_backend_url", return_value="http://backend.test"), \
             patch.object(_auth, "update_config", MagicMock()), \
             patch("ai.auth.requests") as mock_requests:
            mock_requests.post.return_value = _make_response(401)
            result = refresh_auth_token()

        assert result is False

    def test_returns_true_on_successful_refresh(self):
        """200 response with idToken must update config and return True."""
        new_token = "new-id-token-value"
        response_data = {"idToken": new_token, "refreshToken": "new-refresh"}
        with patch.object(_auth, "get_refresh_token", return_value="valid-refresh-token"), \
             patch.object(_auth, "get_backend_url", return_value="http://backend.test"), \
             patch.object(_auth, "update_config") as mock_update, \
             patch("ai.auth.requests") as mock_requests:
            mock_requests.post.return_value = _make_response(200, json_data=response_data)
            result = refresh_auth_token()

        assert result is True
        mock_update.assert_called_once()
        call_kwargs = mock_update.call_args[1]
        assert call_kwargs.get("auth_token") == new_token


# ---------------------------------------------------------------------------
# 5. ensure_valid_token — expired token detection
# ---------------------------------------------------------------------------

class TestTokenExpiredDetection:

    def test_returns_false_when_no_token(self):
        """ensure_valid_token returns False when no auth token exists."""
        with patch.object(_auth, "get_auth_token", return_value=""):
            result = ensure_valid_token()

        assert result is False

    def test_valid_far_future_token_returns_true(self):
        """Token expiring far in the future should be accepted without refresh."""
        far_future = int(time.time()) + 3600  # expires in 1 hour
        token = _make_jwt(far_future)

        with patch.object(_auth, "get_auth_token", return_value=token):
            result = ensure_valid_token()

        assert result is True

    def test_already_expired_token_triggers_refresh_attempt(self):
        """Token with exp in the past should trigger a refresh attempt."""
        past_exp = int(time.time()) - 100  # already expired
        token = _make_jwt(past_exp)

        with patch.object(_auth, "get_auth_token", return_value=token), \
             patch.object(_auth, "refresh_auth_token", return_value=False) as mock_refresh:
            result = ensure_valid_token()

        mock_refresh.assert_called_once()
        # After failed refresh and truly expired token → False
        assert result is False

    def test_near_expiry_token_triggers_proactive_refresh(self):
        """Token expiring in < 5 minutes should trigger a proactive refresh."""
        near_exp = int(time.time()) + 60  # expires in 1 minute
        token = _make_jwt(near_exp)

        with patch.object(_auth, "get_auth_token", return_value=token), \
             patch.object(_auth, "refresh_auth_token", return_value=True) as mock_refresh:
            result = ensure_valid_token()

        mock_refresh.assert_called_once()
        assert result is True

    def test_malformed_token_does_not_crash(self):
        """A token that is not a valid JWT should not raise — returns truthy fallback."""
        with patch.object(_auth, "get_auth_token", return_value="not.a.jwt"):
            # Should not raise, just return some value
            result = ensure_valid_token()

        # Returns bool(token) = True for non-empty string fallback
        assert isinstance(result, bool)
