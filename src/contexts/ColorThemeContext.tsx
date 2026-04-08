import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ColorPalette = 'common' | 'monokai' | 'github' | 'material' | 'original' | 'dracula' | 'nord' | 'solarized' | 'catppuccin';

function hexToHSL(hex: string): string {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export const colorPalettes: Record<ColorPalette, Record<string, string>> = {
  common: {
    primary: hexToHSL('#2563eb'), primaryLight: hexToHSL('#dbeafe'),
    accent: hexToHSL('#22c55e'), accentLight: hexToHSL('#dcfce7'),
    background: hexToHSL('#ffffff'), surface: hexToHSL('#f9fafb'),
    border: hexToHSL('#e5e7eb'), text: hexToHSL('#1f2937'), textMuted: hexToHSL('#6b7280'),
    darkPrimary: hexToHSL('#3b82f6'), darkPrimaryLight: hexToHSL('#1e40af'),
    darkAccent: hexToHSL('#4ade80'), darkAccentLight: hexToHSL('#15803d'),
    darkBackground: hexToHSL('#0f172a'), darkSurface: hexToHSL('#1e293b'),
    darkBorder: hexToHSL('#334155'), darkText: hexToHSL('#f8fafc'), darkTextMuted: hexToHSL('#94a3b8'),
    destructive: hexToHSL('#dc2626'), destructiveLight: hexToHSL('#fee2e2'),
    success: hexToHSL('#16a34a'), successLight: hexToHSL('#dcfce7'),
    warning: hexToHSL('#ea580c'), warningLight: hexToHSL('#ffedd5'),
    info: hexToHSL('#0284c7'), infoLight: hexToHSL('#e0f2fe'),
  },
  monokai: {
    primary: hexToHSL('#f92672'), primaryLight: hexToHSL('#fce7f3'),
    accent: hexToHSL('#a6e22e'), accentLight: hexToHSL('#f0fde8'),
    background: hexToHSL('#fffaf3'), surface: hexToHSL('#fdf7f0'),
    border: hexToHSL('#f5e6d3'), text: hexToHSL('#272822'), textMuted: hexToHSL('#75715e'),
    darkPrimary: hexToHSL('#ff006e'), darkPrimaryLight: hexToHSL('#d7006b'),
    darkAccent: hexToHSL('#b6e946'), darkAccentLight: hexToHSL('#9bd336'),
    darkBackground: hexToHSL('#18181b'), darkSurface: hexToHSL('#25252f'),
    darkBorder: hexToHSL('#444452'), darkText: hexToHSL('#f8f8f2'), darkTextMuted: hexToHSL('#a6acaf'),
    destructive: hexToHSL('#ff5555'), destructiveLight: hexToHSL('#ffe0e0'),
    success: hexToHSL('#50fa7b'), successLight: hexToHSL('#e0ffe0'),
    warning: hexToHSL('#ffb86c'), warningLight: hexToHSL('#ffe0cc'),
    info: hexToHSL('#8be9fd'), infoLight: hexToHSL('#e0f7ff'),
  },
  github: {
    primary: hexToHSL('#0969da'), primaryLight: hexToHSL('#ddf4ff'),
    accent: hexToHSL('#fb8500'), accentLight: hexToHSL('#fff0e0'),
    background: hexToHSL('#ffffff'), surface: hexToHSL('#f6f8fa'),
    border: hexToHSL('#d0d7de'), text: hexToHSL('#24292f'), textMuted: hexToHSL('#57606a'),
    darkPrimary: hexToHSL('#58a6ff'), darkPrimaryLight: hexToHSL('#1f6feb'),
    darkAccent: hexToHSL('#fb8500'), darkAccentLight: hexToHSL('#d96e06'),
    darkBackground: hexToHSL('#0d1117'), darkSurface: hexToHSL('#161b22'),
    darkBorder: hexToHSL('#30363d'), darkText: hexToHSL('#c9d1d9'), darkTextMuted: hexToHSL('#8b949e'),
    destructive: hexToHSL('#da3633'), destructiveLight: hexToHSL('#ffebe6'),
    success: hexToHSL('#1a7f34'), successLight: hexToHSL('#dafbe1'),
    warning: hexToHSL('#d4a574'), warningLight: hexToHSL('#fff8e6'),
    info: hexToHSL('#0969da'), infoLight: hexToHSL('#ddf4ff'),
  },
  material: {
    primary: hexToHSL('#6200ee'), primaryLight: hexToHSL('#ede7f6'),
    accent: hexToHSL('#03dac6'), accentLight: hexToHSL('#e0f2f1'),
    background: hexToHSL('#ffffff'), surface: hexToHSL('#f5f5f5'),
    border: hexToHSL('#e0e0e0'), text: hexToHSL('#212121'), textMuted: hexToHSL('#757575'),
    darkPrimary: hexToHSL('#bb86fc'), darkPrimaryLight: hexToHSL('#6a1b9a'),
    darkAccent: hexToHSL('#03dac6'), darkAccentLight: hexToHSL('#018786'),
    darkBackground: hexToHSL('#121212'), darkSurface: hexToHSL('#1e1e1e'),
    darkBorder: hexToHSL('#302f31'), darkText: hexToHSL('#ffffff'), darkTextMuted: hexToHSL('#b3b3b3'),
    destructive: hexToHSL('#cf6679'), destructiveLight: hexToHSL('#fce4ec'),
    success: hexToHSL('#4caf50'), successLight: hexToHSL('#e8f5e9'),
    warning: hexToHSL('#ff9800'), warningLight: hexToHSL('#fff3e0'),
    info: hexToHSL('#2196f3'), infoLight: hexToHSL('#e3f2fd'),
  },
  original: {
    primary: hexToHSL('#3b82f6'), primaryLight: hexToHSL('#dbeafe'),
    accent: hexToHSL('#f59e42'), accentLight: hexToHSL('#fef3c7'),
    background: hexToHSL('#ffffff'), surface: hexToHSL('#f7f7fa'),
    border: hexToHSL('#e5e7eb'), text: hexToHSL('#1f2937'), textMuted: hexToHSL('#6b7280'),
    darkPrimary: hexToHSL('#2563eb'), darkPrimaryLight: hexToHSL('#1e40af'),
    darkAccent: hexToHSL('#f59e0b'), darkAccentLight: hexToHSL('#d97706'),
    darkBackground: hexToHSL('#0f172a'), darkSurface: hexToHSL('#1e293b'),
    darkBorder: hexToHSL('#334155'), darkText: hexToHSL('#f8fafc'), darkTextMuted: hexToHSL('#94a3b8'),
    destructive: hexToHSL('#ef4444'), destructiveLight: hexToHSL('#fee2e2'),
    success: hexToHSL('#10b981'), successLight: hexToHSL('#d1fae5'),
    warning: hexToHSL('#f59e0b'), warningLight: hexToHSL('#fef3c7'),
    info: hexToHSL('#06b6d4'), infoLight: hexToHSL('#cffafe'),
  },
  dracula: {
    primary: hexToHSL('#bd93f9'), primaryLight: hexToHSL('#e8daf6'),
    accent: hexToHSL('#50fa7b'), accentLight: hexToHSL('#d0fce0'),
    background: hexToHSL('#f8f8f2'), surface: hexToHSL('#f0f0ec'),
    border: hexToHSL('#d6d6d0'), text: hexToHSL('#282a36'), textMuted: hexToHSL('#6272a4'),
    darkPrimary: hexToHSL('#bd93f9'), darkPrimaryLight: hexToHSL('#6e42a8'),
    darkAccent: hexToHSL('#50fa7b'), darkAccentLight: hexToHSL('#28a745'),
    darkBackground: hexToHSL('#282a36'), darkSurface: hexToHSL('#343746'),
    darkBorder: hexToHSL('#44475a'), darkText: hexToHSL('#f8f8f2'), darkTextMuted: hexToHSL('#6272a4'),
    destructive: hexToHSL('#ff5555'), destructiveLight: hexToHSL('#ffe0e0'),
    success: hexToHSL('#50fa7b'), successLight: hexToHSL('#d0fce0'),
    warning: hexToHSL('#f1fa8c'), warningLight: hexToHSL('#fefce8'),
    info: hexToHSL('#8be9fd'), infoLight: hexToHSL('#e0f7ff'),
  },
  nord: {
    primary: hexToHSL('#5e81ac'), primaryLight: hexToHSL('#d8dee9'),
    accent: hexToHSL('#88c0d0'), accentLight: hexToHSL('#e5f0f3'),
    background: hexToHSL('#eceff4'), surface: hexToHSL('#e5e9f0'),
    border: hexToHSL('#d8dee9'), text: hexToHSL('#2e3440'), textMuted: hexToHSL('#4c566a'),
    darkPrimary: hexToHSL('#81a1c1'), darkPrimaryLight: hexToHSL('#5e81ac'),
    darkAccent: hexToHSL('#88c0d0'), darkAccentLight: hexToHSL('#6ba3b3'),
    darkBackground: hexToHSL('#2e3440'), darkSurface: hexToHSL('#3b4252'),
    darkBorder: hexToHSL('#434c5e'), darkText: hexToHSL('#eceff4'), darkTextMuted: hexToHSL('#d8dee9'),
    destructive: hexToHSL('#bf616a'), destructiveLight: hexToHSL('#f5d6d9'),
    success: hexToHSL('#a3be8c'), successLight: hexToHSL('#e4eede'),
    warning: hexToHSL('#ebcb8b'), warningLight: hexToHSL('#fdf5e3'),
    info: hexToHSL('#5e81ac'), infoLight: hexToHSL('#dce3ec'),
  },
  solarized: {
    primary: hexToHSL('#268bd2'), primaryLight: hexToHSL('#d7e7f2'),
    accent: hexToHSL('#2aa198'), accentLight: hexToHSL('#d0ece9'),
    background: hexToHSL('#fdf6e3'), surface: hexToHSL('#eee8d5'),
    border: hexToHSL('#dcd4be'), text: hexToHSL('#073642'), textMuted: hexToHSL('#586e75'),
    darkPrimary: hexToHSL('#268bd2'), darkPrimaryLight: hexToHSL('#1a6099'),
    darkAccent: hexToHSL('#2aa198'), darkAccentLight: hexToHSL('#1c7069'),
    darkBackground: hexToHSL('#002b36'), darkSurface: hexToHSL('#073642'),
    darkBorder: hexToHSL('#586e75'), darkText: hexToHSL('#fdf6e3'), darkTextMuted: hexToHSL('#93a1a1'),
    destructive: hexToHSL('#dc322f'), destructiveLight: hexToHSL('#f8d7d6'),
    success: hexToHSL('#859900'), successLight: hexToHSL('#e3eab8'),
    warning: hexToHSL('#b58900'), warningLight: hexToHSL('#f5ebb8'),
    info: hexToHSL('#268bd2'), infoLight: hexToHSL('#d7e7f2'),
  },
  catppuccin: {
    primary: hexToHSL('#8839ef'), primaryLight: hexToHSL('#e8d5fc'),
    accent: hexToHSL('#179299'), accentLight: hexToHSL('#d0ecee'),
    background: hexToHSL('#eff1f5'), surface: hexToHSL('#e6e9ef'),
    border: hexToHSL('#ccd0da'), text: hexToHSL('#4c4f69'), textMuted: hexToHSL('#6c6f85'),
    darkPrimary: hexToHSL('#cba6f7'), darkPrimaryLight: hexToHSL('#8839ef'),
    darkAccent: hexToHSL('#94e2d5'), darkAccentLight: hexToHSL('#179299'),
    darkBackground: hexToHSL('#1e1e2e'), darkSurface: hexToHSL('#313244'),
    darkBorder: hexToHSL('#45475a'), darkText: hexToHSL('#cdd6f4'), darkTextMuted: hexToHSL('#a6adc8'),
    destructive: hexToHSL('#f38ba8'), destructiveLight: hexToHSL('#fce4ec'),
    success: hexToHSL('#a6e3a1'), successLight: hexToHSL('#e8f5e9'),
    warning: hexToHSL('#f9e2af'), warningLight: hexToHSL('#fef9ef'),
    info: hexToHSL('#89b4fa'), infoLight: hexToHSL('#e3edf9'),
  },
};

interface ColorThemeContextType {
  colorPalette: ColorPalette;
  setColorPalette: (palette: ColorPalette) => void;
  getCurrentColors: () => Record<string, string>;
}

const ColorThemeContext = createContext<ColorThemeContextType | undefined>(undefined);

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const [colorPalette, setColorPaletteState] = useState<ColorPalette>(() => {
    const stored = localStorage.getItem('workos-color-palette');
    const validPalettes: ColorPalette[] = ['common', 'monokai', 'github', 'material', 'original', 'dracula', 'nord', 'solarized', 'catppuccin'];
    return (validPalettes.includes(stored as ColorPalette) ? (stored as ColorPalette) : 'common');
  });

  const applyColors = () => {
    const colors = colorPalettes[colorPalette];
    if (!colors) return;
    const root = document.documentElement;
    const isDark = root.classList.contains('dark');
    
    const p = (key: string, darkKey: string) => isDark ? colors[darkKey] : colors[key];
    
    root.style.setProperty('--primary', p('primary', 'darkPrimary'));
    root.style.setProperty('--primary-foreground', '0 0% 100%');
    root.style.setProperty('--primary-light', p('primaryLight', 'darkPrimaryLight'));
    root.style.setProperty('--accent', p('accent', 'darkAccent'));
    root.style.setProperty('--accent-foreground', isDark ? '0 0% 10%' : '0 0% 100%');
    root.style.setProperty('--accent-light', p('accentLight', 'darkAccentLight'));
    root.style.setProperty('--background', p('background', 'darkBackground'));
    root.style.setProperty('--foreground', p('text', 'darkText'));
    root.style.setProperty('--card', p('surface', 'darkSurface'));
    root.style.setProperty('--card-foreground', p('text', 'darkText'));
    root.style.setProperty('--popover', p('surface', 'darkSurface'));
    root.style.setProperty('--popover-foreground', p('text', 'darkText'));
    root.style.setProperty('--secondary', p('surface', 'darkSurface'));
    root.style.setProperty('--secondary-foreground', p('text', 'darkText'));
    root.style.setProperty('--muted', p('surface', 'darkSurface'));
    root.style.setProperty('--muted-foreground', p('textMuted', 'darkTextMuted'));
    root.style.setProperty('--border', p('border', 'darkBorder'));
    root.style.setProperty('--input', p('surface', 'darkSurface'));
    root.style.setProperty('--ring', p('primary', 'darkPrimary'));
    root.style.setProperty('--destructive', colors.destructive);
    root.style.setProperty('--destructive-foreground', '0 0% 100%');
    root.style.setProperty('--destructive-light', colors.destructiveLight);
    root.style.setProperty('--success', colors.success);
    root.style.setProperty('--success-light', colors.successLight);
    root.style.setProperty('--warning', colors.warning);
    root.style.setProperty('--warning-light', colors.warningLight);
    root.style.setProperty('--info', colors.info);
    root.style.setProperty('--info-light', colors.infoLight);
    root.style.setProperty('--sidebar-background', p('background', 'darkBackground'));
    root.style.setProperty('--sidebar-foreground', p('text', 'darkText'));
    root.style.setProperty('--sidebar-primary', p('primary', 'darkPrimary'));
    root.style.setProperty('--sidebar-primary-foreground', '0 0% 100%');
    root.style.setProperty('--sidebar-accent', p('surface', 'darkSurface'));
    root.style.setProperty('--sidebar-accent-foreground', p('text', 'darkText'));
    root.style.setProperty('--sidebar-border', p('border', 'darkBorder'));
    root.style.setProperty('--sidebar-ring', p('primary', 'darkPrimary'));
  };

  useEffect(() => {
    applyColors();
    localStorage.setItem('workos-color-palette', colorPalette);
  }, [colorPalette]);

  useEffect(() => {
    const observer = new MutationObserver(() => applyColors());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [colorPalette]);

  const setColorPalette = (palette: ColorPalette) => setColorPaletteState(palette);
  const getCurrentColors = () => colorPalettes[colorPalette];

  return (
    <ColorThemeContext.Provider value={{ colorPalette, setColorPalette, getCurrentColors }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme() {
  const context = useContext(ColorThemeContext);
  if (!context) throw new Error('useColorTheme must be used within ColorThemeProvider');
  return context;
}
