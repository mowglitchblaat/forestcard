// The shop's "seen" mark: a new booster or a new price is new; a removed booster is not.

import { expect, test } from 'vite-plus/test';
import { BoosterType, offerChange, offerKeys } from '../src/data/shop.ts';
import { listMark, unseen } from '../src/lib/seen.ts';

const booster = (id: number, prix: number | null) =>
  BoosterType.parse({ id, nom: `B${id}`, image_path: null, nb_cartes: 5, prix });

test('new booster and new price flag; a removed booster does not', () => {
  const seen = listMark(offerKeys([booster(1, 250), booster(2, 400), booster(3, 300)]));
  expect(unseen(seen, offerKeys([booster(1, 250), booster(2, 400)]))).toEqual([]);
  expect(unseen(seen, offerKeys([booster(1, 200), booster(2, 400), booster(4, 500)]))).toEqual([
    '1:200',
    '4:500',
  ]);
});

test('what changed on a booster: new, its price with the one seen, or nothing', () => {
  const seen = listMark(offerKeys([booster(1, 250), booster(2, null)]));
  expect(offerChange(seen, booster(1, 250))).toBeNull();
  expect(offerChange(seen, booster(1, 200))).toEqual({ kind: 'price', before: 250 });
  expect(offerChange(seen, booster(2, 300))).toEqual({ kind: 'price', before: null });
  expect(offerChange(seen, booster(3, 300))).toEqual({ kind: 'new' });
  // A first visit badges nothing.
  expect(offerChange(null, booster(3, 300))).toBeNull();
});
