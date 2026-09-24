import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { readableError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useAnnounce } from './LiveRegion';
import { SheetPin } from './SheetPin';

interface FieldErrors {
  username?: string;
  password?: string;
}

/**
 * The way in. The app has a single administrator, so this is two fields and a
 * plate, on the same sheet as the ledger: no sign-up, no recovery by email.
 */
export function LoginScreen() {
  const { login } = useAuth();
  const announce = useAnnounce();
  const prefix = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // This screen is the only thing on the page: the first field takes the focus.
  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  /** Paint the form-level error and voice it through the app's live region. */
  function showFormError(message: string) {
    setFormError(message);
    announce(message);
  }

  function validate(): { errors: FieldErrors; value: { username: string; password: string } | null } {
    const found: FieldErrors = {};
    const cleanUsername = username.trim();
    if (!cleanUsername) found.username = 'Escribí tu usuario.';
    if (!password) found.password = 'Escribí tu contraseña.';
    setErrors(found);
    if (found.username || found.password) return { errors: found, value: null };
    return { errors: found, value: { username: cleanUsername, password } };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate();
    if (!result.value) {
      showFormError('Revisá los campos marcados.');
      if (result.errors.username) usernameRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    setFormError('');
    setSubmitting(true);
    try {
      await login(result.value.username, result.value.password);
    } catch (error) {
      showFormError(readableError(error));
      // Never keep a rejected password in the field: the next try is a new one.
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="desk auth-screen">
      <div className="sheet">
        <span className="sheet-pin">
          <SheetPin />
        </span>

        <header className="membrete">
          <div className="brand">
            <h1 className="house">FinanciRDUS</h1>
            <span className="tag-line">Cuentas de la casa · cartera en dólares</span>
          </div>
        </header>

        <main id="main">
          <div className="sect">
            <h2 id={`${prefix}-title`}>Entrar</h2>
          </div>

          <form
            className="auth-body"
            aria-labelledby={`${prefix}-title`}
            noValidate
            onSubmit={handleSubmit}
          >
            <div className="field">
              <label htmlFor={`${prefix}-username`}>Usuario</label>
              <input
                ref={usernameRef}
                id={`${prefix}-username`}
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                aria-invalid={errors.username ? true : undefined}
                aria-describedby={`${prefix}-err-username`}
                disabled={submitting}
              />
              <p className="error-msg" id={`${prefix}-err-username`}>
                {errors.username ? `Error: ${errors.username}` : ''}
              </p>
            </div>

            <div className="field">
              <label htmlFor={`${prefix}-password`}>Contraseña</label>
              <input
                ref={passwordRef}
                id={`${prefix}-password`}
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={`${prefix}-err-password`}
                disabled={submitting}
              />
              <p className="error-msg" id={`${prefix}-err-password`}>
                {errors.password ? `Error: ${errors.password}` : ''}
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
                {submitting ? 'Entrando…' : 'Entrar'}
              </button>
            </div>

            <p className="hint">
              La app es de un solo usuario: se entra con la credencial que configuraste.
            </p>
          </form>
        </main>
      </div>
    </div>
  );
}
