# FinanciRDUS — Arquitectura

App personal para registrar gastos e ingresos del mes, con presupuestos por categoría,
gráficos, comparación contra los 6 meses anteriores, export/import JSON y un panel con la
metodología **25/15/50/10**. El dinero es **USD** (canónico); los registros se pueden cargar
en bolívares indicando la tasa, y el backend guarda el equivalente en USD. Los movimientos
pertenecen a **carteras** con nombre (`accounts`) y una cartera con saldo inicial negativo
representa una **deuda** (pagar la deuda es la prioridad cuando existe).

**Decisiones fijadas:** un solo usuario **con credencial propia** (login único, sin registro ni
multirol; pensado para uso local o LAN), PostgreSQL como base de datos, frontend React +
TypeScript + Tailwind. Ninguna de estas cosas se cambia sin actualizar este documento.

## Layout del repositorio

```
FinanciRDUS/
├── docker-compose.yml          # orquestación (root, no lo toca ningún agente)
├── Makefile                    # atajos (up, down, logs, test, seed, migrate)
├── .env.example                # variables de entorno documentadas
├── README.md
├── docs/                       # este documento + api.md + data-model.md
├── legacy/index.html           # app single-file original (referencia de diseño y de reglas)
├── backend/                    # FastAPI + SQLAlchemy + Alembic (dueño: agente backend)
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/versions/
│   ├── scripts/entrypoint.sh
│   └── app/
│       ├── main.py             # create_app(), CORS, CSRF, routers, /api/health
│       ├── config.py           # Settings (pydantic-settings) leídas del entorno
│       ├── db.py               # engine, SessionLocal, get_db
│       ├── models.py           # SQLAlchemy 2.x (DeclarativeBase, Mapped)
│       ├── schemas.py          # Pydantic v2 request/response
│       ├── domain.py           # lógica pura (sin DB): meses, promedios, umbrales, shares
│       ├── security.py         # scrypt, tokens de sesión, cookie, CSRF, require_session
│       ├── seed.py             # datos de ejemplo + entrypoint `python -m app.seed`
│       ├── auth_seed.py        # credencial del admin + entrypoint `python -m app.auth_seed`
│       ├── routers/{auth,admin,accounts,movements,budgets,stats,plan,data}.py
│       └── tests/              # pytest
└── frontend/                   # Vite + React + TS + Tailwind (dueño: agente frontend)
    ├── Dockerfile              # build multi-stage + nginx
    ├── nginx.conf              # sirve dist/ y proxea /api -> api:8000
    ├── package.json            # pnpm
    ├── pnpm-workspace.yaml     # cooldown de releases nuevas (minimumReleaseAge: 1440 = 24 h)
    ├── src/
    │   ├── api/                # client.ts, types.ts, queries.ts (TanStack Query)
    │   ├── auth/               # AuthContext (sesión) + AuthGate (login | cambio forzado | app)
    │   ├── lib/                # money.ts, month.ts, chart.ts, credentials.ts (con tests)
    │   ├── components/
    │   └── App.tsx, main.tsx, index.css
    └── src/**/*.test.ts        # vitest
```

## Topología Docker

| Servicio | Imagen | Puerto host | Rol |
|---|---|---|---|
| `db`   | `postgres:16-alpine` | no publicado | Datos, volumen `pgdata` |
| `api`  | build `backend/`     | `127.0.0.1:8000` (configurable con `API_BIND`) | FastAPI + Uvicorn; migra, crea la credencial del admin si falta y siembra al arrancar |
| `web`  | build `frontend/`    | `0.0.0.0:8080` (configurable con `WEB_BIND`) | nginx sin privilegios: sirve el SPA y proxea `/api` → `api:8000` |

**Postura de exposición:** la app pide credencial (un solo usuario), así que la API puede
publicarse sólo en `127.0.0.1` y dejar el único puerto realmente expuesto a la LAN en el
frontend, que proxea `/api` en el mismo origen y donde vive el login. **Para llevarla a una IP
pública hace falta TLS**: sin HTTPS la cookie tiene que ir sin `Secure` (si no el navegador no la
manda) y viajaría en claro.

- `api` espera a `db` con `depends_on: condition: service_healthy` (healthcheck `pg_isready`).
- `web` espera a `api` con healthcheck propio sobre `/api/health`.
- Bindings del host: `API_BIND` (API, default `127.0.0.1`) y `WEB_BIND` (frontend, default
  `0.0.0.0`). El frontend se expone a la LAN a propósito porque proxea `/api` en el mismo origen.
