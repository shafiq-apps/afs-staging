'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from './Navbar';
import AnimatedBackground from './AnimatedBackground';
import { User } from '@/types/auth';
import { LoadingBar } from '@/components/ui/LoadingBar';

interface LayoutProps {
  children: React.ReactNode;
}

const USER_CACHE_KEY = 'admin_auth_user_cache';

let cachedUser: User | null = null;
let hasResolvedAuth = false;
let inFlightAuthRequest: Promise<User | null> | null = null;

const parseCachedUser = (raw: string | null): User | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as User;
    if (
      parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.email === 'string' &&
      typeof parsed.name === 'string' &&
      typeof parsed.role === 'string'
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
};

const readPersistedUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  return parseCachedUser(window.sessionStorage.getItem(USER_CACHE_KEY));
};

const persistUser = (user: User | null): void => {
  if (typeof window === 'undefined') return;

  if (!user) {
    window.sessionStorage.removeItem(USER_CACHE_KEY);
    return;
  }

  window.sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
};

const fetchCurrentUser = async (): Promise<User | null> => {
  const response = await fetch('/api/auth/me', { cache: 'no-store' });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return (data?.user as User) ?? null;
};

const getCurrentUser = async (): Promise<User | null> => {
  if (inFlightAuthRequest) {
    return inFlightAuthRequest;
  }

  inFlightAuthRequest = fetchCurrentUser()
    .catch(() => null)
    .finally(() => {
      inFlightAuthRequest = null;
    });

  return inFlightAuthRequest;
};

export default function Layout({ children }: LayoutProps) {
  const initialUser = cachedUser ?? readPersistedUser();
  const initialUserRef = useRef<User | null>(initialUser);

  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState<boolean>(() => !initialUser && !hasResolvedAuth);
  const router = useRouter();

  const checkAuth = useCallback(async (): Promise<void> => {
    try {
      if (!cachedUser && !hasResolvedAuth) {
        setLoading(true);
      }

      const nextUser = await getCurrentUser();

      hasResolvedAuth = true;
      cachedUser = nextUser;
      persistUser(nextUser);

      if (!nextUser) {
        setUser(null);
        setLoading(false);
        router.replace('/login');
        return;
      }

      setUser(nextUser);
      setLoading(false);
    } catch {
      hasResolvedAuth = true;
      cachedUser = null;
      persistUser(null);
      setUser(null);
      setLoading(false);
      router.replace('/login');
    }
  }, [router]);

  useEffect(() => {
    if (initialUserRef.current && !cachedUser) {
      cachedUser = initialUserRef.current;
    }

    const timer = setTimeout(() => {
      void checkAuth();
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [checkAuth]);

  if (loading) {
    return (
      <>
        <LoadingBar loading={true} />
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950 relative transition-colors duration-200">
          <AnimatedBackground />
          <Navbar user={user} />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
            <div className="flex justify-center items-center h-64">
              <div className="text-gray-500 dark:text-gray-400">Loading...</div>
            </div>
          </main>
        </div>
      </>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 relative transition-colors duration-200">
        <AnimatedBackground />
        <Navbar user={user} />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
          {children}
        </main>
      </div>
    </>
  );
}

