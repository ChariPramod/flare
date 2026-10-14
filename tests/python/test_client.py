import io
import json
import threading
from http.client import BadStatusLine
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError

import pytest
from flare_client import ApiResponse, FlareClient, SmokeError


class StubResponse(io.BytesIO):
    def __init__(self, body=b"{}", code=200):
        super().__init__(body)
        self.code = code


@pytest.mark.parametrize(
    "base",
    [
        "http://example.com",
        "https://user:secret@example.com",
        "https://example.com/v1",
        "https://example.com?token=secret",
        "https://example.com#secret",
        "file:///tmp/example",
        "http://127.0.0.1.evil.test",
        "https://example.com:invalid",
        "https://example.com\n",
    ],
)
def test_rejects_unsafe_base_urls(base):
    with pytest.raises(SmokeError) as error:
        FlareClient(base)
    assert "secret" not in str(error.value)
    assert base not in str(error.value)


@pytest.mark.parametrize(
    "base",
    [
        "http://localhost:4000",
        "http://127.0.0.1:4000",
        "http://[::1]:4000",
        "https://api.example.com/",
    ],
)
def test_allows_secure_and_loopback_origins(base):
    assert repr(FlareClient(base)) == "FlareClient(base_url=<redacted>)"


@pytest.mark.parametrize(
    "base",
    [
        "https://api.staging.example.com",
        "https://localhost.evil.test",
        "https://192.168.1.1",
        "https://127.1",
        "https://[::ffff:127.0.0.1]",
    ],
)
def test_internal_mode_rejects_non_loopback_origins(base):
    with pytest.raises(SmokeError, match="Internal staging checks require"):
        FlareClient(base, internal=True)


@pytest.mark.parametrize(
    "base",
    [
        "http://127.0.0.1:14000",
        "http://localhost:14000",
        "http://[::1]:14000",
    ],
)
def test_internal_mode_accepts_explicit_loopback_origins(base):
    assert FlareClient(base, internal=True).internal is True


@pytest.mark.parametrize(
    "path", ["https://other.test", "//other.test", "/../health", "/health?key=x", "/health\n"]
)
def test_rejects_paths_that_change_origin_or_leak_query(path):
    with pytest.raises(SmokeError):
        FlareClient("http://localhost").get(path)


def test_key_is_env_only_and_never_attached_to_public_reads(monkeypatch):
    monkeypatch.setenv("FLARE_TEST_API_KEY", "fl_test_secret")
    requests = []
    client = FlareClient("http://localhost", timeout=4)

    def receive(request, timeout):
        requests.append(request)
        assert timeout == 4
        return StubResponse(b'{"status":"ok"}')

    monkeypatch.setattr(client._opener, "open", receive)
    client.get("/health").expect_field("status", "ok")
    client.get("/v1/domains", authenticated=True)
    assert requests[0].get_header("Authorization") is None
    assert requests[1].get_header("Authorization") == "Bearer fl_test_secret"
    assert all(request.get_method() == "GET" for request in requests)


def test_response_and_errors_do_not_render_secrets(monkeypatch):
    client = FlareClient("http://localhost")
    response = ApiResponse(200, b"private-body")
    assert "private-body" not in repr(response)
    with pytest.raises(SmokeError, match="not valid JSON"):
        response.json()

    def rejected(request, timeout):
        raise HTTPError(
            request.full_url, 403, "secret", {"secret": "secret"}, io.BytesIO(b"secret")
        )

    monkeypatch.setattr(client._opener, "open", rejected)
    with pytest.raises(SmokeError) as error:
        client.get("/health")
    assert str(error.value) == "Expected HTTP 200; received HTTP 403"


def test_timeout_errors_are_redacted(monkeypatch):
    client = FlareClient("http://localhost")

    def timeout(request, timeout):
        raise URLError("secret-token in private URL")

    monkeypatch.setattr(client._opener, "open", timeout)
    with pytest.raises(SmokeError) as error:
        client.get("/health")
    assert str(error.value) == "API connection failed or timed out"


def test_malformed_http_status_is_redacted(monkeypatch):
    client = FlareClient("http://localhost")

    def malformed(request, timeout):
        raise BadStatusLine("private-response-value")

    monkeypatch.setattr(client._opener, "open", malformed)
    with pytest.raises(SmokeError) as error:
        client.get("/health")
    assert str(error.value) == "API connection failed or timed out"


@pytest.mark.parametrize(
    "token", ["", "session-token", "fl_", "fl_bad\nheader", "fl_bad\x01header"]
)
def test_invalid_keys_fail_before_network(monkeypatch, token):
    monkeypatch.setenv("FLARE_TEST_API_KEY", token)
    with pytest.raises(SmokeError, match="valid Flare API key"):
        FlareClient("http://localhost").get("/v1/domains", authenticated=True)


def test_large_responses_are_bounded(monkeypatch):
    client = FlareClient("http://localhost", max_bytes=8)
    monkeypatch.setattr(client._opener, "open", lambda *args, **kwargs: StubResponse(b"a" * 9))
    with pytest.raises(SmokeError, match="size limit"):
        client.get("/health")


def test_redirect_never_forwards_authorization(monkeypatch):
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append((self.path, self.headers.get("Authorization")))
            self.send_response(302)
            self.send_header("Location", "/credential-sink")
            self.end_headers()

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("FLARE_TEST_API_KEY", "fl_test_secret")
    try:
        client = FlareClient(f"http://127.0.0.1:{server.server_port}")
        with pytest.raises(SmokeError, match="redirect refused"):
            client.get("/start", authenticated=True)
        assert requests == [("/start", "Bearer fl_test_secret")]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_expected_unauthorized_response_and_json_shape(monkeypatch):
    client = FlareClient("http://localhost")
    monkeypatch.setattr(
        client._opener, "open", lambda *args, **kwargs: StubResponse(b"{}", 401)
    )
    assert client.get("/v1/domains", expected_status=401).status == 401
    with pytest.raises(SmokeError, match="expected field"):
        ApiResponse(200, json.dumps({"status": "private-value"}).encode()).expect_field(
            "status", "ok"
        )
