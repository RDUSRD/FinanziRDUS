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
- Proof the surface must show: the month's three figures at display scale on a ruled subtotal
  band, what is over its cap, and the outstanding debt.
- Hard constraints: the API contract is frozen and owns every business figure; the product has
  no global exchange rate; all copy in Spanish (rioplatense, "vos"); one live region; WCAG 2.2
  AA; zero horizontal overflow at 390px; no external network request of any kind; the sheet must
  stay legible in direct daylight, so ink on paper, never grey-on-grey.

## Chosen direction and memorable moment

**La Factura del Mes** — the month is a white invoice, bound like a savings passbook. One sheet
carries the letterhead, the subtotal band, the numbered line items of the month, the margin
column of jars and the closing TOTAL; the next month is the next page, opening on the balance the
previous one closed with. White paper, print ink, and the three marks a person physically makes
on a document: the rubber stamp, the ballpoint, the highlighter.

The memorable moment: when a movement is saved the subtotal figures **re-print in place** — a
240ms ink-dry wipe — and the new line item takes its number and flashes once as the ink sets.

## Unresolved decisions

- The ledger keeps an intentional horizontal scroll region on phones (`.table-scroll`, a
  focusable region whose label says so): a five-column document line with a description, an
  amount and three actions needs ~565px and a 390px phone offers 352px. Nothing is lost — the
  page itself never scrolls sideways — but a phone-native line item that stacks its actions
  under the description is the next thing to design if the sideways swipe annoys in real use.

## Direction contract

THESIS: The month is one white invoice the visitor keeps re-writing, refused the dashboard of
soft-shadowed KPI cards — and refused the bureaucratic form: every figure carries its date, its
line number and the mark that produced it.

OWN-WORLD: Cool white sheet on a grey desk, square corners everywhere, print ink near-black,
Libre Franklin for the document and Chivo Mono for every column of figures. One stamp red for
loss, excess and the single action plate; ballpoint blue for the bolívar amount; highlighter
yellow only ever as a stroke behind ink. Double rules close a letterhead and a total; hairlines
and dot leaders carry the rest.

STORY: The visitor sees the month already closed into a total, recognises each figure's
provenance in the line beside it, and writes the next movement onto the sheet knowing where it
will land.

FIRST VIEWPORT: The letterhead opens the screen — house name and tag line at the left, the
correlative `Nº YYYY-MM` and its date at the right, closed by a double rule. Immediately under
it the subtotal band: Entró, Salió, and QUEDA on the heavy closing rule, followed by the first
numbered line items entering from the bottom edge. The red action stamp sits within thumb reach,
bottom right; the month jump is a field inside the letterhead, not a spinner in a toolbar.

FORM: The bound invoice/passbook document — fifth of seven grounded directions, the roll's
assignment after six challengers were weighed; seed key `1c4dfe06`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.
