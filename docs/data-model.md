# FinanciRDUS — Modelo de datos

PostgreSQL 16. SQLAlchemy 2.x (`DeclarativeBase`, `Mapped`/`mapped_column`) + Alembic.
Todo el dinero es **entero en centavos** (`Integer`). Sin `Float`/`Numeric` para importes.

## Tablas

### `categories`
Catálogo fijo de categorías, sembrado por migración de datos (no editable por el usuario).

| columna | tipo | notas |
|---|---|---|
| `id` | `Text` PK | slug: `supermercado`, `comidas-afuera`, ..., `sueldo`, ... |
| `type` | `Text` NOT NULL | `'gasto'` \| `'ingreso'` (CHECK) |
| `label` | `Text` NOT NULL | "Comidas afuera", "Alquiler y servicios", ... |
| `sort_order` | `Integer` NOT NULL | orden de presentación (default 0) |

Valores (id / label / type), en este orden:

*gasto:* `supermercado` Supermercado · `comidas-afuera` Comidas afuera · `transporte` Transporte ·
`alquiler-servicios` Alquiler y servicios · `salud` Salud · `suscripciones` Suscripciones ·
`ropa` Ropa · `ocio` Ocio · `ahorro` Ahorro · `otros` Otros

*ingreso:* `sueldo` Sueldo · `freelance` Freelance · `inversiones` Inversiones · `otros-ingresos` Otros

### `movements`

| columna | tipo | notas |
|---|---|---|
| `id` | `Integer` PK autoincrement | |
| `type` | `Text` NOT NULL | `'gasto'` \| `'ingreso'` (CHECK) |
| `category_id` | `Text` NOT NULL | FK → `categories.id` (RESTRICT) |
| `amount_cents` | `Integer` NOT NULL | CHECK `> 0` |
| `date` | `Date` NOT NULL | fecha calendario (sin hora, sin timezone) |
| `note` | `Text` NOT NULL default `''` | máx. 140 caracteres (validado en API) |
| `created_at` | `TIMESTAMPTZ` NOT NULL default `now()` | para ordenar empates |
| `updated_at` | `TIMESTAMPTZ` NOT NULL default `now()` | |

Índices: `(date DESC)`, `(category_id)`, `(type, date)`.
Regla de consistencia (validada en la capa de aplicación, con test): `movements.type`
debe coincidir con `categories.type` de su `category_id`.

### `budgets`
Un tope mensual por categoría de **gasto** (es global, no por mes: es el tope que se
compara contra el gasto del mes que se esté mirando).

| columna | tipo | notas |
|---|---|---|
| `category_id` | `Text` PK | FK → `categories.id` (RESTRICT), sólo categorías de tipo `gasto` |
| `cap_cents` | `Integer` NOT NULL | CHECK `> 0` |
| `updated_at` | `TIMESTAMPTZ` NOT NULL default `now()` | |

Sin fila = sin tope definido. Poner el input vacío borra la fila (nunca guarda `0`).

## Migraciones

- `0001_initial`: crea las 3 tablas + índices + CHECKs y **siembra `categories`**
  (migración de datos, idempotente con `ON CONFLICT DO NOTHING`).
- No editar una migración ya aplicada; los cambios de esquema van en una migración nueva.
- `alembic upgrade head` corre automáticamente al arrancar el contenedor `api`.

## Seed de ejemplo (`app/seed.py`, `python -m app.seed`)

Debe dejar la app usable al primer arranque, con datos repartidos para que TODOS los
gráficos se vean. El gate lo evalúa el propio `app.seed` leyendo `SEED_ON_START` (única fuente
de verdad): con `SEED_ON_START=false` se saltea; `--force` siempre gana. Reglas:

1. Es **idempotente**: si ya hay **movimientos o presupuestos**, no hace nada (salvo `--force`,
   que borra y resiembra). Así una base con topes del usuario pero sin movimientos no recibe los
   44 movimientos de ejemplo ni ve sobrescritos sus topes.
2. Fechas **relativas al mes actual** calculado con `APP_TZ` (nunca fijas en el código).
3. Mes actual: ~22 movimientos, con **las 10 categorías de gasto representadas al menos una vez**
   y 2 ingresos (un sueldo principal + un freelance). Montos realistas en ARS
   (referencia: alquiler 320.000, supermercado 85.000, transporte 42.000).
4. Los 6 meses anteriores: 2-4 gastos por mes, con variación mes a mes (para que el gráfico
   de barras muestre una tendencia y el promedio de 6 meses tenga sentido).
5. Presupuestos para las 10 categorías de gasto, con **al menos una categoría excedida (>100%)**
   y **al menos una en la banda del 80-100%** para que se vean los tres estados de color.
6. Los montos de referencia salen de `legacy/index.html` (`buildSeed()`); se permite
   reajustar los números para que el mes actual cuadre con los presupuestos, pero no se
   agregan ni quitan categorías.
