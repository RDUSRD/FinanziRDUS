---
name: FinanciRDUS
description: Registro personal de gastos e ingresos del mes, impreso como la factura blanca que el visitante reescribe.
colors:
  stamp: "#b12e22"
  stamp-fill: "#b23a20"
  stamp-deep: "#8d2a17"
  ballpoint: "#1b3c8c"
  highlighter: "#f0e24b"
  amber: "#8a6a12"
  paper: "#fafaf8"
  paper-2: "#f2f3f0"
  desk: "#e2e5e1"
  ink: "#11161b"
  ink-deep: "#05080a"
  ink-dim: "rgba(17, 22, 27, 0.66)"
  ink-dim-2: "rgba(17, 22, 27, 0.6)"
  rule: "rgba(17, 22, 27, 0.16)"
  rule-strong: "rgba(17, 22, 27, 0.34)"
  control-line: "rgba(17, 22, 27, 0.46)"
  edge: "#d3d7d2"
typography:
  display:
    fontFamily: "Libre Franklin, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "1.32rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.02em"
  figure:
    fontFamily: "Chivo Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.72rem"
    fontWeight: 700
    letterSpacing: "-0.03em"
    fontFeature: "'tnum' 1"
  subtotal:
    fontFamily: "Chivo Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.22rem"
    fontWeight: 700
    letterSpacing: "-0.03em"
    fontFeature: "'tnum' 1"
  ledger-amount:
    fontFamily: "Chivo Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.94rem"
    fontWeight: 700
    letterSpacing: "-0.02em"
    fontFeature: "'tnum' 1"
  heading:
    fontFamily: "Libre Franklin, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "0.74rem"
    fontWeight: 900
    letterSpacing: "0.16em"
  body:
    fontFamily: "Libre Franklin, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'tnum' 1"
  label:
    fontFamily: "Libre Franklin, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "0.66rem"
    fontWeight: 700
    letterSpacing: "0.14em"
  mono-micro:
    fontFamily: "Chivo Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.74rem"
    fontWeight: 700
    letterSpacing: "0.04em"
    fontFeature: "'tnum' 1"
rounded:
  sheet: "0"
  control: "0"
  punch: "50%"
spacing:
  sheet-y: "26px"
  sheet-x: "18px"
  sheet-y-desk: "34px"
  sheet-x-desk: "40px"
  band: "30px"
  rule-gap: "18px"
  row-y: "9px"
  control-y: "10px"
  control-x: "12px"
  touch: "46px"
  touch-coarse: "44px"
components:
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "26px 18px 34px"
  action-plate:
    backgroundColor: "{colors.stamp-fill}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
    height: "46px"
  action-plate-hover:
    backgroundColor: "{colors.stamp-deep}"
  action-plate-disabled:
    backgroundColor: "{colors.rule-strong}"
    textColor: "{colors.paper}"
  ink-plate:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
    height: "42px"
  ink-plate-hover:
    backgroundColor: "{colors.ink-deep}"
  page-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
    height: "42px"
  icon-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0"
    size: "42px"
  text-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "4px 2px"
    height: "34px"
  segmented-control:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "46px"
  segmented-control-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "46px"
  select:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 34px 10px 12px"
    height: "46px"
  cap-field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.ledger-amount}"
    rounded: "{rounded.control}"
    padding: "6px 8px"
    height: "38px"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "1px 6px"
  rubber-stamp:
    backgroundColor: "rgba(178, 58, 32, 0.05)"
    textColor: "{colors.stamp}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "3px 8px"
  window:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "0 0 18px"
    width: "620px"
  empty-state:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.sheet}"
    padding: "26px 14px"
---

# Design System: FinanciRDUS

## Overview

**Creative North Star: "La Factura del Mes"** — the month is one white invoice, bound like a
savings passbook, that the visitor keeps re-writing. The whole screen is one sheet of cool
white paper lying on a grey desk: the letterhead at the top, the month's three figures ruled
into a subtotal band, the numbered line items of the ledger, the margin column of jars and
wallets, and the perforation that ends the page. Nothing in it is a card: bands are separated by
rules, and the rules are the structure.

