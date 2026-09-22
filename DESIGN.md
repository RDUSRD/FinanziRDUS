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
  desk: "#cba877"
  desk-hi: "#dcbe92"
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
    fontSize: "clamp(1.06rem, 4.6vw, 1.72rem)"
    fontWeight: 700
    letterSpacing: "-0.03em"
    fontFeature: "'tnum' 1"
  subtotal:
    fontFamily: "Chivo Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "clamp(0.94rem, 3.4vw, 1.22rem)"
    fontWeight: 700
    letterSpacing: "-0.03em"
    fontFeature: "'tnum' 1"
  ticket-amount:
    fontFamily: "Chivo Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.02rem"
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
  arrow: "50%"
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
  month-arrow:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.arrow}"
    padding: "0"
    size: "46px"
  text-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "4px 2px"
    height: "34px"
  pin-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
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
    typography: "{typography.ticket-amount}"
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
  facturita:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px 16px"
  facturita-pinned:
    backgroundColor: "{colors.paper-2}"
  pinned-strip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0"
  day-block:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0"
  mosaic:
    backgroundColor: "transparent"
    rounded: "{rounded.control}"
    padding: "0"
---

# Design System: FinanciRDUS

## Overview

**Creative North Star: "La Factura del Mes"** — the month is a white invoice, bound like a
savings passbook, that the visitor keeps re-writing. The whole screen is one sheet of cool white
paper lying on a light honey wooden board — drawn, never photographed: its knots, plank joint and
grain are authored in CSS on the root element, with no raster and no external request. The
letterhead at the top, the month's three figures on one ruled band, and — under the small
perforation — the month's balance. Between the band and the cut sits the month itself as a **board
of facturitas**: one little invoice per record, grouped into ruled day blocks laid as a mosaic,
with the ones that matter pinned into a strip above. Nothing in it is a card: bands are separated
by rules, and the rules are the structure.

The sheet is written with the marks a person physically makes on a document. A rubber stamp
carries anything negative, anything over its cap, and the one action plate; a ballpoint carries
the original bolívar amount of a movement; a highlighter marks a cap that is running out — always
as a stroke behind the ink, never as a colour of its own. Attention that has to be legible as
text uses a darker amber instead. Income is not a colour at all: it is print ink at full strength
with a leading `+`, the way a signed page reads. Pinning is not a colour either: the alfiler is
an ink mark and a pressed state.

Every figure carries its provenance on the ticket beside it — the correlative `Nº`, the date, the
wallet and the note that produced it — so the visitor sees the month already closed into a total
and still knows where each part of it came from. The memorable moment is pinning: the alfiler
presses, the ticket lifts out of its day into the strip above, and the day block closes over the
gap it left. The two things this world refuses are named in its own material: the dashboard of
soft-shadowed KPI cards (there is one sheet, and nothing on it is elevated) and the bureaucratic
form (the movement form is a window over the sheet that first shows a "prueba de tira" — an
estimate of where the movement will land, labelled as an estimate, before anything is saved).

**Key Characteristics:**
- One sheet on a light honey wooden board, ruled into bands; zero cards, and square corners belong
  to the paper (only the month's arrows and the perforation break it).
- Cool white paper, near-black print ink; the only saturated fill is the stamp-red action plate.
- Three marks only: stamp red, ballpoint blue, highlighter yellow — plus amber for attention text.
- Libre Franklin for the document, Chivo Mono for every measured column, tabular figures everywhere.
- Depth is material: one warm shadow for the sheet on the board, one for a window over the sheet,
  one for the action plate once it leaves the flow on a phone, and one drop-shadow that reads each
  torn facturita.
- The board is drawn, never photographed — grain, plank joints and knots in CSS on the root
  element; no raster, no external request.
- Both faces self-hosted and served from this origin; no external font, CDN or network request.
- Two authored motions: the ink-dry re-print of the month's figures, and one flash on the
  facturita just written.

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
- **Paper** (`#fafaf8`): the sheet and every facturita's ground.
- **Copy Paper** (`#f2f3f0`): the second sheet — notice strips, chart boxes, the last-rate
  plaque, empty states, the cap field under focus, a disabled field, and a facturita once the
  alfiler has pinned it.
- **Honey Board** (`#cba877`, `--color-desk`): the light honey wooden board the sheet lies on —
  the board's mid tone, over which its plank grain, joints and knots are drawn, at two scales:
  the wide desktop set and the coarser set the phone's ~`18px` band needs (The Authored-Board
  Rule).
