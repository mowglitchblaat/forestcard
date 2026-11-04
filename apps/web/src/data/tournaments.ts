// Tournaments (db/migrations/46-tournois.sql to 54): played live combat after combat with the
// championship decks, single elimination or Swiss rounds then double elimination; registering and
// leaving from the site, giving up for good once started; trophies and scarves kept forever in the
// profile's cabinet; the admin's creation, draw, settings, rewards and cancelling. As the legacy
// page's vTournois, tableauSite, apercuSuisse, armoire and aTournois, aRecompenses.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const Num = z.union([z.number(), z.string()]).transform(Number);
const NumOrNull = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => (v === null ? null : Number(v)));
const Text = z.string().nullable().optional();
const Who = z.looseObject({ id: z.string(), pseudo: Text });

export const DIVISIONS = {
  rare: { name: 'Ceinture Rare', icon: '🥉', max: 3 },
  epique: { name: 'Ceinture Épique', icon: '🥈', max: 2 },
  libre: { name: 'Ceinture Libre', icon: '🥇', max: 0 },
} as const;
export type Division = keyof typeof DIVISIONS;
export const isDivision = (d: unknown): d is Division => typeof d === 'string' && d in DIVISIONS;

export const Match = z.looseObject({
  id: Num.optional(),
  tour: Num,
  position: Num,
  phase: z.string().nullable().optional(),
  nom_tour: Text,
  format: NumOrNull.optional(),
  a: z.string().nullable().optional(),
  b: z.string().nullable().optional(),
  pseudo_a: Text,
  pseudo_b: Text,
  score_a: z.union([z.number(), z.string()]).nullable().optional(),
  score_b: z.union([z.number(), z.string()]).nullable().optional(),
  gagnant: z.string().nullable().optional(),
  exempt: z.boolean().nullable().optional(),
  a_l_ecran: z.boolean().nullable().optional(),
  petite: z.boolean().nullable().optional(),
  forfait: z.string().nullable().optional(),
});
export type Match = z.infer<typeof Match>;

export const Reward = z.looseObject({
  place: Num,
  gold: NumOrNull.optional(),
  booster_id: NumOrNull.optional(),
  boosters: NumOrNull.optional(),
  booster: Text,
  booster_image: Text,
  dos_id: z.union([z.number(), z.string()]).nullable().optional(),
  dos: Text,
  dos_image: Text,
  variante_id: NumOrNull.optional(),
  carte: Text,
  version: Text,
  carte_image: Text,
});
export type Reward = z.infer<typeof Reward>;

const Ranked = z.looseObject({
  id: z.string(),
  pseudo: Text,
  rang: Num,
  victoires: Num,
  defaites: Num,
  buchholz: NumOrNull.optional(),
  abandon: z.boolean().nullable().optional(),
});

export const Tournament = z.looseObject({
  id: Num,
  nom: z.string(),
  statut: z.enum(['inscriptions', 'en_cours', 'termine', 'annule']),
  division: z.string(),
  ceinture: Text,
  format: Text,
  max_joueurs: NumOrNull.optional(),
  inscrits: z.array(Who).nullable().optional(),
  matchs: z.array(Match).nullable().optional(),
  tours: NumOrNull.optional(),
  abandons: z.array(Who).nullable().optional(),
  en_lice: z.array(z.string()).nullable().optional(),
  recompenses: z.array(Reward).nullable().optional(),
  trophee: Text,
  places: z
    .array(z.looseObject({ place: Num, pseudo: Text }))
    .nullable()
    .optional(),
  classement: z.array(Ranked).nullable().optional(),
  coupe: NumOrNull.optional(),
  coupe_loser: NumOrNull.optional(),
  rondes: NumOrNull.optional(),
  places_winner: NumOrNull.optional(),
  places_loser: NumOrNull.optional(),
  auto: z.boolean().nullable().optional(),
  pseudo_gagnant: Text,
  fini_le: Text,
  lance_le: Text,
});
export type Tournament = z.infer<typeof Tournament>;

