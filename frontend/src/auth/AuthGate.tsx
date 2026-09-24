import { App } from '../App';
import { LoginScreen } from '../components/LoginScreen';
import { PasswordChangeScreen } from '../components/PasswordChangeScreen';
import { LoadingState } from '../components/States';
import { useAuth } from './AuthContext';

/**
 * What the app shows, which is entirely decided by the session: the login while
 * there is none, the forced password change while the bootstrap credential is
 * still in place, and the ledger once both are settled.
 */
export function AuthGate() {
  const { status, mustChangePassword } = useAuth();

  if (status === 'loading') {
    return (
      <div className="desk auth-screen">
        <div className="sheet">
          <LoadingState label="Comprobando la sesión…" />
        </div>
      </div>
    );
  }
  if (status === 'anon') return <LoginScreen />;
  if (mustChangePassword) return <PasswordChangeScreen />;
  return <App />;
}