- **Board Grain** (`#dcbe92`, `--color-desk-hi`): the board's light grain tone, the high side of
  the wood at either scale.
- **Print Ink** (`#11161b`): all text, every drawn rule, the donut and the bars, the caret.
- **Ink Deep** (`#05080a`, `--color-ink-deep`): the same ink under the hand. It appears in exactly
  one place — the hover ground and border of the ink plate (`.pbtn.primary`).
- **Ink Dim** (`rgba(17, 22, 27, 0.66)`, 5.7:1 on paper): secondary text — notes, legends, hints,
  field labels, a facturita's wallet line, its note and its date.
- **Ink Dim 2** (`rgba(17, 22, 27, 0.6)`, 4.7:1 on paper): tertiary text — placeholders, a
  facturita's correlative `Nº`, the day count, the page folio.
- **Rule** / **Rule Strong** (`0.16` / `0.34`): the hairline divider and the dashed tear line
  under a facturita's actions.
- **Control Line** (`rgba(17, 22, 27, 0.46)`, 3.0:1 on paper): the border of every input, select,
  page button, icon button and segmented control — and the 1px filo of a facturita.
- **Window Edge** (`#d3d7d2`, `--color-edge`): the 1px cut edge of a window. It is no longer the
  sheet's: over wood the cool edge clashed with the board, so the sheet's own 1px edge is a warm
  hairline (`rgba(74, 48, 20, 0.42)`) and the paper's silhouette is carried by its warm contact
  shadow instead.

### Named Rules
**The Three-Marks Rule.** Only three marks carry colour: the rubber stamp (red), the ballpoint
(blue) and the highlighter (yellow). Amber is the same "attention" ink made readable as text. A
fourth hue does not exist — a new state finds its mark, or it stays ink, and the alfiler is an ink
mark and a pressed state, never a fourth colour.

**The Ink-Only-Income Rule.** Income is never a colour: `.fact-amt.income` is print ink at full
strength with a leading `+`, exactly like `.fact-amt.expense`. The sign carries the meaning.

**The Highlighter-Behind-Ink Rule.** The highlighter is a background stroke, never a text colour.
When attention must be legible as lettering it is amber (`.row.warn`, `.wbar.warn`) or it is ink.

**The Never-Grey Rule.** Secondary and tertiary text are ink at reduced alpha over paper (0.66 →
5.7:1, 0.6 → 4.7:1). No grey and no tinted neutral is ever used to lower the voice, because the
sheet has to stay legible in daylight.

**The Authored-Board Rule.** The board is drawn, never photographed: a flat `--color-desk` ground
carrying, top to bottom, its knots, a plank joint, three de-synchronised grain periods and one
wide tonal band set — all CSS gradients on the root element, with no raster and no external
request. It is authored at **two scales**, because the band it has to read in is not the same size
on both screens. From `680px` up the side band is at least `60px`, and the wide set draws knots at
x `1.5%`/`98.5%`, an `180px` plank joint, grain periods of `3px`/`7px`/`13px` and one horizontal
tonal band set. At `679px` and below the band is only ~`18px` wide, and there the wide set's
hairline grain (alpha `0.06` on a `3px` period) measured as a flat colour band, not as wood: the
narrow set draws knots of ~`9px` (a dark ellipse at alpha `0.34` plus a light ring at `0.42`) at
x `2%`/`97.5%`, a plank joint every `54px` so that both the left and the right band contain a
plank edge, grain periods of `3px`/`5px`/`4px` at alphas `0.16`/`0.11`/`0.09`, and a `180°` tonal
ramp that runs down the band instead of across it. Both sets are the same board drawn for the room
it has, and that is the cost: two rule sets must be kept in step. It sits on the root element and
not on a `.desk` wrapper, because the sheet's collapsed margins used to shrink that wrapper's box
and leave flat, ungrained bands at the top and bottom of the document. And it only exists where it
is visible: the knots sit at each scale's own x on purpose, so they land in the board's side band
and are never hidden under the sheet.

## Typography

