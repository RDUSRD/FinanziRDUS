import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Account, Category, EntryCurrency, Movement, MovementInput, MovementType } from '../api/types';
import { readableError } from '../api/client';
import { formatMoney, formatRate, toCents } from '../lib/money';
import { isValidDateStr, currentMonthKey, todayStr } from '../lib/month';

interface FieldErrors {
  amount?: string;
  rate?: string;
  categoryId?: string;
  accountId?: string;
  date?: string;
  note?: string;
}

interface MovementFormProps {
  categories: Category[];
  accounts: Account[];
  editing: Movement | null;
  month: string;
  /** Wallet preselected for new movements (the active filter, or null for "all"). */
  defaultAccountId: number | null;
  /** Rate of the most recently loaded VES movement, used to prefill the field. */
  lastVesRateMicros?: number | null;
  onSubmit: (input: MovementInput, editing: Movement | null) => Promise<void>;
  onCancel: () => void;
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

export function MovementForm({
  categories,
  accounts,
  editing,
  month,
  defaultAccountId,
  lastVesRateMicros = null,
  onSubmit,
  onCancel,
}: MovementFormProps) {
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

  const amountRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const accountRef = useRef<HTMLSelectElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  // System categories ("Deudas") are never picked by hand: they come from a debt payment.
  const options = useMemo(
    () => categories.filter((category) => category.type === type && !category.is_system),
    [categories, type],
  );

  const isVes = currency === 'VES';

  // Live USD equivalent of a VES entry ("= $100 (a Bs 40/USD)").
  const preview = useMemo(() => {
    if (!isVes) return null;
    const entryCents = toCents(amount);
    const micros = rateToMicros(rate);
    if (!Number.isFinite(entryCents) || entryCents <= 0 || !Number.isFinite(micros)) return null;
    const usdCents = Math.round((entryCents * 1_000_000) / micros);
    return { usdCents, rateText: formatRate(micros) };
  }, [isVes, amount, rate]);

  function resetForm() {
    setType('gasto');
    setCurrency('USD');
    setAmount('');
    setRate('');
    setCategoryId('');
    setAccountId(defaultAccountId ?? accounts[0]?.id ?? null);
    setDate(defaultDateForMonth(month));
    setNote('');
    setErrors({});
    setFormError('');
  }

  // Load a movement into the form when edit mode starts.
  useEffect(() => {
    if (!editing) return;
    setType(editing.type);
    setCurrency(editing.entry_currency);
    setAmount(centsToInput(editing.entry_amount_cents));
    setRate(editing.rate_micros ? microsToRateInput(editing.rate_micros) : '');
    setCategoryId(editing.category_id);
    setAccountId(editing.account_id);
    setDate(editing.date);
    setNote(editing.note);
    setErrors({});
    setFormError('');
    amountRef.current?.focus();
  }, [editing]);

  // Leaving edit mode (cancel or after save) clears the form.
  useEffect(() => {
    if (editing) return;
    resetForm();
  }, [editing]);

  // Keep the wallet selection coherent: follow the active filter, keep the
  // current choice when it still exists, and otherwise fall back to the first.
  useEffect(() => {
    if (editing) return;
    setAccountId((current) => {
      if (defaultAccountId !== null && accounts.some((account) => account.id === defaultAccountId)) {
        return defaultAccountId;
      }
      if (current !== null && accounts.some((account) => account.id === current)) return current;
      return accounts[0]?.id ?? null;
    });
  }, [editing, defaultAccountId, accounts]);

  // Keep the default date aligned with the month being viewed.
  useEffect(() => {
    if (editing) return;
    setDate(defaultDateForMonth(month));
  }, [month, editing]);

  // Keep the selected category coherent with the current type.
  useEffect(() => {
    if (!options.some((option) => option.id === categoryId)) {
      setCategoryId(options[0]?.id ?? '');
    }
  }, [options, categoryId]);

  /** Switch currency, prefilling the last used VES rate when still empty. */
  function selectCurrency(next: EntryCurrency) {
    setCurrency(next);
    if (next === 'VES' && rate.trim() === '' && lastVesRateMicros) {
      setRate(microsToRateInput(lastVesRateMicros));
    }
  }

  function validate(): { errors: FieldErrors; value: MovementInput | null } {
    const next: FieldErrors = {};
    const cents = toCents(amount);
    if (Number.isNaN(cents)) {
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

    if (Object.keys(next).length > 0) return { errors: next, value: null };

    return {
      errors: next,
      value: {
        type,
        category_id: categoryId,
        account_id: accountId as number,
        entry_currency: currency,
        entry_amount_cents: cents,
        rate_micros: isVes ? rateMicros : null,
        date,
        note: trimmedNote,
      },
    };
  }

  function focusFirstError(fieldErrors: FieldErrors) {
    if (fieldErrors.amount) amountRef.current?.focus();
    else if (fieldErrors.rate) rateRef.current?.focus();
    else if (fieldErrors.categoryId) categoryRef.current?.focus();
    else if (fieldErrors.accountId) accountRef.current?.focus();
    else if (fieldErrors.date) dateRef.current?.focus();
    else if (fieldErrors.note) noteRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate();
    if (!result.value) {
      setErrors(result.errors);
      setFormError('Revisá los campos marcados.');
      focusFirstError(result.errors);
      return;
    }

    setErrors({});
    setFormError('');
    setSubmitting(true);
    try {
      await onSubmit(result.value, editing);
      resetForm();
    } catch (error) {
      setFormError(readableError(error));
    } finally {
      setSubmitting(false);
    }
  }

  const isEditing = editing !== null;
  const previewText = preview
    ? `= ${formatMoney(preview.usdCents, 'USD')} (a Bs ${preview.rateText}/USD)`
    : 'El equivalente en dólares se calcula con la tasa.';

  return (
    <section className={isEditing ? 'card editing' : 'card'} aria-labelledby="form-title">
      <form onSubmit={handleSubmit} noValidate>
        <fieldset>
          <legend id="form-title">{isEditing ? 'Editar movimiento' : 'Nuevo movimiento'}</legend>

          {isEditing && (
            <div className="edit-notice">
              <span aria-hidden="true">✎</span> Editando movimiento
            </div>
          )}

          <div className="segmented" role="radiogroup" aria-label="Tipo de movimiento">
            <label className={type === 'gasto' ? 'is-active' : undefined}>
              <input
                type="radio"
                name="movement-type"
                value="gasto"
                checked={type === 'gasto'}
                onChange={() => setType('gasto')}
              />
              Gasto
            </label>
            <label className={type === 'ingreso' ? 'is-active' : undefined}>
              <input
                type="radio"
                name="movement-type"
                value="ingreso"
                checked={type === 'ingreso'}
                onChange={() => setType('ingreso')}
              />
              Ingreso
            </label>
          </div>

          <div className="segmented" role="radiogroup" aria-label="Moneda">
            <label className={currency === 'USD' ? 'is-active' : undefined}>
              <input
                type="radio"
                name="movement-currency"
                value="USD"
                checked={currency === 'USD'}
                onChange={() => selectCurrency('USD')}
              />
              USD
            </label>
            <label className={currency === 'VES' ? 'is-active' : undefined}>
              <input
                type="radio"
                name="movement-currency"
                value="VES"
                checked={isVes}
                onChange={() => selectCurrency('VES')}
              />
              VES
            </label>
          </div>

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
                aria-describedby="hint-rate err-rate"
              />
              <p className="hint" id="hint-rate">
                {previewText}
              </p>
              <p className="error-msg" id="err-rate">
                {errors.rate ? `Error: ${errors.rate}` : ''}
              </p>
            </div>
          )}

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
              aria-describedby="err-note hint-note"
            />
            <p className="hint" id="hint-note">
              Máximo 140 caracteres.
            </p>
            <p className="error-msg" id="err-note">
              {errors.note ? `Error: ${errors.note}` : ''}
            </p>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Agregar movimiento'}
            </button>
            {isEditing && (
              <button type="button" className="btn btn-ghost" onClick={onCancel}>
                Cancelar
              </button>
            )}
          </div>

          <p className="error-msg" id="err-form">
            {formError}
          </p>
        </fieldset>
      </form>
    </section>
  );
}
