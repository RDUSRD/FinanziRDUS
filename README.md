# FinanciRDUS

Registro personal de gastos e ingresos del mes: cargás movimientos, definís topes por
categoría y la app te dice cuánto te queda, en qué se te va la plata, cómo venís contra los
6 meses anteriores y si te estás pasando de algún presupuesto.

Es la evolución a proyecto completo de una app de un solo archivo HTML: ahora tiene backend
Python con base de datos real, frontend React tipado y todo se levanta con Docker Compose.
La versión original quedó en [`legacy/index.html`](legacy/index.html) como referencia de
diseño y de reglas de negocio (y sigue funcionando si la abrís con el navegador).

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic · Pydantic v2 |
| Base de datos | PostgreSQL 16 |
| Frontend | Vite · React 19 · TypeScript estricto · Tailwind CSS v4 · TanStack Query |
| Gráficos | SVG escritos a mano (sin librerías de charts) |
| Infra | Docker Compose · nginx sin privilegios (proxea `/api` en el mismo origen) |
| Tests | pytest (backend) · vitest (frontend) |

## Levantarlo

Requisitos: Docker con Compose v2. Nada más (no hace falta Python ni Node en tu máquina).

```bash
git clone <repo> FinanciRDUS && cd FinanciRDUS   # o simplemente entrá a la carpeta
cp .env.example .env                              # opcional: ajustar puertos y credenciales
docker compose up --build -d                      # o: make up
```

- App: **http://localhost:8080**
- Documentación interactiva de la API (Swagger): **http://localhost:8000/api/docs** (se puede
  apagar con `DOCS_ENABLED=false`; por defecto está activa)

Al arrancar, el contenedor `api` espera a Postgres, aplica las migraciones y —si la base
no tiene movimientos ni presupuestos y `SEED_ON_START=true`— carga un **mes de ejemplo**
con 44 movimientos repartidos en las 10 categorías, 6 meses de historial y 10 presupuestos,
para que todos los gráficos tengan datos desde el primer minuto.

```bash
make help          # lista todos los atajos
make logs          # seguir los logs
make down          # bajar (conserva los datos)
make seed          # re-sembrar el ejemplo (¡borra tus movimientos!)
make clean         # bajar y borrar el volumen de datos
```

## Qué hace

- **Alta, edición y borrado de movimientos** (gasto o ingreso) con monto, categoría, fecha y nota.
  Podés editar y borrar sin tocar código.
- **Tres KPIs grandes**: ingresos del mes, gastos del mes y cuánto queda (en rojo si es negativo).
- **Comparación histórica**: el gasto del mes contra el promedio de los 6 meses anteriores,
  con el porcentaje de más/menos y el detalle de en cuántos meses se basó.
- **Donut de gastos por categoría** con el total en el centro y el porcentaje en la leyenda.
- **Barras de los últimos 6 meses** con el mes que estás mirando destacado.
- **Presupuestos por categoría**: un tope mensual por categoría con barra de progreso que se
  pone **ámbar** al 80% y **roja** cuando lo superás.
- **Export e import JSON**: descargás todo tu historial y lo volvés a subir, fusionando o
  reemplazando (el import es transaccional: si algo falla, no se toca nada).
- **Categorías**: 10 de gasto (supermercado, comidas afuera, transporte, alquiler y servicios,
  salud, suscripciones, ropa, ocio, ahorro, otros) y 4 de ingreso (sueldo, freelance,
  inversiones, otros).

## Cómo está organizado

```
FinanciRDUS/
├── backend/     FastAPI + SQLAlchemy + Alembic (app/domain.py tiene la lógica pura)
├── frontend/    React + TS + Tailwind (src/lib/ tiene dinero, meses y matemática del donut)
├── docs/        contrato de la API, modelo de datos y arquitectura
├── legacy/      la app original de un solo archivo (referencia)
└── docker-compose.yml, Makefile, .env.example
```

Antes de tocar código, leé **`docs/architecture.md`** (topología, design system, reglas de
accesibilidad y ownership de carpetas), **`docs/api.md`** (contrato congelado de la API,
límites y formas de error) y **`docs/data-model.md`** (tablas y seed).

Decisiones de diseño que vale la pena conocer:

- **El dinero son centavos enteros** de punta a punta (base, API y estado del frontend). Nunca floats.
- **El backend calcula, el frontend formatea**: los totales, porcentajes, promedios y estados
  de presupuesto salen de `/api/stats/*` y `/api/budgets`. El frontend no recalcula negocio.
- **Los meses son strings `YYYY-MM`** con aritmética entera, y "hoy" se calcula con `APP_TZ`
  (`America/Argentina/Buenos_Aires` por defecto), nunca con la hora UTC del contenedor.
- **El promedio es de los 6 meses anteriores** al mes que estás mirando, promediando sólo los
  meses con gastos, e informa en cuántos se basó.

