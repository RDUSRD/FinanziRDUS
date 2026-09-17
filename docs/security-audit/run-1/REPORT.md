# FinanciRDUS — Security Audit Report (run-1)

## 1. Run metadata

| Field | Value |
|---|---|
| Profile | `standard` |
| Scope | Full repository except generated/vendored paths (`frontend/node_modules`, `backend/.ruff_cache`, `backend/.pytest_cache`, `**/__pycache__`) |
| Source ref | `no-vcs:sha256:94b60186c77cb1b03b3c950c6d7e200a7b70e840afc5e22e898a2b98afa1cf34` — **the target is not a git repository** (no commit exists); the ref is a sha256 over the reviewed backend/frontend/deploy source files |
| Budget | 16 agent invocations planned; **13 spent** (4 wave-1 hunters, 3 coverage critics, 1 wave-2 hunter, 4 candidate validators — one re-run after a discarded prose-wrapped result, 1 Phase-5 record verifier) |
| Execution policy | `sandboxed-source-and-local-only` |
| Sandbox | Bubblewrap (`bwrap`) + `unshare`, verified available: no external network, empty allowlisted environment, read-only target and toolchain, scratch-only writes, `ulimit` CPU/VM/FSIZE/NPROC caps and a wall-clock timeout |
| Local execution limit | The ASGI runtime deps (`fastapi`/`starlette`/`sqlalchemy`/`pydantic`) are **not installed** and network installs are prohibited, so the running app could not be exercised. Only pure-stdlib `backend/app/domain.py` was executed (bounded harness) |
| Prior runs | **None.** No compatible prior `coverage-ledger.json` or `findings.json` exists; every unit was seeded `prior_status: none`/`new`. Nothing was carried or excluded on prior-evidence grounds |
| Output location | `docs/security-audit/run-1/` (user-selected in-repo). The target is not under version control, so no `.gitignore` rule excludes it — the usual "must be VCS-ignored" condition is vacuous rather than satisfied |

This is a full-coverage `standard` run, not a scoped or quick pass. It is nonetheless bounded by the source-and-local-only execution policy: no finding was promoted to `confirmed` because the running service could not be exercised in the required sandbox. There are **no deferred units** and no budget exhaustion; coverage closed with two independent critic passes returning `stop=true`.

## 2. Security posture summary

FinanciRDUS is a deliberately unauthenticated, single-user personal-finance app. Its only real trust boundary is **network reachability**, and the repository is unusually explicit about that (`README.md` "Seguridad y alcance", `docs/architecture.md` "Postura de exposición"): Postgres is unpublished, the API binds to `127.0.0.1` by default, and the frontend port is the single LAN-exposed surface that grants full data access. Within that accepted model, the codebase is well-defended: SQLAlchemy bound parameters everywhere (no string SQL), integer-cents money with range validation and DB CHECK backstops, a hard 5 MB / 20 000-row cap on import with transactional rollback, React text/attribute rendering with no HTML sink, and nginx security headers plus a strict CSP. **No confirmed security finding was established.** Two source-grounded candidates were independently refuted; one dependency-integrity lead remains open for owner/offline verification. The residual issues are robustness/defensive-hardening items, notably input values (year `0000`) that pass validators but make `datetime.date` raise an unhandled exception (HTTP 500).

## 3. Confirmed findings

**None.** No candidate survived to a `confirmed` verdict. No confirmed record was carried from a prior run (there is none).

| Severity | Title | Boundary | Observed result |
|---|---|---|---|
| — | — | — | — |

## 4. Confirmed findings detail

Not applicable (zero confirmed records).

## 5. NEEDS VALIDATION

These are prioritized leads, **not** confirmed vulnerabilities, and carry no severity.

| # | Lead | Repository trace | Exact blocker | Bounded local next step | Safe owner-observed check |
|---|---|---|---|---|---|
| 1 | Backend dev extra declares an unpinned, unused dependency `httpx2` (near-name to `httpx`) | `backend/pyproject.toml:25` (`httpx2>=2`) → `Makefile:38` / `README.md:99` (`pip install -e '.[dev]'`) → `backend/financirdus_backend.egg-info/requires.txt:11` | The state of the configured index for the name `httpx2` (existence, owner, artifact contents) is a hosted fact not observable offline; no Python lockfile/hash pins it; no CI consumes the dev extra | In a network-isolated fixture with a captured index mirror, run a pip **dry-run** resolution of `pip install -e '.[dev]'` and record which distribution provides `httpx2`, its artifact URL and sha256 (or that none exists) | Owner inspects the pip cache/download directory for a prior resolution of `httpx2` from `make test-backend` or `pip install -e '.[dev]'` and captures the resolved artifact and hash |

