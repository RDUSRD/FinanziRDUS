# FinanciRDUS — Contrato de la API (v1)

Base: `/api`. JSON en `snake_case`. **Todo el dinero en centavos enteros**
(`amount_cents`, `cap_cents`, `spent_cents`, `*_cents`). Fechas `YYYY-MM-DD`,
meses `YYYY-MM`. Porcentajes como fracción `0..1` en `share`/`pct` (el redondeo es
responsabilidad del frontend).

Documentación interactiva automática: `/api/docs` (Swagger) y `/api/openapi.json`. Se pueden
apagar con `DOCS_ENABLED=false` (por defecto `true`); con `false`, ambos responden `404`.

## Convenciones

- Errores: `{"detail": "<mensaje en español>"}` con el status correspondiente.
  Validación de payload (Pydantic) → `422` con el `detail` estándar de FastAPI (lista de errores).
  Errores de reglas de negocio de la API (categoría inexistente, tipo que no coincide,
  fecha inválida, import inválido) → `422` con `detail` como **string** legible.
- `404` si el recurso no existe.
- `204` sin cuerpo en los DELETE.
- Parámetros de mes inválidos → `422`, nunca `500`: si `month` (o `end` en `/api/stats/monthly`)
  no es un `YYYY-MM` válido o cae fuera de `0001-01 .. 9999-12`, la respuesta es
  `422` con `{"detail":"El mes debe tener el formato 'YYYY-MM'."}`.
- La **ventana de meses** que un endpoint necesita calcular también se valida → `422`, nunca
  `500`: si no cabe en el rango soportado `0001-01 .. 9999-12`, la respuesta es `422` con
  `{"detail":"El mes está fuera del rango soportado para la ventana pedida."}`. En concreto:
  - `GET /api/stats/summary` necesita los **6 meses anteriores** al mes pedido, así que exige
    `month >= 0001-07`; con `month` entre `0001-01` y `0001-06` responde `422`.
  - `GET /api/stats/monthly` necesita los `months` meses que **terminan** en `end`, así que
    exige `end - (months-1) >= 0001-01`: `end=0001-01&months=1` → `200`, pero
    `end=0001-01&months=2` → `422`.
  - El borde superior ya era `422`: `9999-12` no tiene mes siguiente, así que `month_bounds`
    lo rechaza.
- Listados: sin paginación (el volumen es personal), siempre ordenados de forma determinista.

## Endpoints

### `GET /api/health`
`200` → `{"status": "ok", "db": "ok", "version": "1.0.0"}`
Usado por el healthcheck de Docker. Si la DB no responde: `503` con `{"status":"error","db":"error"}`.

### `GET /api/categories`
`200` → `[{"id":"supermercado","type":"gasto","label":"Supermercado","sort_order":1}, ...]`
Ordenado por `type` (gasto primero) y `sort_order`.

### `GET /api/movements`
Query: `month` (`YYYY-MM`, opcional), `category` (id, opcional), `type` (`gasto|ingreso`, opcional).
Sin `month` → devuelve todos. Orden: `date DESC`, luego `created_at DESC`.
`200` → `[{"id":1,"type":"gasto","category_id":"ocio","amount_cents":4500000,"date":"2026-09-04","note":"","created_at":"2026-09-04T12:00:00-03:00"}]`

### `POST /api/movements`
Body: `{"type":"gasto","category_id":"ocio","amount_cents":4500000,"date":"2026-09-04","note":"Cine"}`
Reglas: `amount_cents > 0`; `category_id` existente; `type` coherente con el de la categoría;
`date` válida en el calendario real (año entre `0001` y `9999`); `note` ≤ 140 caracteres
(se recorta con `strip`).
`201` → el movimiento creado (mismo shape que el listado).
`422` → `{"detail":"La categoría no corresponde al tipo elegido."}` (u otro mensaje equivalente).

### `PATCH /api/movements/{id}`
Body: cualquiera de los campos anteriores (todos opcionales, se aplica sólo lo enviado).
Mismas validaciones que el POST, incluyendo la coherencia tipo/categoría resultante.
`200` → el movimiento actualizado. `404` si no existe.

### `DELETE /api/movements/{id}`
`204`. `404` si no existe.

### `GET /api/budgets`
Query: `month` (opcional, default: mes actual) — el mes contra el que se calcula el gasto.
`200` →
```json
{"month":"2026-09","total_cap_cents":74500000,"total_spent_cents":76350000,
 "items":[{"category_id":"supermercado","label":"Supermercado","cap_cents":12000000,
           "spent_cents":13250000,"pct":1.104,"status":"over"}]}
```
Devuelve **siempre las 10 categorías de gasto** (con `cap_cents: 0` y `status: "none"` las
que no tengan tope), ordenadas como el catálogo. `status` ∈ `none|ok|warn|over`.

### `PUT /api/budgets/{category_id}`
Body: `{"cap_cents": 12000000}`
`200` → `{"category_id":"supermercado","cap_cents":12000000}`
`422` si la categoría no es de gasto o `cap_cents <= 0`.
Es idempotente: repetirlo deja el mismo tope, y dos `PUT` concurrentes que crean el tope por
primera vez no fallan (el segundo reutiliza la fila creada por el primero).

### `DELETE /api/budgets/{category_id}`
Borra el tope (equivale a "sin tope"). `204`.

