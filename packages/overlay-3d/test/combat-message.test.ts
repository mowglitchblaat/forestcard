// The combat message as it arrives over WebSocket: unwrapped like the legacy overlay (extraire), read
// whole or rejected whole.

import { expect, test } from 'vite-plus/test';
import { readCombatMessage } from '../src/input/combat-message.ts';

const state = { tour: 0, pv: [100, 80], max: [100, 80], atq: [20, 15] };
const player = (pseudo: string, ids: (number | null)[]) => ({
  pseudo,
  dos: null,
  carte: `${pseudo} fighter`,
  image: `${pseudo}.webp`,
  rar: { nom: 'Rare', couleur: '#3b82f6' },
  magie: 'Aucune magie',
  piege: 'Piège',
  magieImg: null,
  piegeImg: 'trap.webp',
  ids,
});
const message = {
  seed: 7,
  gagnant: 1,
  journal: [
    {
      t: 'debut',
      txt: 'Le combat commence !',
      joueurs: [player('Alice', [1, null, 3]), player('Bob', [4, 5, 6])],
      premier: 0,
      ...state,
    },
    { t: 'degats', txt: 'Bob fighter subit 12 dégâts', c: 1, n: 12, ...state },
    {
      t: 'statut',
      txt: 'Bob fighter saigne',
      c: 1,
      k: 'saignement',
      boost: [
        [0, 0],
        [5, 1],
      ],
      ...state,
    },
    { t: 'fin', txt: 'Bob remporte le combat !', gagnant: 1, ...state },
  ],
};

test('the forms Streamer.bot relays: text, a list, wrapped in data, data as text', () => {
  const wire = JSON.stringify(message);
  for (const raw of [message, wire, [message], { data: message }, { data: wire }]) {
    const m = readCombatMessage(raw);
    expect(m?.journal).toHaveLength(4);
    expect(m?.winner).toBe(1);
  }
});

test('a line: its side, amount, kind, the state after it and the boosts', () => {
  const m = readCombatMessage(message)!;
  const hit = m.journal[1]!;
  expect([hit.t, hit.c, hit.n, hit.k]).toEqual(['degats', 1, 12, null]);
  expect(hit.pv).toEqual([100, 80]);
  expect(m.journal[2]!.boost).toEqual([
    [0, 0],
    [5, 1],
  ]);
  expect(m.journal[3]!.raw['gagnant']).toBe(1);
});

test('the players: their cards, an empty slot as null, the fighter with its rarity', () => {
  const [alice, bob] = readCombatMessage(message)!.journal[0]!.players!;
  expect(alice!.fighter).toEqual({
    id: 1,
    name: 'Alice fighter',
    image: 'Alice.webp',
    type: 'combattant',
    rarity: 'Rare',
  });
  expect(alice!.magic).toBeNull(); // no id, no image: the engine's "no magic"
  expect(alice!.trap?.id).toBe(3);
  expect(bob!.magic?.id).toBe(5);
});

test('rejected whole: no journal, a line without its state, no players to start', () => {
  expect(readCombatMessage({ seed: 1 })).toBeNull();
  expect(readCombatMessage('not json')).toBeNull();
  const broken = structuredClone(message);
  delete (broken.journal[1] as { pv?: unknown }).pv;
  expect(readCombatMessage(broken)).toBeNull();
  expect(readCombatMessage({ journal: message.journal.slice(1) })).toBeNull();
});

test("a line's kind is folded to ASCII: the burn reads 'brulure', composed or decomposed", () => {
  const burn = (k: string) =>
    readCombatMessage({
      journal: [message.journal[0], { t: 'degats', txt: 'brûle', c: 1, n: 5, k, ...state }],
    })!.journal[1]!.k;
  expect(burn('brûlure')).toBe('brulure');
  expect(burn('brûlure')).toBe('brulure'); // u + combining circumflex
  expect(burn('brulure')).toBe('brulure');
});

test("the enriched message: each player's cards whole; a legacy one has none", () => {
  const anubis = {
    carte: 'Anubis',
    id: 101,
    type: 'combattant',
    rarete: 'Légendaire',
    atq: 26,
    pv: 107,
    image: 'a.webp',
    dessin_path: 'dessins/x.webp',
  };
  const enriched = structuredClone(message) as typeof message & {
    journal: { joueurs?: Record<string, unknown>[] }[];
  };
  enriched.journal[0]!.joueurs![1]!['cartes'] = [anubis, null, { carte: 'Piège', type: 'piege' }];
  const [alice, bob] = readCombatMessage(enriched)!.journal[0]!.players!;
  expect(alice!.cards).toBeNull();
  expect(bob!.cards?.fighter).toMatchObject({
    carte: 'Anubis',
    atq: 26,
    dessin_path: 'dessins/x.webp',
  });
  expect(bob!.cards?.magic).toBeNull();
  expect(bob!.cards?.trap?.type).toBe('piege');
});
