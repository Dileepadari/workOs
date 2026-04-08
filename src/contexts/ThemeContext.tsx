import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';
export type Font = 'sans' | 'serif' | 'mono' | 'system';

interface ThemeContextType {
  theme: Theme;
  font: Font;
  toggleTheme: () => void;
  setFont: (font: Font) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const fontFamilies: Record<Font, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"',
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('workos-theme');
    return (stored === 'light' || stored === 'dark') ? stored : 'dark';
  });

  const [font, setFontState] = useState<Font>(() => {
    const stored = localStorage.getItem('workos-font');
    return (stored as Font) || 'sans';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.style.fontFamily = fontFamilies[font];
    localStorage.setItem('workos-theme', theme);
    localStorage.setItem('workos-font', font);
  }, [theme, font]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const setFont = (newFont: Font) => {
    setFontState(newFont);
  };

  return (
    <ThemeContext.Provider value={{ theme, font, toggleTheme, setFont }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
