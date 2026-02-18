'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User } from '@/types/auth';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  refreshUser: () => Promise<User | null>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  initialUser?: User | null;
}

interface MeResponse {
  user?: User;
  error?: string;
}

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUserState] = useState<User | null>(initialUser);
  const [isLoading, setIsLoading] = useState<boolean>(!initialUser);
  const [error, setError] = useState<string | null>(null);

  const loadCurrentUser = useCallback(async (): Promise<User | null> => {
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        setUserState(null);
        setError(response.status === 401 ? 'Not authenticated' : 'Failed to load current user');
        return null;
      }

      const data = (await response.json()) as MeResponse;
      const nextUser = data?.user || null;

      setUserState(nextUser);
      setError(null);
      return nextUser;
    } catch (requestError: unknown) {
      setUserState(null);
      setError(requestError instanceof Error ? requestError.message : 'Failed to load current user');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialUser) {
      setUserState(initialUser);
      setIsLoading(false);
      setError(null);
      return;
    }

    void loadCurrentUser();
  }, [initialUser, loadCurrentUser]);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    setIsLoading(true);
    return loadCurrentUser();
  }, [loadCurrentUser]);

  const setUser = useCallback((nextUser: User | null) => {
    setUserState(nextUser);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      error,
      refreshUser,
      setUser,
    }),
    [error, isLoading, refreshUser, setUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

