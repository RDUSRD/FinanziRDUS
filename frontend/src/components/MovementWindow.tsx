import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  Account,
  BudgetsResponse,
  Category,
  EntryCurrency,
  Movement,
  MovementInput,
  MovementItem,
  MovementType,
  StatsSummary,
} from '../api/types';
import { readableError } from '../api/client';
import { formatMoney, formatPercent, formatRate, toCents } from '../lib/money';
import { isValidDateStr, currentMonthKey, todayStr } from '../lib/month';
import { Window } from './Window';

/**
 * Everything the strip needs to draft an honest estimate: the month summary and
 * the budgets the client already loaded. Either half may be missing; the strip
 * then shows only what it can actually know.
 */
export interface MovementEstimate {
  summary: StatsSummary | null;
  budgets: BudgetsResponse | null;
}

interface MovementWindowProps {
  categories: Category[];
  accounts: Account[];
  editing: Movement | null;
  month: string;
  /** Wallet preselected for new movements (the active filter, or null for "all"). */
  defaultAccountId: number | null;
  /** Rate of the most recently loaded VES movement, used to prefill the field. */
  lastVesRateMicros?: number | null;
  /** Already-loaded summary/budgets, or null: the source of the strip's estimate. */
  estimate: MovementEstimate | null;
  onSubmit: (input: MovementInput, editing: Movement | null) => Promise<void>;
  onClose: () => void;
  /** Voiced through the app's single live region when the form-level error shows. */
  onError?: (message: string) => void;
  open: boolean;
}

interface FieldErrors {
  amount?: string;
  rate?: string;
  categoryId?: string;
  accountId?: string;
  date?: string;
  note?: string;
  /** Line-list level error (over the 100-line cap). */
  items?: string;
}

/** Cents -> editable text ("45000", "1234,56"). */
function centsToInput(cents: number): string {
  return String(cents / 100).replace('.', ',');
}

/** Bs/USD micros -> editable rate text ("40", "36,5"). */
function microsToRateInput(micros: number): string {
  return (Math.round((micros / 1_000_000) * 100) / 100).toString().replace('.', ',');
}

/** Parse an editable "Bs por USD" value into micros; NaN when invalid. */
function rateToMicros(raw: string): number {
  const value = toCents(raw) / 100;
  if (!Number.isFinite(value) || value <= 0) return NaN;
  return Math.round(value * 1_000_000);
}

/** Default date for a new movement: today on the current month, else the 1st. */
function defaultDateForMonth(monthKey: string): string {
  return monthKey === currentMonthKey() ? todayStr() : `${monthKey}-01`;
}

/** Detail lines: the API caps them at 100, each with a short description. */
const MAX_LINES = 100;
const MAX_ITEM_DESC_LEN = 120;

/** A detail line being drafted: the price stays raw text, never a float. */
interface LineDraft {
  id: number;
  description: string;
  amount: string;
}

type LineErrors = Record<number, { description?: string; amount?: string }>;

/**
 * Lines for the draft "prueba de tira": what the typed movement would do to the
 * month, derived ONLY from the typed values plus the summary/budgets already
 * loaded. Never presented as the stored figure; missing data yields no line.
 */
function draftLines(args: {
  usdCents: number | null;
  type: MovementType;
  categoryId: string;
  estimate: MovementEstimate | null;
}): string[] {
  const { usdCents, type, categoryId, estimate } = args;
  if (usdCents === null || estimate === null) return [];

  const lines: string[] = [];

  if (type === 'gasto') {
    const item = estimate.budgets?.items.find((budget) => budget.category_id === categoryId);
    if (item && item.cap_cents > 0) {
      const spent = item.spent_cents + usdCents;
      const pct = spent / item.cap_cents;
      const verdict =
        spent > item.cap_cents
          ? `excedido ${formatPercent(pct)}`
          : spent >= 0.8 * item.cap_cents
            ? `cerca del tope ${formatPercent(pct)}`
            : `${formatPercent(pct)} del tope`;
      lines.push(
        `${item.label} quedaría en ${formatMoney(spent, 'USD')} de ${formatMoney(item.cap_cents, 'USD')} · ${verdict}`,
      );
    }
  }

  if (estimate.summary) {
    const balance =
      type === 'gasto'
        ? estimate.summary.balance_cents - usdCents
        : estimate.summary.balance_cents + usdCents;
    lines.push(`Te quedaría ${formatMoney(balance, 'USD')} este mes.`);
  }

  return lines;
}

