# FinanciRDUS

Registro personal de gastos e ingresos del mes: cargás movimientos, definís topes por
categoría y la app te dice cuánto te queda, en qué se te va la plata, cómo venís contra los
6 meses anteriores y si te estás pasando de algún presupuesto. También trae un panel con la
metodología **25/15/50/10** (crecimiento, estabilidad, esencial, recompensas) que compara el
objetivo de cada frasco contra lo gastado.

**Todo se maneja en dólares (USD)**, que es la moneda de la cartera. Podés cargar un movimiento
en **bolívares**: escribís el monto en Bs y la tasa (Bs por USD) y la app calcula y guarda el
equivalente en USD, conservando el monto original y la tasa para mostrarlos como detalle.

Además podés crear **varias carteras USD con nombre** (por ejemplo "Binance", "Cartera USD") y
registrar **deudas**: una cartera con **saldo inicial negativo** es una deuda, y cada pago la
acerca a 0 (el pago cuenta como gasto del mes). Mientras haya deuda, **pagarla es la prioridad
#1**: hay un panel de deudas destacado y el plan 25/15/50/10 lo avisa.

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

Antes de levantar, **poné tu `SECRET_KEY` y tu credencial en el `.env`** (el `.env.example` trae
todo el bloque comentado):

```bash
openssl rand -hex 32        # pegá el resultado en SECRET_KEY
```

`ADMIN_USERNAME` / `ADMIN_PASSWORD` son la credencial de arranque: crean el admin la primera vez
que arranca la API, y **el primer ingreso obliga a cambiarla** por una que elijas (esa es la que
queda guardada en la base). Si ya existe un admin, esas variables se ignoran. Con
`APP_ENV=production` la API **no arranca** si `SECRET_KEY` falta o es débil.

- App: **http://localhost:8080** (pide usuario y contraseña)
- Documentación interactiva de la API (Swagger): **http://localhost:8000/api/docs** (se puede
  apagar con `DOCS_ENABLED=false`; por defecto está activa)

Al arrancar, el contenedor `api` espera a Postgres, aplica las migraciones, **crea la credencial
del admin si todavía no existe** y —si la base no tiene movimientos ni presupuestos y
`SEED_ON_START=true`— carga un **mes de ejemplo**
con movimientos repartidos en las 10 categorías de gasto (incluido uno cargado en bolívares a una
tasa), 6 meses de historial, 10 presupuestos y **3 carteras** (dos con deuda: `Binance` y
`Cartera USD normal`, con un pago de deuda de ejemplo), para que todos los gráficos y paneles
tengan datos desde el primer minuto.

```bash
make help          # lista todos los atajos
make logs          # seguir los logs
make down          # bajar (conserva los datos)
make seed          # re-sembrar el ejemplo (¡borra tus movimientos!)
make admin-reset   # restablecer la contraseña del admin (usa ADMIN_PASSWORD del .env)
make clean         # bajar y borrar el volumen de datos
```

## Qué hace

- **Alta, edición y borrado de movimientos** (gasto o ingreso) con monto, categoría, fecha y
  nota. El monto se carga en **USD o en Bs**: si elegís bolívares indicás la tasa (Bs por USD)
  y la app calcula el equivalente en dólares; la tabla muestra el monto en USD y, para las
  entradas en Bs, el detalle `Bs … @ tasa`. Podés editar y borrar sin tocar código.
- **Tres KPIs grandes**: ingresos del mes, gastos del mes y cuánto queda (en rojo si es negativo).
- **Comparación histórica**: el gasto del mes contra el promedio de los 6 meses anteriores,
  con el porcentaje de más/menos y el detalle de en cuántos meses se basó.
- **Donut de gastos por categoría** con el total en el centro y el porcentaje en la leyenda.
- **Barras de los últimos 6 meses** con el mes que estás mirando destacado.
- **Presupuestos por categoría**: un tope mensual por categoría con barra de progreso que se
  pone **ámbar** al 80% y **roja** cuando lo superás.
- **Plan 25/15/50/10**: cuatro frascos (crecimiento, estabilidad, esencial, recompensas) que
  reparten el ingreso del mes según su porcentaje y comparan el objetivo contra lo gastado de las
  categorías asignadas; cada categoría se puede reasignar a otro frasco desde el panel.
