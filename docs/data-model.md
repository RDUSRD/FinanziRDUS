# FinanciRDUS — Modelo de datos

PostgreSQL 16. SQLAlchemy 2.x (`DeclarativeBase`, `Mapped`/`mapped_column`) + Alembic.
Todo el dinero es **entero en centavos** (`Integer`). Sin `Float`/`Numeric` para importes.
La moneda canónica es **USD**: `movements.amount_cents` y `budgets.cap_cents` son centavos de
dólar. Los movimientos se pueden cargar en bolívares, guardando además el monto original en Bs
y la tasa usada (ver `movements`). Cada movimiento pertenece a una **cartera** (`accounts`); una
cartera con `opening_balance_cents` negativo representa una **deuda**.

## Tablas

### `categories`
Catálogo fijo de categorías, sembrado por migración de datos (no editable por el usuario).

| columna | tipo | notas |
|---|---|---|
| `id` | `Text` PK | slug: `supermercado`, `comidas-afuera`, ..., `sueldo`, ... |
| `type` | `Text` NOT NULL | `'gasto'` \| `'ingreso'` (CHECK) |
| `label` | `Text` NOT NULL | "Comidas afuera", "Alquiler y servicios", ... |
| `sort_order` | `Integer` NOT NULL | orden de presentación (default 0) |
| `is_system` | `Boolean` NOT NULL default false | categoría interna, no elegible a mano |

Valores (id / label / type), en este orden:

*gasto:* `supermercado` Supermercado · `comidas-afuera` Comidas afuera · `transporte` Transporte ·
`alquiler-servicios` Alquiler y servicios · `salud` Salud · `suscripciones` Suscripciones ·
`ropa` Ropa · `ocio` Ocio · `ahorro` Ahorro · `otros` Otros · `deudas` Deudas (**system**)

*ingreso:* `sueldo` Sueldo · `freelance` Freelance · `inversiones` Inversiones · `otros-ingresos` Otros

Son **15** (11 de gasto + 4 de ingreso). `deudas` es `is_system=true`: no aparece en el selector
manual del formulario, ni en presupuestos, ni en el mapeo de frascos; la usa el backend para los
pagos de deuda.

### `accounts`
Carteras USD con nombre (creadas por el usuario). Una cartera con saldo inicial negativo es una
deuda.

| columna | tipo | notas |
|---|---|---|
| `id` | `Integer` PK autoincrement | |
| `name` | `Text` NOT NULL UNIQUE | 1..60 caracteres (validado en API) |
| `opening_balance_cents` | `Integer` NOT NULL default 0 | con signo; **negativo = deuda** |
| `sort_order` | `Integer` NOT NULL default 0 | orden de presentación |
| `created_at` | `TIMESTAMPTZ` NOT NULL default `now()` | |

El saldo de una cartera no se guarda: se calcula como
`balance = opening_balance_cents + Σ(ingreso) − Σ(gasto no pago) + Σ(pago de deuda)`.
`is_debt = opening_balance_cents < 0`; `remaining_cents = −balance`; `pct_paid = pagos / (−opening)`.
`total_debt_cents` = suma de los saldos negativos.

### `movements`

| columna | tipo | notas |
|---|---|---|
| `id` | `Integer` PK autoincrement | |
| `type` | `Text` NOT NULL | `'gasto'` \| `'ingreso'` (CHECK) |
| `category_id` | `Text` NOT NULL | FK → `categories.id` (RESTRICT) |
| `account_id` | `Integer` NOT NULL | FK → `accounts.id` (RESTRICT) |
| `is_debt_payment` | `Boolean` NOT NULL default false | CHECK `false OR type = 'gasto'` |
| `amount_cents` | `Integer` NOT NULL | **centavos de USD** (canónico), CHECK `> 0` |
| `entry_currency` | `Text` NOT NULL | moneda en que se cargó: `'USD'` \| `'VES'` (CHECK) |
| `entry_amount_cents` | `Integer` NOT NULL | monto tipeado, en su moneda (centavos USD o céntimos de Bs) |
| `rate_micros` | `BigInteger` NULL | Bs por 1 USD × 1_000_000; sólo si `entry_currency='VES'` (CHECK: `NULL` o `> 0`) |
| `date` | `Date` NOT NULL | fecha calendario (sin hora, sin timezone) |
| `note` | `Text` NOT NULL default `''` | máx. 140 caracteres (validado en API) |
| `created_at` | `TIMESTAMPTZ` NOT NULL default `now()` | para ordenar empates |
| `updated_at` | `TIMESTAMPTZ` NOT NULL default `now()` | |