/**
 * The movement form, rendered inside a {@link Window}. It
 * keeps every rule from the old inline form: type, USD/VES currency with the
 * last-rate prefill, amount parsing, the Bs rate with its USD equivalent, wallet
 * and non-system category selects, the month-aware default date, the 140-char
 * note, per-field errors with focus management and the busy submit state.
 */
export function MovementWindow({
  categories,
  accounts,
  editing,
  month,
  defaultAccountId,
  lastVesRateMicros = null,
  estimate,
  onSubmit,
  onClose,
  onError,
  open,
}: MovementWindowProps) {
  const [type, setType] = useState<MovementType>('gasto');
  const [currency, setCurrency] = useState<EntryCurrency>('USD');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState<number | null>(defaultAccountId);
  const [date, setDate] = useState(() => defaultDateForMonth(month));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [lineErrors, setLineErrors] = useState<LineErrors>({});

  const nextLineId = useRef(1);
  const amountRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const accountRef = useRef<HTMLSelectElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const firstLineRef = useRef<HTMLInputElement>(null);

  const isEditing = editing !== null;
  const isVes = currency === 'VES';
  const hasLines = lines.length > 0;
  // A line summary hides the amount field, so the window opens on the lines.
  const editingHasLines = editing !== null && editing.items.length > 0;

  // System categories ("Deudas") are never picked by hand: they come from a debt payment.
  const options = useMemo(
    () => categories.filter((category) => category.type === type && !category.is_system),
    [categories, type],
  );

  // Load (edit) or reset (create) the fields every time the window opens.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setCurrency(editing.entry_currency);
      setAmount(centsToInput(editing.entry_amount_cents));
      setRate(editing.rate_micros ? microsToRateInput(editing.rate_micros) : '');
      setCategoryId(editing.category_id);
      setAccountId(editing.account_id);
      setDate(editing.date);
      setNote(editing.note);
      setLines(
        editing.items.map((item) => ({
          id: nextLineId.current++,
          description: item.description,
          amount: centsToInput(item.amount_cents),
        })),
      );
    } else {
      setType('gasto');
      setCurrency('USD');
      setAmount('');
      setRate('');
      setCategoryId('');
      setAccountId(defaultAccountId ?? accounts[0]?.id ?? null);
      setDate(defaultDateForMonth(month));
      setNote('');
      setLines([]);
    }
    setErrors({});
    setLineErrors({});
    setFormError('');
    // Seed the fields when the window opens; the coherence effects below keep
    // the wallet/date/category valid afterwards.
  }, [open, editing]);

  // Keep the wallet selection coherent with the active filter while creating.
  useEffect(() => {
    if (!open || editing) return;
    setAccountId((current) => {
      if (defaultAccountId !== null && accounts.some((account) => account.id === defaultAccountId)) {
        return defaultAccountId;
      }
      if (current !== null && accounts.some((account) => account.id === current)) return current;
      return accounts[0]?.id ?? null;
    });
  }, [open, editing, defaultAccountId, accounts]);

  // Keep the default date aligned with the month being viewed while creating.
  useEffect(() => {
    if (!open || editing) return;
    setDate(defaultDateForMonth(month));
  }, [month, editing, open]);

  // Keep the selected category coherent with the current type.
  useEffect(() => {
    if (!options.some((option) => option.id === categoryId)) {
      setCategoryId(options[0]?.id ?? '');
    }
  }, [options, categoryId]);

  // Editing a movement that already carries lines hides the amount field, so the
  // window would otherwise fall back to the close button. Arm the focus on open
  // and land on the first line's description once the seeded lines have rendered.
  const lineFocusArmed = useRef(false);
  useEffect(() => {
    lineFocusArmed.current = open && editingHasLines;
  }, [open, editingHasLines]);
  useEffect(() => {
    if (!lineFocusArmed.current) return;
    const node = firstLineRef.current;
    if (!node) return;
    lineFocusArmed.current = false;
    node.focus();
  }, [lines]);

  // Live USD equivalent of a VES entry ("= $100 (a Bs 40/USD)").
  const preview = useMemo(() => {
    if (!isVes) return null;
    const entryCents = toCents(amount);
    const micros = rateToMicros(rate);
    if (!Number.isFinite(entryCents) || entryCents <= 0 || !Number.isFinite(micros)) return null;
    const usdCents = Math.round((entryCents * 1_000_000) / micros);
    return { usdCents, rateText: formatRate(micros) };
  }, [isVes, amount, rate]);

  // The typed movement's USD value, or null while it cannot be known.
  const typedUsdCents = useMemo(() => {
    if (isVes) return preview?.usdCents ?? null;
    const cents = toCents(amount);
    return Number.isFinite(cents) && cents > 0 ? cents : null;
  }, [isVes, preview, amount]);

  const draft = draftLines({ usdCents: typedUsdCents, type, categoryId, estimate });
  const vesEquivalence = preview
    ? `= ${formatMoney(preview.usdCents, 'USD')} (a Bs ${preview.rateText}/USD)`
    : 'El equivalente en dólares se calcula con la tasa.';

  // The typed lines' total in the entry currency (USD cents, or Bs céntimos for a
  // VES entry): the estimate shown on the strip (the API recomputes the real total
  // when it stores the movement).
  const linesTotal = useMemo(() => {
    let total = 0;
    for (const line of lines) {
      const cents = toCents(line.amount);
      if (Number.isFinite(cents) && cents > 0) total += cents;
    }
    return total;
  }, [lines]);

  // The USD equivalent the rate implies for the typed lines: a client-side estimate
  // only (the API converts the sum once, half-up, when it stores the VES movement).
  const linesEquivalent = useMemo(() => {
    if (!isVes || linesTotal <= 0) return null;
    const micros = rateToMicros(rate);
    if (!Number.isFinite(micros)) return null;
    return { usdCents: Math.round((linesTotal * 1_000_000) / micros), rateText: formatRate(micros) };
  }, [isVes, linesTotal, rate]);

  /** Switch currency, prefilling the last used VES rate when still empty. */
  function selectCurrency(next: EntryCurrency) {
    setCurrency(next);
    if (next === 'VES' && rate.trim() === '' && lastVesRateMicros) {
      setRate(microsToRateInput(lastVesRateMicros));
    }
  }

  function addLine() {
    setLines((current) =>
      current.length >= MAX_LINES
        ? current
        : [...current, { id: nextLineId.current++, description: '', amount: '' }],
    );
  }

  function removeLine(id: number) {
    setLines((current) => current.filter((line) => line.id !== id));
    setLineErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function updateLine(id: number, patch: Partial<Pick<LineDraft, 'description' | 'amount'>>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function validate(): { errors: FieldErrors; lineErrors: LineErrors; value: MovementInput | null } {
    const next: FieldErrors = {};
    const nextLineErrors: LineErrors = {};
    const cents = toCents(amount);
    const withLines = lines.length > 0;

    if (withLines) {
      if (lines.length > MAX_LINES) {
        next.items = `Máximo ${MAX_LINES} líneas por movimiento.`;
      }
      for (const line of lines) {
        const lineFieldErrors: { description?: string; amount?: string } = {};
        const description = line.description.trim();
        if (description.length === 0 || description.length > MAX_ITEM_DESC_LEN) {
          lineFieldErrors.description = `Cada línea necesita una descripción de hasta ${MAX_ITEM_DESC_LEN} caracteres.`;
        }
        const lineCents = toCents(line.amount);
        if (!Number.isFinite(lineCents) || lineCents <= 0) {
          lineFieldErrors.amount = 'El precio de una línea debe ser mayor a cero.';
        }
        if (lineFieldErrors.description || lineFieldErrors.amount) {
          nextLineErrors[line.id] = lineFieldErrors;
        }
      }
    } else if (Number.isNaN(cents)) {
      next.amount = 'Ingresá un monto válido (por ejemplo 1.234,56).';
    } else if (cents <= 0) {
      next.amount = 'El monto debe ser mayor a cero.';
    }

    let rateMicros: number | null = null;
    if (isVes) {
      const micros = rateToMicros(rate);
      if (!Number.isFinite(micros)) {
        next.rate = 'Ingresá una tasa válida en Bs por USD (por ejemplo 40).';
      } else {
        rateMicros = micros;
      }
    }

    if (!options.some((option) => option.id === categoryId)) {
      next.categoryId = 'Elegí una categoría válida.';
    }

    if (accountId === null || !accounts.some((account) => account.id === accountId)) {
      next.accountId = 'Elegí una cartera válida.';
    }

    if (!isValidDateStr(date)) {
      next.date = 'Ingresá una fecha válida.';
    }

    const trimmedNote = note.trim();
    if (trimmedNote.length > 140) {
      next.note = 'La nota no puede superar los 140 caracteres.';
    }

    if (Object.keys(next).length > 0 || Object.keys(nextLineErrors).length > 0) {
      return { errors: next, lineErrors: nextLineErrors, value: null };
    }

    const items: MovementItem[] = withLines
      ? lines.map((line) => ({
          description: line.description.trim(),
          amount_cents: toCents(line.amount),
        }))
      : [];
    // Lines are in the entry currency: their sum is the entry amount, and the API
    // converts it once with the rate when the movement is in bolívares.
    const totalCents = items.reduce((acc, item) => acc + item.amount_cents, 0);
    const rateValue = isVes ? rateMicros : null;

    return {
      errors: next,
      lineErrors: nextLineErrors,
      value: {
        type,
        category_id: categoryId,
        account_id: accountId as number,
        entry_currency: currency,
        entry_amount_cents: withLines ? totalCents : cents,
        rate_micros: rateValue,
        date,
        note: trimmedNote,
        items,
      },
    };
  }

  function focusFirstError(fieldErrors: FieldErrors, lineFieldErrors: LineErrors) {
    if (fieldErrors.amount) {
      amountRef.current?.focus();
      return;
    }
    if (fieldErrors.rate) {
      rateRef.current?.focus();
      return;
    }
    const firstBadLine = lines.find((line) => lineFieldErrors[line.id]);
    if (firstBadLine) {
      const id = lineFieldErrors[firstBadLine.id]?.description
        ? `mv-item-desc-${firstBadLine.id}`
        : `mv-item-amt-${firstBadLine.id}`;
      document.getElementById(id)?.focus();
      return;
    }
    if (fieldErrors.categoryId) categoryRef.current?.focus();
    else if (fieldErrors.accountId) accountRef.current?.focus();
    else if (fieldErrors.date) dateRef.current?.focus();
    else if (fieldErrors.note) noteRef.current?.focus();
  }

  /** Paint the form-level error and voice it through the app's live region. */
  function showFormError(message: string) {
    setFormError(message);
    onError?.(message);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate();
    setErrors(result.errors);
    setLineErrors(result.lineErrors);
    if (!result.value) {
      showFormError('Revisá los campos marcados.');
      focusFirstError(result.errors, result.lineErrors);
      return;
    }

    setErrors({});
    setFormError('');
    setSubmitting(true);
    try {
      await onSubmit(result.value, editing);
    } catch (error) {
      showFormError(readableError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Window
      open={open}
      title={isEditing ? 'Editar movimiento' : 'Nuevo movimiento'}
      onClose={onClose}
      busy={submitting}
      initialFocusRef={editingHasLines ? undefined : amountRef}
      footer={
        <>
          <button
            type="submit"
            form="movement-form"
            className="plate"
            disabled={submitting}
            aria-describedby="err-form"
          >
            {submitting ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Agregar movimiento'}
          </button>
          <button type="button" className="linkb" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
        </>
      }
    >
      <form id="movement-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label id="mv-type-label">Tipo</label>
          <div className="seg" role="radiogroup" aria-labelledby="mv-type-label">
            <button
              type="button"
              role="radio"
              aria-checked={type === 'gasto'}
              onClick={() => setType('gasto')}
            >
              Gasto
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={type === 'ingreso'}
              onClick={() => setType('ingreso')}
            >
              Ingreso
            </button>
          </div>
        </div>

        <div className="field">
          <label id="mv-currency-label">Moneda</label>
          <div className="seg" role="radiogroup" aria-labelledby="mv-currency-label">
            <button
              type="button"
              role="radio"
              aria-checked={currency === 'USD'}
              onClick={() => selectCurrency('USD')}
            >
              USD
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={isVes}
              onClick={() => selectCurrency('VES')}
            >
              VES
            </button>
          </div>
        </div>

        {!hasLines && (
          <div className="field">
            <label htmlFor="mv-amount">{isVes ? 'Monto en bolívares' : 'Monto en dólares'}</label>
            <input
              ref={amountRef}
              id="mv-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={isVes ? '4.000,00' : '1.234,56'}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby="err-amount"
            />
            <p className="error-msg" id="err-amount">
              {errors.amount ? `Error: ${errors.amount}` : ''}
            </p>
          </div>
        )}

        {isVes && (
          <div className="field">
            <label htmlFor="mv-rate">Tasa (Bs por USD)</label>
            <input
              ref={rateRef}
              id="mv-rate"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="40"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              aria-invalid={errors.rate ? true : undefined}
              aria-describedby="err-rate"
            />
            <p className="error-msg" id="err-rate">
              {errors.rate ? `Error: ${errors.rate}` : ''}
            </p>
          </div>
        )}

        <fieldset className="lines">
          <legend>Líneas de detalle (opcional)</legend>
          {lines.map((line, index) => {
            const position = index + 1;
            const lineFieldErrors = lineErrors[line.id] ?? {};
            return (
              <div className="line" key={line.id}>
                <div className="field desc">
                  <label htmlFor={`mv-item-desc-${line.id}`}>Descripción</label>
                  <input
                    id={`mv-item-desc-${line.id}`}
                    ref={index === 0 ? firstLineRef : undefined}
                    type="text"
                    autoComplete="off"
                    placeholder="Producto o servicio"
                    value={line.description}
                    onChange={(event) => updateLine(line.id, { description: event.target.value })}
                    aria-label={`Descripción de la línea ${position}`}
                    aria-invalid={lineFieldErrors.description ? true : undefined}
                    aria-describedby={`err-item-desc-${line.id}`}
                  />
                  <p className="error-msg" id={`err-item-desc-${line.id}`}>
                    {lineFieldErrors.description ? `Error: ${lineFieldErrors.description}` : ''}
                  </p>
                </div>
                <div className="field amt">
                  <label htmlFor={`mv-item-amt-${line.id}`}>
                    {isVes ? 'Precio (Bs)' : 'Precio ($)'}
                  </label>
                  <input
                    id={`mv-item-amt-${line.id}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={isVes ? 'Bs 4.000,00' : '$ 1.234,56'}
                    value={line.amount}
                    onChange={(event) => updateLine(line.id, { amount: event.target.value })}
                    aria-label={`Precio de la línea ${position}`}
                    aria-invalid={lineFieldErrors.amount ? true : undefined}
                    aria-describedby={`err-item-amt-${line.id}`}
                  />
                  <p className="error-msg" id={`err-item-amt-${line.id}`}>
                    {lineFieldErrors.amount ? `Error: ${lineFieldErrors.amount}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="linkb rm"
                  onClick={() => removeLine(line.id)}
                  aria-label={`Quitar línea ${position}`}
                >
                  Quitar
                </button>
              </div>
            );
          })}
          <div className="line-tools">
            <button type="button" className="linkb" onClick={addLine} disabled={lines.length >= MAX_LINES}>
              Agregar línea
            </button>
            <p className="hint">
              Hasta {MAX_LINES} líneas. El total es la suma de las líneas, en la moneda del
              movimiento.
            </p>
          </div>
          <p className="error-msg" id="err-items">
            {errors.items ? `Error: ${errors.items}` : ''}
          </p>
        </fieldset>

        <div className="two">
          <div className="field">
            <label htmlFor="mv-category">Categoría</label>
            <select
              ref={categoryRef}
              id="mv-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              aria-invalid={errors.categoryId ? true : undefined}
              aria-describedby="err-category"
            >
              {options.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <p className="error-msg" id="err-category">
              {errors.categoryId ? `Error: ${errors.categoryId}` : ''}
            </p>
          </div>

          <div className="field">
            <label htmlFor="mv-account">Cartera</label>
            <select
              ref={accountRef}
              id="mv-account"
              value={accountId ?? ''}
              onChange={(event) => setAccountId(Number(event.target.value))}
              aria-invalid={errors.accountId ? true : undefined}
              aria-describedby="err-account"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <p className="error-msg" id="err-account">
              {errors.accountId ? `Error: ${errors.accountId}` : ''}
            </p>
          </div>
        </div>

        <div className="two">
          <div className="field">
            <label htmlFor="mv-date">Fecha</label>
            <input
              ref={dateRef}
              id="mv-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              aria-invalid={errors.date ? true : undefined}
              aria-describedby="err-date"
            />
            <p className="error-msg" id="err-date">
              {errors.date ? `Error: ${errors.date}` : ''}
            </p>
          </div>

          <div className="field">
            <label htmlFor="mv-note">Nota (opcional)</label>
            <input
              ref={noteRef}
              id="mv-note"
              type="text"
              maxLength={140}
              autoComplete="off"
              placeholder="Detalle corto"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-invalid={errors.note ? true : undefined}
              aria-describedby="hint-note err-note"
            />
            <p className="hint" id="hint-note">
              Máximo 140 caracteres.
            </p>
            <p className="error-msg" id="err-note">
              {errors.note ? `Error: ${errors.note}` : ''}
            </p>
          </div>
        </div>

        <div className="strip">
          <p>Prueba de tira</p>
          {isVes && !hasLines ? <p className="rate">{vesEquivalence}</p> : null}
          {hasLines ? (
            <p>
              Total de líneas <span className="mono">{formatMoney(linesTotal, currency)}</span>
              {linesEquivalent ? (
                <>
                  {' — = '}
                  <span className="mono">{formatMoney(linesEquivalent.usdCents, 'USD')}</span>
                  {` (a Bs ${linesEquivalent.rateText}/USD)`}
                </>
              ) : null}
              {' — '}estimado, todavía sin guardar.
            </p>
          ) : null}
          {draft.length > 0 ? (
            <>
              <p>Estimado, todavía sin guardar.</p>
              {draft.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </>
          ) : null}
        </div>

        <p className="error-msg" id="err-form">
          {formError}
        </p>
      </form>
    </Window>
  );
}
