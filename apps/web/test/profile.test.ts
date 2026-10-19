// Profiles: the shape the legacy page reads is accepted, missing stats read as none.

import { expect, test } from 'vite-plus/test';
import { combatSummary, Profile } from '../src/data/profile.ts';

test('a full profile, as the legacy page reads it', () => {
  const p = Profile.parse({
    pseudo: 'seazer',
    stats: { victoires: 41, defaites: 22, nuls: 3, meilleure_serie: 7, plus_gros_coup: 58 },
    plus_jouee: { nom: 'PLG', image_path: 'a.webp', couleur: '#fbbf24', valeur: 30 },
    plus_gagnante: null,
  });
  expect(combatSummary(p.stats)).toEqual({
    wins: 41,
    losses: 22,
    draws: 3,
    total: 66,
    winRate: 62,
  });
});

test('a player who never fought: no stats, no win rate', () => {
  const p = Profile.parse({ pseudo: 'nouveau' });
  expect(combatSummary(p.stats)).toEqual({ wins: 0, losses: 0, draws: 0, total: 0, winRate: null });
});