Para una entrada en Bs, `amount_cents = round_half_up(entry_amount_cents × 1_000_000 / rate_micros)`.
Ejemplo: `4.000,00 Bs` (`entry_amount_cents = 400000`) a `40 Bs/USD` (`rate_micros = 40000000`)
→ `amount_cents = 10000` (**$100**). Para una entrada en USD, `entry_amount_cents == amount_cents`
y `rate_micros` es `null`.

Índices: `(date DESC)`, `(category_id)`, `(type, date)`, `(account_id, date DESC)`.
Regla de consistencia (validada en la capa de aplicación, con test): `movements.type`
debe coincidir con `categories.type` de su `category_id`. Un **pago de deuda**
(`is_debt_payment=true`) es siempre `type='gasto'`, `category_id='deudas'` y pertenece a una
cartera con saldo inicial negativo; al calcular el saldo **suma** (acerca la deuda a 0), aunque
en el flujo del mes cuente como gasto.

### `movement_items`
Líneas de detalle **opcionales** de un movimiento: productos/servicios con su precio. Son las que
dan forma de factura al registro. Si un movimiento tiene líneas, su `amount_cents` es la **suma**
de ellas (lo deriva el backend); sin líneas, el total se carga a mano.

| columna | tipo | notas |
|---|---|---|
| `id` | `Integer` PK autoincrement | |
| `movement_id` | `Integer` NOT NULL | FK → `movements.id` **ON DELETE CASCADE** |
| `description` | `Text` NOT NULL | 1..120 caracteres (validado en API) |
| `amount_cents` | `Integer` NOT NULL | precio en **centavos de USD**, CHECK `> 0` |
| `sort_order` | `Integer` NOT NULL default 0 | orden de presentación |

Índice: `(movement_id)`. Las líneas viajan **dentro** de cada movimiento en la API y en el export
(no tienen endpoints propios) y **solo se permiten en movimientos `USD`**: un movimiento en Bs con
líneas es `422`.

### `budgets`
Un tope mensual por categoría de **gasto** (es global, no por mes: es el tope que se
compara contra el gasto del mes que se esté mirando).

| columna | tipo | notas |
|---|---|---|
| `category_id` | `Text` PK | FK → `categories.id` (RESTRICT), sólo categorías de tipo `gasto` |
| `cap_cents` | `Integer` NOT NULL | tope en **centavos de USD**, CHECK `> 0` |
| `updated_at` | `TIMESTAMPTZ` NOT NULL default `now()` | |

Sin fila = sin tope definido. Poner el input vacío borra la fila (nunca guarda `0`).

### `jars`
Catálogo fijo de "frascos" de la metodología 25/15/50/10, sembrado por migración (no editable).

| columna | tipo | notas |
|---|---|---|
| `id` | `Text` PK | `crecimiento` \| `estabilidad` \| `esencial` \| `recompensas` |
| `label` | `Text` NOT NULL | "Crecimiento", "Estabilidad", "Esencial", "Recompensas" |
| `pct` | `Integer` NOT NULL | CHECK `> 0`: 25 / 15 / 50 / 10 |
| `sort_order` | `Integer` NOT NULL | orden de presentación (1..4) |

