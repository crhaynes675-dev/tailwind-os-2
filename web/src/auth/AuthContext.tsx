import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import {
  type AuthUser,
  getStoredUser,
  getRefreshToken,
  refreshSession,
  signIn as doSignIn,
  signOut as doSignOut,
} from '../lib/auth';

interface AuthState {
  user: AuthUser | null;
  /** True while a stored session is being restored — render neither app nor Login. */
  restoring: boolean;
  signIn: (username: string, password: string, companyCode?: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  // On a cold load the ID token may have expired while the tab was closed.
  // A refresh token means the session is probably still alive, so hold the
  // Login screen back until we've tried to renew it.
  const [restoring, setRestoring] = useState(() => !getStoredUser() && !!getRefreshToken());

  useEffect(() => {
    if (!restoring) return;
    let alive = true;
    refreshSession()
      .then((ok) => {
        if (!alive) return;
        if (ok) setUser(getStoredUser());
        else doSignOut(); // refresh token is dead too — clear it and show Login
      })
      .finally(() => {
        if (alive) setRestoring(false);
      });
    return () => {
      alive = false;
    };
  }, [restoring]);

  // The API layer dispatches this when a token is missing/expired/rejected.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('os3-unauthorized', onUnauthorized);
    return () => window.removeEventListener('os3-unauthorized', onUnauthorized);
  }, []);

  const signIn = useCallback(async (username: string, password: string, companyCode?: string) => {
    const u = await doSignIn(username, password, companyCode);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    doSignOut();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, restoring, signIn, signOut }}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
