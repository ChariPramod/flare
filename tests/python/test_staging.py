"""These GET requests do not submit notifications or change application resources."""

import os

import pytest
from flare_client import SmokeError

pytestmark = pytest.mark.staging


def test_health_boundary(staging_client):
    if staging_client.internal:
        response = staging_client.get("/health")
        response.expect_field("status", "ok")
        response.expect_field("service", "api")
    else:
        staging_client.get("/health", expected_status=404)


def test_readiness_boundary(staging_client):
    if staging_client.internal:
        staging_client.get("/ready").expect_field("status", "ready")
    else:
        staging_client.get("/ready", expected_status=404)


def test_domains_requires_authentication(staging_client):
    staging_client.get("/v1/domains", expected_status=401)


def test_authenticated_domains(staging_client):
    if not os.environ.get("FLARE_TEST_API_KEY"):
        pytest.skip("Set FLARE_TEST_API_KEY to opt into the authenticated read check")
    payload = staging_client.get("/v1/domains", authenticated=True).json()
    if not isinstance(payload, list):
        raise SmokeError("Domains response must be a JSON list")
