# FinanciRDUS — Contrato de la API (v1)

Base: `/api`. JSON en `snake_case`. **Todo el dinero en centavos enteros**
(`amount_cents`, `cap_cents`, `spent_cents`, `*_cents`). Fechas `YYYY-MM-DD`,
meses `YYYY-MM`. Porcentajes como fracción `0..1` en `share`/`pct` (el redondeo es
responsabilidad del frontend).

**Moneda canónica: USD.** `amount_cents` es siempre centavos de dólar. Un movimiento se
puede *cargar* en bolívares: se envían `entry_currency: "VES"`, `entry_amount_cents` (monto
en Bs, en céntimos) y `rate_micros` (Bs por 1 USD × 1_000_000), y el backend calcula el
`amount_cents` en USD. Los tres campos de entrada se devuelven siempre para mostrar el
detalle original (monto en Bs + tasa). Para entradas en USD, `rate_micros` es `null`.

**Carteras y deuda.** Cada movimiento pertenece a una **cartera** (`accounts`, con nombre).
Una cartera con `opening_balance_cents` negativo es una **deuda**: su saldo es negativo y los
pagos lo acercan a 0. `GET /api/movements` y `/api/stats/*` aceptan `account` (id numérico o
`all`, default `all`). **Los presupuestos y el plan son siempre globales** (no filtran por cartera).

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
`200` → `[{"id":"supermercado","type":"gasto","label":"Supermercado","sort_order":1,"is_system":false}, ...]`
Ordenado por `type` (gasto primero) y `sort_order`. Devuelve **15**: 11 de gasto (incluye
`deudas`, que es `is_system: true`) y 4 de ingreso. `is_system` marca categorías internas que el
frontend no ofrece para elegir a mano (las usa el backend para los pagos de deuda).

### `GET /api/accounts`
`200` →
```json
{"total_debt_cents":70000,
 "items":[{"id":1,"name":"Cartera USD","opening_balance_cents":0,"balance_cents":82000,
           "is_debt":false,"paid_cents":0,"remaining_cents":0,"pct_paid":0},
          {"id":2,"name":"Binance","opening_balance_cents":-60000,"balance_cents":-40000,
           "is_debt":true,"paid_cents":20000,"remaining_cents":40000,"pct_paid":0.333}]}
```
`balance_cents = opening_balance_cents + Σ(ingreso) − Σ(gasto que no es pago) + Σ(pago de deuda)`.
`is_debt = opening_balance_cents < 0`; `remaining_cents = −balance_cents`; `pct_paid` es fracción
`0..1`. `total_debt_cents` = suma de los saldos negativos.

### `POST /api/accounts`
Body: `{"name":"Binance","opening_balance_cents":-60000}` → `201` con el item.
`422` si el nombre está vacío / supera 60 caracteres / ya existe, o si el saldo está fuera de rango.

### `PATCH /api/accounts/{id}`
Body: `{"name"?: "...", "opening_balance_cents"?: -40000}` → `200`/`404`/`422`.

### `DELETE /api/accounts/{id}`
`204`. `409` si la cartera tiene movimientos o si es la **última** cartera (no se puede quedar sin
ninguna).

### `GET /api/movements`
Query: `month` (`YYYY-MM`, opcional), `category` (id, opcional), `type` (`gasto|ingreso`, opcional),
`account` (id numérico o `all`, opcional, default `all`).
Sin `month` → devuelve todos. Orden: `date DESC`, luego `created_at DESC`.
`200` → `[{"id":1,"type":"gasto","category_id":"ocio","account_id":1,"account_name":"Cartera USD","is_debt_payment":false,"amount_cents":4500000,"entry_currency":"USD","entry_amount_cents":4500000,"rate_micros":null,"date":"2026-09-04","note":"","created_at":"2026-09-04T12:00:00-03:00","items":[]}]`

Un movimiento cargado en Bs conserva la entrada: `{"id":2,"type":"gasto","category_id":"supermercado","account_id":1,"account_name":"Cartera USD","is_debt_payment":false,"amount_cents":10000,"entry_currency":"VES","entry_amount_cents":400000,"rate_micros":40000000,"items":[],...}`.

