// The catalogue's card sections: the shared text (packages/describe, the same wording as the site),
// rendered with the catalogue's presentation: one coloured span per effect (colour = category, see
// the legend), the trigger or condition line above, "aucun" for an empty section. The built page
// declares these names where the legacy description block declared them (build.ts).

import {
  CATEGORY_LABELS,
  categoryOf,
  describeCard,
  type DescribedCard,
  type Section,
} from '@forestcard/describe';

// Legend and categories: shared with the site (packages/describe/src/categories.ts).
export const COL = CATEGORY_LABELS;
const catOf = categoryOf;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s: unknown) =>
  String((s ?? '') as string).replace(/[&<>"]/g, (c) => ESCAPES[c] as string);

// Sections a card always shows in the catalogue: kind, heading when the card has none, empty text.
const LAYOUT: Record<string, [Section['kind'], string, string][]> = {
  combattant: [
    ['passives', 'Passifs', 'aucun'],
    ['ultimate', 'Ultime', 'aucun'],
  ],
  magie: [['magic', 'Effet de la magie', 'aucun']],
  piege: [['trap', 'Piège', 'aucun effet']],
};

function sectionHTML(section: Section | undefined, heading: string, none: string): string {
  const title = section ? section.title : heading;
  const meta = section?.meta === undefined ? '' : `<div class="cond">${esc(section.meta)}</div>`;
  const items = (section?.items ?? [])
    .map((i) => `<span class="ch c-${catOf(i.type)}">${esc(i.text)}</span>`)
    .join('');
  return `<div class="sec"><h4>${esc(title)}</h4>${meta}${items || `<span class="none">${none}</span>`}</div>`;
}

// The body sections of a card: passives and ultimate, magic effect, or trap.
export function sectionsHTML(card: DescribedCard): string {
  const sections = describeCard(card);
  const layout = LAYOUT[card.type] ?? LAYOUT['piege'] ?? [];
  return layout
    .map(([kind, heading, none]) =>
      sectionHTML(
        sections.find((s) => s.kind === kind),
        heading,
        none,
      ),
    )
    .join('');
}
