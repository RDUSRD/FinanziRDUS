import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Account, AccountInput, AccountUpdateInput, AccountsResponse, MovementInput } from '../api/types';
import { readableError } from '../api/client';
import { formatMoney, formatPercent, toCents } from '../lib/money';
import { isValidDateStr } from '../lib/month';

/** Max length shared with the backend contract. */
const MAX_NAME_LEN = 60;
/** Max length shared with the backend contract. */
const MAX_NOTE_LEN = 140;

interface AccountsPanelProps {
  data: AccountsResponse;
  /** Today as "YYYY-MM-DD", used as the default payment date. */
  today: string;
  busy?: boolean;
  onCreate: (input: AccountInput) => Promise<void>;
  onUpdate: (id: number, patch: AccountUpdateInput) => Promise<void>;
  onDelete: (account: Account) => void;
  onPayDebt: (input: MovementInput) => Promise<void>;
}

/** Cents -> editable text ("45000", "-600", "1234,56"). */
function centsToInput(cents: number): string {
  return String(cents / 100).replace('.', ',');
}

function focusFirst(refs: Array<HTMLElement | null>): void {
  const first = refs.find((ref): ref is HTMLElement => ref !== null);
  first?.focus();
}

/* ------------------------------------------------------------------ *
 * New / edit wallet form (name + opening balance, negatives allowed).
 * ------------------------------------------------------------------ */
interface AccountFormProps {
  mode: 'create' | 'edit';
  account?: Account;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: AccountInput) => Promise<void>;
}