The sheet is written with the marks a person physically makes on a document. A rubber stamp
carries anything negative, anything over its cap, and the one action plate; a ballpoint carries
the original bolívar amount of a movement; a highlighter marks a cap that is running out — always
as a stroke behind the ink, never as a colour of its own. Attention that has to be legible as
text uses a darker amber instead. Income is not a colour at all: it is print ink at full strength
with a leading `+`, the way a signed ledger reads.

Every figure on the sheet carries its provenance in the line beside it — its date, its line
number, the wallet and the note that produced it — so the visitor sees the month already closed
into a total and still knows where each part of it came from. The two things this world refuses
are named in its own material: the dashboard of soft-shadowed KPI cards (there is one sheet, and
nothing on it is elevated) and the bureaucratic form (the movement form is a window over the
sheet that first shows a "prueba de tira" — an estimate of where the movement will land, labelled
as an estimate, before anything is saved).

**Key Characteristics:**
- One sheet on a grey desk, ruled into bands; zero cards, zero rounded corners.
- Cool white paper, near-black print ink; the only saturated fill is the stamp-red action plate.
- Three marks only: stamp red, ballpoint blue, highlighter yellow — plus amber for attention text.
- Libre Franklin for the document, Chivo Mono for every measured column, tabular figures everywhere.
- Depth is material: one shadow for the sheet on the desk, one for a window over the sheet, and one
  for the action plate once it leaves the flow on a phone.
- Both faces self-hosted and served from this origin; no external font, CDN or network request.
- Two authored motions: the ink-dry re-print of the month's figures, and one flash on the row just written.

## Colors

The palette is paper and print ink, with exactly three marks allowed to carry colour.

### Primary
- **Stamp Red** (`#b12e22`, `--color-danger`): the rubber stamp's ink. Lettering for a negative
  balance, an exceeded cap, a destructive control and an error message; the invalid field border;
  and the focus ring.
- **Stamp Fill** (`#b23a20`, `--color-danger-fill`): the single saturated fill on the sheet — the
  action plate, the fill of an exceeded progress bar, `::selection`, and the skip link.
- **Stamp Deep** (`#8d2a17`, `--color-danger-deep`): the plate under the hand (hover).

### Secondary
- **Ballpoint Blue** (`#1b3c8c`, `--color-pen`): the original bolívar amount of a movement
  (`.pen`) and nothing else. The number the visitor wrote in bolívares stays in the pen that
  wrote it, directly under its USD equivalent.

### Tertiary
- **Highlighter Yellow** (`#f0e24b`, `--color-mark`): a stroke laid behind ink — a 178° gradient
  band covering 8%–92% of the line box (`.mark`). It is never a text colour: as lettering it
  would measure 1.3:1 on paper.
- **Attention Amber** (`#8a6a12`, `--color-warn`): attention that must be read as text or drawn
  as a rule — the status of a cap at or above 80%, and the amber fill of that bar. It is
  deliberately darker than the highlighter so it clears 4.8:1 on paper.

### Neutral
- **Paper** (`#fafaf8`): the sheet and every field's ground.
- **Copy Paper** (`#f2f3f0`): the second sheet — notice strips, chart boxes, the last-rate
  plaque, empty states, the cap field under focus, a disabled field.
- **Desk Grey** (`#e2e5e1`): the surface the sheet lies on.
- **Print Ink** (`#11161b`): all text, every drawn rule, the donut and the bars, the caret.
- **Ink Deep** (`#05080a`, `--color-ink-deep`): the same ink under the hand. It appears in exactly
  one place — the hover ground and border of the ink plate (`.pbtn.primary`).
- **Ink Dim** (`rgba(17, 22, 27, 0.66)`, 5.7:1 on paper): secondary text — notes, legends, hints,
  field labels, table heads.
- **Ink Dim 2** (`rgba(17, 22, 27, 0.6)`, 4.7:1 on paper): tertiary text — placeholders, line
  numbers, the page folio.
- **Rule** / **Rule Strong** (`0.16` / `0.34`): the hairline divider and the dashed row separator.
- **Control Line** (`rgba(17, 22, 27, 0.46)`, 3.0:1 on paper): the border of every input, select,
  page button, icon button and segmented control.
- **Sheet Edge** (`#d3d7d2`): the 1px cut edge of the sheet and of a window.

### Named Rules
**The Three-Marks Rule.** Only three marks carry colour: the rubber stamp (red), the ballpoint
(blue) and the highlighter (yellow). Amber is the same "attention" ink made readable as text. A
fourth hue does not exist — a new state finds its mark, or it stays ink.

