import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '@shared/schema';
import { authApi } from './api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, verify the session with the server rather than trusting localStorage alone.
  // If the server says there's no valid session the user is treated as logged out.
  useEffect(() => {
    authApi.me().then(serverUser => {
      if (serverUser) {
        setUser(serverUser);
        localStorage.setItem('factory_user', JSON.stringify(serverUser));
      } else {
        setUser(null);
        localStorage.removeItem('factory_user');
      }
    }).catch(() => {
      // Network error on startup — fall back to cached user so the UI isn't
      // broken if the server is momentarily unavailable.
      const stored = localStorage.getItem('factory_user');
      if (stored) {
        try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem('factory_user'); }
      }
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  // Keep localStorage in sync as a fallback cache (see catch block above).
  useEffect(() => {
    if (user) {
      localStorage.setItem('factory_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('factory_user');
    }
  }, [user]);

  const logout = async () => {
    await authApi.logout().catch(() => {});
    setUser(null);
    localStorage.removeItem('factory_user');
  };

  const hasRole = (role: string): boolean => {
    if (!user) return false;
    const roles: string[] = (user as any).roles || [];
    return roles.includes(role);
  };

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
