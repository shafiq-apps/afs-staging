'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme, ThemeMode } from './ThemeProvider';
import Button from '../ui/Button';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themes: { mode: ThemeMode; icon: typeof Sun; label: string }[] = [
    { mode: 'light', icon: Sun, label: 'Light' },
    { mode: 'dark', icon: Moon, label: 'Dark' },
    { mode: 'system', icon: Monitor, label: 'System' },
  ];

  const currentTheme = themes.find((t) => t.mode === theme) || themes[0];
  const CurrentIcon = currentTheme.icon;

  const handleClick = () => {
    const currentIndex = themes.findIndex((t) => t.mode === theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex].mode);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      icon={CurrentIcon}
      onClick={handleClick}
      title={`Current theme: ${currentTheme.label}. Click to switch.`}
      className="text-gray-700 dark:text-gray-300"
    >
      <span className="hidden sm:inline">{currentTheme.label}</span>
    </Button>
  );
}

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  const themes: { mode: ThemeMode; icon: typeof Sun; label: string }[] = [
    { mode: 'light', icon: Sun, label: 'Light' },
    { mode: 'dark', icon: Moon, label: 'Dark' },
    { mode: 'system', icon: Monitor, label: 'System' },
  ];

  return (
    <div className="flex flex-col space-y-2">
      {themes.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          onClick={() => setTheme(mode)}
          className={`
            flex items-center space-x-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${
              theme === mode
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }
            cursor-pointer
          `}
        >
          <Icon className="h-5 w-5" />
          <span>{label}</span>
          {theme === mode && (
            <span className="ml-auto text-purple-600 dark:text-purple-400">✓</span>
          )}
        </button>
      ))}
    </div>
  );
}

