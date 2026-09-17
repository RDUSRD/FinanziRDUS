# FinanciRDUS — Leads Needing Validation (run-1)

These are prioritized, source-grounded leads with an exact unresolved blocker. They are
**not** confirmed vulnerabilities and carry **no severity**. Each has at least one bounded
local or owner-observed resolution plan. Do not treat any of these as live-test guidance
against a deployed target.

---

## 1. Unused, unpinned dev dependency `httpx2` (near-name to `httpx`)

- **Fingerprint:** `deploy-backend-pyproject-dev-extra-httpx2-unpinned-unused-namespace`
- **Affected boundary:** the backend dev/test dependency install (`pip install -e '.[dev]'`) on a developer machine or disposable dev container. Not the shipped runtime image.
- **Claimed root cause:** a dev-only dependency named `httpx2` is declared with an open-ended range and no hash/lock pinning and is imported by no code, so its resolution target is unverified and its artifact identity is unbound. Whoever controls the `httpx2` distribution name on the configured index can influence what code pip builds and executes on the installing machine.

### Source trace (repository-relative)

1. `entrypoint` — `backend/pyproject.toml:25`: `"httpx2>=2"` under `[project.optional-dependencies].dev`, with no upper bound and no hash. The adjacent comment (`backend/pyproject.toml:23`, "Starlette 1.6+ usa httpx2 en TestClient") does not match the real Starlette/`httpx` relationship.
2. `propagation` — `Makefile:38` (`test-backend`): `pip install -q -e '.[dev]'` inside a disposable `api` container installs the dev extra (including `httpx2`).
3. `propagation` — `README.md:99` ("Desarrollo sin Docker"): documents the same `pip install -e ".[dev]"` on the developer machine.
4. `sink` — `backend/financirdus_backend.egg-info/requires.txt:11`: generated metadata records `httpx2>=2` under `[dev]`, confirming the requirement reaches the resolver.

### Verified evidence

- `backend/pyproject.toml:25` — `"httpx2>=2"`, open-ended, no hash.
- `backend/pyproject.toml:23` — comment attributing the dependency to Starlette, which is incorrect (Starlette's `TestClient` is built on `httpx`).
- `backend/app/tests/conftest.py:8` — `from fastapi.testclient import TestClient`; the suite exercises `TestClient`/`httpx`, and no file in the repository imports `httpx2`.
- `backend/financirdus_backend.egg-info/requires.txt:11` — `httpx2>=2` listed under `[dev]`.
- `backend/Dockerfile:23` — `pip install --no-cache-dir -e .` installs only base dependencies; the dev extra is absent from the release image.

Independent check performed by this audit: a repository-wide search for `httpx2` matches only `backend/pyproject.toml` and the generated `backend/financirdus_backend.egg-info/requires.txt`.

### Blockers (why this is unresolved)

1. The state of the configured package index for the name `httpx2` (existence, owner, artifact contents) is a hosted fact not observable offline; network installs are prohibited in this environment.
2. No Python lockfile or hash pinning exists in the repository to bind the resolved artifact identity, so the artifact actually selected by the open-ended range cannot be determined from source.
3. No CI workflow consumes the dev extra (no `.github`/`.gitlab-ci.yml` exists), so there is no hosted resolution observation.

### Resolution plan

- **Local (bounded):** in a network-isolated fixture with a captured index mirror, run a pip **dry-run** resolution of `pip install -e '.[dev]'` and record which distribution provides `httpx2`, its artifact URL and sha256 — or that no such distribution exists. Compare the resolved name/identity against what the code actually uses (only `fastapi.testclient`/`httpx`).
- **Owner-observed (deployment):** inspect the pip cache/download directory for any prior resolution of `httpx2` from `make test-backend` or `pip install -e '.[dev]'`, and capture the resolved artifact and hash.

### Smallest source fix (if confirmed)

Remove the unused `httpx2>=2` line from `backend/pyproject.toml` `[dev]`; if a client is genuinely needed, keep the canonical `httpx` and pin backend dev dependencies with a lockfile/hashes. A regression test is not applicable to a dependency declaration; the observable check is that `pip install -e '.[dev]'` resolves no `httpx2`.
