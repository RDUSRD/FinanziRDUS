# Handoff — Facturas con líneas de detalle + ajustes visuales (frascos y hoja pinchada)

Documento de handoff para el **orquestador de frontend**. Es autocontenido: describe **qué** hay
que construir y **cómo**, respetando el mundo visual de `DESIGN.md` ("La Factura del Mes").

Alcance: **solo `frontend/**`** (más los docs de diseño que resuelve quien orquesta). El backend
ya expone el nuevo campo `items` (ver §1.0).

---

## §0. Límites duros (respetar)

- Escribí **solo** dentro de `frontend/**`. No toques `backend/**`, `docs/**`, `docker-compose*`, `Makefile`, `README.md`.
- `frontend/src/index.css` es la **única fuente de estilo**. No hay `tailwind.config.js`; los componentes usan **clases con nombre** (`.sheet`, `.fact`, `.margin-col`, …), no utilidades Tailwind. No agregues estilos inline salvo `style={{ width }}` en barras (patrón ya existente).
- **No nuevas dependencias.**
- **No edites `Icons.tsx`**: reutilizá los iconos existentes como están (para §3 usá `PinIcon`, ya exportado).
- Sistema de diseño (`DESIGN.md`): **sin cards ni sombras nuevas** (salvo las rupturas permitidas), **separaciones con rayas de tinta** (hairlines 1px, 2px, 3px), **sin un cuarto color**, esquinas `border-radius: 0`.
- **Accesibilidad WCAG 2.2 AA**: `<label>` asociado, `aria-invalid`/`aria-describedby` en errores, foco visible, targets ≥44px, una sola región live (`LiveRegion`), `aria-valuetext` en las barras.
- **Cero scroll horizontal a 390px** es requisito de producto: verificá.
- No cambies nombres accesibles existentes ni el comportamiento de mutaciones (`useCreateMovement`/`useUpdateMovement`, invalidación, `announceWithBalance`).

---

## §1. Líneas de productos/servicios en las facturas

### §1.0. Contrato que expone el backend (ya implementado)

- `Movement` gana `items: [{ description: string; amount_cents: number }]` (siempre presente; `[]` si no hay líneas). `amount_cents` sigue siendo el **total en centavos USD**.
- `MovementInput` gana `items?: { description: string; amount_cents: number }[]`.
- **Regla del total:** si hay líneas, el backend **deriva** `amount_cents` como la suma de las líneas (deja `entry_currency="USD"`, `entry_amount_cents = amount_cents`, `rate_micros = null`). Sin líneas, el total se carga a mano como hoy.
- **Solo USD:** un movimiento con líneas no puede estar en `VES` (`422`: "Las líneas de detalle solo aplican a movimientos en dólares (USD).").
- En `PATCH`: si mandás `items`, **reemplaza** la lista completa (`[]` la limpia y el total vuelve a derivarse de la entrada manual).
- Límites: hasta **100 líneas** por movimiento; `description` de **1..120**; `amount_cents` de línea **1..2147483647**. Mensajes de error en español.
- El **export/import** sube a `version 4` y cada movimiento del export incluye `items`. Se siguen aceptando v1–v3.

### §1.1. Tipos y cliente

- `frontend/src/api/types.ts`:
  - Agregá `export interface MovementItem { description: string; amount_cents: number }`.
  - `Movement`: agregá `items: MovementItem[];`.
  - `MovementInput`: agregá `items?: MovementItem[];`.
  - `ExportMovement`: agregá `items?: MovementItem[];` (v4).
- `frontend/src/api/client.ts`: **pass-through** del campo (no hay lógica nueva; el `request<T>` ya serializa el body).

### §1.2. `MovementWindow.tsx` — cargar las líneas

