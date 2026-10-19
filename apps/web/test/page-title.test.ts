// The header's page title, from the address.

import { expect, test } from 'vite-plus/test';
import { pageTitle } from '../src/page-title.ts';

test.each([
  ['/collection', 'Ma collection'],
  ['/historique', 'Historique'],
  ['/jeux', 'Jeux du jour'],
  ['/live', 'Le live'],
  ['/votes', 'Votes'],
  ['/admin/votes', 'Admin · Votes'],
  ['/deck', 'Mes decks'],
  ['/encyclopedie/effets', 'Encyclopédie · Effets'],
  ['/admin/inconnu', 'Admin'],
  ['/', 'Forest Card'],
])('%s → %s', (path, title) => {
  expect(pageTitle(path)).toBe(title);
});
