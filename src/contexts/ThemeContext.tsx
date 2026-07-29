import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { workspaces as workspacesApi } from '@/lib/api';
import { useWorkspace } from './WorkspaceContext';

// Single source of truth for all theming — merges what used to be two
// separate, unsynchronized providers (ThemeContext + ColorThemeContext).
// Light/dark mode + font are personal (localStorage). Color palette / custom
// brand color are a workspace-wide identity, persisted server-side via
// workspace_settings so every member of the team sees the same branding —
// not per-browser localStorage.

type Mode = 'light' | 'dark';
export type Font = 'sans' | 'serif' | 'mono' | 'system';
export type ColorPalette = 'common' | 'monokai' | 'github' | 'material' | 'original' | 'dracula' | 'nord' | 'solarized' | 'catppuccin' | 'custom';

const fontFamilies: Record<Font, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"',
};

export function hexToHSL(hex: string): string {
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

function withLightness(hsl: string, lightness: number, saturationScale = 1): string {
  const [h, s] = hsl.match(/[\d.]+/g)!.map(Number);
  return `${h} ${Math.min(100, Math.round(s * saturationScale))}% ${lightness}%`;
}

export const colorPalettes: Record<Exclude<ColorPalette, 'custom'>, Record<string, string>> = {
  // The default preset — matches the ADK Dev brand mark (deep violet + gold)
  // rather than a generic shadcn blue, per the actual logo colors.
  common: {
    primary: hexToHSL('#47266b'), primaryLight: hexToHSL('#ede9f5'),
    accent: hexToHSL('#b45309'), accentLight: hexToHSL('#fef3c7'),
    background: hexToHSL('#ffffff'), surface: hexToHSL('#f9fafb'),
    border: hexToHSL('#e5e7eb'), text: hexToHSL('#1f2937'), textMuted: hexToHSL('#6b7280'),
    darkPrimary: hexToHSL('#9d7cc7'), darkPrimaryLight: hexToHSL('#5b3a87'),
    darkAccent: hexToHSL('#f59e0b'), darkAccentLight: hexToHSL('#78350f'),
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

function buildCustomPalette(primaryHex: string, accentHex: string): Record<string, string> {
  const base = colorPalettes.common;
  const primary = hexToHSL(primaryHex);
  const accent = hexToHSL(accentHex);
  return {
    ...base,
    primary, primaryLight: withLightness(primary, 95, 0.5),
    accent, accentLight: withLightness(accent, 92, 0.5),
    darkPrimary: withLightness(primary, 62), darkPrimaryLight: withLightness(primary, 32),
    darkAccent: withLightness(accent, 58), darkAccentLight: withLightness(accent, 28),
  };
}

const PALETTE_IDS: ColorPalette[] = ['common', 'monokai', 'github', 'material', 'original', 'dracula', 'nord', 'solarized', 'catppuccin', 'custom'];

interface ThemeContextType {
  theme: Mode;
  toggleTheme: () => void;
  font: Font;
  setFont: (font: Font) => void;
  colorPalette: ColorPalette;
  setColorPalette: (palette: ColorPalette) => void;
  customPrimaryHex: string;
  customAccentHex: string;
  setCustomColors: (primaryHex: string, accentHex: string) => void;
  getCurrentColors: () => Record<string, string>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const DEFAULT_CUSTOM_PRIMARY = '#2563eb';
const DEFAULT_CUSTOM_ACCENT = '#22c55e';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { currentWorkspace } = useWorkspace();

  const [theme, setTheme] = useState<Mode>(() => {
    const stored = localStorage.getItem('workos-theme');
    return (stored === 'light' || stored === 'dark') ? stored : 'dark';
  });
  const [font, setFontState] = useState<Font>(() => (localStorage.getItem('workos-font') as Font) || 'sans');

  // Cached immediately from localStorage for instant paint (pre-login, or
  // before the workspace_settings fetch resolves); source of truth once a
  // workspace is loaded is the server, so every teammate sees the same brand.
  const [colorPalette, setColorPaletteState] = useState<ColorPalette>(() => {
    const stored = localStorage.getItem('workos-cached-palette');
    return PALETTE_IDS.includes(stored as ColorPalette) ? (stored as ColorPalette) : 'common';
  });
  const [customPrimaryHex, setCustomPrimaryHex] = useState(() => localStorage.getItem('workos-cached-primary-hex') || DEFAULT_CUSTOM_PRIMARY);
  const [customAccentHex, setCustomAccentHex] = useState(() => localStorage.getItem('workos-cached-accent-hex') || DEFAULT_CUSTOM_ACCENT);

  // Load the real, shared value once a workspace is available.
  useEffect(() => {
    if (!currentWorkspace) return;
    let cancelled = false;
    workspacesApi.settings.get(currentWorkspace.id).then((settings) => {
      if (cancelled || !settings) return;
      if (PALETTE_IDS.includes(settings.theme_preset as ColorPalette)) setColorPaletteState(settings.theme_preset as ColorPalette);
      if (settings.custom_primary_hex) setCustomPrimaryHex(settings.custom_primary_hex);
      if (settings.custom_accent_hex) setCustomAccentHex(settings.custom_accent_hex);
    });
    return () => { cancelled = true; };
  }, [currentWorkspace?.id]);

  const getCurrentColors = () => (colorPalette === 'custom' ? buildCustomPalette(customPrimaryHex, customAccentHex) : colorPalettes[colorPalette]);

  const applyColors = () => {
    const colors = getCurrentColors();
    const root = document.documentElement;
    const isDark = root.classList.contains('dark');
    const p = (key: string, darkKey: string) => (isDark ? colors[darkKey] : colors[key]);

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
    // Was wrongly bound to the card/surface color, which is near-white in
    // light mode — every plain Input/Select (they use border-input) ended up
    // with an almost invisible outline. Should track --border's strength.
    root.style.setProperty('--input', p('border', 'darkBorder'));
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

  // One effect owns both the dark-class toggle and the palette repaint —
  // eliminates the old MutationObserver hack that existed only because two
  // separate providers couldn't otherwise react to each other's changes.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.style.fontFamily = fontFamilies[font];
    localStorage.setItem('workos-theme', theme);
    localStorage.setItem('workos-font', font);
    applyColors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, font, colorPalette, customPrimaryHex, customAccentHex]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const setFont = (newFont: Font) => setFontState(newFont);

  const persist = (payload: Partial<{ theme_preset: string; custom_primary_hex: string; custom_accent_hex: string }>) => {
    if (currentWorkspace) workspacesApi.settings.update(currentWorkspace.id, payload).catch(() => {});
  };

  const setColorPalette = (palette: ColorPalette) => {
    setColorPaletteState(palette);
    localStorage.setItem('workos-cached-palette', palette);
    persist({ theme_preset: palette });
  };

  const setCustomColors = (primaryHex: string, accentHex: string) => {
    setColorPaletteState('custom');
    setCustomPrimaryHex(primaryHex);
    setCustomAccentHex(accentHex);
    localStorage.setItem('workos-cached-palette', 'custom');
    localStorage.setItem('workos-cached-primary-hex', primaryHex);
    localStorage.setItem('workos-cached-accent-hex', accentHex);
    persist({ theme_preset: 'custom', custom_primary_hex: primaryHex, custom_accent_hex: accentHex });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, font, setFont, colorPalette, setColorPalette, customPrimaryHex, customAccentHex, setCustomColors, getCurrentColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
