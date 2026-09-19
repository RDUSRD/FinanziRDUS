# Build packet — "La Factura del Mes" (read fully before touching code)

Shared contract for every frontend agent on this round. `frontend/src/index.css` has already
been rewritten and is the **only** source of truth for style. Do not edit `index.css`,
`frontend/index.html`, or any file outside your assignment.

## The world

The month is one **white invoice bound like a savings passbook**. Light paper, print ink, square
corners everywhere (the paper has no radius). Nothing is a card with a soft shadow: there is one
sheet, and rules divide it.

Three marks are physical actions on paper — use them for their meaning, never as decoration:

- **stamp red** (`--color-danger`, `--color-danger-fill`) — loss, something over its cap, a
  destructive action, and the ONE action plate. `.stamp` for a rubber-stamp impression
  (`.stamp.void` when neutral); `.plate` / `.action-stamp` for the single saturated button.
- **ballpoint blue** (`--color-pen`, class `.pen`) — the original bolívar amount of a movement.
  Never used for anything else.
- **highlighter** (`--color-mark`, class `.mark`) — **background stroke behind ink only, never a
  text colour**. It marks the ≥80% of a cap.
- `--color-warn` is a text-safe amber: use it for attention text and rules, never `--color-mark`.

Income is never a colour: full ink with a leading `+`.

## Token rename map (old world → new)

| was | now |
|---|---|
| `--color-board` | `--color-paper` |
| `--color-board-2` | `--color-paper-2` |
| `--color-board-3` | `--color-desk` |
| `--color-chalk` | `--color-ink` |
| `--color-wood`, `--color-wood-hi` | **deleted** (there is no frame) |
| `--paint-texture` | `--paper-texture` |
| `--color-danger`, `--color-danger-fill`, `--color-warn`, `--color-dim`, `--color-dim-2`, `--color-rule`, `--color-rule-strong`, `--color-control` | same names, new values |
| — | new: `--color-edge`, `--color-danger-deep`, `--color-mark`, `--color-pen` |

No component may keep a `board`, `chalk`, `wood` or `paint` token or class name.

## Class vocabulary (all defined in index.css — use these exact names)

- **Shell:** `.desk` (the grey desk behind), `.sheet` (the document; replaces `.board`+`.frame`;
  `.board-texture` is deleted), `.membrete`, `.brand`, `.brand .house`, `.brand .tag-line`,
  `.doc-no`.
- **Sections:** `.sect` (replaces `.head`), `.sect h2`, `.sect-note`, `.sect-actions` (replaces
  `.head-actions`), `.legend-note`, `.rule`.
- **Subtotals:** `.subtotals`, `.sub-line`, `.sub-line .lab`, `.leader` (the dot leader),
  `.sub-line .val`, `.sub-line.total`, `.sub-line.neg`, `.compare`. Replaces `.figs`/`.fig`.
- **Marks:** `.mark`, `.struck`, `.fix`, `.stamp`, `.stamp.void`, `.plate`, `.action-stamp`,
  `.perf`, `.page-no`.
- **Controls:** `.field`, `.field > label`, `.seg`, `.tag`, `.linkb`, `.linkb.destructive`,
  `.iconb`, `.pbtn`, `.monthnav`, `.monthnav .m`, `.monthjump`.
- **Ledger:** `.book`, `.book .ln`, `.book .ln-head`, `.book .amt`, `.book .desc`,
  `.book .desc .who`, `.book .desc .what`, `.book .desc .note`, `.book .acts`, `.right`,
  `.pen`, `.flash`; `.pager`, `.pager-state`, `.pager-range`, `.pager .pages`.
- **Blocks:** `.list`, `.row`, `.row .nm`, `.row .amt`, `.row .cap`, `.row .capfield`,
  `.row.warn`, `.row.over`, `.bar`, `.wbar`, `.cats`, `.acc`, `.acc .a`, `.acc .a .n`,
  `.acc .a .b`, `.acc .a .m`, `.acc .a.debt`, `.debtline`, `.rate`,
  `.margin-col`, `.margin-col .j`, `.margin-col .j .no`, `.nm`, `.pc` (replaces `.jar`).
- **Charts:** `.chartbox`, `.chartlead`, `.donut`, `.bars`, `.bars-scroll`, `.cols`, `.two`.
- **Windows:** `.scrim`, `.window`, `.wtitle`, `.wsub`, `.wbody`, `.wfoot`.
- **States:** `.empty-state`, `.error-msg`, `.hint`, `.notice`, `.strip`, `.strip.action`,
  `.skel`, `.repaint`, `.mono`, `.num`, `.sr-only`, `.skip-link`.

## Hard rules

1. **Markup structure may be reorganised; meaning may not.** Do not change any accessible name,
   `aria-label`, `<label>` text, heading text, button text, role, or visible copy. The 104
   existing tests query by role and text — they must stay green without weakening a single
   assertion. If a test breaks because you moved markup, fix the query, never the assertion.
2. **No new dependencies, no external requests, no new fonts, no new icons.** Use only the
   existing components/`Icons.tsx`. Never edit `Icons.tsx` (shared, collision risk).
3. **Add comment only where the logic is not self-evident.** No decorative comments. No
   `TODO`. Never write strategy words (`THESIS`, `OWN-WORLD`, direction names, seed keys) into
   source, JSX, comments, `data-*`, or any delivered file.
4. Keep every figure in tabular figures; money and counts stay aligned. Add `.num` / `.mono`
   where a figure is measured.
5. Mobile-first: no horizontal overflow at 390px; touch targets ≥44px; keep `:focus-visible`
   working; error text stays wired through `aria-invalid` + `aria-describedby`.
6. **Sun legibility**: no text below 4.5:1 on its actual background. Never grey-on-grey.
7. `pnpm run typecheck` and `pnpm run lint` must pass, and your assigned test files must pass.
   Run them yourself before reporting. Report the exact commands and their result.
8. Report back concisely: files changed, the class vocabulary you applied, commands run and
   their output, and anything you could not do. Do not report `DONE` without evidence.
