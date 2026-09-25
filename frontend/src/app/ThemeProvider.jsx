import { createContext, useContext, useEffect, useMemo } from 'react';
import { usePref } from '@/lib/storage';

const ThemeContext = createContext(null);

function systemTheme() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }) {
  const [stored, setTheme] = usePref('theme', null); // null → follow OS
  const [density, setDensity] = usePref('density', 'comfortable');
  const theme = stored ?? systemTheme();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      density,
      setDensity,
    }),
    [theme, density, setTheme, setDensity],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