**The Ink-Only-Income Rule.** Income is never a colour: `.amt.income` is print ink at full
strength with a leading `+`, exactly like `.amt.expense`. The sign carries the meaning.

**The Highlighter-Behind-Ink Rule.** The highlighter is a background stroke, never a text colour.
When attention must be legible as lettering it is amber (`.row.warn`, `.wbar.warn`) or it is ink.

**The Never-Grey Rule.** Secondary and tertiary text are ink at reduced alpha over paper (0.66 →
5.7:1, 0.6 → 4.7:1). No grey and no tinted neutral is ever used to lower the voice, because the
sheet has to stay legible in daylight.

## Typography

**Display Font:** Libre Franklin (variable, weight 100–900, self-hosted as
`/fonts/libre-franklin-latin-var.woff2`)
**Body Font:** Libre Franklin (the same face carries the section heads at 900 and the labels at 700)
**Label/Mono Font:** Chivo Mono 400/700 (self-hosted; `ui-monospace`, `SFMono-Regular`, `Menlo` fallbacks)

**Character:** Two faces, two jobs. Libre Franklin is the printer's sans the invoice is set in —
the house name, the section heads, the labels and the reading copy. Chivo Mono is the ledger: mono
is not a costume here, the whole world measures, so every amount, rate, date, count and line
number is set in it and every column of figures aligns to the cent. Both faces are declared in
`index.css` and served from this origin (`font-src 'self'`); the system loads no font from
anywhere else.

### Hierarchy
- **Display** (900, `1.32rem`, `1`, `-0.02em`, uppercase): the house name in the letterhead
  (`.brand .house`).
- **Figure** (Chivo Mono, 700, `1.72rem`, `-0.03em`, tabular): the closing total — "Te queda"
  (`.sub-line.total .val`), the largest number on the sheet.
- **Subtotal** (Chivo Mono, 700, `1.22rem`, `-0.03em`, tabular): the income and expense figures
  above it.
- **Ledger amount** (Chivo Mono, 700, `0.94rem`, `-0.02em`, tabular): a movement's amount in
  `.book`, right-aligned behind its `+`/`-`.
- **Heading** (900, `0.74rem`, `0.16em`, uppercase): the section head (`.sect h2`) — small,
  letter-spaced, and the only thing on its line besides its rule.
- **Body** (400, `16px`, `1.45`, measure capped at 66–74ch by `.wsub`/`.legend-note`/`.compare`):
  reading copy, notes and hints.
- **Label** (700, `0.66rem`, `0.14em`, uppercase): field labels, plate lettering, `.tag`.
- **Mono micro** (Chivo Mono, 700, `0.68`–`0.76rem`, `0.04`–`0.12em`, uppercase): the document
  number (`Nº YYYY-MM`), the page folio — which carries the balance forward, "Pasa a la hoja
  siguiente · <monto>" —, the pager state and the ledger's line numbers.

### Named Rules
**The Tabular Rule.** `font-variant-numeric: tabular-nums` is declared on `body` and inherited by
everything, and restated on `.mono`/`.num`. No column of figures may shift width.

**The Measured-Mono Rule.** Chivo Mono is for money, rates, dates, counts, line numbers and
codes — things that are measured, matched or listed in a column. It is never used to make
something look technical.

**The One-Line Section Rule.** A section opens with a `.sect`: one `0.74rem`/900/`0.16em`
uppercase heading and its 1px ink rule sharing a baseline, with the optional `sect-note` in Ink
Dim at the far end of the row. The heading carries its own weight; the rule supplies the division.

## Layout

One sheet, `1180px` max-width, centred on the desk (`min-height: 100vh`). On a phone the sheet
runs edge to edge with `26px 18px 34px` of internal margin; from `680px` it lifts off the desk
(`30px auto` margins, `34px 40px 46px` padding) so the grey desk shows around it. Its bands, in
document order: letterhead (`.membrete`), subtotal band, concepts list, two-column spread
(`.cols`: donut + 6-month bars), the margin column of jars, the wallets, the ledger, then
`.perf` and the page folio.

