import { ICONS, type LucideIcon } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type Palette, type Theme, useTheme } from '@/lib/theme';

const CHOICES: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Clair', icon: ICONS.themeLight },
  { value: 'dark', label: 'Sombre', icon: ICONS.themeDark },
  { value: 'system', label: 'Système', icon: ICONS.themeSystem },
];

const PALETTES: { value: Palette; label: string }[] = [
  { value: 'forest', label: 'Forest Card' },
  { value: 'base', label: 'Sobre' },
];

export function ThemeToggle() {
  const { theme, setTheme, palette, setPalette } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Thème">
          <ICONS.themeLight className="dark:hidden" />
          <ICONS.themeDark className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Mode</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          {CHOICES.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Couleurs</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={palette} onValueChange={(v) => setPalette(v as Palette)}>
          {PALETTES.map(({ value, label }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
