import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth as authApi } from '@/lib/api';
import { getToken, setToken, clearToken, decodeToken } from '@/lib/authToken';

// Custom username/password + JWT auth (see supabase/functions/workos) — no
// Supabase Auth/GoTrue anywhere, since this app is headed for a self-hosted
// Supabase instance with no Auth service. `email` stays optional on the user
// object since not every account has one set.

interface AuthUser {
  id: string;
  username: string;
  email?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (username: string, password: string, displayName?: string, email?: string) => Promise<{ error: Error | null }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      const payload = decodeToken(token);
      if (payload) {
        setUser({ id: payload.sub, username: payload.username });
      } else {
        clearToken();
      }
    }
    setLoading(false);
  }, []);

  const signIn = async (username: string, password: string) => {
    try {
      const { token, user: apiUser } = await authApi.login(username, password);
      setToken(token);
      setUser({ id: apiUser.id, username: apiUser.username });
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signUp = async (username: string, password: string, displayName?: string, email?: string) => {
    try {
      const { token, user: apiUser } = await authApi.signup(username, password, displayName, email);
      setToken(token);
      setUser({ id: apiUser.id, username: apiUser.username, email });
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