**Display Font:** Libre Franklin (variable, weight 100–900, self-hosted as
`/fonts/libre-franklin-latin-var.woff2`)
**Body Font:** Libre Franklin (the same face carries the section heads at 900 and the labels at 700)
**Label/Mono Font:** Chivo Mono 400/700 (self-hosted; `ui-monospace`, `SFMono-Regular`, `Menlo` fallbacks)

**Character:** Two faces, two jobs. Libre Franklin is the printer's sans the invoice is set in —
the house name, the section heads, the labels and the reading copy. Chivo Mono is the measuring
face: mono is not a costume here, the whole world measures, so every amount, rate, date, count and
correlative number is set in it and every column of figures aligns to the cent. Both faces are
declared in `index.css` and served from this origin (`font-src 'self'`); the system loads no font
from anywhere else.

### Hierarchy
- **Display** (900, `1.32rem`, `1`, `-0.02em`, uppercase): the house name in the letterhead
  (`.brand .house`).
- **Figure** (Chivo Mono, 700, `clamp(1.06rem, 4.6vw, 1.72rem)`, `-0.03em`, tabular): the closing
  total — "Te queda" (`.sub-line.total .val`), the largest number on the sheet.
- **Subtotal** (Chivo Mono, 700, `clamp(0.94rem, 3.4vw, 1.22rem)`, `-0.03em`, tabular): the income
  and expense figures beside it on the month's band.
- **Ticket amount** (Chivo Mono, 700, `1.02rem`, `-0.02em`, tabular): a facturita's amount on its
  header line (`.fact-amt`), pushed to the right edge and the largest figure on the ticket.
- **Heading** (900, `0.74rem`, `0.16em`, uppercase): the section head (`.sect h2`) — small,
  letter-spaced, and the only thing on its line besides its rule.
- **Body** (400, `16px`, `1.45`, measure capped at 66–74ch by `.wsub`/`.legend-note`/`.compare`,
  `.pin-empty` at 68ch and `.chartlead` at 70ch): reading copy, notes and hints.
- **Label** (700, `0.66rem`, `0.14em`, uppercase): field labels, plate lettering, `.tag`.
- **Mono micro** (Chivo Mono, 700, `0.68`–`0.76rem`, `0.04`–`0.12em`, uppercase): the document
  number (`Nº YYYY-MM`), a facturita's correlative `Nº` and its date, the day count, the page folio
  — which carries the balance forward, "Pasa a la hoja siguiente · <monto>" — and the pager state.

### Named Rules
**The Tabular Rule.** `font-variant-numeric: tabular-nums` is declared on `body` and inherited by
everything, and restated on `.mono`/`.num`. No column of figures may shift width.

**The Measured-Mono Rule.** Chivo Mono is for money, rates, dates, counts, correlative numbers and
codes — things that are measured, matched or listed in a column. It is never used to make
something look technical.

**The One-Line Section Rule.** A section opens with a `.sect`: one `0.74rem`/900/`0.16em`
uppercase heading and its 1px ink rule sharing a baseline, with the optional `sect-note` in Ink
Dim at the far end of the row. The heading carries its own weight; the rule supplies the division.

## Layout

One sheet, centred on the light honey board (`min-height: 100vh`). On a phone it is `width:
min(1400px, 100% − 36px)` with `margin: 18px auto` — **18px of board all around it**, the same
paper over the same board as on the desktop, with the controls and the pieces keeping their sizes
— and `26px 18px 34px` of internal margin. From `680px` up it lifts off the board (`width:
min(1400px, 100% − 120px)`, `margin: 30px auto`, `34px 40px 46px` padding), which guarantees **at
least `60px` of board on each side**. `12px` of board was tried first on the desktop and read as a
border that showed no knots, so that inset was widened to `60px`; the phone's ~`18px` band is the
same board drawn at a smaller scale (The Authored-Board Rule). Its bands, in document order:
letterhead (`.membrete`), the month's three figures on ONE ruled band
(`.subtotals`), the FIJADAS strip (`.pinned`), the board (the `.filters` bar, the `.mosaic` of day
blocks, the `.pager`), the perforation (`.perf`), then — below the cut — the balance of the month:
the caps list (`.list`), the donut + bars spread (`.cols`), the jars margin column (`.margin-col`)
and the wallets (`.cats`), and finally the closing `.perf` and the page folio (`.page-no`).