Vertical rhythm: `30px` above a section head (`.sect`, `margin: 30px 0 10px`), `18px` around a
bare `.rule` that closes the sheet's larger bands, `9px` of row padding inside the ledger, `14px`
grid gap inside a window form. Tight groups, generous separation, and more space above a heading
than below it.

Responsive: at `>=680px` the sheet gains its desk margin; at `>=720px` `.cols`, `.two` and
`.jar-meta` become two columns; below `719px` the ledger's action column wraps onto its own line
instead of widening the table, the bar chart gets its own focusable scroller (`.bars-scroll`), the
letterhead's action plate leaves the flow (`position: fixed`, `16px` from the right and bottom
edges, `z-index: 30`) with the body reserving `104px` of foot so it never covers the pagination,
and the pagination's buttons stack into a column. On a coarse pointer every control below the
comfortable minimum is raised to `44px` — `.linkb`, `.book .acts .linkb`, `.iconb` (width
included), `.pbtn`, `.row .capfield` and the month field; those declarations sit at the end of the
stylesheet on purpose, because at equal specificity they only win by order. Zero horizontal
overflow at `390px` is a product requirement, not a hope: `.table-scroll` carries
`position: relative` and `min-width: 0` because without them the table's sr-only caption escapes
the clip and drags the whole page sideways.

## Elevation & Depth

**Flat by default.** Two shadows describe an object rather than a raised surface: the sheet lying
on the desk
(`box-shadow: 0 1px 0 rgba(17, 22, 27, 0.04), 0 14px 34px -18px rgba(17, 22, 27, 0.34)`) and a
window thrown over the sheet (`0 24px 60px -22px rgba(17, 22, 27, 0.5)`). Both carry an offset
and a soft negative-spread blur; neither is a coloured halo or a glow. The scrim is a flat ink
wash (`rgba(17, 22, 27, 0.42)`) with no backdrop blur.

The one state that lifts is the action plate: on a phone, once it leaves the flow and floats over
the sheet, it gains `0 12px 28px -12px rgba(17, 22, 27, 0.55)` so it is not read as printed on the
paper. In the flow it declares no drop shadow — only its inset edge.

Every other `box-shadow` in the sheet draws a rule rather than a depth: the double rule
(`0 5px 0 -4px var(--color-ink)` under a 3px ink border, on `.membrete`, `.sub-line.total` and
`.wtitle`) and the plate's printed edge (`inset 0 -2px 0 rgba(0, 0, 0, 0.18)`, which flips to
`inset 0 1px 0 rgba(0, 0, 0, 0.22)` while the stamp is pressed). Structure comes from rules:
1px hairlines at 16% ink, dashed 1px row separators at 16%, 2px rules closing a table head, a
list or a margin column, 3px rules closing the letterhead, the total and a window title, and
`.leader` — a 1px dotted rule pushed down 3px to sit on the dot line between a label and its
figure.

### Named Rules
**The Flat-Sheet Rule.** A surface never lifts. It is either printed on the sheet (fields, bars,
tags, stamps) or it is a window over it. A card with a soft shadow does not belong to this world.

**The One-Shadow Rule.** A surface declares its depth once, as ground contact: the sheet has one
shadow, the window has one shadow. Nothing else in the sheet casts anything — except the action
plate, and only once it has left the flow to float over the sheet on a phone.

## Shapes

Square and ruled. The whole sheet declares `border-radius: 0` nineteen times, and the only other
radius in the system is the 7px punch hole (`border-radius: 50%`) at each end of `.perf` — the
one curve, and it belongs to the perforation, not to a container. No pills, no rounded cards, no
circular containers; the donut is drawn SVG geometry.

Boundaries are one of four rules: a 1px solid hairline at 16% ink (`.rule`, row separators), a
1px dashed rule at 16% (ledger rows, list rows, the cap field's baseline) or at 34% (the
perforation), a 2px rule at full ink (`.book thead th`, `.list`, `.margin-col`, `.acc`, the top of
every `.notice`/`.strip`, and both edges of the active `.margin-col .j[aria-current="step"]`) or
at 34% (the nested wallet, `.acc .a`), and a 3px ink rule with the double rule under it
(`.membrete`, `.sub-line.total`, `.wtitle`). Fills are flat rectangles with square corners; the
segmented control is a 1px-bordered rectangle divided by 1px separators.

## Components