const Past = z.looseObject({
  id: Num,
  nom: z.string(),
  division: z.string(),
  fini_le: Text,
  joueurs: NumOrNull.optional(),
  pseudo_gagnant: Text,
});
export type PastTournament = z.infer<typeof Past>;

const State = z.looseObject({
  tournoi: Tournament.nullable().optional(),
  passes: z.array(Past).nullable().optional(),
});

// id: null for the current tournament (open, else the last one).
export async function fetchTournament(
  id: number | null,
): Promise<{ tournament: Tournament | null; past: PastTournament[] }> {
  const { data, error } = await supabase.rpc('tournoi_etat', { p_id: id });
  if (error) throw new Error(error.message);
  const state = State.parse(data ?? {});
  return { tournament: state.tournoi ?? null, past: state.passes ?? [] };
}

// The player's championship decks (15 cards each when complete), by division.
export async function fetchChampionshipDecks(player: string): Promise<Map<string, number[]>> {
  const { data, error } = await supabase
    .from('decks_championnat')
    .select('division,cartes')
    .eq('joueur_id', player);
  if (error) throw new Error(error.message);
  const rows = z
    .array(z.object({ division: z.string(), cartes: z.array(Num).nullable() }))
    .parse(data ?? []);
  return new Map(rows.map((r) => [r.division, r.cartes ?? []]));
}

export async function register(): Promise<string> {
  const { data, error } = await supabase.rpc('tournoi_inscrire_site');
  if (error) throw new Error(error.message);
  const r = z
    .looseObject({ tournoi: Text, inscrits: NumOrNull.optional(), max: NumOrNull.optional() })
    .parse(data ?? {});
  return `🎖️ Inscrit au tournoi « ${r.tournoi ?? ''} » ! (${r.inscrits ?? '?'}/${r.max ?? '?'})`;
}

// Before the start: leaves. Once started: gives up for good.
export async function leave(): Promise<string> {
  const { data, error } = await supabase.rpc('tournoi_quitter_site');
  if (error) throw new Error(error.message);
  const r = z
    .looseObject({
      gagnants: z.array(z.string()).nullable().optional(),
      tournoi_fini: z.boolean().nullable().optional(),
      champion: Text,
    })
    .nullable()
    .parse(data ?? null);
  const winners = r?.gagnants ?? [];
  return `🏳️ C'est fait.${winners.length ? ` ${winners.join(', ')} passe${winners.length > 1 ? 'nt' : ''} par forfait.` : ''}${r?.tournoi_fini && r.champion ? ` 👑 ${r.champion} remporte le tournoi !` : ''}`;
}

export const tournamentKeys = {
  all: ['tournaments'] as const,
  one: (id: number | null) => ['tournaments', id ?? 'current'] as const,
  decks: (player: string) => ['championshipDecks', player] as const,
  trophies: (player: string) => ['trophies', player] as const,
  admin: ['tournaments', 'admin'] as const,
};

// ── Places, trophies ──

export const PLACES: Record<
  number,
  { label: string; tone: 'gold' | 'silver' | 'bronze' | 'scarf' }
> = {
  0: { label: '🎗️ Participant', tone: 'scarf' },
  1: { label: '🥇 Vainqueur', tone: 'gold' },
  2: { label: '🥈 Finaliste', tone: 'silver' },
  3: { label: '🥉 3e place', tone: 'bronze' },
};
export const PLACE_NAMES: Record<number, string> = {
  1: '🥇 1re place',
  2: '🥈 2e place',
  3: '🥉 3e place',
  4: '4e place',
};

const Trophy = z.looseObject({
  place: Num,
  nom: z.string(),
  ceinture: Text,
  image: Text,
  le: z.string(),
  tournoi: NumOrNull.optional(),
});
export type Trophy = z.infer<typeof Trophy>;

export async function fetchTrophies(player: string): Promise<Trophy[]> {
  const { data, error } = await supabase.rpc('trophees_joueur', { p_joueur: player });
  if (error) throw new Error(error.message);
  return z.array(Trophy).parse(data ?? []);
}