The month's band is a 3-column grid (`repeat(3, minmax(0, 1fr))`) closed by a `3px` ink rule with
its double rule BELOW it. Each `.sub-line` is a stacked cell — its label above its figure, `9px`
of padding, a 1px hairline divider between cells — with no left padding on the first cell and no
right padding on the last, and no top rule of its own: the total is the third cell, never a
separate row. Its figures are `clamp(0.94rem, 3.4vw, 1.22rem)`; the closing "Te queda" figure is
`clamp(1.06rem, 4.6vw, 1.72rem)`.

The board's day blocks sit in the `.mosaic`: `18px 26px` gaps, three columns from `1100px`, two
from `720px` and one below — the desktop sheet carries ~`395px` day blocks. Inside a day,
`.tickets` list the facturitas at a `10px` gap.

Vertical rhythm: `30px` above a section head (`.sect`, `margin: 30px 0 10px`), `18px` around a
bare `.rule` that closes the sheet's larger bands, `9px` of row padding inside the caps list and
the margin column, `14px` grid gap inside a window form. Tight groups, generous separation, and
more space above a heading than below it.

Responsive: below `680px` the sheet keeps an `18px` cravat of board on every side, and from
`680px` it gains its wide inset — at least `60px` of wood per side; at
`>=720px` the `.mosaic`, `.cols`, `.two` and `.jar-meta` become two columns, and from `1100px` the
`.mosaic` goes to three. Below `719px` the letterhead's action plate leaves the
flow (`position: fixed`, `16px` from the right and bottom edges, `z-index: 30`) with the body
reserving `104px` of foot so it never covers the pagination, and the pagination's buttons stack
into a column. On a coarse pointer every control below the comfortable minimum is raised to `44px`
— `.linkb`, `.fact-acts .linkb`, `.pinb`, `.iconb` (width included), `.pbtn`, the cap field and
the month field; those declarations sit at the end of the stylesheet on purpose, because at equal
specificity they only win by order. Zero horizontal overflow at `390px` is a product requirement,
not a hope.

One thing this stylesheet cannot fix from here: the letterhead (`.membrete`, `AppHeader.tsx`,
untouched by this build) stacks to ≈`427px` — brand, `Nº`, the month navigation with its field,
the wallet filter, the last-rate plaque and Exportar/Importar — so on a `390px` phone it, the band
and the three notes under it fill the first screen, and the FIJADAS strip, the filter bar and the
mosaic all fall below the fold. It grew from `405px`: `6px` for the centred month row and `16px`
more because the phone's `18px` board inset narrows the sheet and the header rows wrap sooner. The
first screen carries no facturita. Compacting the letterhead —
the month navigation on one row, the actions as icon buttons, the rate plaque out of the header —
is the next thing to design.

### Named Rules
**The Counted-Day Rule.** A day block is headed by its day and the COUNT of its facturas, never by
a money subtotal. PRODUCT.md makes the backend own every business figure and freezes the API, so
the frontend may not sum: a day total waits for an API field.

## Elevation & Depth

**Flat by default.** Two shadows describe an object rather than a raised surface: the sheet lying
on the board
(`box-shadow: 0 1px 0 rgba(58, 36, 10, 0.14), 0 16px 34px -18px rgba(58, 36, 10, 0.56)`) and a
window thrown over the sheet (`0 24px 60px -22px rgba(17, 22, 27, 0.5)`). Both carry an offset
and a soft negative-spread blur; neither is a coloured halo or a glow. The sheet's own shadow is
warm — it is cast on wood, not on grey — and it is what holds the paper's silhouette against the
board, because the sheet's warm hairline edge measures under the `3:1` a rim would need. The scrim
is a flat ink wash (`rgba(17, 22, 27, 0.42)`) with no backdrop blur.

The one state that lifts is the action plate: on a phone, once it leaves the flow and floats over
the sheet, it gains `0 12px 28px -12px rgba(17, 22, 27, 0.55)` so it is not read as printed on the
paper. In the flow it declares no drop shadow — only its inset edge.

