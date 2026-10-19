// Cards for the simulator, shaped as combat.html loads them (REEL): database rows plus the rarity
// name. The input is a JSON export of the `cartes` table with its rarities (the catalogue query, e.g.
// docs/legacy/cartes-*.json).
//
// Order matters: duel seeds and random equipment depend on each card's index. The catalogue export is
// ordered by name by the database, like the page's own query, so the file order is kept as is.

import { readFileSync } from 'node:fs';
import type { SimCard } from './winrate.ts';

type Row = Record<string, unknown> & { id: number | string; type: string; nom: string };

export type CardPools = { cartes: SimCard[]; magies: SimCard[]; pieges: SimCard[] };

export function loadCards(file: string): CardPools {
  const rows = JSON.parse(readFileSync(file, 'utf8')) as Row[];
  const all = rows.map((c): SimCard => {
    const variants =
      (c['variantes_carte'] as
        | { nom?: string; image_path?: string; image_combat?: string }[]
        | null) || [];
    const v = variants.find((x) => x.nom === 'Standard') || variants[0] || {};
    const rarities = c['raretes'] as { nom?: string } | { nom?: string }[] | null;
    const rarity = Array.isArray(rarities) ? rarities[0] : rarities;
    return {
      rarete: (rarity && rarity.nom) || '—',
      rar: rarity || null,
      id: c.id,
      type: c.type,
      nom: c.nom,
      atq: c['atq'] as SimCard['atq'],
      pv: c['pv'] as SimCard['pv'],
      passif: c['passif'] as SimCard['passif'],
      ultime: c['ultime'] as SimCard['ultime'],
      effet: c['effet'] as SimCard['effet'],
      image: v.image_path || null,
      imageCombat: v.image_combat || null,
    };
  });
  return {
    cartes: all.filter((c) => c.type === 'combattant'),
    magies: all.filter((c) => c.type === 'magie'),
    pieges: all.filter((c) => c.type === 'piege'),
  };
}
