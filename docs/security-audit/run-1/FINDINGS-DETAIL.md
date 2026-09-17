# FinanciRDUS — Confirmed Findings Detail (run-1)

This file documents the complete source path and a target-neutral, bounded local
reproduction for every **confirmed** finding of severity `medium`, `high`, or `critical`.

## Result: no confirmed findings

This run produced **zero confirmed records**. Two source-grounded candidates were
independently validated and refuted; their full traces, evidence, and refutation reasons
are retained in `findings.json` under `verdict: "rejected"` so future runs do not repeat
the unsupported claims:

- `backend/app/config.py:Settings.cors_origins:CORSMiddleware_wildcard_credentials` — refuted: a conditional operator misconfiguration with no ambient credential to protect and no source-visible wildcard path.
- `backend/app/routers/data.py:_apply_merge+export_data:unbounded_full_store_read` — refuted: per-request bounds are source-visible, and the claimed aggregate effect has no cross-boundary blast radius in a single-user, deliberately unauthenticated app where any reachable peer already holds full CRUD authority.

One lead remains open (not a confirmed finding): see `NEEDS-VALIDATION.md`.

## Why no `confirmed` record exists

The audit's execution boundary is source-and-local-only. Target-controlled execution is
permitted only inside an OS-enforced sandbox (no external network, empty allowlisted
environment, read-only target and toolchain, scratch-only writes, explicit resource and
wall-clock limits). The sandbox itself was available and used, but the ASGI runtime
dependencies (`fastapi`, `starlette`, `sqlalchemy`, `pydantic`) are not installed locally
and network installs are prohibited, so the running service could not be exercised. Under
the candidate gate, a `confirmed` record requires a bounded local observed result; that
condition could not be met for any candidate, and the residual issues are self-impact
robustness items (HTTP 500 to the requester) rather than cross-boundary violations. They
are recorded as hardening notes in `REPORT.md` §6.