Two grounded marks also cast, both pinned by the user. Each facturita's list item carries **one**
`filter: drop-shadow(0 4px 3px rgba(58, 36, 10, 0.42))` — a `filter` and not a `box-shadow`,
because the mask that tears the bottom edge clips a `box-shadow` (which paints outside the box)
while `drop-shadow` follows the torn silhouette. That shadow is also the only thing that makes the
tear legible: a facturita rests on the sheet, not on the board, so under the torn edge there is
paper, never wood, and the cut reads by the shadow it throws. And the month's two arrow chips carry
a short paper shadow (`0 3px 5px -2px rgba(58, 36, 10, 0.38)`), dropping to `0 1px 2px -1px` while
pressed.

Every other `box-shadow` in the sheet draws a rule rather than a depth: the double rule
(`0 5px 0 -4px var(--color-ink)` under a 3px ink border, on `.membrete`, `.subtotals` and
`.wtitle`) and the plate's printed edge (`inset 0 -2px 0 rgba(0, 0, 0, 0.18)`, which flips to
`inset 0 1px 0 rgba(0, 0, 0, 0.22)` while the stamp is pressed). Structure comes from rules:
1px hairlines at 16% ink, dashed 1px lines at 16% (list rows, `.fact-acts`) or at 34% (the
perforation), 2px rules closing a day head, a list or a
margin column, and 3px rules closing the letterhead, the month's band and a window title. A
facturita is a printed rectangle — a 1px Control Line border on a flat ground — square above and
torn below; it never lifts, and its one shadow reads the tear, not a raised card.

### Named Rules
**The Flat-Sheet Rule.** A surface never lifts. It is either printed on the sheet (fields, bars,
tags, stamps, facturitas) or it is a window over it. A card with a soft shadow does not belong to
this world. A facturita's drop-shadow does not lift it: it follows the torn silhouette and reads
the cut, not height.

**The One-Shadow Rule.** A surface declares its depth once, as contact with what is under it: the
sheet has one warm shadow on the board, the window has one over the sheet, the torn facturita has
one on the paper beneath it, and the month's arrow chips have their one short paper shadow.
Nothing else in the sheet casts anything — except the action plate, and only once it has left the
flow to float over the sheet on a phone.

## Shapes

Square and ruled — square corners belong to the paper. Every surface declares `border-radius: 0`;
no pills, no rounded cards. The one other radius in the system is the `7px` punch hole
(`border-radius: 50%`) at each end of `.perf`, and the donut is drawn SVG geometry. A facturita is
a little printed rectangle — square and printed above, torn along the bottom by an authored mask,
a 1px Control Line border on a flat ground — and it is a list item, never a nested card. Two breaks
of the old squareness are pinned by the user, not drift — see The Two Pinned Breaks.

Boundaries are one of four rules: a 1px solid hairline at 16% ink (`.rule`, row separators), a
1px dashed rule at 16% (list rows, the cap field's baseline, and `.fact-acts` — the same dashed
separator the document's lists use) or at 34% (the perforation), a 2px rule at full ink (`.list`,
`.margin-col`, `.acc`, `.day-head`, the top of every `.notice`/`.strip`, and both edges of the active
`.margin-col .j[aria-current="step"]`) or at 34% (the nested wallet, `.acc .a`), and a 3px ink
rule with the double rule under it (`.membrete`, `.subtotals`, `.wtitle`). Fills are flat
rectangles with square corners; the segmented control is a 1px-bordered rectangle divided by 1px
separators. The literal cut of a facturita is the paper's bottom edge, not the `.fact-acts`
divider above its actions.

### Named Rules
**The Two Pinned Breaks.** Two deliberate breaks of the old squareness are the user's, not drift.
The month's `‹`/`›` arrows are `46px` paper **circles** (`border-radius: 50%`, `.mnav-btn`), and
every facturita carries **one** `filter: drop-shadow` following its torn edge. "Square corners
everywhere" is now "square corners belong to the paper": the sheet, the facturita, the month's band
and the lists stay square, and the `7px` perforation punch holes are no longer the only curve.

**The Pinned-Sheet Break.** A third user-directed break, added on request: the sheet reads as a
paper **pinned to the board** — a visible thumbtack (the drawn `PinIcon`, an ink mark, never a
fourth colour) sits over its top edge, and on desktop (`>= 720px`) the whole sheet carries a very
slight tilt with its warm contact shadow re-tuned so it reads as lying pinned, not floating. The
tilt is **desktop-only on purpose**: below `720px` the action plate is `position: fixed`, and a
`transform` on `.sheet` would make that `fixed` resolve against the sheet and break the floating
button. The board stays drawn (never photographed) and the sheet stays the only container.

