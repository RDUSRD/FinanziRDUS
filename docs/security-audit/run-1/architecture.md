# FinanciRDUS — Audit Architecture Summary (run-1, standard)

## 1. Product, principals, authority, protected resources

FinanciRDUS is a single-user personal finance tracker (monthly income/expense logging,
per-category budgets, charts, JSON export/import). The repository documents one deliberate
design decision: **there is no authentication** (`README.md` "Seguridad y alcance",
`docs/architecture.md` "Postura de exposición"). Every caller that can reach the HTTP
surface has full read/write/delete authority over the single data set.

Principals: (a) the single owner/operator running it locally; (b) any network peer that can
reach the published ports. Protected resource: the movement/budget records in PostgreSQL.
There is no per-resource authorization and no tenant dimension, so "cross-user" findings are
structurally impossible; the only real trust boundary is **network reachability**, which the
repository deliberately narrows (API bound to `127.0.0.1`) and deliberately does not narrow
for the frontend port.

## 2. Comparable baseline

Comparable: a local, single-user, containerised self-hosted web app (e.g. a home dashboard).
That class accepts "no login, bind to loopback, one exposed reverse-proxy port" as its
security trade-off. It does *not* accept unauthenticated exposure to an untrusted network.
FinanciRDUS matches that baseline and documents the residual risk. This calibrates severity;
it does not dismiss any demonstrated finding.

## 3. Stack and source-visible deployment paths

- Backend: Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 (`backend/`).
- DB: PostgreSQL 16 (`db` service; **not published to the host**).
- Frontend: Vite + React 19 + TypeScript strict + Tailwind v4; hand-written SVG charts (`frontend/`).
- Proxy/edge: unprivileged nginx, serves the SPA and proxies `/api` same-origin (`frontend/nginx.conf`).
- Orchestration: `docker-compose.yml` (3 services), `Makefile`, `.env.example`.
- Offline build/test limits: the backend test suite uses an in-memory SQLite `TestClient`
  (no network) and frontend tests use jsdom + a fake fetch server. **Runtime deps are not
  installed locally and network installs are prohibited**, so the ASGI app cannot be executed
  in this environment; only pure-stdlib `app/domain.py` can be exercised by a bounded harness.

## 4. Entry surfaces and source-to-sink paths

1. `GET/POST/PATCH/DELETE /api/movements` → `domain.validate_*` → SQLAlchemy ORM.
2. `GET/PUT/DELETE /api/budgets` → `domain.validate_cap` → ORM.
3. `GET /api/stats/{summary,by-category,monthly}` → month arithmetic (`domain.shift_month`,
   `average_prev_months`, `category_shares`) → ORM aggregation.
4. `GET/POST /api/data/{export,import}` → `_read_body_within_limit` → `json.loads` →
   `_validate_payload` → transactional `_apply_merge`/`_apply_replace`.
5. `GET /api/health`, `GET /api/categories`, `/api/docs`, `/api/openapi.json`.
6. Browser surface: React SPA renders API JSON as text/attributes (no `innerHTML`).
7. Edge: nginx static serving + `/api` proxy + `add_header` security headers + CSP.
8. Build inputs: `backend/Dockerfile`, `frontend/Dockerfile`, dependency manifests.

## 5. Trust boundaries and strongest source-visible control on each

| Boundary | Strongest source-visible control |
|---|---|
| Network → API | No auth by design; `API_BIND` defaults to `127.0.0.1`; Postgres unpublished |
| Network → web | none by design; `WEB_PORT` published without host-IP restriction |
| Untrusted HTTP body → parser | `_read_body_within_limit` (declared + real byte cap, 5 MB) |
| Untrusted JSON → DB | `_validate_payload` + transactional apply with rollback |
| Untrusted query params → month/date | `parse_month`/`valid_date_str` + `month_bounds` |
| Untrusted field values → ORM | SQLAlchemy parameter binding (no string SQL) |
| API JSON → DOM | React text/attribute escaping; nginx CSP `script-src 'self'` |
| Browser → cross-origin | Same-origin `/api` in prod; CORS restricted to `CORS_ORIGINS` |
| Build input → image | `--frozen-lockfile` (frontend); pinned base-image *minor* tags |

## 6. Repository-relative starting paths

`backend/app/main.py`, `backend/app/config.py`, `backend/app/db.py`,
`backend/app/routers/{movements,budgets,stats,data,__init__}.py`, `backend/app/domain.py`,
`backend/app/schemas.py`, `backend/app/models.py`, `backend/app/seed.py`,
`backend/alembic/versions/0001_initial.py`, `backend/scripts/entrypoint.sh`,
`backend/Dockerfile`, `frontend/src/**`, `frontend/nginx.conf`, `frontend/Dockerfile`,
`docker-compose.yml`, `legacy/index.html`.

## 7. Prior-coverage gaps, revalidation targets, same-source exclusions

No compatible prior ledger exists (`prior_status: "none"` everywhere). Nothing is carried
and nothing is excluded on prior-evidence grounds. All coverage gaps are this run's work.

## 8. Companion selection summary

- `WEB-PROTOCOL-AND-AUTH.md` — HTTP response-header injection, credentialed CORS trust (edge + app factory).
- `CLIENT-SIDE.md` — DOM-based XSS, credentialed CORS trust, browser-storage (React SPA).
- `CLOUD-AND-DEPLOYMENT.md` — unexpected service reachability, secret exposure, config precedence drift (compose/nginx).
- `DATA-ISOLATION-AND-LIFECYCLE.md` — export/import scope expansion, import authority expansion (data endpoints).
- `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` — decompression/representation amplification, unbounded buffering, reachable fatal error (import).
- `SUPPLY-CHAIN-AND-RELEASE.md` — mutable/unbound build inputs, build-context inclusion (Dockerfiles).

Excluded reasons are recorded per unit in `coverage-ledger.json`.
