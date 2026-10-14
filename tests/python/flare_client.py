"""Small GET-only test client. Credentials come exclusively from environment variables."""

import ipaddress
import json
import os
import re
import socket
from dataclasses import dataclass, field
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class SmokeError(RuntimeError):
    """A failure that deliberately excludes credentials, URLs, headers, and response bodies."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


@dataclass(frozen=True)
class ApiResponse:
    status: int
    _body: bytes = field(repr=False)

    def json(self):
        try:
            return json.loads(self._body)
        except (ValueError, UnicodeError):
            raise SmokeError("Response is not valid JSON") from None

    def expect_field(self, name, expected):
        payload = self.json()
        if not isinstance(payload, dict) or payload.get(name) != expected:
            raise SmokeError("Response JSON did not match the expected field")


class FlareClient:
    def __init__(self, base_url, *, timeout=10, max_bytes=1024 * 1024, internal=False):
        try:
            parsed = urlsplit(base_url)
            hostname = parsed.hostname
            port = parsed.port  # Validate malformed ports before issuing any request.
            del port
        except (TypeError, ValueError):
            raise SmokeError("Invalid API base URL") from None
        if (
            not hostname
            or parsed.scheme not in {"http", "https"}
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
            or any(ord(char) <= 32 for char in base_url)
            or not base_url.isascii()
            or "\\" in base_url
        ):
            raise SmokeError("API base URL must be an origin without credentials or a path")
        try:
            loopback = ipaddress.ip_address(hostname).is_loopback
        except ValueError:
            loopback = hostname == "localhost"
        if internal and not loopback:
            raise SmokeError(
                "Internal staging checks require localhost or a literal loopback IP"
            )
        if parsed.scheme != "https" and not loopback:
            raise SmokeError("HTTPS is required except for localhost or literal loopback IPs")
        if not isinstance(timeout, (int, float)) or not 0 < timeout <= 30:
            raise SmokeError("Timeout must be greater than zero and at most 30 seconds")
        if not isinstance(max_bytes, int) or not 0 < max_bytes <= 2 * 1024 * 1024:
            raise SmokeError("Response limit must be between 1 byte and 2 MiB")
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._max_bytes = max_bytes
        self._opener = build_opener(_NoRedirect())
        self.internal = internal

    def __repr__(self):
        return "FlareClient(base_url=<redacted>)"

    def get(self, path, *, authenticated=False, expected_status=200):
        if (
            not isinstance(path, str)
            or not path.startswith("/")
            or path.startswith("//")
            or any(character in path for character in ("?", "#", "\\"))
            or any(ord(character) <= 32 for character in path)
            or not path.isascii()
            or any(part in {".", ".."} for part in path.split("/"))
        ):
            raise SmokeError("Use an absolute API path without query, fragment, or traversal")
        headers = {"Accept": "application/json"}
        if authenticated:
            token = os.environ.get("FLARE_TEST_API_KEY", "")
            if not re.fullmatch(r"fl_[A-Za-z0-9_-]+", token):
                raise SmokeError("FLARE_TEST_API_KEY must contain a valid Flare API key")
            headers["Authorization"] = f"Bearer {token}"
        request = Request(self._base_url + path, headers=headers, method="GET")
        try:
            try:
                response = self._opener.open(request, timeout=self._timeout)
            except HTTPError as error:
                response = error
            with response:
                status = response.code
                if 300 <= status < 400:
                    raise SmokeError("API redirect refused")
                if status != expected_status:
                    raise SmokeError(f"Expected HTTP {expected_status}; received HTTP {status}")
                body = response.read(self._max_bytes + 1)
                if len(body) > self._max_bytes:
                    raise SmokeError("API response exceeds the configured size limit")
                return ApiResponse(status, body)
        except (URLError, OSError, socket.timeout, HTTPException):
            raise SmokeError("API connection failed or timed out") from None