## Components

### Buttons
Square, uppercase, letter-spaced — except the month's arrows, which are paper circles. The primary
plate and the month's arrows are 46px tall, the page, icon and ink buttons 42px, and the inline
text action 34px (`0.68rem` inside a facturita).
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
- **Month arrow** (`.mnav-btn`): a `46×46` paper **circle** (`border-radius: 50%`, 1px Control
  Line border) holding one chevron, with the short paper shadow `0 3px 5px -2px rgba(58, 36, 10,
  0.38)`; hover is the Copy Paper wash with an ink border, and pressing drops it `1px` with a
  shallower shadow (`0 1px 2px -1px`). It is one of the two pinned breaks (The Two Pinned Breaks).
- **Text button** (`.linkb`): ink lettering underlined in Rule Strong, `text-underline-offset: 3px`,
  34px minimum height; the underline darkens to ink on hover. `.destructive` turns both to stamp
  red. Inside a facturita (`.fact-acts .linkb`) it drops to `0.68rem`.
- **Alfiler** (`.pinb`): the pin. A borderless ink text button at `0.68rem`/uppercase carrying the
  drawn thumbtack (`PinIcon`, `0 0 20 20`, `currentColor`) before its word ("fijar" / "soltar"),
  34px at rest. It is an ink mark and a pressed state, never a fourth colour: hover underlines it,
  and once its facturita is pinned the label stays underlined while the ticket's ground swaps to
  Copy Paper. On a coarse pointer it joins the 44px floor.

### Fields
- **Shape:** square (radius 0), 1px Control Line border, `10px 12px`, 46px minimum height, paper
  ground, `0.92rem` Libre Franklin.
- **Label:** uppercase `0.66rem`/`0.14em` in Ink Dim, sitting directly above the field.
- **Focus / Error / Disabled:** `:focus-visible` turns the border stamp red and inherits the
  global `2px` red outline with `2px` offset; `[aria-invalid="true"]` thickens the border to 2px
  stamp red and its message (`0.74rem`, stamp red, 600) is wired through `aria-describedby`;
  disabled is a Copy Paper ground with Ink Dim 2 lettering.
- **Search:** the board's search is a native `input[type="search"]` on the same casillero (46px,
  1px Control Line, paper ground), so the browser's own clear affordance is kept rather than
  redrawn.
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
  lettering in Ink Dim. It labels a facturita's kind ("Gasto", "Ingreso", "Pago de deuda") and
  never carries colour.
- **Rubber stamp** (`.stamp`): a 2px stamp-red border at `3px 8px`, `0.64rem`/900/`0.16em`
  lettering on a 5% stamp wash, rotated `-2.4°`. It is the mark on a debt (`A pagar`).
  `.stamp.void` is the same stamp dulled to Ink Dim with an ink wash.

### Sheet, bands and containers
- **The sheet** (`.sheet`): Paper ground, flat — a plain colour, no texture and no pattern —
  square corners and one warm ground shadow; its edge is a warm 1px hairline (`rgba(74, 48, 20,
  0.42)`), not the cool Window Edge, because over wood the cool edge clashed. Below `680px` it is
  `min(1400px, 100% − 36px)` with `margin: 18px auto` — an `18px` cravat of board all around it,
  the same paper over the same board as on the desktop — and from `680px` `min(1400px, 100% −
  120px)` with `margin: 30px auto` (at least `60px` of board per side). It is the only container;
  bands inside it are divided by rules, not wrapped in cards.
- **Section head** (`.sect`): a `.74rem`/900/`0.16em` uppercase heading and its `sect-note` on one
  baseline row, closed by a 1px ink rule.
- **Chart box** (`.chartbox`): a 1px Rule border on Copy Paper with `14px` padding — the frame
  around an engraved donut or a set of printed bars.
