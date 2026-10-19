// The views and anchors are the legacy page's: same list, same labels, same anchors. A view added or
// renamed upstream fails here until it is reported in src/views.ts, or listed as not yet ported.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vite-plus/test';
import { ADMIN_VIEWS, PLAYER_VIEWS, plainLabel, routerHash } from '../src/views.ts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const PAGE = readFileSync(join(ROOT, 'legacy', 'index.html'), 'utf8');

// Evaluates a one-line object or array literal of the legacy page.
const literal = (pattern: RegExp): unknown => {
  const match = pattern.exec(PAGE);
  if (!match) throw new Error(`not found in legacy/index.html: ${String(pattern)}`);
  return runInNewContext(`(${match[1]})`);
};

// Upstream views apps/web does not have yet (README, "Avancement"). Only they may be missing; the
// check is exact again once the list is empty.
const NOT_YET_PORTED: readonly string[] = ['echanges'];
const isPorted = (view: string) => !NOT_YET_PORTED.includes(view);

describe('views', () => {
  test('player views: the legacy TABS, same order and labels', () => {
    const tabs = literal(/^const TABS=(\{.*?\});/m) as Record<string, string>;
    const portedTabs = Object.entries(tabs).filter(([view]) => isPorted(view));
    expect(PLAYER_VIEWS).toEqual(Object.fromEntries(portedTabs));
    expect(Object.keys(PLAYER_VIEWS)).toEqual(portedTabs.map(([view]) => view));
  });

  test('every legacy anchor is a view (VUES = TABS + admin)', () => {
    const anchors = literal(/^const VUES=(\[.*?\]);/m) as string[];
    expect([...Object.keys(PLAYER_VIEWS), 'admin']).toEqual(anchors.filter(isPorted));
  });

  test('a view not yet ported is a legacy view that apps/web does not have', () => {
    const tabs = Object.keys(literal(/^const TABS=(\{.*?\});/m) as object);
    for (const view of NOT_YET_PORTED) {
      expect(tabs, view).toContain(view);
      expect(Object.keys(PLAYER_VIEWS), view).not.toContain(view);
    }
  });

  test('admin views: the legacy sub-views of vAdmin, same order and labels', () => {
    const legacy = literal(/^ {2}const S=(\{cartes:.*?\});/m);
    expect(ADMIN_VIEWS).toEqual(legacy);
    expect(Object.keys(ADMIN_VIEWS)).toEqual(Object.keys(legacy as object));
  });
});

describe('routerHash', () => {
  test.each([
    ['#collection', '#/collection'],
    ['#profil', '#/profil'],
    ['#admin/joueurs', '#/admin/joueurs'],
    ['#admin', '#/admin/cartes'],
    ['#admin/inconnu', '#/admin/cartes'],
  ])('%s → %s', (legacy, router) => {
    expect(routerHash(legacy)).toBe(router);
  });

  test.each([
    '',
    '#',
    '#/collection',
    '#inconnu',
    '#collection/x',
    '#access_token=abc&refresh_token=def',
    '#error=access_denied&error_description=x',
  ])('%s is left alone', (hash) => {
    expect(routerHash(hash)).toBeNull();
  });
});

test('plainLabel drops the leading emoji only', () => {
  expect(plainLabel(PLAYER_VIEWS.jeux)).toBe('Jeux du jour');
  expect(plainLabel(ADMIN_VIEWS.votes)).toBe('Votes');
  expect(plainLabel(PLAYER_VIEWS.collection)).toBe('Ma collection');
});
