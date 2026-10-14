# Optional Python tests

Write Python tests in `tests/python/`. Flare remains a TypeScript application: pytest adds a small HTTP smoke suite and does not replace Vitest, Playwright, or the Compose acceptance tests.

Use Python 3.9 or newer. From the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r tests/python/requirements.txt
.venv/bin/python -m pytest
.venv/bin/ruff check tests/python
.venv/bin/ruff format --check tests/python
```

The default pytest run executes 38 local client tests and skips all four staging checks. It needs no Docker, running Flare API, account, or credentials. The redirect test uses a temporary loopback HTTP server and verifies that Authorization is never forwarded.

## Public staging checks

Set `FLARE_TEST_BASE_URL` to the public API **origin**, such as `https://api.staging.example.com`. Do not append `/v1`: resource routes include `/v1` explicitly. Remote origins require HTTPS.

```sh
FLARE_TEST_BASE_URL=https://api.staging.example.com \
  .venv/bin/python -m pytest --staging -m staging
```

The staging Caddy configuration deliberately hides `/health` and `/ready`. Public mode asserts that both return **404**, and that an unauthenticated `/v1/domains` request returns **401**. These three checks verify the external access boundary; they do not prove dependency readiness. The fourth check validates authenticated domain listing only when `FLARE_TEST_API_KEY` is present, giving three passes and one skip without a key, or four passes with a suitable key.

Supply a key scoped to the intended test environment through your shell's secret injection or CI secret store; do not put credentials in URLs, command arguments, source files, or committed configuration. A sending-only key cannot list domains, so this check needs a key permitted to read that resource. API keys already select their organization and environment; session tokens are deliberately unsupported.

## Internal health and readiness through an SSH tunnel

Use an existing SSH tunnel that forwards a local loopback port to the staging API's internal port. Set the base origin to that local tunnel and pass both flags:

```sh
FLARE_TEST_BASE_URL=http://127.0.0.1:14000 \
  .venv/bin/python -m pytest --staging --staging-internal -m staging
```

Internal mode accepts only `localhost` or a literal loopback IP such as `127.0.0.1` or `::1`. It rejects remote, private-network, and other hostname origins even over HTTPS. The client does not establish an SSH tunnel or expose the API itself. For a local development API, the same flags can target `http://127.0.0.1:4000`.

Here `/health` must return the API identity and `/ready` must confirm dependency readiness with **200**. Domain authentication checks remain the same: three passes and one optional skip without a key, or four passes with a key. A readiness **503** fails this run. `--staging-internal` without `--staging` is rejected.

All requests use GET. They do not send emails or change business resources; normal server request logs, key last-used timestamps, and rate-limit counters still update. The client refuses redirects, uses the standard TLS certificate checks, applies a 10-second socket timeout and a 1 MiB response limit, and excludes response bodies, URLs, headers, and secrets from its errors. Avoid pytest `--showlocals`, HTTP debug logging, or assertions that print private response data.

## Add your own test

Create `tests/python/test_my_api.py`:

```python
import pytest

pytestmark = pytest.mark.staging


def test_domains_are_private(staging_client):
    staging_client.get("/v1/domains", expected_status=401)
```

Run just that file against staging:

```sh
FLARE_TEST_BASE_URL=https://api.staging.example.com \
  .venv/bin/python -m pytest --staging tests/python/test_my_api.py
```

For an authenticated GET, call `staging_client.get("/v1/domains", authenticated=True)`. The client reads the key from `FLARE_TEST_API_KEY` only for that request. For a local unit test, omit the `staging` marker and use pytest's `monkeypatch` fixture as shown in `test_client.py`.

CI can run the three default commands above after installing the pinned requirements. Public staging runs need the deployed Caddy API origin and optionally an environment-scoped API key. Internal readiness runs additionally require the loopback SSH tunnel and healthy PostgreSQL/Redis/object storage. Keep both as explicit deployment gates; neither command implicitly targets production.