- **Carteras y deudas**: creás carteras USD con nombre y cada movimiento se asigna a una. Una
  cartera con **saldo inicial negativo** es una deuda; registrás pagos y el panel muestra cuánto
  falta y el porcentaje pagado. El selector de cartera filtra los movimientos y sus gráficos.
- **Líneas de detalle en las facturas** (opcional): cada movimiento se puede desglosar en
  productos/servicios con su precio; cuando hay líneas, el total es la suma y la facturita se
  muestra como una factura real (con desglose). Solo aplican a movimientos en USD.
- **Export e import JSON**: descargás todo tu historial y lo volvés a subir, fusionando o
  reemplazando (el import es transaccional: si algo falla, no se toca nada).
- **Categorías**: 10 de gasto (supermercado, comidas afuera, transporte, alquiler y servicios,
  salud, suscripciones, ropa, ocio, ahorro, otros) y 4 de ingreso (sueldo, freelance,
  inversiones, otros).
- **Login y panel de administración** (arriba a la derecha, botón **Admin**): cambiar tu
  contraseña y ver/cerrar las **sesiones activas** (dispositivo, IP, último uso y vencimiento),
  incluida la de este navegador. Cerrar una sesión corta ese dispositivo al instante; el botón
  **Salir** del membrete termina la sesión actual.

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

- **El dinero son centavos enteros** de punta a punta (base, API y estado del frontend). Nunca
  floats. La moneda canónica es **USD**; una entrada en Bs guarda el monto original y la tasa, y
  el backend calcula el equivalente en dólares (`round_half_up`).
- **Una deuda es un saldo negativo**: el saldo de una cartera es
  `saldo inicial + ingresos − gastos + pagos de deuda` y no se guarda, se calcula. Un pago de
  deuda sube el saldo hacia 0 y a la vez **cuenta como gasto del mes**.
- **El backend calcula, el frontend formatea**: los totales, porcentajes, promedios y estados
  de presupuesto salen de `/api/stats/*` y `/api/budgets`. El frontend no recalcula negocio.
