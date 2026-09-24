import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

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
      // El front y la API se sirven por HTTPS en Railway, así que la cookie de
      // sesión se manda sólo por HTTPS.
      SESSION_COOKIE_SECURE: "true",
      // Secretos que no viven en el repo: `preserve()` deja el valor ya cargado
      // en Railway (definilos una vez con `railway variables`, o desde el
      // dashboard, ANTES de aplicar). Con APP_ENV=production la API NO arranca
      // si SECRET_KEY falta.
      SECRET_KEY: preserve(),
      ADMIN_USERNAME: preserve(),
      ADMIN_PASSWORD: preserve(),
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