## Desarrollo sin Docker

La forma cómoda es dejar Postgres en Docker y correr el resto con recarga en caliente:

```bash
docker compose up -d db                      # sólo la base
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
export DATABASE_URL=postgresql+psycopg://financirdus:financirdus@localhost:5432/financirdus
alembic upgrade head && python -m app.seed    # migrar y sembrar el ejemplo
uvicorn app.main:app --reload                 # API en :8000

cd ../frontend
pnpm install
pnpm run dev                                  # SPA en :5173 con proxy a /api
```

## Tests

```bash
make test              # backend + frontend
make test-backend      # pytest (en un contenedor descartable)
make test-frontend     # vitest + tsc
make test-integration  # contrato completo contra el stack levantado (148 checks; re-siembra solo)
make lint              # ruff + eslint
```

- **Backend**: unitarios de la lógica pura (aritmética de meses, bisiestos, promedios,
  umbrales del 80%/100%, shares) y de API completos con `TestClient` y SQLite en memoria:
  CRUD, validaciones, presupuestos, stats, export/import (merge, replace, inválidos y
  límites). Hay además un test marcado `postgres` para correr contra la base real:
  `TEST_DATABASE_URL=... pytest -m postgres`.
- **Frontend**: `vitest` sobre la matemática de dinero/meses/gráficos y tests de render e
  interacción (formulario, edición, borrado, presupuestos, navegación de mes, estados de
  comparación y de error) contra un servidor falso.
- **Integración (148 checks)**: [`tests/integration/api_smoke.py`](tests/integration/api_smoke.py)
  pega contra el stack real (API + nginx) y verifica el contrato completo, los límites, el
  proxy, las cabeceras de seguridad y CORS. Es destructivo (usa import `replace`), por eso
  `make test-integration` re-siembra el ejemplo al terminar.

## Seguridad y alcance

**Esta app no tiene autenticación: es de un solo usuario, a propósito.** Cualquiera que llegue
al puerto del frontend puede leer, modificar y borrar tus finanzas. Por eso:

- Postgres **no** se publica al host (vive sólo en la red de Compose).
- La API se publica únicamente en `127.0.0.1` (`API_BIND`), accesible desde tu máquina para
  ver Swagger. El navegador entra por `web`, que proxea `/api` en el mismo origen y se publica
  en `0.0.0.0` por defecto (`WEB_BIND`).
- Si algún día querés usarla desde otra máquina de tu LAN, poné `API_BIND=0.0.0.0` sólo si
  entendés el riesgo, o entrá por el puerto del frontend.
- **No la expongas a Internet tal como está.** Si lo vas a hacer: TLS + un proxy delante,
  un secreto por header, sacá `SEED_ON_START`, cambiá las credenciales por defecto y apagá
  `/api/docs` (`DOCS_ENABLED=false`).

El contenedor de la API corre como usuario sin privilegios (`appuser`), nginx corre sin
privilegios (uid 101) y el SPA se sirve con CSP, `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy` y `Permissions-Policy` (deniega camera/microphone/geolocation/payment/usb).
No se manda HSTS a propósito: en local la app se sirve por HTTP plano, sin TLS. El import tiene
tope de 5 MB y 20.000 movimientos por archivo, y los montos están acotados al rango de
`INTEGER` de Postgres.

### Checklist de producción web: qué aplica y qué no

Es una app personal, local y sin terceros, así que varias cosas del checklist de producción
no aplican y lo dejamos explícito en vez de simularlas: **no hay cookies, ni analítica, ni
tracking, ni fuentes o CDNs externos**, por lo que no corresponde banner de consentimiento,
páginas legales, `sitemap.xml`, `robots.txt` ni Open Graph (tampoco hay tráfico externo).
Lo que sí se aplica y está hecho: `lang="es"`, título y meta description, favicon SVG inline,
imágenes/íconos sin requests externos (no hay imágenes de contenido), contraste AA, navegación
por teclado, foco visible, `prefers-reduced-motion`, estados de carga/error/vacío con reintento
en todas las vistas, validación de formularios con `aria-invalid`/`aria-describedby`, y
cabeceras de seguridad en el HTML.

## Limitaciones conocidas

- Los listados no tienen paginación (el volumen es personal y la UI siempre consulta por mes;
  el export sí devuelve todo por diseño).
- La moneda está fija en ARS (`Intl.NumberFormat('es-AR')`); cambiarla es una línea en el
  frontend y la etiqueta del formulario.
- Los tests del frontend corren contra un servidor falso; el contrato real se verifica con la
  suite de integración que se corre contra el stack levantado (health, CRUD, presupuestos,
  stats, export/import, límites, proxy, cabeceras y CORS).
- Borrar un movimiento pide confirmación, pero no hay deshacer.