### `GET /api/stats/summary`
Query: `month` (opcional, default mes actual).
`200` →
```json
{"month":"2026-09","income_cents":138000000,"expenses_cents":76350000,"balance_cents":61650000,
 "average_prev":{"avg_cents":42283333,"months_used":6},
 "comparison":{"pct":0.806,"direction":"above"}}
```
- `average_prev`: promedio de los 6 meses **anteriores** al mes pedido, promediando sólo los
  meses con gastos. `months_used` entre 0 y 6; si es 0 → `avg_cents: 0`.
- `comparison.direction` ∈ `above|below|equal|na` (`na` cuando `avg_cents === 0`).
  `pct` = `(expenses - avg) / avg` como fracción (positiva = gastó más).

### `GET /api/stats/by-category`
Query: `month` (opcional). `200` →
```json
{"month":"2026-09","total_cents":76350000,
 "items":[{"category_id":"alquiler-servicios","label":"Alquiler y servicios","cents":32000000,"share":0.419}, ...]}
```
Sólo categorías de gasto **con gasto > 0**, ordenadas por `cents DESC` (empate: `label` asc).
`share` suma 1 (0 si el total es 0).

### `GET /api/stats/monthly`
Query: `end` (`YYYY-MM`, opcional, default mes actual), `months` (int 1..24, default 6).
`200` → `[{"month":"2026-04","expenses_cents":0,"income_cents":0}, ...]`
Ventana de `months` meses que **termina** en `end` (inclusive), meses sin datos en 0, orden ascendente.

### `GET /api/data/export`
`200` con `Content-Disposition: attachment; filename="financirdus-YYYY-MM-DD.json"`.
```json
{"version":1,"exported_at":"2026-09-16T12:00:00-03:00",
 "movements":[{"type":"gasto","category_id":"ocio","amount_cents":4500000,"date":"2026-09-04","note":""}],
 "budgets":{"supermercado":12000000}}
```

### `POST /api/data/import`
Query: `mode` ∈ `merge|replace` (default `merge`).
Body: el mismo shape del export (`version`, `movements[]`, `budgets{}`).
- `merge`: agrega los movimientos que no existan y actualiza/suma los presupuestos
  (el tope importado gana). Nunca borra lo existente.
- `replace`: reemplaza TODOS los movimientos y presupuestos.
- Todo dentro de una transacción: si algo falla, no se aplica nada.
`200` → `{"mode":"merge","movements_imported":12,"movements_skipped":0,"budgets_imported":10}`
`422` → `{"detail":"El movimiento 3 tiene una categoría inválida."}` (mensajes concretos y
numerados: JSON inválido, `version` no soportada, `movements` no es lista, monto/fecha/categoría
inválidos, `category_id` que no es string, y nota de más de 140 caracteres).

**La nota no se trunca.** Si un movimiento del archivo trae más de 140 caracteres en `note`, se
rechaza el import entero con `422` (`"El movimiento N tiene una nota demasiado larga (máximo
140 caracteres)."`), igual que el CRUD de movimientos. Los exports que produce la app siempre
tienen notas ≤ 140, así que el round-trip export → import sigue funcionando.

## Límites (defensa contra payloads absurdos)

La app es personal y no tiene autenticación, así que la API se defiende de entradas
desproporcionadas con límites explícitos y errores claros:

| Límite | Valor | Respuesta |
|---|---|---|
| Tamaño del cuerpo de `POST /api/data/import` | 5 MB | `413` `{"detail":"El archivo es demasiado grande (máximo 5 MB)."}` |
| Movimientos por import | 20.000 | `422` con mensaje concreto |
| `amount_cents` en movimientos (POST/PATCH) | `1 .. 2147483647` | `422` "El monto es demasiado grande." |
| `cap_cents` en presupuestos (PUT/import) | `1 .. 2147483647` | `422` "El tope es demasiado grande." |
| `months` en `GET /api/stats/monthly` | `1 .. 24` | `422` (validación de query) |
| `month` / `end` (query) en `/api/movements`, `/api/budgets`, `/api/stats/*` | `0001-01 .. 9999-12` | `422` `{"detail":"El mes debe tener el formato 'YYYY-MM'."}` |
| `note` en movimientos (POST/PATCH e import) | ≤ 140 caracteres | `422` (el import **no** trunca; ver abajo) |

Presupuestos en el import: `null`, `0` o `""` significan **sin tope** (se ignoran sin
error, igual que dejar el input vacío en la UI). Una categoría desconocida, un valor no
entero o un valor negativo **sí** cortan el import con `422` y un mensaje numerado
(`"El presupuesto de la categoría \"x\" es inválido."`), para que nunca se pierda un
presupuesto en silencio. Nunca se persiste un tope en `0`.

## Reglas que el frontend asume

- No calcula totales "de verdad": los KPIs, porcentajes, status de presupuesto y promedios
  vienen de `/api/stats/*` y `/api/budgets`. El frontend sólo formatea y grafica.
- Formatea dinero con `Intl.NumberFormat('es-AR', {style:'currency', currency:'ARS'})`
  y los porcentajes con `Intl.NumberFormat('es-AR', {maximumFractionDigits:1})`.
- Si la API no responde, muestra un estado de error con acción de reintento (nunca pantalla vacía).