### Buttons
Square, uppercase, letter-spaced. The primary plate is 46px tall, the page, icon and ink buttons
42px, and the inline text action 34px (30px inside a ledger row).
- **Primary plate** (`.plate`, alias `.action-stamp`): stamp fill, paper lettering, `12px 18px`,
  46px minimum height, with `inset 0 -2px 0 rgba(0, 0, 0, 0.18)` as the plate's printed edge. It
  is the only saturated fill on the sheet and reads straight (never rotated): in a task, the
  action is not decorated.
- **Hover / Active:** the fill deepens to Stamp Deep over `120ms ease`; pressing moves the plate
  down `1px` over `60ms ease` and flips the inset edge to the top — the stamp going down on paper.
- **Disabled:** drops to `rule-strong` with paper lettering, no edge shadow, `cursor: not-allowed`,
  and never translates.
- **Page button** (`.pbtn`): paper fill, 1px Control Line border, `9px 14px`, 42px minimum height;
  hover swaps the ground to Copy Paper and the border to ink; disabled only lowers the lettering
  to Ink Dim 2.
- **Ink plate** (`.pbtn.primary`): the page button's frame with a full Print Ink ground and paper
  lettering, and its hover dropping both ground and border to Ink Deep (`--color-ink-deep`). It is
  the confirm action inside the wallet window ("Crear cartera" / "Guardar cambios"), so the red
  plate stays reserved for the document's own action and for what is destructive.
- **Icon button** (`.iconb`): a 42×42 square, 1px Control Line border, holding one drawn SVG at
  16px (`0 0 20 20` box, square caps, miter joins, `currentColor`); hover is the Copy Paper wash
  with an ink border. The SVG is `aria-hidden` and the control owns the accessible name.
- **Text button** (`.linkb`): ink lettering underlined in Rule Strong, `text-underline-offset: 3px`,
  34px minimum height; the underline darkens to ink on hover. `.destructive` turns both to stamp red.

### Fields
- **Shape:** square (radius 0), 1px Control Line border, `10px 12px`, 46px minimum height, paper
  ground, `0.92rem` Libre Franklin.
- **Label:** uppercase `0.66rem`/`0.14em` in Ink Dim, sitting directly above the field.
- **Focus / Error / Disabled:** `:focus-visible` turns the border stamp red and inherits the
  global `2px` red outline with `2px` offset; `[aria-invalid="true"]` thickens the border to 2px
  stamp red and its message (`0.74rem`, stamp red, 600) is wired through `aria-describedby`;
  disabled is a Copy Paper ground with Ink Dim 2 lettering.
- **Select:** `appearance: none` with the chevron drawn in CSS — two 5×5px ink wedges (45°/135°
  gradients) at `calc(100% - 17px)` and `calc(100% - 12px)` — and `option` forced onto an opaque
  paper ground. A transparent popup would leave the native list light under ink lettering, which
  makes every choice unreadable.
- **Cap field** (`.row .capfield`): the deliberate exception. A 92px borderless field on a dashed
  1px baseline, mono at `0.86rem` weight 700, right-aligned, plus the word " tope" beside it. On
  focus the baseline goes solid red over a Copy Paper ground. The concept list therefore reads as
  a written list, not as a grid of boxes.
- **Segmented control** (`.seg`): a 1px-bordered rectangle; each option is `10px 16px`, 46px tall,
  uppercase, divided by 1px separators, and the chosen one (from `aria-pressed` / `aria-checked`)
  turns ink with paper lettering. Used for gasto/ingreso, USD/VES and the import modes.

### Tags and stamps (chips)
- **Tag** (`.tag`): transparent ground, 1px Rule Strong border, square, `1px 6px`, `0.62rem`/900
  lettering in Ink Dim. It labels a row's kind ("Gasto", "Ingreso", "Pago de deuda", "Deuda") and
  never carries colour.
- **Rubber stamp** (`.stamp`): a 2px stamp-red border at `3px 8px`, `0.64rem`/900/`0.16em`
  lettering on a 5% stamp wash, rotated `-2.4°`. It is the mark on a debt (`A pagar`).
  `.stamp.void` is the same stamp dulled to Ink Dim with an ink wash.