- Al arrancar, `api` corre `alembic upgrade head`, después `python -m app.auth_seed` (crea la
  credencial del admin si no existe; **nunca** pisa una existente) y por último `python -m
  app.seed`. El seed lo decide `app.seed` leyendo `SEED_ON_START` (única fuente de verdad) y es
  idempotente: siembra sólo cuando **no hay movimientos ni presupuestos**, así nunca pisa datos
  del usuario.
- El SPA habla con `/api` en el **mismo origen** a través de nginx: sin CORS en producción.
  CORS queda habilitado y configurable (`CORS_ORIGINS`) para el desarrollo con Vite.
- `docker compose up --build` es el único comando necesario para tener todo andando.

## Autenticación

Un solo usuario. La cookie de sesión es la única puerta: todo el ledger está detrás de ella y
sólo quedan abiertos `/api/health` y los endpoints de `/api/auth`.

```
navegador ──POST /api/auth/login──► routers/auth.py
                                    ├─ scrypt contra admin_users.password_hash (y un hash señuelo
                                    │  cuando el usuario no existe: mismo costo, no filtra cuál sí)
                                    ├─ login_attempts: cuenta fallos recientes y bloquea (429)
                                    └─ crea una fila en `sessions` y devuelve el token en la cookie
navegador ──cualquier /api/*───────► security.require_session (dependencia)
                                    ├─ hash_token(cookie) == sessions.token_hash (HMAC + SECRET_KEY)
                                    ├─ revoked_at IS NULL, expires_at y tope absoluto > now
                                    └─ desliza la expiración (a lo sumo una escritura por minuto)
```

- **El token es opaco y la base guarda sólo su hash** (HMAC-SHA256 con `SECRET_KEY`): una fuga de
  `sessions` no entrega sesiones usables. CSRF se cubre con `SameSite=Lax` más un middleware ASGI
  que en los métodos mutantes se apoya en `Sec-Fetch-Site` (lo pone el navegador y no se puede
  falsificar; además sobrevive a los proxies que reescriben `Host`, como `changeOrigin` en el
  proxy de Vite) y sólo cae al `Origin` contra `CORS_ORIGINS`/host si esa cabecera no viene. No
  toca el cuerpo, para no interferir con el import, que limita su propio tamaño mientras lo lee.
- **Protección sin tocar cada handler**: los routers se incluyen en `create_app()` con
  `dependencies=[Depends(require_session)]`. Los endpoints que además necesitan la sesión
  (me / logout / panel) la piden explícitamente y reciben sesión + usuario.
- **Panel (`/api/admin/sessions`)**: lista las sesiones vivas (dispositivo, IP, último uso,
  vencimiento) y cierra una o todas. Cerrar la sesión actual borra la cookie; cerrarla desde otro
  dispositivo deja a ese navegador en `401`.
- **Frontend**: `AuthProvider` pregunta `GET /api/auth/me` al montar y `AuthGate` decide entre
  login, cambio de contraseña forzado y app. Cualquier `401`, en cualquier request, saca al
  usuario de la app y limpia la caché de React Query (`setUnauthorizedHandler` en `client.ts`).

## Variables de entorno

