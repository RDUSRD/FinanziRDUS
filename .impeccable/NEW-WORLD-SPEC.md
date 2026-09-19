# FinanciRDUS — New visual world: «La pizarra de la tasa»

Handoff contract for the frontend rebuild. Read it fully before writing code.

## 0. Hard boundaries

- You write **only** inside `frontend/**`. `backend/**`, `docs/**`, `docker-compose.yml`,
  `Makefile`, `.env.example`, `README.md` and `legacy/**` are frozen — never touch them.
- The API contract in `frontend/src/api/**` is frozen. Do not add, remove or rename a field.
  All business figures (totals, percentages, averages, budget status, USD conversion) come from
  the API. Never recompute a business figure in the client. A clearly-labelled *estimate* for
  user feedback is allowed only where section 6 says so.
- All existing functionality must survive: movement CRUD, VES entries with rate, budgets,
  donut, 6-month bars, the 25/15/50/10 plan with category reassignment, named wallets with debt
  and debt payments, export/import (merge + replace), month navigation, wallet filter, category
  filter, one live region, all loading/error/empty states.
- Reference renders (look at them, do not copy numbers): `.impeccable/mocks/decision/assigned.html`
  (board, no modal), `assigned-modal.html` (board + the movement window),
  `.impeccable/review/assigned-desktop-full.png` and `assigned-mobile-full.png`.

## 1. The contract (also ships in `frontend/index.html`)

```
THESIS: La app es una pizarra de precios reescrita a mano y el mes es el tablero. Rechaza el dashboard de tarjetas con sombra suave.
OWN-WORLD: Tablero verde-negro con textura de pintura, enmarcado en madera; letra de cartel en marfil tiza y cifras medidas en mono; líneas y reglas a mano; una sola mancha bermellón para lo negativo y la acción, ámbar sólo para la atención.
STORY: Quien entra entiende en un vistazo cuánto le queda, qué se pasó de la raya y qué escribió; escribe un movimiento en una ventana con marco y ve la prueba de tira antes de confirmar.
FIRST VIEWPORT: Una pizarra enmarcada a sangre: nombre pintado, placa de la última tasa cargada, la deuda en rojo y los tres números del mes en cifras enormes sobre una raya; ANOTAR MOVIMIENTO es la única mancha de color fuerte.
FORM: Pizarra de precios de casa de cambio; cuarta de siete direcciones curadas; seed 173ac4e7.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
```

## 2. Tokens — replace the whole `@theme` block in `src/index.css`

Tailwind v4 CSS-first. Keep `@import "tailwindcss";` first.

```css
@theme {
  --color-board: #131a16;        /* pizarra verde-negro */
  --color-board-2: #17201b;
  --color-board-3: #0e1411;      /* fondo detrás del marco */
  --color-chalk: #ede8d9;        /* marfil tiza: texto principal */
  --color-dim: rgba(237, 232, 217, 0.64);
  --color-dim-2: rgba(237, 232, 217, 0.58);
  --color-rule: rgba(237, 232, 217, 0.15);
  --color-rule-strong: rgba(237, 232, 217, 0.32);
  --color-control: rgba(237, 232, 217, 0.42);   /* borde de controles, >=3:1 */
  --color-danger: #ff6a44;       /* saldo negativo y tope excedido (texto) */
  --color-danger-fill: #b23a20;  /* relleno de la placa de acción; chalk encima = 4.8:1 */
  --color-warn: #e0a92c;         /* atención: >=80% del tope, y la placa de la tasa */
  --color-wood: #3b2a1b;
  --color-wood-hi: #5d452c;
  --font-sans: "Chivo", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "Chivo Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
```

Colour roles are strict and exhaustive: **chalk** = neutral; **danger/danger-fill** = something
is negative or exceeded, or the destructive/primary action; **warn** = pay attention (a cap at
or above 80%, and the last-rate plaque). Income is **not** a colour: it is chalk at full
strength with a leading `+`. Never introduce a fourth hue; the donut and bars are a
single-family chalk ramp.

Self-hosted fonts live in `frontend/public/fonts/` (already copied, served at `/fonts/...`,
CSP already allows `font-src 'self'`). Declare them in `index.css` with `@font-face` for
Chivo 400/700/900 and Chivo Mono 400/700, `font-display: swap`. No external font, CDN or
network request may be introduced.

`body`: `background: var(--color-board-3)`, `color: var(--color-chalk)`,
`font-family: var(--font-sans)`, `font-size: 16px`, `line-height: 1.45`,
`-webkit-font-smoothing: antialiased`. All figures carry `font-variant-numeric: tabular-nums`.

## 3. Materials (do these, they are the world)

- The page is **one framed board**, not a stack of cards. A `.frame` (wood gradient + 13px
  padding + a single outer shadow) contains one `.board` (painted ground, inner shadow).
- Board ground: a subtle painted texture — layer an inline data-URI `feTurbulence` SVG at very
  low opacity plus one soft radial lightening at the top-left. Never a flat fill alone.
- Sections are separated by 1px chalk rules at 15% alpha with a small uppercase painted
  heading (`.sect`) with `letter-spacing: .2em` and a `::after` rule that fills the row.
  **No cards, no rounded corners, no soft drop shadows anywhere.**
- Plates (buttons, chips) are painted rectangles: `border-radius: 2px`, and a
  `filter: url(#paint-rough)` (inline SVG `feTurbulence` + `feDisplacementMap`, scale ~3.4)
  applied to a background pseudo-element only — never to text.
- The painted surface has one authored depth move: the primary action plate is the only
  saturated fill on the board, and it must stay the visually loudest element.
- Browser surfaces belong to the palette too: theme `::selection` (chalk on
  `--color-danger-fill`), the caret, and scrollbars for the window body and the bars scroller.

