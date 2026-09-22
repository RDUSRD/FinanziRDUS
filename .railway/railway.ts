import { defineRailway, github, postgres, project, service } from "railway/iac";

const REPO = "RDUSRD/FinanziRDUS";
const BRANCH = "master";

export default defineRailway(() => {
  const db = postgres("Postgres");

  const api = service("api", {
    source: github(REPO, { branch: BRANCH, rootDirectory: "backend" }),
    healthcheck: "/api/health",
    env: {
      // El helper de Postgres entrega DATABASE_URL como postgresql://, y la app usa
      // psycopg v3 (dialecto +psycopg): por eso se compone la URL desde las PG*.
      DATABASE_URL:
        "postgresql+psycopg://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}",
      PORT: "8000",
      APP_ENV: "production",
      APP_TZ: "America/Caracas",
      SEED_ON_START: "false",
      DOCS_ENABLED: "false",
      LOG_LEVEL: "info",
    },
  });

  const web = service("web", {
    source: github(REPO, { branch: BRANCH, rootDirectory: "frontend" }),
    healthcheck: "/",
    env: {
      API_UPSTREAM: "api.railway.internal:8000",
      PORT: "8080",
    },
  });

  return project("financirdus", { resources: [api, web, db] });
});
