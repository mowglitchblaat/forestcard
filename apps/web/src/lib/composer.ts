// The card composer (the bare drawing + frame + plaque + numbers → the card's two images), the very
// code of the legacy page and of atelier.html (apps/site/src/composeur.js): read as text at build,
// then run once with the two names it reads from packages/describe. One composer for every page, so
// an image made here is the image the legacy admin would make.

import { CATEGORY_STYLES, plaqueLinesExplained } from '@forestcard/describe';
import source from '../../../site/src/composeur.js?raw';

// The composer's settings (stored with the drawing on the Standard version, `compo`).
export type ComposerSettings = {
  police: string;
  style: 'pastille' | 'texte';
  taille: number;
  decal: number;
  marge: number;
  daUlt: boolean;
  lueur: boolean;
  details: boolean;
  dtaille: number;
  z: number;
  sx: number;
  sy: number;
  x: number;
  y: number;
  textes: string[] | null;
  dtextes: string[] | null;
  zones?: unknown;
};

// The card as the composer reads it: its type, stats and effects.
export type ComposerCard = {
  type: string;
  atq?: number | string | null;
  pv?: number | string | null;
  ultime?: unknown;
  passif?: unknown;
  effet?: unknown;
};

export type ComposerArgs = {
  dessin: HTMLImageElement;
  carte: ComposerCard;
  tier: string;
  o: ComposerSettings;
  chiffres?: boolean;
};

export type Composer = {
  VERSION: string;
  W: number;
  H: number;
  DEF: ComposerSettings;
  POLICES: string[];
  rendre: (ctx: CanvasRenderingContext2D, args: ComposerArgs) => Promise<void>;
  images: (args: Omit<ComposerArgs, 'chiffres'>) => Promise<{
    carte: File | null;
    combat: File | null;
    zones: unknown;
  }>;
  tierDe: (rarity: { nom?: string } | null | undefined) => string;
  lignes: (card: ComposerCard, o: Partial<ComposerSettings>) => { t: string; d?: string }[];
  dessinDe: (url: string) => Promise<HTMLImageElement | null>;
  taille: (canvas: HTMLCanvasElement) => void;
  reduire: (source: HTMLCanvasElement, canvas: HTMLCanvasElement) => void;
};

let composer: Composer | null = null;

export function getComposer(): Composer {
  if (!composer) {
    // The legacy script declares `const CPO`; it is run as a function body that returns it.
    // oxlint-disable-next-line no-new-func
    const build = new Function('lignesEcriteau', 'COULEURS_CAT', `${source}\nreturn CPO;`) as (
      lines: typeof plaqueLinesExplained,
      styles: typeof CATEGORY_STYLES,
    ) => Composer;
    composer = build(plaqueLinesExplained, CATEGORY_STYLES);
  }
  return composer;
}