- Agregá una lista **opcional y dinámica** de líneas dentro del formulario (debajo de monto/tasa, antes de la "Prueba de tira"). Cada fila: **descripción** (`<input>`) + **precio** (`<input inputMode="decimal">`, parseado con `toCents`). Botones "Agregar línea" y "Quitar" por fila; cada control con `aria-label` que nombre su fila (p. ej. "Descripción de la línea 2", "Precio de la línea 2", "Quitar línea 2").
- Reglas de interacción (coherentes con la regla del total):
  - Sin líneas: comportamiento actual (monto manual). El campo de líneas se puede abrir con "Agregar línea".
  - Con ≥1 línea: **ocultá o deshabilitá el monto manual** y fijá la moneda en **USD** (el total = suma de líneas). El `seg` de moneda puede deshabilitarse mientras haya líneas.
  - Mostrá un **total de líneas etiquetado como estimación** ("Estimado, todavía sin guardar", regla de la "Prueba de tira") en Chivo Mono tabular; el backend recalcula el total real.
- **Validación inline accesible** (mismo patrón que hoy): cada línea necesita descripción (1..120, con `trim`) y precio > 0; usá `aria-invalid` y `aria-describedby` a su `p.error-msg`. Contá las líneas contra el tope de 100.
- Al enviar: construí `MovementInput` con `items: [...]` cuando haya líneas (y `entry_currency: 'USD'`). Sin líneas, mandá el `MovementInput` de siempre (sin `items`, o con `items: []`).
- En **edición**, precargá las líneas existentes desde `movement.items`.

### §1.3. `Board.tsx` (componente `Factura`) — mostrar el desglose

- Si `movement.items.length > 0`, renderizá un bloque de desglose **entre el cuerpo y la línea de acciones** (`.fact-body` y `.fact-acts`): una fila por línea con la descripción a la izquierda y su precio a la derecha (`formatMoney(item.amount_cents, 'USD')` en Chivo Mono tabular).
- Separá el bloque con una **raya de tinta** (hairline `--color-rule` o dashed, como el resto de las listas) — nunca con una card ni un fondo nuevo. El **total** ya está en el header (`.fact-amt`).
- Clases nuevas en `index.css` (p. ej. `.fact-items`, `.fact-item`, `.fact-item-desc`, `.fact-item-amt`), siguiendo el estilo de `.fact-who`/`.fact-note`.

### §1.4. Tests

- `frontend/src/test/fakeServer.ts`: el servidor falso debe aceptar `items` en el body de movimientos, **derivar** `amount_cents` como la suma (y normalizar `entry_currency='USD'`/`entry_amount_cents`/`rate_micros`), devolver `items` en el `MovementOut`, y rechazar `VES`+líneas con `422`. Ajustá el shape del movimiento y subí el `version` del export falso a **4** (con `items` en cada movimiento exportado) — hoy emite `version: 3` (~línea 547).
- `frontend/src/test/seed.ts`: sembrá al menos **un movimiento con líneas** para que el desglose tenga datos.
- Tests vitest: (a) el formulario con líneas deriva el total y lo envía; (b) la facturita muestra el desglose de líneas; (c) `VES`+líneas se bloquea en la UI.

---

## §2. Separar `Objetivo / Gastado / Restante` en los frascos

Hoy, en `frontend/src/components/JarsPanel.tsx`, `JarRow` renderiza las tres cifras como **spans sueltos dentro de un único `<p className="hint">`**, separados sólo por un `{' '}` de JSX:

```tsx
<p className="hint">
  <span className="tag">{statusLabel(status)}</span>{' '}
  <span className="mono">Objetivo {formatMoney(targetCents, 'USD')}</span>{' '}
  <span className="mono">Gastado {formatMoney(spentCents, 'USD')}</span>{' '}
  <span className="mono">Restante {formatMoney(remainingCents, 'USD')}</span>
</p>
```

Se leen pegadas (`ok Objetivo $25 Gastado $3 Restante $22`). `.hint` sólo define `font-size`/`line-height`/`color`, así que no hay separador.

**Qué hacer:**

