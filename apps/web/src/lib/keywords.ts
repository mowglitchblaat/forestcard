// The keywords of an effect text, coloured by what they are about, as on the legacy page (KRX,
// CK): percentages, durations, damage, healing, statuses, attack, plain numbers. The texts
// themselves come from packages/describe; this is presentation only.

import { TONES } from '@/lib/tones';

export type KeywordKind =
  | 'percent'
  | 'turns'
  | 'damage'
  | 'healing'
  | 'status'
  | 'attack'
  | 'number';

// The legacy page's pattern, group by group in the order of KIND_OF_GROUP.
const KEYWORDS =
  /(?<![\p{L}])(?:([+\-−]?\d+(?:[.,]\d+)?\s?%)|(\d+\s?tours?)|(dégâts?|saign\p{L}*|brûl\p{L}*|poison\p{L}*|malédiction\p{L}*|fracture\p{L}*|renvo\p{L}*)|(soins?|soign\p{L}*|régénér\p{L}*|réanim\p{L}*|PV|récup\p{L}*|protég\p{L}*|évite la mort|purifi\p{L}*)|(étourd\p{L}*|gel\p{L}*|fatigu\p{L}*|insensib\p{L}*|vol(?:e|er|é|s)?|échang\p{L}*|annul\p{L}*)|(ATQ|attaq\p{L}*|frappe\p{L}*|rage)|([+\-−]?\d+))(?![\p{L}])/giu;

const KIND_OF_GROUP: KeywordKind[] = [
  'percent',
  'turns',
  'damage',
  'healing',
  'status',
  'attack',
  'number',
];

export type Piece = { text: string; kind: KeywordKind | null };

// A text cut into plain pieces and keywords, in order; joined back, the pieces give the text.
export function keywordPieces(text: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(KEYWORDS)) {
    const at = m.index;
    if (at > last) pieces.push({ text: text.slice(last, at), kind: null });
    const group = m.slice(1).findIndex((g) => g !== undefined);
    pieces.push({ text: m[0], kind: KIND_OF_GROUP[group] ?? null });
    last = at + m[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), kind: null });
  return pieces;
}

// The legacy colours were for a dark page; each has a darker shade for the light theme.
export const KEYWORD_CLASSES: Record<KeywordKind, string> = {
  percent: `font-extrabold ${TONES.percent.text}`,
  turns: `font-bold ${TONES.turns.text}`,
  damage: `font-bold ${TONES.damage.text}`,
  healing: `font-bold ${TONES.healing.text}`,
  status: `font-bold ${TONES.status.text}`,
  attack: `font-bold ${TONES.attack.text}`,
  number: 'font-extrabold text-foreground',
};
