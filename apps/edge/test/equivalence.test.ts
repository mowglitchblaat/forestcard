// Equivalence of the generated edge function (dist/swift-responder.ts) with the legacy one
// (legacy/swift-responder.ts): same requests in, same responses AND same calls to Supabase out.
//
// Both files run under Node with stubs: Deno.serve captures the handler, Deno.env serves fake
// secrets, fetch answers as Supabase would from a scenario, and Math.random follows a fixed
// sequence (it draws the combat seed and the bounty). The calls to Supabase carry what the server
// computes around the combat (turns, total damage, biggest hit, history, rewards), so comparing them
// covers those computations too.
//
// Run `vp run build` in apps/edge first: the test reads dist/.

import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vite-plus/test';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const LEGACY = join(ROOT, 'legacy', 'swift-responder.ts');
const GENERATED = join(ROOT, 'apps', 'edge', 'dist', 'swift-responder.ts');
const CARDS = JSON.parse(
  readFileSync(join(ROOT, 'docs', 'legacy', 'cartes-2026-10-19.json'), 'utf8'),
) as Card[];

type Card = { id: number; type: string; [k: string]: unknown };
type Handler = (req: Request) => Promise<Response>;
type Call = { method: string; url: string; body: unknown };
type Scenario = {
  name: string;
  request: Record<string, unknown> | string;
  secret?: string;
  settings?: Record<string, string>;
  freeCombatsToday?: number;
  pairCombatsToday?: number;
  deckSize?: number;
  randomSeed?: number;
};

const ENV: Record<string, string> = {
  COMBAT_SECRET: 'secret',
  SUPABASE_URL: 'https://project.supabase.co',
  SERVICE_KEY: 'sb_test_key',
};

// A legal 10-card deck (3 fighters, 3 magics, 3 traps + 1), different per player and per seed.
function deck(offset: number, size: number): Card[] {
  const of = (type: string) => CARDS.filter((c) => c.type === type);
  const pick = (list: Card[], n: number) =>
    Array.from({ length: n }, (_, i) => list[(offset + i * 7) % list.length] as Card);
  const cards = [...pick(of('combattant'), 4), ...pick(of('magie'), 3), ...pick(of('piege'), 3)];
  return structuredClone(cards.slice(0, size));
}

// Fake Supabase: answers every call the server makes, records them all.
function supabase(s: Scenario, calls: Call[]) {
  const settings = s.settings ?? {};
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const raw = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ method, url, body: raw === undefined ? undefined : JSON.parse(raw) });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    const path = url.replace(ENV['SUPABASE_URL'] as string, '');
    const seed = s.randomSeed ?? 1;
    if (path.startsWith('/rest/v1/rpc/preparer_combat'))
      return json({
        a: { id: 1, pseudo: 'Alice', deck: deck(seed, s.deckSize ?? 10) },
        b: { id: 2, pseudo: 'Bob', deck: deck(seed + 3, 10) },
      });
    if (path.startsWith('/rest/v1/rpc/reclamer_booster_quotidien'))
      return json({ pseudo: 'Alice', quantite: 2, detail: [{ quantite: 2, booster: 'Forêt' }] });
    if (path.startsWith('/rest/v1/rpc/')) return json(null);
    if (path.startsWith('/rest/v1/reglages_jeu')) {
      const keys = /cle=(?:eq\.([a-z_]+)|in\.\(([^)]*)\))/.exec(path);
      const wanted = keys ? (keys[1] ? [keys[1]] : (keys[2] as string).split(',')) : [];
      return json(
        wanted.filter((k) => k in settings).map((cle) => ({ cle, valeur: settings[cle] })),
      );
    }
    if (path.startsWith('/rest/v1/joueurs?twitch_id')) return json([{ id: 1 }]);
    if (path.startsWith('/rest/v1/joueurs?id=in'))
      return json([
        { id: 1, dos_actif: 5 },
        { id: 2, dos_actif: null },
      ]);
    if (path.startsWith('/rest/v1/dos_cartes'))
      return json([
        { id: 4, image: 'dos-base.webp', par_defaut: true },
        { id: 5, image: 'dos-or.webp', par_defaut: false },
      ]);
    if (path.startsWith('/rest/v1/combats_gratuits_jour'))
      return method === 'GET' ? json([{ nb: s.freeCombatsToday ?? 0 }]) : json(null, 201);
    if (path.startsWith('/rest/v1/historique_combats'))
      return method === 'GET'
        ? json(Array.from({ length: s.pairCombatsToday ?? 0 }, (_, i) => ({ id: i })))
        : json(null, 201);
    if (path.startsWith('/rest/v1/cartes'))
      return json(
        CARDS.map((c) => ({ id: c.id, raretes: c['raretes'] })).filter((c) =>
          path.includes(String(c.id)),
        ),
      );
    return json({ message: `unexpected call ${path}` }, 500);
  };
}

