# Surface brief — the FinanciRDUS document

## Scope and visitor mode

The whole single-page app (`frontend/src/App.tsx` and every component it renders): the one
surface this product has. **Operate.** The visitor completes a task — recording a movement and
reading the state of the month — so scanability, consistency and the real usage scene outrank
expression. Brand lives in the precise details, not in decoration.

## Audience and job

One person, on their phone, at the moment a purchase happens, often outdoors in daylight, and
again on a desk to understand the month. The job: write a movement in seconds, then answer three
questions at a glance — how much is left, where the money went, how this month compares.

## Action, proof and constraints

- Primary action: **Anotar movimiento** — the only saturated plate on the sheet. It opens the
  movement window.
- Proof the surface must show: the month's three figures on one ruled band, what is over its cap,
  and the outstanding debt.
- Hard constraints: the API contract is frozen and owns every business figure; the product has
  no global exchange rate; all copy in Spanish (rioplatense, "vos"); one live region; WCAG 2.2
  AA; zero horizontal overflow at 390px; no external network request of any kind; the sheet must
  stay legible in direct daylight, so ink on paper, never grey-on-grey.

## Chosen direction and memorable moment

**El Mosaico de Días** — inside the established world of *La Factura del Mes*, the month is no
longer one invoice but the pile of little invoices it actually is: every movement is its own
facturita, with its correlative number, its concept, its wallet and its amount, and the days of
the month are ruled blocks laid in a mosaic. What matters is **clavado arriba**: the alfiler
lifts a facturita into the FIJADAS strip that crosses the sheet, out of the mosaic, where it
stays while the rest of the month is paged. Below the perforation the sheet closes with the
month's balance — caps, jars, wallets, the two printed charts.

The memorable moment: pinning a facturita. The alfiler presses, the ticket lifts out of its day
and lands in the strip above, and the day block closes over the gap it left.

## Unresolved decisions

- **No money subtotal per day.** PRODUCT.md is explicit — the backend computes, the frontend
  only formats, and the API contract is frozen — so a day block is headed by its day and by the
  count of facturas in it, never by a sum. A day total needs an API field first.
- **The pin lives in the browser.** There is no place for it in the frozen contract, so the
  alfiler state is per month in `localStorage` and never travels with the export. Clearing site
  data unpins everything.
- **The mobile letterhead is what keeps the board off the first screen.** It stacks to ≈427px —
  brand, `Nº`, the month navigation with its field, the wallet filter, the last-rate plaque and
  Exportar/Importar — and it grew from 405px: 6px for the centred month row the user asked for,
  and 16px more because the phone's 18px board inset narrows the sheet and the header rows wrap
  sooner. Compacting it is still the next thing to design: the month navigation on one row, the
  actions as icon buttons, the rate plaque out of the header.
- **The board is drawn at two scales.** On a phone the visible band is only ~18px wide, and there
  the desktop grain (alpha 0.075 on a 3px period) measured as a flat colour band, not as wood: the
  ≤679px board carries coarser, higher-contrast grain, ~9px knots and a 54px plank joint instead.
  Both are the same board drawn for the room it has — that is what makes the material survive at
  both sizes — but they are two rule sets to keep in step.
- **The sheet's silhouette against the wood measures under 3:1** (its warm hairline is ≈1.4–1.9:1
  against the board). The separation is carried by the paper's own contact shadow instead. A 3:1
  rim would mean a dark frame around the sheet — a larger fidelity loss than the numeric gain.
- The facturita is a list item, not a nested card: at 390px the mosaic collapses to one column
  and the ticket keeps its day header, number, concept and amount on the same measure.

## Direction contract

THESIS: The month is a board of facturitas — one little invoice per record, grouped by day,
refused the ledger row, where a figure hides behind a table column, and refused the dashboard:
what matters is pinned to the top with the alfiler and everything else waits in its own day.

OWN-WORLD: Cool white sheet on a light honey wooden board — the board authored in CSS (grain,
plank joints, knots), never a photograph, because this environment generates no imagery. Print
ink near-black, Libre Franklin for the document and Chivo Mono for every column of figures. One
stamp red for loss, excess and the single action plate; ballpoint blue for the bolívar amount;
highlighter yellow only as a stroke behind ink; the alfiler is an ink mark and a pressed state,
never a fourth colour. Square corners belong to the paper — the sheet, the facturita, the band,
the lists — while two things break that squareness on purpose, both pinned by the user: the
month's arrows are 46px paper circles, and every facturita is a torn paper carrying one short
drop-shadow. Double rules close the letterhead and the month's band; hairlines, dashed row
separators and 2px closers carry the rest.

STORY: The visitor opens the month and recognises it as the pile of little invoices it is, each
carrying its number, its day, its wallet and its mark; the ones that matter are pinned above and
still there after paging, and the day they belong to stays visibly theirs.

FIRST VIEWPORT: The letterhead opens the screen, closed by the double rule. Immediately under it
the month's three figures on ONE ruled band — Ingresos, Gastos, and Te queda carrying the heavy
closing rule — then the FIJADAS strip crossing the sheet, then the mosaic of day blocks entering
from the bottom edge: three columns on a wide sheet, two from 720px, one on a phone. Each block
is ruled, headed by its day and its count, and closes with its facturitas, each a torn paper
resting on the sheet. On the desktop the sheet leaves at least 60px of wooden board on each side;
the month jump is a field in the letterhead and the arrows are paper chips flanking a centred
month. On a 390px phone the same order holds at one column, on the same paper over the same board
with 18px of it around the sheet — the board redrawn at a smaller scale there, because an 18px
band cannot show desktop-scale grain. The ≈427px letterhead, the band and the three notes under
it fill the first screen, so the FIJADAS strip, the filter bar and the mosaic all fall below the
fold: the first screen carries no facturita, and that is the one promise of this block the build
does not keep on a phone.

FORM: El Mosaico de Días — seventh of seven grounded structures, the roll's deal on the surface
round (indices 7, 2, 4; the saldo rail and the two-page balance were the other two hands); seed
key `60ac4520`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.
