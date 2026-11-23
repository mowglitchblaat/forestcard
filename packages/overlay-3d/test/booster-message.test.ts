// The booster message: read the way the legacy overlay reads it, then turned into the scene's event.

import { expect, test } from 'vite-plus/test';
import {
  readBoosterMessage,
  texturesOf,
  tierOf,
  tierOfColour,
  toBoosterEvent,
} from '../src/input/booster-message.ts';

const keys = { imageKey: (p: string) => `img/${p}`, drawingKey: (p: string) => `dessin/${p}` };

const message = {
  pseudo: 'Viewer',
  booster: 'Booster Nihon Densetsu Edition SEAZER 5 cartes',
  cartes: [
    { carte: 'Seazer', couleur: '#f59e0b', image: '322bacf7.webp' },
    { carte: 'Oni sanglant', couleur: '#9ca3af', image: null },
  ],
};

test('the message is found however it is wrapped, like the legacy overlay (extraire)', () => {
  const wraps = [
    message,
    JSON.stringify(message),
    [message],
    { data: message },
    { data: JSON.stringify(message) },
    { ouvrir_booster: message },
    { ouvrir_booster: JSON.stringify(message) },
  ];
  for (const w of wraps) expect(readBoosterMessage(w)?.cartes.length).toBe(2);
  expect(readBoosterMessage({ pseudo: 'x' })).toBeNull();
  expect(readBoosterMessage('not json')).toBeNull();
});

test('the booster image comes from image_path, or the two other names the legacy overlay accepts', () => {
  expect(readBoosterMessage({ ...message, image_path: 'a.webp' })?.image_path).toBe('a.webp');
  expect(readBoosterMessage({ ...message, booster_image: 'b.webp' })?.image_path).toBe('b.webp');
  expect(readBoosterMessage({ ...message, image_booster: 'c.webp' })?.image_path).toBe('c.webp');
  expect(readBoosterMessage(message)?.image_path).toBeNull();
});

test('the rarity is read back from its colour; an unknown colour plays as a common', () => {
  expect(tierOfColour('#f59e0b')).toBe('legendaire');
  expect(tierOfColour('#FFFFFF')).toBe('ggez');
  expect(tierOfColour('#a855f7')).toBe('epique');
  expect(tierOfColour('#123456')).toBe('commun');
  expect(tierOfColour(null)).toBe('commun');
});

test("every card of the message becomes a flat face, its image under the caller's texture name", () => {
  const m = readBoosterMessage(message);
  if (!m) throw new Error('unread');
  const ev = toBoosterEvent(m, { ...keys, boosterImage: null });
  expect(ev.cartes.map((c) => [c.name, c.tier, c.face])).toEqual([
    ['Seazer', 'legendaire', { kind: 'flat', image: 'img/322bacf7.webp' }],
    ['Oni sanglant', 'commun', { kind: 'flat', image: '' }],
  ]);
});

// Seazer as the enriched message carries it (cartes-2026-10-23.json, card 105)
const seazer = {
  carte: 'Seazer',
  couleur: '#f59e0b',
  image: '322bacf7.webp',
  id: 105,
  rarete: 'Légendaire',
  type: 'combattant',
  atq: 30,
  pv: 82,
  passif: {
    briques: [
      { type: 'esquive', chance: 30 },
      { type: 'saignement', pctpv: 8, tours: 2, chance: 50, reducsoin: 50 },
    ],
  },
  ultime: {
    type: 'execution_direct',
    nbmarques: 2,
    seuilexec: 10,
    apres_tours: 2,
    utilisations: 1,
  },
  effet: null,
  dessin_path: 'dessins/seazer.webp',
  compo: { taille: 90 },
};

test('enriched: a card with a known type and a drawing is built, its lines written by describe', () => {
  const m = readBoosterMessage({ ...message, cartes: [seazer] });
  if (!m) throw new Error('unread');
  const [card] = toBoosterEvent(m, { ...keys, boosterImage: null }).cartes;
  expect(card?.face).toEqual({ kind: 'built', drawing: 'dessin/dessins/seazer.webp' });
  expect([card?.id, card?.type, card?.tier, card?.atq, card?.pv]).toEqual([
    '105',
    'combattant',
    'legendaire',
    30,
    82,
  ]);
  // the ultimate's line first, then the passives
  expect(card?.lines.map((l) => [l.ult, l.types])).toEqual([
    [true, ['execution_direct']],
    [false, ['esquive']],
    [false, ['saignement']],
  ]);
  expect(texturesOf(m, keys)).toEqual(['dessin/dessins/seazer.webp']);
});

test('enriched: without a drawing, or with an unknown type, the card stays flat', () => {
  const m = readBoosterMessage({
    ...message,
    cartes: [
      { ...seazer, dessin_path: null },
      { ...seazer, type: 'dragon' },
    ],
  });
  if (!m) throw new Error('unread');
  const faces = toBoosterEvent(m, { ...keys, boosterImage: null }).cartes.map((c) => c.face);
  expect(faces).toEqual([
    { kind: 'flat', image: 'img/322bacf7.webp' },
    { kind: 'flat', image: 'img/322bacf7.webp' },
  ]);
  expect(texturesOf(m, keys)).toEqual(['img/322bacf7.webp', 'img/322bacf7.webp']);
});

test('enriched: the rarity name wins over the colour; malformed fields are dropped', () => {
  expect(tierOf({ carte: 'x', couleur: '#9ca3af', rarete: 'Epique' })).toBe('epique');
  expect(tierOf({ carte: 'x', couleur: '#9ca3af', rarete: 'Mythique' })).toBe('commun');
  const m = readBoosterMessage({
    ...message,
    cartes: [{ ...seazer, atq: '30', passif: 'esquive', compo: [1, 2] }],
  });
  expect([m?.cartes[0]?.atq, m?.cartes[0]?.passif, m?.cartes[0]?.compo]).toEqual([
    null,
    null,
    null,
  ]);
});