// Deterministic Math.random (mulberry32).
function sequence(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const realFetch = globalThis.fetch;
const realRandom = Math.random;
const g = globalThis as unknown as { Deno?: unknown };

// Loads a server file as a fresh module and returns its request handler.
async function load(file: string): Promise<Handler> {
  const copy = join(mkdtempSync(join(tmpdir(), 'edge-')), 'swift-responder.ts');
  copyFileSync(file, copy);
  let handler: Handler | undefined;
  g.Deno = { serve: (h: Handler) => (handler = h), env: { get: (k: string) => ENV[k] } };
  await import(pathToFileURL(copy).href);
  if (!handler) throw new Error(`${file} did not call Deno.serve`);
  return handler;
}

async function run(handler: Handler, s: Scenario) {
  const calls: Call[] = [];
  globalThis.fetch = supabase(s, calls) as typeof fetch;
  Math.random = sequence(s.randomSeed ?? 1);
  const res = await handler(
    new Request('https://project.supabase.co/functions/v1/swift-responder', {
      method: 'POST',
      headers: { 'x-secret': s.secret ?? ENV['COMBAT_SECRET'] ?? '' },
      body: typeof s.request === 'string' ? s.request : JSON.stringify(s.request),
    }),
  );
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // plain-text answer
  }
  return {
    status: res.status,
    message: res.headers.get('x-message'),
    type: res.headers.get('content-type'),
    body,
    calls,
  };
}

const bounty = {
  bounty_actif: '1',
  bounty_min: '10',
  bounty_max: '90',
  bounty_chance: '100',
  bounty_part_gagnant: '70',
  bounty_tout: '30',
};

const SCENARIOS: Scenario[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    name: `free combat, seed ${i}`,
    request: { twitch_id: '42' },
    randomSeed: i + 1,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    name: `paid duel, seed ${i}`,
    request: { twitch_id: '42', mode: 'payant', adversaire: 'Bob' },
    randomSeed: 100 + i,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    name: `bounty and x2 gains, seed ${i}`,
    request: { twitch_id: '42' },
    settings: { ...bounty, multiplicateur_gains: '2', gain_victoire: '40' },
    randomSeed: 200 + i,
  })),
  { name: 'daily booster', request: { twitch_id: '42', mode: 'booster_quotidien' } },
  { name: 'wrong secret', request: { twitch_id: '42' }, secret: 'nope' },
  { name: 'unreadable body', request: '{not json' },
  { name: 'missing player', request: {} },
  { name: 'paid duel without target', request: { twitch_id: '42', mode: 'payant' } },
  {
    name: 'free combats used up',
    request: { twitch_id: '42' },
    settings: { combats_gratuits_par_jour: '2' },
    freeCombatsToday: 2,
  },
  { name: 'old 9-card deck', request: { twitch_id: '42' }, deckSize: 9 },
  {
    name: 'anti-farm limit on a duel',
    request: { twitch_id: '42', mode: 'payant', adversaire: 'Bob' },
    pairCombatsToday: 3,
  },
];

describe('generated swift-responder behaves like the legacy one', () => {
  let legacy: Handler;
  let generated: Handler;

  beforeAll(async () => {
    if (!existsSync(GENERATED))
      throw new Error('dist/swift-responder.ts is missing: run `vp run build` in apps/edge');
    legacy = await load(LEGACY);
    generated = await load(GENERATED);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    Math.random = realRandom;
  });

  test.each(SCENARIOS)('$name', async (s) => {
    const expected = await run(legacy, s);
    const actual = await run(generated, s);
    expect(actual).toEqual(expected);
  });
});

// src/swift-responder.js is the legacy server code with the engine import swapped in. When the
// upstream server code changes (legacy/ resync), this test fails until the change is ported.
test('src/swift-responder.js still matches the legacy server code', () => {
  const legacyLines = readFileSync(LEGACY, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const serverStart = legacyLines.findIndex((l) => l.startsWith('// ---------------- Serveur'));
  const legacyServer = legacyLines
    .slice(serverStart)
    .join('\n')
    .replace('globalThis.Moteur.simuler(', 'simuler(');
  const source = readFileSync(
    join(ROOT, 'apps', 'edge', 'src', 'swift-responder.js'),
    'utf8',
  ).replace(/\r\n/g, '\n');
  expect(serverStart).toBeGreaterThan(0);
  expect(source.endsWith(legacyServer)).toBe(true);
});