// ── The Swiss format's preview during registration (same counts as tournoi_coupes and
// tournoi_double_creer, 52-tournoi-tout-le-monde.sql) ──

export function swissCounts(
  n: number,
  winners: number | null | undefined,
  losers: number | null | undefined,
): { rounds: number; winner: number; loser: number } {
  const rounds = n <= 2 ? 1 : n === 3 ? 2 : n <= 8 ? 3 : n <= 16 ? 4 : n <= 32 ? 5 : 6;
  let w = Math.min(n, Math.max(2, winners ?? Math.round(n * 0.6)));
  if ((winners === null || winners === undefined) && w >= n && n > 2) w = n - 1;
  return { rounds, winner: w, loser: Math.max(0, Math.min(n - w, losers ?? n - w)) };
}

// The final bracket with places instead of names ("1er du suisse"), as it will be drawn.
export function swissPreview(
  n: number,
  winners: number | null | undefined,
  losers: number | null | undefined,
): Match[] {
  const { winner: w, loser: l } = swissCounts(n, winners, losers);
  type M = Match & { id: number; sv: number; sc: number; pv: number; pc: number; fini: boolean };
  const all: M[] = [];
  let next = 0;
  const add = (o: Partial<M> & { tour: number; position: number }): M => {
    const m: M = {
      id: ++next,
      score_a: '',
      score_b: '',
      a: null,
      b: null,
      pseudo_a: null,
      pseudo_b: null,
      exempt: false,
      gagnant: null,
      fini: false,
      sv: 0,
      sc: 0,
      pv: 0,
      pc: 0,
      format: 3,
      ...o,
    };
    all.push(m);
    return m;
  };
  const rank = (i: number) => `${i}${i === 1 ? 'er' : 'e'} du suisse`;
  const seed = (k: number) => ({ a: `#${k}`, p: rank(k) });
  const order = (q: number) => {
    if (q <= 1) return [1];
    let o = [1, 2];
    while (o.length < q) {
      const len = o.length;
      o = o.flatMap((x) => [x, 2 * len + 1 - x]);
    }
    return o;
  };
  const put = (m: M | undefined, side: number, x: { a: string; p: string } | false | undefined) => {
    if (!m || !x) return;
    if (side === 0) {
      m.a = x.a;
      m.pseudo_a = x.p;
    } else {
      m.b = x.a;
      m.pseudo_b = x.p;
    }
  };
  if (w <= 2 && l === 0) {
    const f = add({ tour: 1, position: 1, phase: 'grande', nom_tour: 'Finale', format: 5 });
    put(f, 0, seed(1));
    put(f, 1, seed(2));
    return all;
  }
  let tb = 1;
  let rw = 0;
  while (tb < w) {
    tb *= 2;
    rw++;
  }
  const half = tb / 2;
  let ps = half;
  let p = 0;
  while (ps < l) {
    ps *= 2;
    p++;
  }
  const ow = order(tb);
  const op = order(ps);
  let cur = 1;
  const tw = [cur];
  const tp = [cur];
  const td: number[] = [];
  const tre: number[] = [];
  for (let q = 2; q <= p; q++) tp.push(++cur);
  for (let r = 1; r <= rw; r++) {
    td.push(++cur);
    if (r < rw) {
      tw.push(++cur);
      tre.push(++cur);
    }
  }
  const at = (t: number | undefined, pos: number, ph: string) =>
    all.find((m) => m.tour === t && m.position === pos && m.phase === ph);
  const ow_ = (i: number) => ow[i] ?? Infinity;
  const op_ = (i: number) => op[i] ?? Infinity;
  for (let r = 1; r <= rw; r++) {
    const k = tb >> r;
    const name =
      k === 1
        ? 'Finale du winner'
        : k === 2
          ? 'Demi-finale du winner'
          : k === 4
            ? 'Quart de finale du winner'
            : `Winner bracket, ${r}${r === 1 ? 'er' : 'e'} tour`;
    for (let i = 1; i <= k; i++) {
      const m = add({ tour: tw[r - 1] ?? 0, position: i, phase: 'winner', nom_tour: name });
      if (r === 1) {
        put(m, 0, ow_(2 * i - 2) <= w && seed(ow_(2 * i - 2)));
        put(m, 1, ow_(2 * i - 1) <= w && seed(ow_(2 * i - 1)));
      }
    }
  }
  let nb = 0;
  for (let q = 1; q <= p; q++) {
    nb++;
    const k = ps >> q;
    for (let i = 1; i <= k; i++) {
      const m = add({
        tour: tp[q - 1] ?? 0,
        position: q === 1 ? half + i : i,
        phase: 'loser',
        nom_tour: `Loser bracket, ${nb}${nb === 1 ? 'er' : 'e'} tour`,
      });
      if (q === 1) {
        put(m, 0, op_(2 * i - 2) <= l && seed(w + op_(2 * i - 2)));
        put(m, 1, op_(2 * i - 1) <= l && seed(w + op_(2 * i - 1)));
      }
    }
  }
  for (let r = 1; r <= rw; r++) {
    nb++;
    const k = tb >> r;
    for (let i = 1; i <= k; i++)
      add({
        tour: td[r - 1] ?? 0,
        position: i,
        phase: 'loser',
        format: r === rw ? 5 : 3,
        nom_tour:
          r === rw ? 'Finale du loser' : `Loser bracket, ${nb}${nb === 1 ? 'er' : 'e'} tour`,
      });
    if (r < rw) {
      nb++;
      for (let i = 1; i <= k / 2; i++)
        add({
          tour: tre[r - 1] ?? 0,
          position: i,
          phase: 'loser',
          nom_tour: r + 1 === rw ? 'Demi-finale du loser' : `Loser bracket, ${nb}e tour`,
        });
    }
  }
  if (p === 0 && l > 0) {
    const real = (x: number) => (ow_(2 * (half - x + 1) - 1) <= w ? 1 : 0);
    const places = [...Array<number>(half)]
      .map((_, x) => x + 1)
      .sort((x, y) => real(x) - real(y) || x - y);
    for (let i = 1; i <= l; i++) put(at(td[0], places[i - 1] ?? 0, 'loser'), 0, seed(w + i));
  }
  const gf = add({
    tour: cur + 1,
    position: 1,
    phase: 'grande',
    nom_tour: 'Grande finale',
    format: 5,
  });
  for (let r = 1; r <= rw; r++) {
    const k = tb >> r;
    for (const m of all.filter((x) => x.phase === 'winner' && x.tour === tw[r - 1])) {
      m.sv = r < rw ? (at(tw[r], (m.position + 1) >> 1, 'winner')?.id ?? 0) : gf.id;
      m.sc = r < rw ? (m.position - 1) % 2 : 0;
      m.pv = at(td[r - 1], k - m.position + 1, 'loser')?.id ?? 0;
      m.pc = 1;
    }
    for (const m of all.filter((x) => x.phase === 'loser' && x.tour === td[r - 1])) {
      m.sv = r < rw ? (at(tre[r - 1], (m.position + 1) >> 1, 'loser')?.id ?? 0) : gf.id;
      m.sc = r < rw ? (m.position - 1) % 2 : 1;
    }
    if (r < rw)
      for (const m of all.filter((x) => x.phase === 'loser' && x.tour === tre[r - 1])) {
        m.sv = at(td[r], m.position, 'loser')?.id ?? 0;
        m.sc = 0;
      }
  }
  for (let q = 1; q <= p; q++)
    for (const m of all.filter(
      (x) => x.phase === 'loser' && x.tour === tp[q - 1] && (q > 1 || x.position > half),
    )) {
      const pp = m.position - (q === 1 ? half : 0);
      m.sv =
        q < p ? (at(tp[q], (pp + 1) >> 1, 'loser')?.id ?? 0) : (at(td[0], pp, 'loser')?.id ?? 0);
      m.sc = q < p ? (pp - 1) % 2 : 0;
    }
  // Byes: a side no match feeds any more stays empty; the player there goes through, with their place.
  const dead = (m: M, side: number) =>
    !(side ? m.b : m.a) &&
    !all.some(
      (f) => !f.fini && ((f.sv === m.id && f.sc === side) || (f.pv === m.id && f.pc === side)),
    );
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of [...all].sort((x, y) => x.tour - y.tour || x.position - y.position)) {
      if (m.fini) continue;
      const da = dead(m, 0);
      const db = dead(m, 1);
      if ((da || db) && (da || m.a) && (db || m.b)) {
        m.fini = true;
        m.exempt = true;
        const x = m.a
          ? { a: m.a, p: m.pseudo_a ?? '' }
          : m.b
            ? { a: m.b, p: m.pseudo_b ?? '' }
            : null;
        m.a = x?.a ?? null;
        m.pseudo_a = x?.p ?? null;
        m.b = null;
        m.pseudo_b = null;
        if (x && m.sv)
          put(
            all.find((t) => t.id === m.sv),
            m.sc,
            x,
          );
        changed = true;
        break;
      }
    }
  }
  return all.filter((m) => !(m.exempt && !m.a));
}

