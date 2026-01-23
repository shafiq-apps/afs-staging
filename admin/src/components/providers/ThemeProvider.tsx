'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useState, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'admin-theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return (stored as ThemeMode) || 'system';
}

function resolveTheme(theme: ThemeMode): ResolvedTheme {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: ThemeMode;
}

export function ThemeProvider({ children, defaultTheme = 'system' }: ThemeProviderProps) {
  // Initialize theme state immediately from localStorage or default
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      return getStoredTheme();
    }
    return defaultTheme;
  });

  // Initialize resolved theme immediately
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof window !== 'undefined') {
      const stored = getStoredTheme();
      return resolveTheme(stored);
    }
    return 'light'; // Default for SSR
  });

  const [mounted, setMounted] = useState(false);

  // Apply theme to DOM synchronously before browser paint (prevents flash)
  useLayoutEffect(() => {
    setMounted(true);
    
    // Get current theme from storage
    const initialTheme = typeof window !== 'undefined' ? getStoredTheme() : defaultTheme;
    const initialResolved = resolveTheme(initialTheme);
    
    // Update state
    setThemeState(initialTheme);
    setResolvedTheme(initialResolved);
    
    // Apply to DOM immediately - useLayoutEffect runs synchronously before paint
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    
    if (initialResolved === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.add('light');
    }
  }, [defaultTheme]);

  // Update resolved theme when theme changes
  useEffect(() => {
    if (!mounted) return;
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
  }, [theme, mounted]);

  // Apply theme to document whenever resolvedTheme changes
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    
    root.classList.remove('light', 'dark');
    
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.add('light');
    }
  }, [resolvedTheme, mounted]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setResolvedTheme(getSystemTheme());
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    // Fallback for older browsers
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    }
  };

  const toggleTheme = () => {
    const themes: ThemeMode[] = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