`DATABASE_URL` (postgresql+psycopg://...), `POSTGRES_USER/PASSWORD/DB`,
`APP_ENV` (development|production), `APP_TZ` (default `America/Caracas`),
`CORS_ORIGINS` (coma-separado), `SEED_ON_START` (true|false), `DOCS_ENABLED` (true|false,
default `true`), `LOG_LEVEL`.
Autenticación: `SECRET_KEY` (pepper del hash de los tokens de sesión), `ADMIN_USERNAME` /
`ADMIN_PASSWORD` (credencial de arranque, sólo para crear el admin la primera vez),
`SESSION_COOKIE_SECURE` (true|false, default `false`), `SESSION_TTL_MINUTES` (default `43200`),
`SESSION_ABSOLUTE_TTL_MINUTES` (default `86400`), `LOGIN_MAX_ATTEMPTS` (default `5`),
`LOGIN_LOCKOUT_MINUTES` (default `15`).
Valores por defecto funcionales en `.env.example`; nunca hardcodear secretos en el código.

**Validación al arrancar (fail-closed):** `Settings` valida la configuración al construirla, así
que un valor inválido **impide el arranque** en vez de hacer fallar cada request con `500`. Una
`APP_TZ` que no sea una zona horaria válida y un `APP_ENV` fuera de `development|production`
abortan el arranque; con `APP_ENV=production`, un `CORS_ORIGINS` comodín (`*`) y un `SECRET_KEY`
que siga en el valor por defecto también se rechazan (los tiempos y umbrales de autenticación
deben ser > 0). `DOCS_ENABLED=false` apaga `/api/docs` y `/api/openapi.json` (ambos responden
`404`).

**Zona horaria:** el mes "actual" y la fecha "hoy" se calculan SIEMPRE con `APP_TZ`,
nunca con la hora UTC del contenedor (si no, el mes cambia a las 21:00 hora local).

## Contrato de propiedad (para trabajo en paralelo)

- El agente backend escribe **sólo** en `backend/**`.
- El agente frontend escribe **sólo** en `frontend/**`.
- `docs/**`, `docker-compose.yml`, `Makefile`, `.env.example`, `README.md` y `legacy/**`
  son archivos congelados: ningún agente los modifica. Si algo del contrato no cierra,
  se reporta y lo resuelve quien orquesta, no se improvisa localmente.

## Design system (obligatorio, viene de `legacy/index.html`)

Modo oscuro sobrio, **una sola familia de color** (teal/cian, hue 188) para todos los
gráficos y acentos. El rojo se reserva SÓLO para saldo negativo y tope excedido; el ámbar
SÓLO para el aviso de ≥80% del presupuesto. Nada de arcoíris, gradientes ruidosos ni
sombras pesadas.

| Token | Valor | Uso |
|---|---|---|
| `bg` | `#0e1116` | fondo |
| `surface` | `#171d25` | tarjetas |
| `surface-2` | `#1b2129` | controles, chips, thead |
| `border` | `rgba(255,255,255,.10)` | separadores y bordes de tarjeta |
| `border-control` | `rgba(255,255,255,.38)` | bordes de inputs/botones (≥3:1 sobre `surface`) |
| `text` | `#e6e9ee` | texto principal |
| `muted` | `#98a2b3` | texto secundario y placeholders (≥4.5:1) |
| `accent` | `hsl(188 60% 55%)` | acento, barra primaria, ingresos |
| `danger` | `#ff6b6b` | saldo negativo, presupuesto excedido |
| `warn` | `#f0b429` | presupuesto ≥80% |
| radios | 14px tarjetas, 12px botones, 10px controles | |
| sombra | `0 1px 2px rgba(0,0,0,.45)` (una sola capa) | |
| tipografía | system-ui; números con `tabular-nums` | |

Paleta secuencial de los gráficos (una sola función, compartida):
`paletteFor(n)` → hue 188, `L` interpolado de 86% a 38% y `S` de 72% a 42%, del más claro
(porción más grande) al más oscuro; `n === 1` → `hsl(188 60% 60%)`; `n <= 0` → `[]`.
Peor caso de contraste contra `surface`: ≥3:1.

### Accesibilidad (WCAG 2.2 AA) — no negociable

- Contraste ≥4.5:1 en texto y ≥3:1 en bordes de controles y elementos gráficos.
- Todos los controles con `<label>` asociado; el grupo gasto/ingreso con `fieldset`+`legend`.
- `:focus-visible` visible (outline 2px en `accent`, offset 2px) y navegación completa por teclado.
- **Una sola región live** para los anuncios (`role="status"`), sin duplicar anuncios por
  regiones live simultáneas. Los totales se anuncian con un texto corto, no releyendo los 3 KPIs.
- Errores de formulario: `aria-invalid` + `aria-describedby` apuntando al mensaje, y foco
  al primer campo con error. Sin `role="alert"` en cada campo (evita 4 anuncios a la vez).
- Tablas con `th scope`, `caption` accesible y contenedor de scroll enfocable
  (`tabindex="0"` + `role="region"` + `aria-label`) para que el teclado llegue a las acciones.
- Gráficos: `role="img"` con `aria-label` corto + equivalente en texto/tabla navegable
  (una sola fuente de datos, sin triplicar la misma información).
- Barras de presupuesto con `role="progressbar"`, nombre accesible por categoría y
  `aria-valuetext` que informa el porcentaje real (aunque supere 100%).
- `prefers-reduced-motion` respetado (incluido el scroll programático).
- Targets táctiles ≥44px, cero scroll horizontal indeseado.

## Algoritmos de los gráficos (contrato, no cambiar la matemática)

**Donut** (`viewBox 200x200`, centro 100,100, `r = 68`, trazo 26):
```
C = 2πr
gap = n > 1 ? 2 : 0
L_i = share_i > 0 ? max(3, share_i * C - gap) : 0     // mínimo visible: 3
si sum(L) > C → L_i = L_i * C / sum(L)                 // caso degenerado: muchas porciones mínimas
offset_i = Σ L_j (j < i)
<circle stroke-dasharray="{L} {C-L}" stroke-dashoffset="{-offset}" transform="rotate(-90 100 100)">
```
El total en el centro del agujero; si el texto formateado supera 9 caracteres, usar la
versión abreviada (`$1,2M`). Con `total === 0`: anillo gris + "Sin gastos este mes".

**Barras** (`viewBox 520x260`, padL 46, padR 10, padT 30, padB 46):
`barW = min(56, slot*0.56)`, alto `= (v/max)*plotH`, baseline con gridlines, mes abreviado
abajo (con año cuando cambia). Mes seleccionado en `hsl(188 62% 58%)` + etiqueta "actual";
el resto `hsl(188 38% 40%)`. Fuentes ≥13px dentro del viewBox y `min-width: 440px` en el
host para que el texto no quede ilegible en mobile. Si todos los meses son 0: estado vacío.

## Reglas de negocio (idénticas a `legacy/index.html`, ya validadas)

- Dinero en **centavos enteros** de punta a punta (DB, API y estado del frontend).
  El parseo del input acepta `1.234,56` y `1234.56`; los grupos de 3 dígitos se leen como
  miles (`1.234` y `1,234` → 1234).
- **Moneda canónica USD**: `amount_cents` es siempre centavos de dólar. Un movimiento se puede
  cargar en bolívares con `entry_currency="VES"` + `rate_micros` (Bs por USD × 1e6); el backend
  calcula el equivalente en USD (`round_half_up`) y guarda el monto original y la tasa. El
  frontend no calcula la conversión: la hace el backend y la devuelve.
- **Plan 25/15/50/10**: `jars` es un catálogo fijo (crecimiento 25, estabilidad 15, esencial 50,
  recompensas 10) y `jar_categories` mapea cada categoría de gasto a un frasco (editable). El
  objetivo por frasco es `pct × ingreso del mes` (el último absorbe el redondeo); el estado sale
  de `budget_status`.
- **Carteras y deuda**: `accounts` son carteras USD con nombre. El saldo **no se guarda**: se
  calcula como `opening + Σ(ingreso) − Σ(gasto no pago) + Σ(pago de deuda)`. Una cartera con
  `opening < 0` es una deuda; un pago (`is_debt_payment=true`, categoría system `deudas`) sube el
  saldo hacia 0 y cuenta como gasto del mes. La prioridad cuando hay deuda la expone el panel de
  deudas y el aviso del plan. Los presupuestos y el plan son globales; el selector de cartera sólo
  filtra movimientos y sus vistas derivadas.
- Meses como string `YYYY-MM` con aritmética entera (sin `Date` para la lógica).
  Fechas como string `YYYY-MM-DD` validadas contra el calendario real (bisiestos incluidos).
- Promedio de los 6 meses **anteriores** al mes elegido (no incluye el mes actual),
  promediando **sólo los meses con gastos**, reportando `months_used` (0 → `na`).
- `budgetStatus`: sin tope → `none`; gasto > tope → `over`; gasto ≥ 80% del tope → `warn`; si no `ok`.
- Categorías: 10 de gasto (supermercado, comidas afuera, transporte, alquiler y servicios,
  salud, suscripciones, ropa, ocio, ahorro, otros) y 4 de ingreso (sueldo, freelance,
  inversiones, otros). Salen de la API, no hardcodeadas en el frontend.
- Nunca se usa `innerHTML`/`dangerouslySetInnerHTML` con datos del usuario (la nota es texto).

## Estrategia de tests

- **Backend:** `pytest`. Tests unitarios de `domain.py` (sin DB) + tests de API con
  `TestClient` y una DB de test (SQLite en memoria vía override de dependencia, para que
  corran sin Docker) + un test marcado que verifica el flujo completo contra Postgres.
- **Frontend:** `vitest` para `lib/` (dinero, meses, aritmética del donut) y al menos un
  test de render de la vista principal con `fetch` mockeado. `tsc --noEmit` y `vite build`
  son parte del gate.
- **Integración:** `docker compose up --build` + smoke test de la API real (health, CRUD,
  stats, export/import) y verificación de que el SPA servido por nginx responde y consume la API.