- **Los meses son strings `YYYY-MM`** con aritmética entera, y "hoy" se calcula con `APP_TZ`
  (`America/Caracas` por defecto), nunca con la hora UTC del contenedor.
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
# Sin esto, con APP_ENV=production la app no arranca (SECRET_KEY es obligatoria):
export SECRET_KEY="$(openssl rand -hex 32)"
export ADMIN_USERNAME=rdus ADMIN_PASSWORD='una-clave-larga-y-propia'
alembic upgrade head && python -m app.auth_seed && python -m app.seed   # migrar, admin, ejemplo
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
make test-integration  # contrato completo contra el stack levantado (248 checks; re-siembra solo)
make lint              # ruff + eslint
```

- **Backend**: unitarios de la lógica pura (aritmética de meses, bisiestos, promedios,
  umbrales del 80%/100%, shares) y de API completos con `TestClient` y SQLite en memoria:
  autenticación (login, bloqueo por intentos, sesiones, cambio de contraseña, CSRF), CRUD,
  validaciones, presupuestos, stats, export/import (merge, replace, inválidos y
  límites). Hay además un test marcado `postgres` para correr contra la base real:
  `TEST_DATABASE_URL=... pytest -m postgres`.
- **Frontend**: `vitest` sobre la matemática de dinero/meses/gráficos y tests de render e
  interacción (formulario, edición, borrado, presupuestos, navegación de mes, estados de
  comparación y de error) contra un servidor falso.
- **Integración (contrato completo)**: [`tests/integration/api_smoke.py`](tests/integration/api_smoke.py)
  pega contra el stack real (API + nginx) y verifica autenticación (login, cookie, sesiones,
  logout, CSRF), el contrato completo, los límites, el proxy, las cabeceras de seguridad y CORS.
  Se autentica con la `ADMIN_USERNAME`/`ADMIN_PASSWORD` de tu entorno o de tu `.env`. Es
  destructivo (usa import `replace`), por eso `make test-integration` re-siembra el ejemplo al
  terminar.

## Seguridad y alcance

**La app pide credencial: un solo usuario (el dueño) con una sola contraseña.** Todo el ledger
queda detrás de la sesión; lo único abierto es `/api/health` (lo usan Docker y Railway) y el
propio login.

- La sesión es un **token opaco que vive en la base** (se guarda sólo su hash con pepper) y
  viaja en una cookie `httpOnly`, `SameSite=Lax` y `Secure` cuando se sirve por HTTPS. Expira
  por inactividad (30 días) y tiene un tope duro (60 días), y se puede cerrar a distancia desde
  **Admin → Sesiones activas**.
- La contraseña se hashea con `scrypt` (parámetros OWASP). El primer ingreso usa la credencial
  de arranque (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) y la app **obliga a cambiarla**; después
  manda la contraseña guardada en la base. Reiniciar con otra `ADMIN_PASSWORD` no la pisa.
- Fuerza bruta: `LOGIN_MAX_ATTEMPTS` intentos fallidos (5 por defecto) bloquean el login
  `LOGIN_LOCKOUT_MINUTES` minutos (15). Las mutaciones con `Origin` ajeno se rechazan con `403`.
- Con `APP_ENV=production` la API **no arranca** si `SECRET_KEY` falta, quedó vacía o es más
  corta que 32 caracteres. Generala con `openssl rand -hex 32` y ponela en tu `.env`.
- ¿Olvidaste la contraseña? `make admin-reset` (usa `ADMIN_PASSWORD` del `.env` y vuelve a
  obligar el cambio en el próximo ingreso).

Además:

- Postgres **no** se publica al host (vive sólo en la red de Compose).
- La API se publica únicamente en `127.0.0.1` (`API_BIND`), accesible desde tu máquina para
  ver Swagger. El navegador entra por `web`, que proxea `/api` en el mismo origen y se publica
  en `0.0.0.0` por defecto (`WEB_BIND`).
- `SESSION_COOKIE_SECURE=false` es lo que hace funcionar la LAN por HTTP plano: con `true` el
  navegador no manda la cookie. En Railway (HTTPS) va en `true`.
- **No la expongas a Internet sin TLS.** Si lo vas a hacer: TLS + un proxy delante,
  `SECRET_KEY` propia, `SESSION_COOKIE_SECURE=true`, credenciales propias, sacá
  `SEED_ON_START` y apagá `/api/docs` (`DOCS_ENABLED=false`).

El contenedor de la API corre como usuario sin privilegios (`appuser`), nginx corre sin
privilegios (uid 101) y el SPA se sirve con CSP, `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy` y `Permissions-Policy` (deniega camera/microphone/geolocation/payment/usb).
No se manda HSTS a propósito: en local la app se sirve por HTTP plano, sin TLS. El import tiene
tope de 5 MB y 20.000 movimientos por archivo, y los montos están acotados al rango de
`INTEGER` de Postgres.

### Checklist de producción web: qué aplica y qué no

Es una app personal, local y sin terceros, así que varias cosas del checklist de producción
no aplican y lo dejamos explícito en vez de simularlas: **no hay analítica, ni tracking, ni
fuentes o CDNs externos**, y la única cookie es la de sesión (la pone el propio backend, es
`httpOnly` y no la lee ningún script). Por eso no corresponde banner de consentimiento,
páginas legales, `sitemap.xml`, `robots.txt` ni Open Graph (tampoco hay tráfico externo).
Lo que sí se aplica y está hecho: `lang="es"`, título y meta description, favicon SVG inline,
imágenes/íconos sin requests externos (no hay imágenes de contenido), contraste AA, navegación
por teclado, foco visible, `prefers-reduced-motion`, estados de carga/error/vacío con reintento
en todas las vistas, validación de formularios con `aria-invalid`/`aria-describedby`, y
cabeceras de seguridad en el HTML.


## Limitaciones conocidas

- Los listados no tienen paginación (el volumen es personal y la UI siempre consulta por mes;
  el export sí devuelve todo por diseño).
- La moneda de la cartera es USD; las entradas en bolívares se convierten con la tasa que cargás
  en cada movimiento (no hay tasa global ni cotización automática). El detalle `Bs … @ tasa` se
  muestra junto al monto en USD, pero no hay un total mensual en bolívares.
- Cada cartera tiene **un** saldo (una deuda); para deudas separadas, creá carteras separadas. No
  hay transferencias entre carteras ni saldo histórico por mes: el saldo se calcula con los
  movimientos cargados.
- Los tests del frontend corren contra un servidor falso; el contrato real se verifica con la
  suite de integración que se corre contra el stack levantado (health, CRUD, presupuestos,
  stats, export/import, límites, proxy, cabeceras y CORS).
- Borrar un movimiento pide confirmación, pero no hay deshacer.