- **Window** (see below): Paper ground, 1px Window Edge border, 620px max-width.
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
- **Month navigation** (`.monthnav`): a **column of two rows**. `.monthnav-main` is a centred row
  — the `‹`/`›` `.mnav-btn` paper circles flanking `.m`, which carries `min-width: 16ch` so the
  arrows never shift as the month name changes length. `.monthnav-tools` holds "Mes actual" as a
  `.pbtn` raised to `46px` plus `.monthjump`, a labelled native `month` field in mono. Any month is
  one step or one field away, and it lives in the letterhead because the month *is* the document's
  date.
- **Filters** (`.filters`): the board's search and its two selects, as `.field`s that wrap at
  `300px` flex-basis and sit on one line when there is room. The search is a `type="search"` field.
- **Skip link** (`.skip-link`): fixed off-screen at `top: -100px`, 44px tall, stamp fill, and it
  slides into the top-left corner (`top: 14px`) over `140ms ease` on focus.

### The month's band
Three `.sub-line` cells on one ruled band: each a label stacked over its value, a 1px hairline
divider between cells, and no rule of its own. The closing cell is `.sub-line.total` — full-ink
label and the `clamp(1.06rem, 4.6vw, 1.72rem)` figure — and the whole band closes on the 3px ink
rule with its double rule below. When the month closes negative, `.neg` turns that one figure
stamp red. Below the band sit the note that expenses include debt payments, the outstanding-debt
line, and the comparison against the previous six months — all in `.compare`/`.legend-note` body
copy at Ink Dim.

### The board — a mosaic of day blocks
The month's records are laid out as facturitas inside a `<ul class="mosaic" aria-label="Días del
mes">`: one `<li class="day">` per day, three columns from `1100px`, two from `720px` and one
below. Each day block is
a ruled block, not a card: a `.day-head` carrying the day and its count, closed by a 2px ink rule,
then its `.tickets` list. The day is spelled out in Spanish (`.day-name`, `0.78rem`/900/`0.12em`
uppercase, from `lib/month.ts#dayLabel` — "viernes 4"); the count is `.day-count` (mono micro,
uppercase, Ink Dim 2, "n factura" / "n facturas"). Below the mosaic the `.pager` shows `Página N
de M` and the tanda range in mono, with page buttons for six day blocks at a time.

