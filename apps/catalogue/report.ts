// Writes docs/rapports/phase-4b-catalogue-avant-apres.md: for every real card, the catalogue text
// before phase 4b (legacy code, run as is) and after (the built page, shared text). For the author's
// review. Run after the build: `node report.ts` from apps/catalogue.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const ROOT = resolve(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
const LEGACY = read('legacy', 'catalogue.html');
const BUILT = read('apps', 'catalogue', 'dist', 'catalogue.html');

type Card = Record<string, unknown> & { id: number; nom: string; type: string };

// Legacy: the description block plus the legacy sections computation of cardHTML.
const legacyBlock = LEGACY.slice(
  LEGACY.indexOf('// ======== Description des effets'),
  LEGACY.indexOf('function cardHTML'),
);
const legacySecs = LEGACY.slice(
  LEGACY.indexOf(" let secs='';"),
  LEGACY.indexOf(' return `<div class="card'),
);
const before = runInContext(
  `(function(){\n${legacyBlock}\nreturn (c)=>{\n${legacySecs}\nreturn secs;};})()`,
  createContext({}),
) as (c: Card) => string;

// New: the code shipped in the built page.
const builtBlock = BUILT.slice(
  BUILT.indexOf('// ======== Description des effets : générée'),
  BUILT.indexOf('const { COL, esc, sectionsHTML } = CatalogueDescribe;'),
);
const after = runInContext(
  `(function(){\n${builtBlock}\nreturn CatalogueDescribe.sectionsHTML;})()`,
  createContext({}),
) as (c: Card) => string;

const unescape = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
// Sections HTML as readable lines.
const lines = (html: string): string[] =>
  [
    ...html.matchAll(
      /<h4>(.*?)<\/h4>|<div class="cond">(.*?)<\/div>|<span class="ch[^"]*">(.*?)<\/span>|<span class="none">(.*?)<\/span>/g,
    ),
  ].map((m) =>
    m[1] !== undefined
      ? `**${unescape(m[1])}**`
      : m[2] !== undefined
        ? `_${unescape(m[2])}_`
        : m[3] !== undefined
          ? `- ${unescape(m[3])}`
          : `- (${unescape(m[4] as string)})`,
  );

const cards = (JSON.parse(read('docs', 'legacy', 'cartes-2026-10-17.json')) as Card[]).slice();
const TYPES: Record<string, string> = { combattant: 'Combattant', magie: 'Magie', piege: 'Piège' };
let changed = 0;
const blocks = cards.map((card) => {
  const a = lines(before(card));
  const b = lines(after(card));
  const same = a.join('\n') === b.join('\n');
  if (!same) changed++;
  return [
    `### ${card.nom} (${TYPES[card.type] ?? card.type})${same ? ' : inchangé' : ''}`,
    '',
    ...(same
      ? b
      : [
          'Avant (catalogue actuel) :',
          '',
          ...a,
          '',
          'Après (texte commun, celui du site) :',
          '',
          ...b,
        ]),
    '',
  ].join('\n');
});

const header = `# Phase 4b : texte du catalogue, avant → après

Rapport généré par \`apps/catalogue/report.ts\` à partir du code réel : « avant » est l'ancien catalogue exécuté tel quel, « après » est la page générée. Snapshot des cartes du 2026-10-17 : ${cards.length} cartes, ${changed} dont le texte change.

Décision (docs/adr/0003-le-texte-des-effets-dans-describe.md) : une seule formulation partout, celle du site ; le catalogue, en retard, n'est pas repris. Le site lui-même ne change que sur un point : décrire une exécution ne fait plus planter la page (aucune carte réelle n'en a aujourd'hui).

## Précisions de règle présentes seulement dans l'ancien catalogue

Elles disparaissent avec le texte commun. Toutes sont exactes d'après le moteur ; à l'auteur de dire lesquelles ajouter au texte commun (elles apparaîtraient alors aussi sur le site).

| Effet | Précision de l'ancien catalogue | D'après le moteur |
|---|---|---|
| Esquive (passif) | « (plafond 75 %) » | exact : l'esquive cumulée est plafonnée à 75 % (\`plafondEsquive\`) |
| Purification | « rend l'ATQ perdu par malédiction » | exact, et rend aussi l'ATQ perdue par fatigue |
| Réanimation | « meurt puis revient » | exact : la carte se brise, puis se reforme |
| Enchaînement | « jusqu'à 10 frappes en plus » quand aucun maximum n'est saisi | exact : 10 par défaut ; le site n'affiche le maximum que s'il est saisi |
| Effet aléatoire | « tiré au hasard parmi tous les effets du jeu » | exact : 45 effets possibles |
| Condition « l'adversaire a attaqué N fois » | « (puis toutes les N attaques) » | exact : le piège se déclenche aux attaques N, 2N, 3N… |
| Ultime | « utilisations illimitées » quand aucune limite n'est saisie | exact |

## Cartes

`;

mkdirSync(join(ROOT, 'docs', 'rapports'), { recursive: true });
const file = join(ROOT, 'docs', 'rapports', 'phase-4b-catalogue-avant-apres.md');
writeFileSync(file, header + blocks.join('\n'));
console.log(`${file}: ${cards.length} cards, ${changed} changed`);