### Sheet, bands and containers
- **The sheet** (`.sheet`): Paper ground, flat — a plain colour, no texture and no pattern — 1px
  Sheet Edge border, square corners, `1180px` max-width and one ground shadow. It is the only
  container; bands inside it are divided by rules, not wrapped in cards.
- **Section head** (`.sect`): a `.74rem`/900/`0.16em` uppercase heading and its `sect-note` on one
  baseline row, closed by a 1px ink rule.
- **Chart box** (`.chartbox`): a 1px Rule border on Copy Paper with `14px` padding — the frame
  around an engraved donut or a set of printed bars.
- **Window** (see below): Paper ground, 1px Sheet Edge border, 620px max-width.
- **Notice / strip / empty state**: Copy Paper grounds, square, each closed above by a 2px ink rule
  sitting over its 1px Rule Strong border — the band is ruled into the sheet, never outlined down
  one side. `.notice.success` swaps its border to ink; `.notice.error` is the only one that takes
  the stamp's red (2px border on a 5% stamp wash, its sentence in bold stamp red). `.strip.action`
  — the sentence that warns about replacing data — is bordered 2px stamp red all round.
  `.empty-state` is a dashed border with centred lettering.

### Navigation
- **The letterhead** (`.membrete`): a wrapping flex row closed by the 3px ink rule plus its double
  rule. The brand (house name + tag line) sits left; the document number `Nº YYYY-MM` and the
  date, in mono micro and right-aligned, sit right.
- **Month navigation** (`.monthnav`): `‹` / `›` icon buttons around the month's name, a "Mes
  actual" page button, and `.monthjump` — a labelled native `month` field in mono. Any month is
  one step or one field away, and it lives in the letterhead because the month *is* the
  document's date.
- **Filters** (`.filters`): the ledger's search and its two selects, as `.field`s that wrap at
  `300px` flex-basis and sit on one line when there is room.
- **Skip link** (`.skip-link`): fixed off-screen at `top: -100px`, 44px tall, stamp fill, and it
  slides into the top-left corner (`top: 14px`) over `140ms ease` on focus.

### The subtotal band
Three `.sub-line` rows, each a label, a `.leader` dot rule and its value; the closing row takes
`.sub-line.total` — a 3px ink top rule with the double rule under it, `10px` more padding, and the
`1.72rem` figure. When the month closes negative, `.neg` turns that one figure stamp red. Below it
sits the note that expenses include debt payments, the outstanding-debt line, and the comparison
against the previous six months — all in `.compare`/`.legend-note` body copy at Ink Dim.

### The ledger
The table is the document's line items: a 2px ink head rule, 1px dashed row rules, a mono line
number column (`.ln`, hidden from assistive tech because the row announces itself), the date in
mono, a structured description (`.who` = tag + category, `.what` = wallet, `.note` = note), and
the amount right-aligned in mono with the ballpoint `.pen` detail underneath for a VES entry.
Row actions are `.linkb`s, at `0.68rem`, that name what they act on through `aria-label`. The
whole table lives in a focusable `.table-scroll` region with `role="region"` and an
`aria-label`; a `<caption>` (sr-only) and `<th scope>` carry the structure. Below it the `.pager`
shows `Página N de M` and the row range in mono with page buttons for 10 rows at a time. The row
just written takes `.flash` once.

### The windows
`Window.tsx` is the single dialog primitive, and every task that needs interruption uses it —
movement create/edit, wallet create/edit, debt payment, import, and both delete confirmations.
A scrim (flat ink wash, `z-index: 40`, a fixed empty veil that only dims) sits behind a Paper
panel that positions itself against the viewport — `position: fixed`, `16px` from the top,
centred, `z-index: 41`, `max-height: calc(100dvh - 32px)` with its own vertical scroll — so
opening a window never drags the document's scroll. The panel carries a titled bar (3px rule +
double rule), a labelled close icon button, a `.wbody`, and a `.wfoot` for the actions, separated
by a 1px rule. It is `role="dialog"` + `aria-modal="true"` + `aria-labelledby` on a real heading;
focus moves in on open, is trapped (Tab/Shift+Tab wrap), and returns to the opener on close;
Escape and a scrim click close it; body scroll is locked while it is open; dismissal is blocked
while a mutation is in flight; and one window is never nested inside another. There is no
`window.confirm` anywhere in the product.