### `jar_categories`
Mapeo categoría de gasto → frasco (editable desde el panel del plan). Cada categoría de gasto
pertenece a **un** frasco.

| columna | tipo | notas |
|---|---|---|
| `category_id` | `Text` PK | FK → `categories.id` (RESTRICT) |
| `jar_id` | `Text` NOT NULL | FK → `jars.id` (RESTRICT) |

Mapeo por defecto (editable): **esencial** supermercado, transporte, alquiler-servicios, salud,
suscripciones · **crecimiento** ahorro · **estabilidad** otros · **recompensas**
comidas-afuera, ocio, ropa.

### `admin_users`

El único administrador (la app es de un solo usuario; la tabla existe para poder soportar más de
una credencial sin migrar nada). La llena `app.auth_seed` al arrancar, nunca el seed de ejemplo.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `Integer` PK autoincrement | |
| `username` | `Text` NOT NULL UNIQUE | 3..60 caracteres (validado en la API) |
| `password_hash` | `Text` NOT NULL | `scrypt$n$r$p$<salt_b64>$<hash_b64>` (scrypt, stdlib) |
| `must_change_password` | `Boolean` NOT NULL default true | lo pone el bootstrap y el reset; la UI obliga a cambiarla |
| `password_changed_at` | `TIMESTAMPTZ` NULL | |
| `created_at` / `updated_at` | `TIMESTAMPTZ` NOT NULL default `now()` | |

### `sessions`

Sesiones de servidor: la cookie lleva un token opaco y **acá vive el estado**. Se guarda sólo el
hash del token (HMAC-SHA256 con `SECRET_KEY`), así una fuga de esta tabla no entrega sesiones.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `Integer` PK autoincrement | lo usa el panel para cerrar una sesión |
| `token_hash` | `Text` NOT NULL UNIQUE | `hmac(SECRET_KEY, token)`, nunca el token |
| `user_id` | `Integer` NOT NULL | FK → `admin_users.id` **ON DELETE CASCADE** |
| `created_at` | `TIMESTAMPTZ` NOT NULL default `now()` | |
| `last_seen_at` | `TIMESTAMPTZ` NOT NULL default `now()` | se desliza con la actividad (máx. 1 escritura/minuto) |
| `expires_at` | `TIMESTAMPTZ` NOT NULL | vencimiento por inactividad (`SESSION_TTL_MINUTES`) |
| `absolute_expires_at` | `TIMESTAMPTZ` NOT NULL | tope duro (`SESSION_ABSOLUTE_TTL_MINUTES`) |
| `revoked_at` | `TIMESTAMPTZ` NULL | logout o cierre remoto desde el panel |
| `ip` / `user_agent` | `Text` NULL | sólo para mostrarlos en el panel |
| | | índice `ix_sessions_user_id` |

### `login_attempts`

Un registro por intento de login (con o sin éxito). Es el contador de fuerza bruta: si los fallos
de los últimos `LOGIN_LOCKOUT_MINUTES` **de esa cuenta** llegan a `LOGIN_MAX_ATTEMPTS`, el login
responde `429`. Se cuenta por cuenta (no por IP) porque la app tiene un solo usuario y contar por
IP dejaría que una dirección compartida (NAT) dejara al dueño afuera de su propia app. Un login
exitoso borra los fallos previos de ese usuario.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `Integer` PK autoincrement | |
| `username` | `Text` NOT NULL | el usuario *enviado* (truncado a 60), exista o no |
| `created_at` | `TIMESTAMPTZ` NOT NULL default `now()` | |
| `success` | `Boolean` NOT NULL default false | |
| | | índice `ix_login_attempts_username_created` |

## Migraciones

- `0001_initial`: crea las 3 tablas + índices + CHECKs y **siembra `categories`**
  (migración de datos, idempotente con `ON CONFLICT DO NOTHING`).
