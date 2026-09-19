import { useRef, useState, type FormEvent } from 'react';
import type { Account, AccountInput, AccountUpdateInput, AccountsResponse, MovementInput } from '../api/types';
import { readableError } from '../api/client';
import { formatMoney, formatPercent, toCents } from '../lib/money';
import { isValidDateStr } from '../lib/month';
import { Window } from './Window';

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
 * New / edit wallet window (name + opening balance, negatives allowed).
 * ------------------------------------------------------------------ */
interface AccountWindowProps {
  mode: 'create' | 'edit';
  account?: Account;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: AccountInput) => Promise<void>;
}

function AccountWindow({ mode, account, busy, onCancel, onSubmit }: AccountWindowProps) {
  const uid = account ? String(account.id) : 'new';
  const [name, setName] = useState(account?.name ?? '');
  const [opening, setOpening] = useState(account ? centsToInput(account.opening_balance_cents) : '');
  const [errors, setErrors] = useState<{ name?: string; opening?: string }>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const openingRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: { name?: string; opening?: string } = {};

    const trimmed = name.trim();
    if (trimmed.length === 0) next.name = 'Ingresá un nombre para la cartera.';
    else if (trimmed.length > MAX_NAME_LEN)
      next.name = `El nombre no puede superar los ${MAX_NAME_LEN} caracteres.`;

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
    } catch (error) {
      setFormError(readableError(error));
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === 'create' ? 'Nueva cartera' : `Editar ${account?.name ?? 'cartera'}`;
  const invalid = submitting || busy;

  return (
    <Window
      open
      title={title}
      onClose={onCancel}
      busy={submitting}
      initialFocusRef={nameRef}
    >
      <form onSubmit={handleSubmit} noValidate aria-label={title}>
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

        <div className="wfoot">
          <button
            type="submit"
            className="pbtn primary"
            disabled={invalid}
            aria-describedby={`err-form-${uid}`}
          >
            {submitting ? 'Guardando…' : mode === 'create' ? 'Crear cartera' : 'Guardar cambios'}
          </button>
          <button type="button" className="pbtn" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
        </div>

        <p className="error-msg" id={`err-form-${uid}`}>
          {formError}
        </p>
      </form>
    </Window>
  );
}

/* ------------------------------------------------------------------ *
 * Debt payment window (monto + fecha + nota). Registers an is_debt_payment
 * movement with no manual category: the backend forces "deudas".
 * ------------------------------------------------------------------ */
interface PaymentWindowProps {
  account: Account;
  today: string;
  onCancel: () => void;
  onSubmit: (input: MovementInput) => Promise<void>;
}

function PaymentWindow({ account, today, onCancel, onSubmit }: PaymentWindowProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; date?: string; note?: string }>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: { amount?: string; date?: string; note?: string } = {};

    const cents = toCents(amount);
    if (Number.isNaN(cents)) next.amount = 'Ingresá un monto válido (por ejemplo 1.234,56).';
    else if (cents <= 0) next.amount = 'El monto debe ser mayor a cero.';

    if (!isValidDateStr(date)) next.date = 'Ingresá una fecha válida.';

    const trimmedNote = note.trim();
    if (trimmedNote.length > MAX_NOTE_LEN)
      next.note = `La nota no puede superar los ${MAX_NOTE_LEN} caracteres.`;

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
    <Window
      open
      title={`Pagar deuda · ${account.name}`}
      onClose={onCancel}
      busy={submitting}
      initialFocusRef={amountRef}
    >
      <form onSubmit={handleSubmit} noValidate aria-label={`Registrar pago de ${account.name}`}>
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

        <div className="wfoot">
          <button
            type="submit"
            className="pbtn primary"
            disabled={submitting}
            aria-describedby={`err-form-payment-${account.id}`}
          >
            {submitting ? 'Guardando…' : 'Registrar pago'}
          </button>
          <button type="button" className="pbtn" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
        </div>

        <p className="error-msg" id={`err-form-payment-${account.id}`}>
          {formError}
        </p>
      </form>
    </Window>
  );
}

/* ------------------------------------------------------------------ *
 * One wallet block: balance, debt and its actions.
 * ------------------------------------------------------------------ */
interface AccountBlockProps {
  account: Account;
  busy: boolean;
  onEdit: () => void;
  onPay: () => void;
  onDelete: () => void;
}

