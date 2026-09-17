import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Category, Movement, MovementInput, MovementType } from '../api/types';
import { readableError } from '../api/client';
import { toCents } from '../lib/money';
import { isValidDateStr, currentMonthKey, todayStr } from '../lib/month';

interface FieldErrors {
  amount?: string;
  categoryId?: string;
  date?: string;
  note?: string;
}

interface MovementFormProps {
  categories: Category[];
  editing: Movement | null;
  month: string;
  onSubmit: (input: MovementInput, editing: Movement | null) => Promise<void>;
  onCancel: () => void;
}

/** Cents -> editable text ("45000", "1234,56"). */
function centsToInput(cents: number): string {
  return String(cents / 100).replace('.', ',');
}

/** Default date for a new movement: today on the current month, else the 1st. */
function defaultDateForMonth(monthKey: string): string {
  return monthKey === currentMonthKey() ? todayStr() : `${monthKey}-01`;
}

export function MovementForm({ categories, editing, month, onSubmit, onCancel }: MovementFormProps) {
  const [type, setType] = useState<MovementType>('gasto');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(() => defaultDateForMonth(month));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => categories.filter((category) => category.type === type), [categories, type]);

  function resetForm() {
    setType('gasto');
    setAmount('');
    setCategoryId('');
    setDate(defaultDateForMonth(month));
    setNote('');
    setErrors({});
    setFormError('');
  }

  // Load a movement into the form when edit mode starts.
  useEffect(() => {
    if (!editing) return;
    setType(editing.type);
    setAmount(centsToInput(editing.amount_cents));
    setCategoryId(editing.category_id);
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

  function validate(): { errors: FieldErrors; value: MovementInput | null } {
    const next: FieldErrors = {};
    const cents = toCents(amount);
    if (Number.isNaN(cents)) {
      next.amount = 'Ingresá un monto válido (por ejemplo 1.234,56).';
    } else if (cents <= 0) {
      next.amount = 'El monto debe ser mayor a cero.';
    }

    if (!options.some((option) => option.id === categoryId)) {
      next.categoryId = 'Elegí una categoría válida.';
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
        amount_cents: cents,
        category_id: categoryId,
        date,
        note: trimmedNote,
      },
    };
  }

  function focusFirstError(fieldErrors: FieldErrors) {
    if (fieldErrors.amount) amountRef.current?.focus();
    else if (fieldErrors.categoryId) categoryRef.current?.focus();
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

          <div className="field">
            <label htmlFor="mv-amount">Monto en pesos</label>
            <input
              ref={amountRef}
              id="mv-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="1.234,56"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby="err-amount"
            />
            <p className="error-msg" id="err-amount">
              {errors.amount ? `Error: ${errors.amount}` : ''}
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
