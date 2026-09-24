import { useId, useRef, useState, type FormEvent } from 'react';
import { readableError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { MIN_PASSWORD_LEN } from '../lib/credentials';

interface FieldErrors {
  current?: string;
  next?: string;
  repeat?: string;
}

interface PasswordFormProps {
  submitLabel?: string;
  /** Called after the password is replaced (the other sessions are already closed). */
  onSuccess: () => void;
  /** Called with a readable message when the change fails. */
  onError: (message: string) => void;
}

/**
 * The password change form, used both by the forced first-login screen and by
 * the admin panel. It follows the app's manual pattern: one piece of state per
 * field, a `validate()` that returns the errors and the payload, focus moved to
 * the first field in error, and the submit disabled while in flight.
 */
export function PasswordForm({
  submitLabel = 'Cambiar contraseña',
  onSuccess,
  onError,
}: PasswordFormProps) {
  const { changePassword } = useAuth();
  const prefix = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const repeatRef = useRef<HTMLInputElement>(null);

  function showFormError(message: string) {
    setFormError(message);
    onError(message);
  }

  function focusFirstError(found: FieldErrors) {
    if (found.current) currentRef.current?.focus();
    else if (found.next) nextRef.current?.focus();
    else if (found.repeat) repeatRef.current?.focus();
  }

  function validate(): {
    errors: FieldErrors;
    value: { current: string; next: string } | null;
  } {
    const found: FieldErrors = {};
    if (!current) found.current = 'Escribí tu contraseña actual.';
    if (next.length < MIN_PASSWORD_LEN) {
      found.next = `La contraseña nueva necesita al menos ${MIN_PASSWORD_LEN} caracteres.`;
    }
    if (repeat !== next) found.repeat = 'Las dos contraseñas nuevas no coinciden.';
    setErrors(found);
    if (found.current || found.next || found.repeat) return { errors: found, value: null };
    return { errors: found, value: { current, next } };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate();
    if (!result.value) {
      showFormError('Revisá los campos marcados.');
      focusFirstError(result.errors);
      return;
    }

    setFormError('');
    setSubmitting(true);
    try {
      await changePassword(result.value.current, result.value.next);
      setCurrent('');
      setNext('');
      setRepeat('');
      onSuccess();
    } catch (error) {
      showFormError(readableError(error));
      currentRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-body" noValidate onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor={`${prefix}-current`}>Contraseña actual</label>
        <input
          ref={currentRef}
          id={`${prefix}-current`}
          name="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          aria-invalid={errors.current ? true : undefined}
          aria-describedby={`${prefix}-err-current`}
          disabled={submitting}
        />
        <p className="error-msg" id={`${prefix}-err-current`}>
          {errors.current ? `Error: ${errors.current}` : ''}
        </p>
      </div>

      <div className="field">
        <label htmlFor={`${prefix}-next`}>Contraseña nueva</label>
        <input
          ref={nextRef}
          id={`${prefix}-next`}
          name="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          aria-invalid={errors.next ? true : undefined}
          aria-describedby={`${prefix}-err-next`}
          disabled={submitting}
        />
        <p className="hint">Al menos {MIN_PASSWORD_LEN} caracteres.</p>
        <p className="error-msg" id={`${prefix}-err-next`}>
          {errors.next ? `Error: ${errors.next}` : ''}
        </p>
      </div>

      <div className="field">
        <label htmlFor={`${prefix}-repeat`}>Repetir la nueva</label>
        <input
          ref={repeatRef}
          id={`${prefix}-repeat`}
          name="repeat-password"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          aria-invalid={errors.repeat ? true : undefined}
          aria-describedby={`${prefix}-err-repeat`}
          disabled={submitting}
        />
        <p className="error-msg" id={`${prefix}-err-repeat`}>
          {errors.repeat ? `Error: ${errors.repeat}` : ''}
        </p>
      </div>

      <p className="error-msg" id={`${prefix}-err-form`}>
        {formError}
      </p>

      <div className="auth-actions">
        <button
          type="submit"
          className="plate"
          disabled={submitting}
          aria-describedby={`${prefix}-err-form`}
        >
          {submitting ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