Fingerprint: `deploy-backend-pyproject-dev-extra-httpx2-unpinned-unused-namespace`.

Note: the runtime image (`backend/Dockerfile:23`, `pip install -e .`) does **not** install the dev extra, so the affected boundary is the developer/operator machine or disposable dev container that runs the documented install, not the shipped image.

## 6. Hardening notes

**Unhandled exceptions reachable from unauthenticated input (self-impact → hardening, not findings).** Each returns HTTP 500 only to the requester; there is no crash, no data mutation, and no cross-principal effect.

- `backend/app/routers/__init__.py` (`month_bounds`): month keys `0000-01` / `0000-12` pass `parse_month` and then `date(0,1,1)` raises an uncaught `ValueError`; `9999-12` makes `shift_month` emit a 5-digit year that the **unguarded** second `parse_month` rejects with an uncaught `ValueError`. Reachable via `?month=` on `/api/movements`, `/api/budgets`, `/api/stats/*`. Fix: reject year `0000` in `parse_month` and move the second `parse_month`/`date()` construction inside the guarded block. Regression: `GET /api/movements?month=0000-01` must be 422.
- `backend/app/routers/movements.py` (create/update) and `backend/app/routers/data.py` (import apply): `domain.valid_date_str` accepts year `0000`, but the later `date.fromisoformat(...)` raises an uncaught `ValueError`. Fix: require year ≥ `0001` in `valid_date_str`.
- `backend/app/routers/data.py` (`_validate_payload`): a movement whose `category_id` is a JSON array/object makes `category_types.get(category_id)` raise an uncaught `TypeError` (unhashable); the validator runs outside the try block. Fix: reject non-string `category_id` with the documented numbered 422.
- `backend/app/routers/data.py` (`_read_body_within_limit`): `declared.isdigit()` then `int(declared)` is not defensive against a digit string that is not an int literal (likely rejected earlier by the ASGI server).

**Configuration / lifecycle.**

- `backend/app/config.py`: `APP_TZ` is materialized lazily in `Settings.tz`; an invalid timezone is accepted at startup and then makes **every** request that computes `current_month()` or serializes a datetime return 500. Add a field validator so a bad timezone fails closed at boot.
- `backend/app/config.py`: `app_env` is read but used nowhere — there is no production profile that rejects a wildcard `CORS_ORIGINS`, disables `/api/docs` + `/api/openapi.json`, or forces `SEED_ON_START` off.
- `backend/app/config.py`: `seed_on_start` is dead config; the effective gate is `entrypoint.sh`'s literal string compare, so `SEED_ON_START=True` parses truthy in `Settings` yet silently does not seed. Collapse to one source of truth.
- `/api/docs` and `/api/openapi.json` are always served with no toggle, reachable through the LAN-exposed web port on the unauthenticated surface.
- `backend/app/seed.py`: the idempotency guard keys only on the `movements` count while `_seed` also resets all `Budget.cap_cents`. A database with user budgets but zero movements will, on the next start (`SEED_ON_START` defaults `true` in compose), re-inject the 44 sample movements and overwrite the owner's caps — contradicting `docs/data-model.md` rule 1. Gate on an explicit already-seeded marker or also check budgets.
- `backend/app/seed.py`: `build_movements`/`_seed` bypass all `domain.validate_*` and the tables have no upper-bound CHECK; current constants are in-range but are explicitly re-tunable.

**Concurrency (not realized under the single-instance default).**

- `backend/app/routers/budgets.py`: `put_budget` is a non-atomic get-or-create upsert; two concurrent first-`PUT`s both INSERT and one raises `IntegrityError` → 500. Use `ON CONFLICT DO UPDATE` or catch it.
- `backend/app/seed.py` + `backend/scripts/entrypoint.sh`: seeding and `alembic upgrade head` are unlocked at container start; a second replica or a manual `make seed` during startup could race.

