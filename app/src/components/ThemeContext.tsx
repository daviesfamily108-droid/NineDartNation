import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
  theme: 'default',
  setTheme: (t: string) => {},
});

const THEME_KEY = 'ndn_theme'

export function ThemeProvider({ children }: { children: any }) {
  const [theme, setTheme] = useState('default');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved) setTheme(saved)
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme) } catch {}
  }, [theme])
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className={`theme-${theme}`}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