// ── Admin ──

const AdminRow = z.looseObject({
  id: Num,
  nom: z.string(),
  division: z.string(),
  statut: z.string(),
  cree_le: z.string(),
  joueurs: NumOrNull.optional(),
  abandons: NumOrNull.optional(),
  pseudo_gagnant: Text,
});
export type AdminTournament = z.infer<typeof AdminRow>;

const rpc = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
};

export async function fetchAdminTournaments(): Promise<AdminTournament[]> {
  return z.array(AdminRow).parse((await rpc('tournois_admin', {})) ?? []);
}

export async function createTournament(t: {
  nom: string;
  division: string;
  max: number | null;
  auto: boolean;
  swiss: boolean;
  winners: number | null;
  losers: number | null;
  images: (string | null)[]; // by place: 0 the scarf, 1 to 3 the cups
}): Promise<number> {
  const id = Number(
    await rpc('tournoi_creer', {
      p_nom: t.nom,
      p_division: t.division,
      p_max: t.max,
      p_trophee: t.images[1] ?? null,
      p_auto: t.auto,
    }),
  );
  if (t.swiss) {
    await rpc('tournoi_format', { p_id: id, p_format: 'suisse' });
    if (t.winners !== null || t.losers !== null)
      await rpc('tournoi_places', { p_id: id, p_winner: t.winners, p_loser: t.losers });
  }
  for (const place of [0, 2, 3]) {
    const image = t.images[place];
    if (image) await rpc('tournoi_trophee', { p_id: id, p_place: place, p_image: image });
  }
  return id;
}