**Deployment / supply chain.**

- `docker-compose.yml`: `web` publishes `${WEB_PORT:-8080}:8080` with no host-IP restriction, unlike `api` which honours `API_BIND`; consider a `WEB_BIND` control with a restricted default.
- Base images use mutable minor tags (`python:3.12-slim`, `node:22-alpine`, `nginxinc/nginx-unprivileged:1.27-alpine`), and backend runtime deps use open-ended `>=` ranges with no Python lockfile or hash pinning — the image build is not reproducibility/integrity bound.
- `frontend/.dockerignore` omits `.env*` while `frontend/Dockerfile` does `COPY . .`; no `frontend/.env*` exists in-repo and the only consumed var (`VITE_API_BASE`) is non-secret, so impact is latent.
- No container hardening on any service (no `cap_drop`, `read_only` rootfs, `no-new-privileges`, userns remap).
- `frontend/pnpm-workspace.yaml` sets `minimumReleaseAgeExclude` without a matching `minimumReleaseAge`, so the intended pnpm release-cooldown is a no-op.
- `frontend/nginx.conf` sets `nosniff`, `Referrer-Policy`, `X-Frame-Options` and CSP but not HSTS or `Permissions-Policy`.

**Import/CRUD divergence.**

- Import truncates notes to 140 chars via `str(...)`, while movement CRUD rejects an over-long note with 422. Both are bounded and safe, but the siblings should agree; imported notes can carry Python `repr` artifacts.

## 7. Positive source patterns

- All database access uses SQLAlchemy bound parameters; the only literal SQL is a static `SELECT 1` health probe and static DDL defaults.
- Money is integer cents end-to-end with explicit `MAX_CENTS` validation and DB `CHECK` constraints; budgets use integer cross-multiplication (no float thresholds).
- Import is bounded at both the declared and streamed byte level (5 MB) and at 20 000 movements, and applies inside a single transaction that rolls back on any error (verified by the in-repo suite).
- React renders all API data as text/attributes; no `innerHTML`, `dangerouslySetInnerHTML`, `eval`, or `document.write` exists in the frontend.
- nginx serves the SPA with `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, and a restrictive CSP (`default-src 'self'`; `frame-ancestors 'none'`); no `add_header` interpolates a variable, so no response-header injection path exists.
- Containers run as non-root (`appuser` uid 1000; `nginx-unprivileged` uid 101); Postgres is not published; the API defaults to loopback.
- The container entrypoint is fail-closed (`set -euo pipefail`, DB wait with timeout that omits the exception and URL from logs, migrations before serving).
- The frontend build is integrity-bound (`pnpm-lock.yaml` sha512 + `--frozen-lockfile`).

## 8. Coverage summary

From `coverage-ledger.json` (15 units, deterministic canonical IDs):

| State | Count |
|---|---|
| `covered` | 14 |
| `candidate` | 1 (the open `needs_validation` lead above) |
| `blocked` | 0 |
| `deferred` | 0 |
| `planned`/`in_progress` | 0 |
| `out_of_scope` | 0 (full-scope run; only generated/vendored paths are excluded, recorded in `run-metadata.json`) |

Wave 1 covered movements CRUD, import/export, month/date parsing, the app factory/CORS, the SPA render, nginx, compose exposure, and build inputs. The post-wave-1 critic added three units (budgets, stats, and the entrypoint/alembic lifecycle), which wave 2 closed. The post-wave-2 critic and a distinct final-clean critic each returned `stop=true` with no missing units and no reassignments, closing the coverage loop.

Coverage caveats: (a) the run is source-and-local-only, so no unit was closed by executing the running service; (b) the post-wave-2 critic mistakenly listed the three then-open candidates under `resolved_prior_leads` — they are current-run candidates, not prior leads, and the parent did not treat them as resolved; (c) one candidate verifier returned a prose-wrapped result, which was discarded unrepaired and re-run with a fresh verifier as required.

One candidate was refuted for a residual, undocumented effect: none carry over into this report as findings. `findings.json` retains the two `rejected` records (so future runs do not repeat the unsupported claims) and the one `needs_validation` record. Both `validate-findings.cjs` and `validate-coverage-ledger.cjs` pass.
