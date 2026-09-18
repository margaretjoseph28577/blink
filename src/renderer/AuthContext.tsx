import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionUser } from '../shared/types';
import { call } from './api/client';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setUser(await call('auth:getSession'));
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const u = await call('auth:login', { username, password });
    setUser(u);
    return u;
  };

  const logout = async () => {
    await call('auth:logout');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