## 4. Type

- Display (board title, section heads, the month's big figures, plate labels): Chivo 900,
  uppercase, tracking between `-0.03em` and `.02em`.
- The month's three figures: `clamp(2rem, 1.1rem + 3.6vw, 4rem)`, weight 900, tabular.
- Labels and micro-copy: Chivo 700, `.68rem`–`.78rem`, uppercase, `letter-spacing: .16em`.
- Every measured number, amount, rate, date, and table figure: Chivo Mono, tabular.
- Body copy measure 65–75ch; no gradient text.

## 5. Class inventory (build these in `@layer components`)

`.frame`, `.board`, `.board-texture`, `.sect`, `.rule`, `.num`, `.mono`, `.plate` (+ `.fill`,
`.fill.red`, `.fill.ivory`), `.pbtn` (+ `.primary`, `.iconb`, `.linkb`, `.pbtn:disabled`),
`.rate`, `.monthnav`, `.fig` (+ `.neg`), `.compare`, `.cols`, `.list` / `.row` (+ `.warn`,
`.over`), `.bar` (> i), `.chartbox`, `.donut`, `.bars`, `.jar` (+ `.warn`, `.over`), `.acc`
(+ `.a.debt`), `.debtline`, `.book` (table), `.tag` (+ `.inc`), `.window` (+ `.wbar`, `.wc`,
`.wbody`, `.wfoot`), `.strip`, `.field`, `.seg`, `.scrim`, `.notice`, `.empty-state`, and
`.skip-link`.

Responsive: the board is a tall column below 640px; the price list stacks name+figure on one
line with the cap below; the ledger drops its wallet and note columns; the bars get their own
`overflow-x: auto` scroller with a `min-width`. **Zero horizontal overflow at 390px** — verify
it, do not assume it.

## 6. Interaction contract

1. **The movement window.** The primary plate «ANOTAR MOVIMIENTO» opens a window containing the
   form (type, currency USD/Bolívares, amount, rate when VES, wallet, category, date, note).
   Editing a row opens the same window prefilled and titled as an edit. The old inline form is
   gone; delete `MovementForm.tsx` and create `MovementWindow.tsx`.
2. **Prueba de tira.** Inside the window, a strip shows the USD equivalent for a VES entry (the
   existing behaviour) and, below it, an **estimate** of what the movement would do to the
   month. The estimate is derived only from the values already typed plus the summary/budgets
   the client already loaded, and it must be labelled literally as an estimate that is not
   saved yet (e.g. «Estimado, todavía sin guardar»). It is never presented as the stored figure.
3. **Confirmations are windows, not `window.confirm`.** Deleting a movement and deleting a
   wallet ask inside a window that names the specific item and the consequence.
4. **Import is a window.** It offers the two modes (fusionar / reemplazar), the file input, and
   the destructive confirmation for `replace` inside the same window. Export stays a button.
5. **Wallets.** Creating, editing and paying a debt open windows too.
6. **Movement list controls.** A text search (over category label and note) plus the existing
   category filter plus a type filter (todos / gastos / ingresos). Client-side presentation
   only, over the month already loaded. Show the filtered count and a clear empty state.
7. **Notice.** A visible dismissible notice for success/error, in addition to the single
   `role="status"` live region (which keeps announcing, never duplicated).
8. **Month navigation, wallet filter, export** keep their current behaviour.

### The window primitive (`Window.tsx`)

`role="dialog"` + `aria-modal="true"` + `aria-labelledby` on a real heading; a title bar with a
labelled close button; a scrim; **Escape closes**; focus moves into the window on open, is
trapped inside it (Tab/Shift+Tab wrap), and returns to the element that opened it on close;
`body` scroll is locked while open and restored after; the window body scrolls on its own when
it is taller than the viewport; clicking the scrim closes it. Never nest a window inside another.

## 7. Motion — one authored moment, nothing else

Exactly one signature motion: after a movement is saved or the month changes, the affected big
figures are **re-painted** — a short `clip-path`/`mask` wipe along the painted stroke, ~240ms,
`cubic-bezier(.2, .9, .1, 1)`. The row that was just written gets one brief highlight. There is
no entrance animation per section and no scattered hover effects. Under
`prefers-reduced-motion: reduce`, both are disabled and content is visible by default.
`scroll-behavior` is respected (the app currently scrolls programmatically).

## 8. Accessibility — non-negotiable, WCAG 2.2 AA

- Contrast: body/placeholder text ≥4.5:1, large text and graphic rules ≥3:1. Verify the
  control border (`--color-control`) and every chalk-alpha value against the board ground.
- Every control has an associated `<label>`; the gasto/ingreso and USD/VES groups keep
  `fieldset`/`legend` (or `role="radiogroup"` + `aria-label`).
- Form errors: `aria-invalid` + `aria-describedby` pointing at the message, and focus moves to
  the first field with an error. No `role="alert"` per field.
- One live region only. Charts keep `role="img"` with a short `aria-label` plus the sr-only
  navigable table equivalent. Progress bars keep `role="progressbar"` with `aria-valuetext`.
- Tables keep `<caption>` (sr-only is fine), `<th scope>`, and a focusable scroll container.
- Touch targets ≥44px; `:focus-visible` visible everywhere (2px ochre or chalk outline, 2px
  offset); keyboard-only operation must reach every action.
- Never `dangerouslySetInnerHTML` with user data.

## 9. Gates before you report done

```
cd frontend
pnpm run typecheck
pnpm run lint
pnpm test -- --run
pnpm run build
```

All four must pass. Fix what you broke. Do not weaken or delete a test to make it pass: update
it to the new interaction (a test that submitted the inline form must now open the window
first). Do not leave a `console.log`, a TODO, or a commented-out block.