function AccountForm({ mode, account, busy, onCancel, onSubmit }: AccountFormProps) {
  const uid = account ? String(account.id) : 'new';
  const [name, setName] = useState(account?.name ?? '');
  const [opening, setOpening] = useState(account ? centsToInput(account.opening_balance_cents) : '');
  const [errors, setErrors] = useState<{ name?: string; opening?: string }>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const openingRef = useRef<HTMLInputElement>(null);

  // Focus the first field when the form opens.
  useEffect(() => {
    if (mode === 'create') nameRef.current?.focus();
  }, [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: { name?: string; opening?: string } = {};

    const trimmed = name.trim();
    if (trimmed.length === 0) next.name = 'Ingresá un nombre para la cartera.';
    else if (trimmed.length > MAX_NAME_LEN) next.name = `El nombre no puede superar los ${MAX_NAME_LEN} caracteres.`;

    const rawOpening = opening.trim();
    const cents = rawOpening === '' ? 0 : toCents(rawOpening);
    if (Number.isNaN(cents) || !Number.isSafeInteger(cents)) {
      next.opening = 'Ingresá un saldo válido (podés usar negativos, por ejemplo -600).';
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      setFormError('Revisá los campos marcados.');
      focusFirst([next.name ? nameRef.current : null, next.opening ? openingRef.current : null]);
      return;
    }

    setErrors({});
    setFormError('');
    setSubmitting(true);
    try {
      await onSubmit({ name: trimmed, opening_balance_cents: cents });
      if (mode === 'create') {
        setName('');
        setOpening('');
        nameRef.current?.focus();
      }
    } catch (error) {
      setFormError(readableError(error));
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === 'create' ? 'Nueva cartera' : `Editar ${account?.name ?? 'cartera'}`;
  const invalid = submitting || busy;

  return (
    <form className="inline-form" onSubmit={handleSubmit} noValidate aria-label={title}>
      <h3>{title}</h3>

      <div className="field">
        <label htmlFor={`account-name-${uid}`}>Nombre de la cartera</label>
        <input
          ref={nameRef}
          id={`account-name-${uid}`}
          type="text"
          autoComplete="off"
          maxLength={MAX_NAME_LEN}
          placeholder="Binance"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={`err-account-name-${uid}`}
        />
        <p className="error-msg" id={`err-account-name-${uid}`}>
          {errors.name ? `Error: ${errors.name}` : ''}
        </p>
      </div>

      <div className="field">
        <label htmlFor={`account-opening-${uid}`}>Saldo inicial (USD)</label>
        <input
          ref={openingRef}
          id={`account-opening-${uid}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={opening}
          onChange={(event) => setOpening(event.target.value)}
          aria-invalid={errors.opening ? true : undefined}
          aria-describedby={`hint-account-opening-${uid} err-account-opening-${uid}`}
        />
        <p className="hint" id={`hint-account-opening-${uid}`}>
          Un saldo negativo significa deuda (por ejemplo -600).
        </p>
        <p className="error-msg" id={`err-account-opening-${uid}`}>
          {errors.opening ? `Error: ${errors.opening}` : ''}
        </p>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={invalid}>
          {submitting ? 'Guardando…' : mode === 'create' ? 'Crear cartera' : 'Guardar cambios'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>

      <p className="error-msg">{formError}</p>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * Debt payment form (monto + fecha + nota). Registers an is_debt_payment
 * movement with no manual category: the backend forces "deudas".
 * ------------------------------------------------------------------ */
interface PaymentFormProps {
  account: Account;
  today: string;
  onCancel: () => void;
  onSubmit: (input: MovementInput) => Promise<void>;
}

function PaymentForm({ account, today, onCancel, onSubmit }: PaymentFormProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; date?: string; note?: string }>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: { amount?: string; date?: string; note?: string } = {};

    const cents = toCents(amount);
    if (Number.isNaN(cents)) next.amount = 'Ingresá un monto válido (por ejemplo 1.234,56).';
    else if (cents <= 0) next.amount = 'El monto debe ser mayor a cero.';

    if (!isValidDateStr(date)) next.date = 'Ingresá una fecha válida.';

    const trimmedNote = note.trim();
    if (trimmedNote.length > MAX_NOTE_LEN) next.note = `La nota no puede superar los ${MAX_NOTE_LEN} caracteres.`;

    if (Object.keys(next).length > 0) {
      setErrors(next);
      setFormError('Revisá los campos marcados.');
      focusFirst([
        next.amount ? amountRef.current : null,
        next.date ? dateRef.current : null,
        next.note ? noteRef.current : null,
      ]);
      return;
    }

    setErrors({});
    setFormError('');
    setSubmitting(true);
    try {
      await onSubmit({
        type: 'gasto',
        is_debt_payment: true,
        account_id: account.id,
        entry_currency: 'USD',
        entry_amount_cents: cents,
        rate_micros: null,
        date,
        note: trimmedNote,
      });
    } catch (error) {
      setFormError(readableError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="inline-form"
      onSubmit={handleSubmit}
      noValidate
      aria-label={`Registrar pago de ${account.name}`}
    >
      <h3>Registrar pago · {account.name}</h3>

      <div className="field">
        <label htmlFor={`payment-amount-${account.id}`}>Monto del pago (USD)</label>
        <input
          ref={amountRef}
          id={`payment-amount-${account.id}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="100"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={`err-payment-amount-${account.id}`}
        />
        <p className="error-msg" id={`err-payment-amount-${account.id}`}>
          {errors.amount ? `Error: ${errors.amount}` : ''}
        </p>
      </div>

      <div className="field">
        <label htmlFor={`payment-date-${account.id}`}>Fecha del pago</label>
        <input
          ref={dateRef}
          id={`payment-date-${account.id}`}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={`err-payment-date-${account.id}`}
        />
        <p className="error-msg" id={`err-payment-date-${account.id}`}>
          {errors.date ? `Error: ${errors.date}` : ''}
        </p>
      </div>

      <div className="field">
        <label htmlFor={`payment-note-${account.id}`}>Nota (opcional)</label>
        <input
          ref={noteRef}
          id={`payment-note-${account.id}`}
          type="text"
          autoComplete="off"
          maxLength={MAX_NOTE_LEN}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={`err-payment-note-${account.id}`}
        />
        <p className="error-msg" id={`err-payment-note-${account.id}`}>
          {errors.note ? `Error: ${errors.note}` : ''}
        </p>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Registrar pago'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>

      <p className="error-msg">{formError}</p>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * One wallet row: balance, debt progress and its actions.
 * ------------------------------------------------------------------ */
interface AccountRowProps {
  account: Account;
  today: string;
  busy: boolean;
  onUpdate: (id: number, patch: AccountUpdateInput) => Promise<void>;
  onDelete: (account: Account) => void;
  onPayDebt: (input: MovementInput) => Promise<void>;
}

function AccountRow({ account, today, busy, onUpdate, onDelete, onPayDebt }: AccountRowProps) {
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);

  const isDebt = account.is_debt;
  const paidFraction = Math.min(1, Math.max(0, account.pct_paid));
  const progressClass = account.pct_paid >= 1 ? 'progress' : 'progress warn';
  const formId = `account-form-${account.id}`;

  return (
    <li className="account-row">
      <div className="account-head">
        <span className="account-name">{account.name}</span>
        {isDebt && <span className="badge badge-debt">Deuda</span>}
        <span className="num account-balance">{formatMoney(account.balance_cents, 'USD')}</span>
      </div>

      {isDebt && (
        <>
          <div
            className={progressClass}
            role="progressbar"
            aria-label={`${account.name}: deuda pagada`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(1, Math.max(0, account.pct_paid)) * 100)}
            aria-valuetext={`${account.name}: ${formatPercent(account.pct_paid, 0)} pagado, restante ${formatMoney(
              account.remaining_cents,
              'USD',
            )}`}
          >
            <span style={{ width: `${(paidFraction * 100).toFixed(1)}%` }} />
          </div>
          <div className="account-meta">
            <span className="num">Restante {formatMoney(account.remaining_cents, 'USD')}</span>
            <span className="num">{formatPercent(account.pct_paid, 0)} pagado</span>
          </div>
        </>
      )}

      <div className="row-actions">
        {isDebt && (
          <button
            type="button"
            className="btn btn-sm"
            aria-expanded={paying}
            aria-controls={paying ? formId : undefined}
            aria-label={`Registrar pago de ${account.name}`}
            disabled={busy}
            onClick={() => {
              setPaying((value) => !value);
              setEditing(false);
            }}
          >
            Registrar pago
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          aria-label={`Editar cartera ${account.name}`}
          disabled={busy}
          onClick={() => {
            setEditing((value) => !value);
            setPaying(false);
          }}
        >
          Editar
        </button>
        <button
          type="button"
          className="btn btn-sm"
          aria-label={`Borrar cartera ${account.name}`}
          disabled={busy}
          onClick={() => onDelete(account)}
        >
          Borrar
        </button>
      </div>

      {paying && (
        <div id={formId}>
          <PaymentForm
            account={account}
            today={today}
            onCancel={() => setPaying(false)}
            onSubmit={async (input) => {
              await onPayDebt(input);
              setPaying(false);
            }}
          />
        </div>
      )}

      {editing && (
        <AccountForm
          mode="edit"
          account={account}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await onUpdate(account.id, input);
            setEditing(false);
          }}
        />
      )}
    </li>
  );
}

export function AccountsPanel({ data, today, busy = false, onCreate, onUpdate, onDelete, onPayDebt }: AccountsPanelProps) {
  const [creating, setCreating] = useState(false);
  const totalDebt = data.total_debt_cents;

  return (
    <section className="card" aria-labelledby="accounts-title">
      <h2 id="accounts-title">Carteras y deudas</h2>

      {totalDebt > 0 && (
        <div className="debt-objective">
          <span className="kpi-label">Objetivo: eliminar la deuda</span>
          <span className="debt-objective-value num">{formatMoney(totalDebt, 'USD')}</span>
          <p className="hint-note">
            Pagar la deuda es la prioridad del mes: cada pago acerca una cartera a $ 0.
          </p>
        </div>
      )}

      {data.items.length === 0 ? (
        <p className="empty-state">Todavía no hay carteras. Creá la primera.</p>
      ) : (
        <ul className="accounts-list">
          {data.items.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              today={today}
              busy={busy}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onPayDebt={onPayDebt}
            />
          ))}
        </ul>
      )}

      {creating ? (
        <AccountForm
          mode="create"
          busy={busy}
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            await onCreate(input);
            setCreating(false);
          }}
        />
      ) : (
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)} disabled={busy}>
            Nueva cartera
          </button>
        </div>
      )}
    </section>
  );
}
