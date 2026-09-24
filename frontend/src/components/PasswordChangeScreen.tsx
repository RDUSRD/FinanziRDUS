import { useAnnounce } from './LiveRegion';
import { PasswordForm } from './PasswordForm';
import { SheetPin } from './SheetPin';

/**
 * Shown instead of the ledger while the bootstrap password (the one from
 * `ADMIN_PASSWORD`) is still in place: the change is not skippable, and the
 * screen disappears on its own once the new password is saved.
 */
export function PasswordChangeScreen() {
  const announce = useAnnounce();

  return (
    <div className="desk auth-screen">
      <div className="sheet">
        <span className="sheet-pin">
          <SheetPin />
        </span>

        <header className="membrete">
          <div className="brand">
            <h1 className="house">FinanciRDUS</h1>
            <span className="tag-line">Cambio de contraseña</span>
          </div>
        </header>

        <main id="main">
          <div className="sect">
            <h2 id="password-change-title">Elegí tu contraseña</h2>
          </div>

          <div className="strip">
            <p>
              Estás entrando con la contraseña de arranque, la que se configuró para
              iniciar la app. Elegí una propia para seguir: es la que va a quedar guardada,
              y con ella se cierran las otras sesiones que hubiera abiertas.
            </p>
          </div>

          <PasswordForm
            submitLabel="Guardar y entrar"
            onSuccess={() => announce('Contraseña actualizada. Ya estás dentro.')}
            onError={(message) => announce(message)}
          />
        </main>
      </div>
    </div>
  );
}
