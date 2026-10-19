// Theme, on two independent axes, each kept in localStorage and applied on <html>, which the shadcn
// theme variables follow (index.css):
//   - the mode (light, dark, or the system's): the `dark` class;
//   - the palette (Forest Card, the default, or the base one): the `data-palette` attribute.
// index.html applies both before the first paint, so the page never flashes the wrong theme.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export const THEME_STORAGE_KEY = 'forestcard-theme';
export type Palette = 'forest' | 'base';
export const PALETTE_STORAGE_KEY = 'forestcard-palette';
export const DEFAULT_PALETTE: Palette = 'forest';

const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark' || v === 'system';
const isPalette = (v: unknown): v is Palette => v === 'forest' || v === 'base';
const SYSTEM_DARK = '(prefers-color-scheme: dark)';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  palette: Palette;
  setPalette: (p: Palette) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  });
  const [palette, setPaletteState] = useState<Palette>(() => {
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
    return isPalette(stored) ? stored : DEFAULT_PALETTE;
  });

  useEffect(() => {
    const media = matchMedia(SYSTEM_DARK);
    const apply = () =>
      document.documentElement.classList.toggle(
        'dark',
        theme === 'dark' || (theme === 'system' && media.matches),
      );
    apply();
    // Following the system: switch when the system does.
    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset['palette'] = palette;
  }, [palette]);

  const setTheme = (t: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, t);
    setThemeState(t);
  };
  const setPalette = (p: Palette) => {
    localStorage.setItem(PALETTE_STORAGE_KEY, p);
    setPaletteState(p);
  };
  return <ThemeContext value={{ theme, setTheme, palette, setPalette }}>{children}</ThemeContext>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