### The facturita
The month's atom: one little **torn piece of paper** per record, resting on the sheet. Square and
printed above, torn along the bottom: `.fact` has a `16px` `padding-bottom` and carries an authored
SVG mask (`--tear`, a 320×12 path whose x jumps run `3–34px` and whose depth runs `2.4–7.9` —
deliberately irregular so it never reads as a sawtooth), repeated horizontally at `mask-size:
320px 12px` and unioned with a `linear-gradient` that keeps everything above the last `12px`
opaque. Each ticket's `<li>` carries **one** `filter: drop-shadow(0 4px 3px rgba(58, 36, 10,
0.42))`; the shadow must be a filter because the mask clips a `box-shadow`, and the tear is legible
by that shadow alone, because the tickets rest on the sheet — there is paper under the torn edge,
never wood. It is a printed ticket, not a card (its 1px `--color-control` border is the token's
documented role: ≈3.0:1 on paper). Its header line (`.fact-top`, closed by a 1px hairline) carries
the correlative `Nº` (`.fact-no`, mono micro, `aria-hidden` because the record speaks for itself),
the date (`.fact-date`, mono) and the amount (`.fact-amt`, pushed right by `margin-left: auto` — the
largest figure on the ticket, ink with its `+`/`-`). The body stacks `.fact-who` (the kind `.tag` +
the category), `.fact-what` (the wallet), `.fact-note`, and — for a bolívar entry — the ballpoint
`.pen` detail (the original Bs amount and its rate) in Ballpoint Blue. Below the 1px dashed
`--color-rule` divider — the same dashed separator the document's lists use — sit the `.fact-acts`:
the alfiler and the `.linkb` actions ("editar" / "borrar"), each naming what it acts on through
`aria-label`. The facturita just written takes one `.flash` — an inset 2px stamp ring that inks in
once and fades.

### The pinned strip (Fijadas)
`.pinned` crosses the sheet above the board, headed by its own `.sect` ("Fijadas (n)") and the note
that the alfiler does not let go when the page turns. What it holds sits in `.pin-row` — a grid of
`repeat(auto-fill, minmax(250px, 1fr))` — and each pinned facturita is the same ticket with
`.fact.pinned`, its ground swapped to Copy Paper (the copy of the invoice) while its 1px border
stays. With nothing pinned, one dim line (`.pin-empty`) explains how to pin. The pin lives in this
browser (`lib/pins.ts`, `localStorage`, per month): there is no field for it in the frozen API.

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
- **Do** keep one sheet and divide it with rules (`.sect`, `.rule`, 2px/3px closers, dashed tear
  lines). Bands are separated by ink, never by a card.
- **Do** draw the board, never photograph it — grain, plank joints and knots as CSS gradients on
  the root element, no raster and no external request — keeping an `18px` cravat of board around
  the sheet below `680px` and at least `60px` of board on each side from `680px`; the phone's band
  is the same board at a smaller scale, and the two sets must be kept in step (The Authored-Board
  Rule).
- **Do** measure every figure in Chivo Mono with tabular numerals (`.num`, `.mono`, `.pen`, `.cap`,
  `.fact-amt`) and push money to the right edge of its line.
- **Do** set income as full ink with a leading `+`; the sign carries the meaning.
- **Do** use the highlighter as a background stroke behind ink (`.mark`) and switch to amber
  (`--color-warn`, 4.8:1) the moment attention has to be lettering.
- **Do** head a day block by its day and the COUNT of its facturas, never by a money subtotal (The
  Counted-Day Rule).
- **Do** keep the stamp-red `.plate` the loudest element of the flow it belongs to.
- **Do** keep the alfiler an ink mark and a pressed state, and swap only a pinned facturita's ground
  to Copy Paper.
- **Do** cut a facturita's bottom edge with the authored `--tear` mask and give each ticket **one**
  `filter: drop-shadow` — a filter, not a `box-shadow`, because the mask clips it — since the tear
  is legible by that shadow alone, the paper resting on the sheet and not on the board (The Two
  Pinned Breaks).
- **Do** put every interruption, form and destructive confirmation in the one window primitive
  with focus moved in, trapped and restored, Escape working, body scroll locked, and the panel
  positioned against the viewport so opening it never scrolls the document.
- **Do** let every figure show its provenance: the correlative `Nº`, the date, the wallet and the
  note stay on the ticket beside the amount.
- **Do** label a client-side estimate as an estimate ("Estimado, todavía sin guardar") and never
  as the stored figure.
- **Do** verify contrast as a number against the real ground (ink 0.66 → 5.7:1, ink 0.6 → 4.7:1,
  control 0.46 → 3.0:1, stamp on paper 6.1:1, paper on stamp fill 5.7:1), and size the controls for
  touch — fields and the plate 46px, page and icon buttons 42px, the alfiler and the ticket actions
  34px, and a 44px floor on a coarse pointer — with one visible 2px focus ring.
- **Do** keep both faces self-hosted and versioned in the document's own stylesheet: no CDN, no
  external font, no network request at runtime.

### Don't
- **Don't** introduce a fourth hue or a coloured fill that is not the stamp plate. The only other
  full fill in the system is print ink (`.pbtn.primary`), which is not a colour — and the alfiler
  is not a colour at all.
- **Don't** round a corner beyond the two pinned breaks: the sheet, the facturita, the month's band
  and the lists stay `border-radius: 0`, and the only curves are the `.perf` punch holes and the
  month's `46px` arrow circles.
- **Don't** wrap a facturita in a card: it is a printed rectangle with a 1px Control Line border on
  a flat paper ground, torn along its bottom edge. Its one `filter: drop-shadow` reads the tear, not
  a lift — never a `box-shadow`, which the mask would clip.
- **Don't** let a surface cast a shadow other than the sheet's warm ground shadow, a window's, the
  floating action plate's, a torn facturita's one drop-shadow or the month arrow chips'; a band's
  depth is its rule.
- **Don't** use the highlighter yellow as a text colour, and don't colour an income.
- **Don't** recompute a stored business figure in the client, and never sum a day: the API owns the
  numbers.
- **Don't** lay the month out as rows behind table columns: a record is a facturita, a little
  printed rectangle, never a line in a table that a figure can hide behind.
- **Don't** use `window.confirm`, a `role="alert"` per field, or a second live region.
- **Don't** add an entrance animation per section: the only two motions in the system are the
  ink-dry re-print of the month's figures (240ms) and the single flash of the facturita just
  written.
