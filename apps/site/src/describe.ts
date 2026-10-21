// The site's effect descriptions: the shared text (packages/describe), plus the site's icons, and the
// admin editor's lists. The built page declares these names where the legacy page declared them
// (build.ts).

import { describeCard, type DescribedCard, type Section } from '@forestcard/describe';

export { nz, fxPassif, fxEffet, fxCond, fxTrigUlt } from '@forestcard/describe';
// The card composer of the admin: the plaque's lines and the colours of the effect categories.
export {
  plaqueLinesExplained as lignesEcriteau,
  CATEGORY_STYLES as COULEURS_CAT,
} from '@forestcard/describe';
// The admin editor's lists, under the names the page uses.
export {
  EDITOR_FIELDS as P,
  EDITOR_PASSIVES as PAS,
  EDITOR_ULTIMATES as ULT,
  EDITOR_MAGICS as MAG,
  EDITOR_CONDITIONS as CON,
} from '@forestcard/describe';

// Section icons, written as escapes: the source stays emoji-free.
const ICONS: Record<Section['kind'], string> = {
  passives: '\u{1F6E1}\u{FE0F}',
  ultimate: '\u{26A1}',
  magic: '\u{2728}',
  trap: '\u{1FAA4}',
};

type CardLine = { ico: string; t: string; meta?: string; items: string[] };

export const lignesCarte = (card: DescribedCard): CardLine[] =>
  describeCard(card).map(({ kind, title, meta, items }) => ({
    ico: ICONS[kind],
    t: title,
    ...(meta === undefined ? {} : { meta }),
    items: items.map((i) => i.text),
  }));