export const setFormat = (id: number, format: string) =>
  rpc('tournoi_format', { p_id: id, p_format: format });
export const setPlaces = (id: number, winners: number | null, losers: number | null) =>
  rpc('tournoi_places', { p_id: id, p_winner: winners, p_loser: losers });
export const setTrophy = (id: number, place: number, image: string) =>
  rpc('tournoi_trophee', { p_id: id, p_place: place, p_image: image });
export const setAuto = (id: number, auto: boolean) =>
  rpc('tournoi_regler', { p_id: id, p_auto: auto, p_trophee: null });
export const removeEntrant = (id: number, player: string) =>
  rpc('tournoi_retirer', { p_id: id, p_joueur: player });
export const launch = (id: number) => rpc('tournoi_lancer', { p_id: id });
export const cancel = (id: number) => rpc('tournoi_annuler', { p_id: id });
export const setReward = (
  id: number,
  place: number,
  r: {
    gold: number;
    booster: number | null;
    boosters: number;
    dos: string | null;
    variant: number | null;
  },
) =>
  rpc('tournoi_recompense_regler', {
    p_id: id,
    p_place: place,
    p_gold: r.gold,
    p_booster: r.booster,
    p_boosters: r.boosters,
    p_dos: r.dos,
    p_variante: r.variant,
  });
