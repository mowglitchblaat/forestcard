// Every mark a combat lays on a card, and how it shows (docs/plans/overlay-3d.md, "État posé"). A kind
// without its entry here does not compile.

import { blades } from './blades.ts';
import { charges } from './charges.ts';
import type { MarkFxDef } from './define.ts';
import { execution } from './execution.ts';
import { forge } from './forge.ts';
import { guard } from './guard.ts';
import { links } from './links.ts';
import { programmed, programmedUltimate } from './programmed.ts';
import { shield } from './shield.ts';
import { swallow } from './swallow.ts';
import { target } from './target.ts';
import { threads } from './threads.ts';

export type MarkKind =
  | 'execution'
  | 'swallow'
  | 'programmed'
  | 'programmedUltimate'
  | 'threads'
  | 'links'
  | 'shield'
  | 'target'
  | 'guard'
  | 'forge'
  | 'blades'
  | 'charges';

export const MARK_FX: Readonly<Record<MarkKind, MarkFxDef>> = {
  execution,
  swallow,
  programmed,
  programmedUltimate,
  threads,
  links,
  shield,
  target,
  guard,
  forge,
  blades,
  charges,
};

// The name of each mark, as the bench says it.
export const MARK_LABELS: Readonly<Record<MarkKind, string>> = {
  execution: "Marques d'exécution",
  swallow: "Marques d'avalage",
  programmed: 'Passifs programmés',
  programmedUltimate: 'Ultime programmé',
  threads: 'Fils',
  links: 'Liens parasitaires',
  shield: 'Bouclier',
  target: 'Ciblage',
  guard: 'Garde',
  forge: 'Forge',
  blades: 'Lames',
  charges: 'Charges',
};