**Líneas de detalle (opcional).** Un movimiento puede llevar **líneas de productos/servicios**, cada una con su precio **en la moneda de entrada del movimiento** (`entry_currency`): dólares si el movimiento es USD, bolívares si es VES. **Cuando hay líneas, el total del movimiento es la suma de las líneas**: el backend deriva de ellas `entry_amount_cents` (en la moneda de entrada) y calcula `amount_cents` (USD) — con `USD` es esa misma suma y `rate_micros=null`; con `VES` convierte **una sola vez** la suma con la tasa (`round_half_up(Σ × 1e6 / rate_micros)`), así que no hay redondeo por línea. Las líneas **no** guardan un equivalente en dólares propio: el detalle se muestra en la moneda de entrada y el total en USD es el del movimiento. Sin líneas, el total se carga a mano como siempre. El array `items` viaja siempre (vacío si el movimiento no tiene líneas), en orden de presentación.
`200` → `[{"id":3,"type":"gasto","category_id":"supermercado","amount_cents":500,"entry_currency":"USD","rate_micros":null,"items":[{"description":"Leche","amount_cents":350},{"description":"Pan","amount_cents":150}],...}]`

Un movimiento con líneas cargado en bolívares conserva la entrada, y sus líneas están en Bs: Bs 4.000,00 al cambio de 40 Bs/USD son $ 100,00 →
`{"id":4,"type":"gasto","category_id":"supermercado","account_id":1,"amount_cents":10000,"entry_currency":"VES","entry_amount_cents":400000,"rate_micros":40000000,"items":[{"description":"Harina","amount_cents":300000},{"description":"Arroz","amount_cents":100000}],...}`

### `POST /api/movements`
Body (entrada en USD):
`{"type":"gasto","category_id":"ocio","account_id":1,"entry_currency":"USD","entry_amount_cents":4500000,"date":"2026-09-04","note":"Cine"}`
Body (entrada en bolívares: Bs 4.000,00 al cambio de 40 Bs/USD):
`{"type":"gasto","category_id":"supermercado","account_id":1,"entry_currency":"VES","entry_amount_cents":400000,"rate_micros":40000000,"date":"2026-09-04","note":"Cine"}`
Body (pago de deuda; el backend fuerza `type="gasto"` y `category_id="deudas"`, no se manda `category_id`):
`{"type":"gasto","account_id":2,"is_debt_payment":true,"entry_currency":"USD","entry_amount_cents":20000,"date":"2026-09-18","note":"Pago Binance"}`
Body (con líneas de detalle: el total se deriva de las líneas y **no** se manda `entry_amount_cents`):
`{"type":"gasto","category_id":"supermercado","account_id":1,"entry_currency":"USD","date":"2026-09-04","note":"Compra","items":[{"description":"Leche","amount_cents":350},{"description":"Pan","amount_cents":150}]}`
Body (con líneas **en bolívares**: las líneas van en Bs y la tasa convierte la suma una sola vez):
`{"type":"gasto","category_id":"supermercado","account_id":1,"entry_currency":"VES","rate_micros":40000000,"date":"2026-09-04","note":"Mercado","items":[{"description":"Harina","amount_cents":300000},{"description":"Arroz","amount_cents":100000}]}`
Reglas: `account_id` **obligatorio** y existente; `entry_currency` ∈ `USD|VES`; `entry_amount_cents > 0`
y ≤ `2147483647` (**requerido salvo** que se manden líneas); `rate_micros` **requerido si**
`entry_currency="VES"` (y `null`/ausente en USD); `category_id` **obligatorio salvo**
`is_debt_payment=true` (el pago debe ir a una cartera con saldo inicial negativo, si no `422`);
`type` coherente con el de la categoría; `date` válida en el calendario real (año entre `0001` y
`9999`); `note` ≤ 140 caracteres. `items` es **opcional** (hasta 100 líneas; cada una con
`description` de 1..120 y `amount_cents` de 1..2147483647): **si hay líneas**, `entry_currency` puede
ser `USD` o `VES`, `entry_amount_cents` es opcional (el backend lo deriva como la suma de las
líneas, en la moneda de entrada) y `amount_cents` sale de esa suma — igual a ella en USD, o
convertida **una sola vez** con la tasa en VES; un pago de deuda no admite líneas (`422`). El
backend calcula el `amount_cents` (USD) y exige que caiga en `1..2147483647`.
Un pago de deuda **suma** al saldo de su cartera (acerca la deuda a 0) pero **cuenta como gasto
del mes** (aparece en KPIs, donut y presupuestos no —`deudas` es system—).
`201` → el movimiento creado (mismo shape que el listado).
`422` → `{"detail":"La categoría no corresponde al tipo elegido."}` (u otro mensaje equivalente).