### The stitched estimate (`.strip`)
Inside the movement window, a Copy Paper strip carries "Prueba de tira": the USD equivalent of a
VES entry, and then what the typed movement would do to the month. Every line is derived only
from the values already typed plus the summary/budgets the client already holds, and it is
labelled "Estimado, todavía sin guardar" — never presented as the stored figure. The product's
rule is intact: the API owns every stored number.

### The margin column and the wallets
The 25/15/50/10 plan is a numbered margin column: one `<li>` per jar with its step number in mono,
its name, its share in mono, and a `.wbar` (8px, 1px Rule border on Copy Paper, ink fill, amber at
`warn`, stamp fill at `over`) under the ruled span. The jar the step is on carries
`aria-current="step"` and is enclosed between two 2px ink rules — the way a line is marked in a
document, never a strip down one side — with its step number in full ink. The status line carries
its `tag` and three mono figures (objetivo / gastado / restante), then per-category reassignment
selects in their own fields. Wallets are `.acc`/`.a` blocks closed by 2px ink rules, with the
balance as the largest mono figure, a debt block marked by a stamp and an ink progress bar, and
its actions as `.linkb`s.

### Printed charts
Both charts are authored SVG in the one ink token — no library, no colour ramp: the donut cuts
categories as one family of ink opacities (0.92 → 0.22) with hairline inner and outer edges, and
the bars draw every month on one fixed scale over a single ink baseline, the month in view at 0.9
and the rest at 0.2. Each keeps `role="img"` with a short `aria-label`, and the bars keep an
sr-only table as the navigable equivalent.

### States
Loading is `.empty-state` with `aria-busy="true"` and never a live region; an error is a bordered
notice with a "Reintentar" page button; the app keeps exactly one polite `role="status"` region
(`LiveRegion.tsx`) and announcements replace each other instead of queueing. The visible
success/error notice is deliberately not a live region, so nothing is announced twice.

## Do's and Don'ts

### Do
- **Do** keep one sheet and divide it with rules (`.sect`, `.rule`, 2px/3px closers, dashed row
  separators). Bands are separated by ink, never by a card.
- **Do** measure every figure in Chivo Mono with tabular numerals (`.num`, `.mono`, `.pen`,
  `.cap`, `.ln`) and right-align money.
- **Do** set income as full ink with a leading `+`; the sign carries the meaning.
- **Do** use the highlighter as a background stroke behind ink (`.mark`) and switch to amber
  (`--color-warn`, 4.8:1) the moment attention has to be lettering.
- **Do** keep the stamp-red `.plate` the loudest element of the flow it belongs to.
- **Do** put every interruption, form and destructive confirmation in the one window primitive
  with focus moved in, trapped and restored, Escape working, body scroll locked, and the panel
  positioned against the viewport so opening it never scrolls the document.
- **Do** let every figure show its provenance: date, line number, wallet and note stay in the row
  beside the amount.
- **Do** label a client-side estimate as an estimate ("Estimado, todavía sin guardar") and never
  as the stored figure.
- **Do** verify contrast as a number against the real ground (ink 0.66 → 5.7:1, ink 0.6 → 4.7:1,
  control 0.46 → 3.0:1, stamp on paper 6.1:1, paper on stamp fill 5.7:1), and size the controls for
  touch — fields and the plate 46px, page and icon buttons 42px, and a 44px floor on a coarse
  pointer — with one visible 2px focus ring.
- **Do** keep both faces self-hosted and versioned in the document's own stylesheet: no CDN, no
  external font, no network request at runtime.

### Don't
- **Don't** introduce a fourth hue or a coloured fill that is not the stamp plate. The only other
  full fill in the system is print ink (`.pbtn.primary`), which is not a colour.
- **Don't** round a corner: the sheet has `border-radius: 0` everywhere. The punch holes of
  `.perf` are the only curve.
- **Don't** let a surface cast a shadow other than the sheet's, a window's or the floating action
  plate's; a band's depth is its rule.
- **Don't** use the highlighter yellow as a text colour, and don't colour an income.
- **Don't** recompute a stored business figure in the client; the API owns the numbers.
- **Don't** use `window.confirm`, a `role="alert"` per field, or a second live region.
- **Don't** add an entrance animation per section: the only two motions in the system are the
  ink-dry re-print of the month's figures (240ms) and the single flash of the row just written.