function AccountBlock({ account, busy, onEdit, onPay, onDelete }: AccountBlockProps) {
  const isDebt = account.is_debt;
  const paidFraction = Math.min(1, Math.max(0, account.pct_paid));

  return (
    <div className="acc">
      <div className={isDebt ? 'a debt' : 'a'}>
        <div className="n">
          <span className="account-name">{account.name}</span>
          {isDebt && <span className="tag">Deuda</span>}
          {isDebt && <span className="stamp">A pagar</span>}
        </div>
        <div className="b num">{formatMoney(account.balance_cents, 'USD')}</div>

        {isDebt ? (
          <>
            <div
              className="bar"
              role="progressbar"
              aria-label={`${account.name}: deuda pagada`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(paidFraction * 100)}
              aria-valuetext={`${account.name}: ${formatPercent(account.pct_paid, 0)} pagado, restante ${formatMoney(
                account.remaining_cents,
                'USD',
              )}`}
            >
              <i style={{ width: `${(paidFraction * 100).toFixed(1)}%` }} />
            </div>
            <div className="m">
              <span className="mono">Restante {formatMoney(account.remaining_cents, 'USD')}</span>{' '}
              <span className="mono">{formatPercent(account.pct_paid, 0)} pagado</span>
            </div>
          </>
        ) : (
          <div className="m">Apertura {formatMoney(account.opening_balance_cents, 'USD')}</div>
        )}

        <div className="sect-actions">
          {isDebt && (
            <button
              type="button"
              className="linkb"
              disabled={busy}
              aria-label={`Registrar pago de ${account.name}`}
              onClick={onPay}
            >
              Pagar deuda
            </button>
          )}
          <button
            type="button"
            className="linkb"
            disabled={busy}
            aria-label={`Editar cartera ${account.name}`}
            onClick={onEdit}
          >
            Editar
          </button>
          <button
            type="button"
            className="linkb destructive"
            disabled={busy}
            aria-label={`Borrar cartera ${account.name}`}
            onClick={onDelete}
          >
            Borrar
          </button>
        </div>
      </div>
    </div>
  );
}

type Dialog = { kind: 'create' } | { kind: 'edit'; account: Account } | { kind: 'pay'; account: Account };

/**
 * Wallets as `.cats` blocks of `.acc`/`.a` entries: a wallet in debt is marked
 * (`.debt`) and sealed with a rubber stamp, and the outstanding total rides on
 * the `.debtline`. Create, edit and pay-debt open windows, and the delete
 * confirmation is App's `ConfirmWindow`. Every mutation, validation and Spanish
 * string is unchanged.
 */
export function AccountsPanel({
  data,
  today,
  busy = false,
  onCreate,
  onUpdate,
  onDelete,
  onPayDebt,
}: AccountsPanelProps) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const totalDebt = data.total_debt_cents;

  return (
    <section aria-labelledby="accounts-title">
      <div className="sect">
        <h2 id="accounts-title">Las carteras</h2>
        <div className="sect-actions">
          <button
            type="button"
            className="pbtn"
            disabled={busy}
            onClick={() => setDialog({ kind: 'create' })}
          >
            Nueva cartera
          </button>
        </div>
      </div>

      {totalDebt > 0 && (
        <p className="debtline">
          <span>Objetivo: eliminar la deuda</span>{' '}
          <strong>{formatMoney(totalDebt, 'USD')}</strong>{' '}
          <span>Cada pago acerca una cartera a $ 0.</span>
        </p>
      )}

      {data.items.length === 0 ? (
        <p className="empty-state">Todavía no hay carteras. Creá la primera.</p>
      ) : (
        <div className="cats">
          {data.items.map((account) => (
            <AccountBlock
              key={account.id}
              account={account}
              busy={busy}
              onEdit={() => setDialog({ kind: 'edit', account })}
              onPay={() => setDialog({ kind: 'pay', account })}
              onDelete={() => onDelete(account)}
            />
          ))}
        </div>
      )}

      {dialog?.kind === 'create' && (
        <AccountWindow
          mode="create"
          busy={busy}
          onCancel={() => setDialog(null)}
          onSubmit={async (input) => {
            await onCreate(input);
            setDialog(null);
          }}
        />
      )}

      {dialog?.kind === 'edit' && (
        <AccountWindow
          mode="edit"
          account={dialog.account}
          busy={busy}
          onCancel={() => setDialog(null)}
          onSubmit={async (input) => {
            await onUpdate(dialog.account.id, input);
            setDialog(null);
          }}
        />
      )}

      {dialog?.kind === 'pay' && (
        <PaymentWindow
          account={dialog.account}
          today={today}
          onCancel={() => setDialog(null)}
          onSubmit={async (input) => {
            await onPayDebt(input);
            setDialog(null);
          }}
        />
      )}
    </section>
  );
}
