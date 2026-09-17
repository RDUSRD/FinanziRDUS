#!/usr/bin/env bash
#
# Container entrypoint for the FinanciRDUS API.
#   1. Wait for the database (retry with timeout).
#   2. Apply Alembic migrations (alembic upgrade head).
#   3. Run the seed module, which decides idempotently based on Settings.seed_on_start
#      (SEED_ON_START); with SEED_ON_START=false it skips and exits 0.
#   4. Start Uvicorn on 0.0.0.0:8000.
#
set -euo pipefail

DB_WAIT_TIMEOUT="${DB_WAIT_TIMEOUT:-60}"

echo "[entrypoint] Waiting for the database to be ready (timeout ${DB_WAIT_TIMEOUT}s)..."
DB_WAIT_TIMEOUT="${DB_WAIT_TIMEOUT}" python - <<'PY'
import os
import sys
import time

from sqlalchemy import create_engine, text

url = os.environ["DATABASE_URL"]
timeout = int(os.environ.get("DB_WAIT_TIMEOUT", "60"))
deadline = time.time() + timeout

while time.time() < deadline:
    try:
        engine = create_engine(url, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        engine.dispose()
        print("[entrypoint] Database is ready.")
        sys.exit(0)
    except Exception:  # noqa: BLE001 - cualquier fallo de conexion significa "todavia no esta lista"
        print("[entrypoint] Database not ready yet, retrying...")
        time.sleep(2)

# Sin volcar la excepcion ni la URL: los logs del contenedor no filtran infraestructura.
print(f"[entrypoint] ERROR: database not reachable after {timeout}s.", file=sys.stderr)
sys.exit(1)
PY

echo "[entrypoint] Applying database migrations..."
alembic upgrade head

echo "[entrypoint] Running seed (idempotent; gated by SEED_ON_START)..."
python -m app.seed

echo "[entrypoint] Starting Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
