import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { session } from '@/lib/session';
import type { SessionUser } from '@completeos/auth-client';

// WorkOS no longer keeps its own token: sign-in is the ecosystem's single
// sign-on. The surface here is unchanged - useAuth() still gives the current
// user and the sign in / up / out verbs - but it is backed by the shared
// session, so arriving already signed in from another app lands here signed in.

interface AuthUser {
  id: string;
  username: string;
  email?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    username: string,
    password: string,
    displayName?: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toUser(u: SessionUser): AuthUser {
  return { id: u.id, username: u.username, email: u.email };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    session.init()
      .then((s) => setUser(s.status === 'authenticated' ? toUser(s.user) : null))
      .finally(() => setLoading(false));
    return session.subscribe((s) => {
      if (s.status === 'anonymous') setUser(null);
      else if (s.status === 'authenticated') setUser(toUser(s.user));
    });
  }, []);

  const signIn = async (identifier: string, password: string) => {
    try {
      const u = await session.login(identifier, password);
      setUser(toUser(u));
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signUp = async (email: string, username: string, password: string, displayName?: string) => {
    try {
      const u = await session.signup({ email, username, password, display_name: displayName });
      setUser(toUser(u));
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = () => {
    void session.logout();
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
