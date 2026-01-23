// Theme initialization script - prevents flash of wrong theme
(function() {
  const THEME_STORAGE_KEY = 'admin-theme';
  
  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  function getStoredTheme() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored || 'system';
  }
  
  function resolveTheme(theme) {
    if (theme === 'system') {
      return getSystemTheme();
    }
    return theme;
  }
  
  const theme = getStoredTheme();
  const resolvedTheme = resolveTheme(theme);
  const root = document.documentElement;
  
  root.classList.remove('light', 'dark');
  root.classList.add(resolvedTheme);
})();