### `PATCH /api/movements/{id}`
Body: cualquiera de los campos anteriores (todos opcionales, se aplica sólo lo enviado),
incluyendo `account_id`, `is_debt_payment` e `items`. Mismas validaciones que el POST. Si se pasa
a `entry_currency="USD"` sin mandar `rate_micros`, la tasa guardada se limpia; mandar una tasa
con USD es `422`. `items` **reemplaza** la lista completa de líneas: mandar `items: []` las limpia
(y el total vuelve a derivarse de `entry_amount_cents`); mandar líneas recalcula el `amount_cents`
como su suma.
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
Devuelve **siempre las 10 categorías de gasto** (excluye las `is_system`, como `deudas`), con
`cap_cents: 0` y `status: "none"` las que no tengan tope, ordenadas como el catálogo.
`status` ∈ `none|ok|warn|over`. El gasto se cuenta sobre **todas** las carteras (global).

### `PUT /api/budgets/{category_id}`
Body: `{"cap_cents": 12000000}`
`200` → `{"category_id":"supermercado","cap_cents":12000000}`
`422` si la categoría no es de gasto o `cap_cents <= 0`.
Es idempotente: repetirlo deja el mismo tope, y dos `PUT` concurrentes que crean el tope por
primera vez no fallan (el segundo reutiliza la fila creada por el primero).

### `DELETE /api/budgets/{category_id}`
Borra el tope (equivale a "sin tope"). `204`.

### `GET /api/stats/summary`
Query: `month` (opcional, default mes actual), `account` (id numérico o `all`, opcional, default `all`).
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
Query: `month` (opcional), `account` (id numérico o `all`, opcional, default `all`). `200` →
```json
{"month":"2026-09","total_cents":76350000,
 "items":[{"category_id":"alquiler-servicios","label":"Alquiler y servicios","cents":32000000,"share":0.419}, ...]}
```
Sólo categorías de gasto **con gasto > 0**, ordenadas por `cents DESC` (empate: `label` asc).
`share` suma 1 (0 si el total es 0).

### `GET /api/stats/monthly`
Query: `end` (`YYYY-MM`, opcional, default mes actual), `months` (int 1..24, default 6),
`account` (id numérico o `all`, opcional, default `all`).
`200` → `[{"month":"2026-04","expenses_cents":0,"income_cents":0}, ...]`
Ventana de `months` meses que **termina** en `end` (inclusive), meses sin datos en 0, orden ascendente.

### `GET /api/plan`
Query: `month` (opcional, default mes actual).
`200` →
```json
{"month":"2026-09","income_cents":138000000,
 "jars":[{"jar_id":"crecimiento","label":"Crecimiento","pct":25,"target_cents":34500000,
          "spent_cents":8000000,"remaining_cents":26500000,"used":0.232,"status":"ok",
          "category_ids":["ahorro"]}]}
```
Aplica la metodología **25/15/50/10** al ingreso del mes: `target_cents = pct × income_cents`
(el reparto redondea half-up y el último frasco absorbe el resto, así la suma de `target_cents`
es exactamente `income_cents`; con `income_cents = 0` todos los objetivos son `0`). `spent_cents`
es la suma de los gastos del mes de las categorías asignadas a cada frasco; `status` ∈
`none|ok|warn|over` (mismas reglas que el estado de presupuesto). Devuelve siempre los 4 frascos.

### `PUT /api/plan/categories/{category_id}`
Body: `{"jar_id": "esencial"}`
`200` → `{"category_id":"ocio","jar_id":"esencial"}`
Reasigna una categoría de **gasto** a un frasco (una categoría vive en un solo frasco).
`422` si el frasco no existe o si la categoría es de ingreso.

