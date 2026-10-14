import os

import pytest
from flare_client import FlareClient


def pytest_addoption(parser):
    parser.addoption(
        "--staging", action="store_true", help="Enable read-only staging API checks"
    )
    parser.addoption(
        "--staging-internal",
        action="store_true",
        help="With --staging, check internal health/readiness through a loopback SSH tunnel",
    )


def pytest_configure(config):
    if config.getoption("--staging-internal") and not config.getoption("--staging"):
        raise pytest.UsageError("--staging-internal also requires --staging")


def pytest_collection_modifyitems(config, items):
    if not config.getoption("--staging"):
        skip = pytest.mark.skip(reason="Pass --staging and set FLARE_TEST_BASE_URL to opt in")
        for item in items:
            if "staging" in item.keywords:
                item.add_marker(skip)


@pytest.fixture(scope="session")
def staging_client(request):
    base_url = os.environ.get("FLARE_TEST_BASE_URL")
    if not base_url:
        pytest.fail("FLARE_TEST_BASE_URL is required with --staging", pytrace=False)
    return FlareClient(base_url, internal=request.config.getoption("--staging-internal"))
