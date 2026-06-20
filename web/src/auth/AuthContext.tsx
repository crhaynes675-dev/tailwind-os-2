import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { type AuthUser, getStoredUser, signIn as doSignIn, signOut as doSignOut } from '../lib/auth';

interface AuthState {
  user: AuthUser | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());

  const signIn = useCallback(async (username: string, password: string) => {
    const u = await doSignIn(username, password);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    doSignOut();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