- Reemplazá ese párrafo por una **grilla de tres celdas etiquetadas**, con el mismo patrón que la banda `.subtotals`/`.sub-line` de la hoja: **label arriba** (`.66rem`/900/`0.14em`, uppercase, Ink Dim) y **figura mono tabular abajo** (`Chivo Mono`, `.mono`).
- Dejá la marca de estado (`.tag` con `statusLabel`) **fuera** de la grilla (arriba, en su propia línea) para que la grilla quede limpia.
- Separadores: **divisores hairline de 1px `--color-rule`** entre celdas (borde izquierdo en la 2ª y 3ª, o `column-gap` + bordes), **sin cards, sin sombras, sin colores nuevos**.
- `index.css`: nueva clase (p. ej. `.jar-figs` con `display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));`) y `.jar-fig` (celda) + `.jar-fig .lbl` (label). Mantené el `grid-column: 2 / -1` que ya tiene `.jar-meta > *` para que la grilla caiga bajo la barra. Responsive coherente con el resto (a 720px `.jar-meta` pasa a 2 columnas; la grilla de cifras puede quedarse en 3 o bajar a 1 fila).
- **Accesibilidad:** conservá intacto el `role="progressbar"` con su `aria-valuetext` (ya dice "gastado X de objetivo Y, Z%"). Cada cifra queda legible por su label.

---

## §3. Hoja principal pinchada al tablero

Hoy la hoja (`.sheet`, en `App.tsx`: `<div className="desk"><div className="sheet">…`) es un **rectángulo plano** sobre el tablero de madera, con un hairline cálido y una sombra de contacto.

**Qué hacer:** que lea como un **papel pinchado con un alfiler** (y leve giro en desktop).

- **Alfiler visible:** agregá un elemento decorativo con el icono `PinIcon` (ya exportado en `Icons.tsx`; **no** lo edites) posicionado **sobre el borde superior** de `.sheet` (p. ej. centrado arriba, sobresaliendo ~la mitad del icono). Usá un contenedor `aria-hidden="true"` (es decoración; el pin real de las facturitas ya existe y no se toca). Estilizalo como marca de tinta (color de tinta, no un cuarto color).
- **Leve giro + sombra (solo desktop):**
  - Aplicá `transform: rotate(-0.3deg)` (aprox.) a `.sheet` **dentro de `@media (min-width: 720px)`**.
  - **CRÍTICO — no romper el botón flotante:** por debajo de `719px` la action plate es `position: fixed` (ver `DESIGN.md`). Un `transform` en `.sheet` convertiría ese `fixed` en relativo a la hoja y rompería el botón. Por eso el giro va **solo ≥720px** (donde la plate está en flujo); en móvil: **alfiler sin giro**.
  - Reajustá la sombra para que lea "apoyada/pinchada" (seguí usando la sombra cálida de contacto; no agregues una sombra nueva de otro tipo).
- **Cero scroll horizontal:** el giro puede desbordar unos px. Compensá con `overflow-x: clip` en `.desk` (o márgenes) y **verificá a 390px** (y con la rotación activa en ≥720px). Ojo: `overflow-x: clip` en un ancestro sin `transform` no afecta al `fixed` de la plate.
- **Impresión:** en `@media print` la hoja ya pierde sombra/borde; ocultá ahí el alfiler y el giro.
- `DESIGN.md` (lo actualiza quien orquesta): registrar ésta como una **tercera ruptura dirigida por el dueño** junto a "The Two Pinned Breaks" (círculos de flecha + `drop-shadow` de la facturita).

---

## Verificación (frontend)

1. `make test-frontend` (`vitest` + `tsc --noEmit`) en verde.
2. `make lint` (eslint) en verde.
3. Manual: cargar un movimiento con líneas y ver el desglose en la facturita; frascos con las tres cifras separadas y legibles; hoja pinchada (desktop con giro, móvil sin giro) **sin scroll horizontal a 390px**; navegación por teclado y foco visible intactos.

## Checklist de diseño (antes de dar por cerrado)

- [ ] Solo rayas de tinta para separar; ninguna card ni sombra nueva.
- [ ] Sin cuarto color; estado del frasco sigue siendo el `.tag` de siempre.
- [ ] `border-radius: 0` en lo nuevo (salvo lo ya permitido).
- [ ] `<label>`/`aria-*` correctos en los campos nuevos; una sola live region.
- [ ] Cero overflow horizontal a 390px (incluido el giro de desktop).
- [ ] `VES`+líneas imposible desde la UI; total derivado coincide con lo que muestra la facturita.