- `0002_usd_wallet_ves_entry_jars`: agrega `movements.entry_currency` / `entry_amount_cents` /
  `rate_micros` (con backfill de las filas existentes a USD), crea y siembra `jars` y
  `jar_categories`, y las CHECK constraints de la entrada. `downgrade` las revierte.
- `0003_accounts_debts`: agrega `categories.is_system` + siembra `deudas`, crea `accounts`
  (con una cartera por defecto `Cartera USD`), agrega `movements.account_id` (con backfill de los
  movimientos existentes a la cartera por defecto) y `movements.is_debt_payment` + CHECK e índice.
  `downgrade` las revierte.
- `0004_movement_items`: crea `movement_items` (FK `ON DELETE CASCADE` a `movements`, CHECK
  `amount_cents > 0` e índice por `movement_id`). Tabla nueva, sin backfill. `downgrade` la elimina.
- `0005_admin_auth`: crea `admin_users`, `sessions` y `login_attempts` (índices y FKs incluidos).
  Sin backfill: `admin_users` arranca vacía y la llena `python -m app.auth_seed` en el arranque.
  `downgrade` las elimina (y con ellas las sesiones abiertas).

- No editar una migración ya aplicada; los cambios de esquema van en una migración nueva.
- `alembic upgrade head` corre automáticamente al arrancar el contenedor `api`.

## Seed de ejemplo (`app/seed.py`, `python -m app.seed`)

Debe dejar la app usable al primer arranque, con datos repartidos para que TODOS los
gráficos se vean. El gate lo evalúa el propio `app.seed` leyendo `SEED_ON_START` (única fuente
de verdad): con `SEED_ON_START=false` se saltea; `--force` siempre gana. Reglas:

1. Es **idempotente**: si ya hay **movimientos o presupuestos**, no hace nada (salvo `--force`,
   que borra movimientos, presupuestos **y carteras** —en orden por las FKs— y resiembra). Así una
   base con topes del usuario pero sin movimientos no recibe los movimientos de ejemplo ni ve
   sobrescritos sus topes.
2. Fechas **relativas al mes actual** calculado con `APP_TZ` (nunca fijas en el código).
3. Siembra **carteras**: `Cartera USD` (saldo inicial positivo de $2.000, para que el neto del
   ejemplo —6 meses de gastos contra un solo mes de ingresos— no la deje en negativo) y dos con
   deuda — `Binance` (−$600) y `Cartera USD normal` (−$200). Los movimientos de ejemplo van a
   `Cartera USD`. El seed **reconcilia** el saldo inicial de sus carteras aunque ya existan (la
   migración 0003 crea `Cartera USD` con saldo 0), así el arranque sin `--force` deja el mismo
   estado que `--force`; nunca toca carteras que no sean suyas.
4. Mes actual: ~22 movimientos, con **las 10 categorías de gasto representadas al menos una vez**
   y 2 ingresos (un sueldo principal + un freelance). Montos realistas en **USD** (referencia:
   alquiler 250, supermercado 80, transporte 20), incluyendo **al menos un movimiento cargado en
   bolívares** (`entry_currency='VES'` con su `rate_micros`) y **un pago de deuda** sobre `Binance`
   (gasto, `is_debt_payment=true`, categoría `deudas`) para que el panel de deuda muestre progreso.
5. Los 6 meses anteriores: 2-4 gastos por mes, con variación mes a mes (para que el gráfico
   de barras muestre una tendencia y el promedio de 6 meses tenga sentido).
6. Presupuestos para las 10 categorías de gasto (en USD, sin contar la categoría system `deudas`),
   con **al menos una categoría excedida (>100%)** y **al menos una en la banda del 80-100%**.
7. Se permite reajustar los números para que el mes actual cuadre con los presupuestos, pero no se
   agregan ni quitan categorías del catálogo (sigue siendo 15; `deudas` la siembra la migración) ni
   se cambian los frascos (los siembra la migración, no el seed).
