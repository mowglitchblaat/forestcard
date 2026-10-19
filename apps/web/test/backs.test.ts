// Card backs: the game's back first, in use when no other is; labels as the legacy page writes them.

import { expect, test } from 'vite-plus/test';
import { CardBack } from '../src/data/backs.ts';
import { toBacks } from '../src/views/backs/page.tsx';

const back = (id: number, actif: boolean, par_defaut = false): CardBack =>
  CardBack.parse({ id, nom: `Dos ${id}`, image: `dos-${id}.webp`, actif, par_defaut });

test('the game back first, in use when no other is', () => {
  const list = toBacks([back(1, false, true), back(2, false)]);
  expect(list.map((b) => [b.key, b.inUse, b.label])).toEqual([
    ['standard', true, 'Dos du jeu'],
    ['1', false, 'Dos de base'],
    ['2', false, 'Offert'],
  ]);
  expect(list[0]?.id).toBeNull();
});

test('a back in use: the game back is not', () => {
  const list = toBacks([back(1, false, true), back(2, true)]);
  expect(list.filter((b) => b.inUse).map((b) => b.key)).toEqual(['2']);
});