### `GET /api/data/export`
`200` con `Content-Disposition: attachment; filename="financirdus-YYYY-MM-DD.json"`.
```json
{"version":4,"exported_at":"2026-09-16T12:00:00-03:00",
 "accounts":[{"name":"Cartera USD","opening_balance_cents":0},
             {"name":"Binance","opening_balance_cents":-60000}],
 "movements":[{"type":"gasto","category_id":"supermercado","amount_cents":10000,
               "entry_currency":"VES","entry_amount_cents":400000,"rate_micros":40000000,
               "date":"2026-09-04","note":"","account_id":1,"account_name":"Cartera USD",
               "is_debt_payment":false,"items":[]}],
 "budgets":{"supermercado":12000000},
 "jar_categories":{"ahorro":"crecimiento"}}
```
`accounts` son las carteras (nombre + saldo inicial). Cada movimiento incluye su cartera
(`account_id`/`account_name`), `is_debt_payment` y sus `items` (array; `[]` si no tiene líneas).
`budgets` es un dict `category_id → cap_cents`.

### `POST /api/data/import`
Query: `mode` ∈ `merge|replace` (default `merge`).
Body: el shape del export. **Se aceptan `version` 1, 2, 3 y 4**:
- **v4**: como v3, y además cada movimiento puede traer `items` (líneas de detalle). Los payloads
  v1–v3 no traen `items` y se importan como `[]`.
- **v3**: trae `accounts` y, en cada movimiento, `account_name`/`account_id` e `is_debt_payment`.
  Las carteras se crean por **nombre** (las que falten).
- **v1/v2**: sin `accounts`; todos los movimientos caen en la cartera por defecto `Cartera USD`
  (se crea si no existe) y `entry_currency="USD"`, `entry_amount_cents = amount_cents`,
  `rate_micros = null`, `is_debt_payment=false`.
- `merge`: agrega los movimientos que no existan (la firma incluye cartera y entrada), crea las
  carteras faltantes y aplica presupuestos y mapeo de frascos. Nunca borra lo existente.
- `replace`: reemplaza movimientos, presupuestos **y carteras** (borra las que no estén en el
  archivo); el mapeo de frascos se aplica encima.
- Todo dentro de una transacción: si algo falla, no se aplica nada.
`200` → `{"mode":"merge","movements_imported":12,"movements_skipped":0,"budgets_imported":10,"accounts_imported":2}`
`422` → `{"detail":"El movimiento 3 tiene una categoría inválida."}` (mensajes concretos y
numerados: JSON inválido, `version` no soportada, `movements`/`accounts` con forma inválida,
monto/entrada/fecha/categoría/cartera inválidos, `category_id` que no es string, y nota de más de
140 caracteres).

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
| Carteras por import | 1.000 | `422` con mensaje concreto |
| `name` de cartera (POST/PATCH/import) | `1 .. 60` caracteres, único | `422` |
| `opening_balance_cents` (POST/PATCH/import) | `-2147483647 .. 2147483647` | `422` |
| `account` (query) en `/api/movements` y `/api/stats/*` | id numérico o `all` | `422` `{"detail":"La cartera debe ser un id numérico o 'all'."}` |
| `entry_amount_cents` en movimientos (POST/PATCH) | `1 .. 2147483647` | `422` "El monto es demasiado grande." |
| `items` de un movimiento (POST/PATCH/import) | ≤ 100 líneas | `422` "Máximo 100 líneas por movimiento." |
| `items[].description` (POST/PATCH/import) | `1 .. 120` caracteres | `422` "Cada línea necesita una descripción de hasta 120 caracteres." |
| `items[].amount_cents` (POST/PATCH/import) | `1 .. 2147483647` | `422` "El precio de una línea debe ser mayor a cero." |
| `rate_micros` en movimientos VES (POST/PATCH) | `1 .. 1000000000000000` | `422` |
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
- Formatea dinero con `formatMoney(cents, 'USD'|'VES')`: agrupación `Intl.NumberFormat('es-VE')`
  más el símbolo por moneda (`$` para USD, `Bs` para VES), y los porcentajes con
  `Intl.NumberFormat('es-VE', {maximumFractionDigits:1})`. Los totales/KPIs son en USD; los
  movimientos cargados en Bs muestran su monto original + tasa como detalle.
- Si la API no responde, muestra un estado de error con acción de reintento (nunca pantalla vacía).
