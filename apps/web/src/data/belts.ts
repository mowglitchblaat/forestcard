// The championship (33-championnat.sql to 45): three belts (Rare, Épique, Libre), their champions,
// the pending challenges, every reign and title combat (38-ceintures-histoire.sql), the Pantheon of
// the greatest reigns and the double and triple champions (44, 45), and the bonuses' lock.

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { callGame } from './game';

const Num = z.union([z.number(), z.string()]).transform(Number);
const NumOrNull = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => (v === null ? null : Number(v)));
const Text = z.string().nullable().optional();

const Belt = z.looseObject({
  division: z.string(),
  nom: z.string(),
  champion: z.string().nullable().optional(),
  pseudo: Text,
  depuis: Text,
  defenses: NumOrNull.optional(),
  refus: NumOrNull.optional(),
  refus_max: NumOrNull.optional(),
  prime: NumOrNull.optional(),
  defendu: z.boolean().nullable().optional(),
  jours: NumOrNull.optional(),
  vacante_le: Text,
  en_cours: z.boolean().nullable().optional(),
});
export type Belt = z.infer<typeof Belt>;

const Challenge = z.looseObject({
  division: z.string(),
  challenger: z.string(),
  adversaire: z.string(),
  pseudo_challenger: Text,
  pseudo_adversaire: Text,
  expire_le: z.string(),
});
export type Challenge = z.infer<typeof Challenge>;

const Reign = z.looseObject({
  division: z.string(),
  joueur: z.string(),
  pseudo: Text,
  debut: z.string(),
  fin: Text,
  raison: Text,
  defenses: NumOrNull.optional(),
  primes: NumOrNull.optional(),
});
export type Reign = z.infer<typeof Reign>;

const TitleCombat = z.looseObject({
  division: z.string(),
  challenger: z.string(),
  adversaire: Text,
  pseudo_challenger: Text,
  pseudo_adversaire: Text,
  gagnant: z.string().nullable().optional(),
  fini_le: z.string(),
  pour_champion: z.boolean().nullable().optional(),
});
export type TitleCombat = z.infer<typeof TitleCombat>;

const State = z.looseObject({
  ceintures: z.array(Belt),
  defis: z.array(Challenge).nullable().optional(),
  regnes: z.array(Reign).nullable().optional(),
  combats: z.array(TitleCombat).nullable().optional(),
});
export type BeltsState = {
  belts: Belt[];
  challenges: Challenge[];
  reigns: Reign[];
  combats: TitleCombat[];
};

export async function fetchBelts(): Promise<BeltsState> {
  const { data, error } = await supabase.rpc('ceintures_etat');
  if (error) throw new Error(error.message);
  const s = State.parse(data);
  return {
    belts: s.ceintures,
    challenges: s.defis ?? [],
    reigns: s.regnes ?? [],
    combats: s.combats ?? [],
  };
}

// Whether the belts' bonuses are locked today (no live): false when the function is missing.
export async function fetchTitleLock(): Promise<boolean> {
  const { data, error } = await supabase.rpc('titre_verrouille');
  return !error && !!data;
}

const Great = z.looseObject({
  division: z.string().optional(),
  pseudo: Text,
  nom: Text,
  defenses: NumOrNull.optional(),
  secondes: Num,
  debut: Text,
  fin: Text,
});
const Multi = z.looseObject({
  pseudo: Text,
  secondes: Num,
  fois: NumOrNull.optional(),
  record: NumOrNull.optional(),
  en_cours: z.boolean().nullable().optional(),
});
const Pantheon = z.looseObject({
  defenses: z.array(Great).nullable().optional(),
  duree: z.array(Great).nullable().optional(),
  doubles: z.array(Multi).nullable().optional(),
  triples: z.array(Multi).nullable().optional(),
});
export type Pantheon = z.infer<typeof Pantheon>;
export type GreatReign = z.infer<typeof Great>;
export type MultiChampion = z.infer<typeof Multi>;

export async function fetchPantheon(): Promise<Pantheon | null> {
  const { data, error } = await supabase.rpc('pantheon_ceintures', { p_limite: 5 });
  if (error || !data) return null;
  return Pantheon.parse(data);
}

// Refuses a challenge for a belt (through the game server). Returns its answer.
export async function refuseChallenge(division: string): Promise<string> {
  return (await callGame({ mode: 'refuser', division })).text;
}

export const beltKeys = {
  all: ['belts'] as const,
  lock: ['belts', 'lock'] as const,
  pantheon: ['belts', 'pantheon'] as const,
};

// A duration in words, as the legacy page writes it.
export function duration(ms: number): string {
  const m = Math.max(1, Math.round(ms / 6e4));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${String(m % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} jours`;
}

export function longDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const d = Math.floor(h / 24);
  if (d) return `${d} jour${d > 1 ? 's' : ''}${h % 24 ? ` ${h % 24} h` : ''}`;
  return h ? `${h} h` : `${Math.max(1, Math.round(seconds / 60))} min`;
}

// The story of a belt: a block per reign (how it began, its defences, how it ended), and the
// vacancies between reigns, with the draws played while vacant. Newest first.
export type StoryLine = { icon: string; text: string; at: string | null };
export type StoryBlock =
  | { kind: 'reign'; reign: Reign; lines: StoryLine[] }
  | {
      kind: 'vacant';
      until: string | null;
      since: string | null;
      draws: TitleCombat[];
      fromStart: boolean;
    };

const time = (x: string) => new Date(x).getTime();
const near = (a: string, b: string) => Math.abs(time(a) - time(b)) < 5000;
const other = (c: TitleCombat, id: string) =>
  c.challenger === id ? (c.pseudo_adversaire ?? '?') : (c.pseudo_challenger ?? '?');

export function beltStory(state: BeltsState, division: string): StoryBlock[] {
  const reigns = state.reigns
    .filter((r) => r.division === division)
    .sort((x, y) => time(x.debut) - time(y.debut));
  const combats = state.combats.filter((c) => c.division === division);
  // The reign in place just before a combat (none: the belt was vacant).
  const before = (c: TitleCombat) =>
    reigns.find(
      (r) =>
        time(r.debut) < time(c.fini_le) - 5000 && (!r.fin || time(r.fin) >= time(c.fini_le) - 5000),
    );
  const out: StoryBlock[] = [];
  reigns.forEach((r, k) => {
    const lines: StoryLine[] = [];
    const first = combats.find((c) => near(c.fini_le, r.debut) && c.gagnant === r.joueur);
    lines.push(
      first
        ? {
            icon: '👑',
            text: `Prend la ceinture${first.pour_champion ? '' : ' vacante'} en battant ${other(first, r.joueur)}`,
            at: r.debut,
          }
        : { icon: '👑', text: 'Devient champion', at: r.debut },
    );
    combats
      .filter((c) => before(c) === r && (c.gagnant === r.joueur || c.gagnant == null))
      .sort((x, y) => time(x.fini_le) - time(y.fini_le))
      .forEach((c) =>
        lines.push(
          c.gagnant == null
            ? {
                icon: '🤝',
                text: `Match nul contre ${other(c, r.joueur)} : garde la ceinture`,
                at: c.fini_le,
              }
            : { icon: '🛡️', text: `Défend contre ${other(c, r.joueur)}`, at: c.fini_le },
        ),
      );
    if (r.fin) {
      const end = r.fin;
      const lost = combats.find((c) => near(c.fini_le, end) && c.gagnant && c.gagnant !== r.joueur);
      lines.push(
        r.raison === 'refus'
          ? { icon: '🏳️', text: '3e refus de défi : la ceinture lui est retirée', at: end }
          : r.raison === 'abandon'
            ? { icon: '🏳️', text: 'Rend sa ceinture, qui devient vacante', at: end }
            : r.raison === 'admin'
              ? { icon: '🛠️', text: 'Ceinture remise en jeu par l’admin', at: end }
              : r.raison === 'inactivite'
                ? {
                    icon: '⏳',
                    text: '7 jours sans combat pour le titre : la ceinture lui est retirée',
                    at: end,
                  }
                : { icon: '⚔️', text: `Battu par ${lost ? other(lost, r.joueur) : '?'}`, at: end },
      );
    }
    out.push({ kind: 'reign', reign: r, lines });
    const next = reigns[k + 1];
    if (r.fin && r.raison !== 'defaite') {
      const end = r.fin;
      out.push({
        kind: 'vacant',
        since: end,
        until: next?.debut ?? null,
        draws: combats.filter(
          (c) =>
            !before(c) &&
            c.gagnant == null &&
            time(c.fini_le) > time(end) &&
            (!next || time(c.fini_le) < time(next.debut)),
        ),
        fromStart: false,
      });
    }
  });
  const firstReign = reigns[0];
  const drawsAtStart = combats.filter(
    (c) =>
      !before(c) && c.gagnant == null && (!firstReign || time(c.fini_le) < time(firstReign.debut)),
  );
  if (!reigns.length || drawsAtStart.length)
    out.unshift({
      kind: 'vacant',
      since: null,
      until: firstReign?.debut ?? null,
      draws: drawsAtStart,
      fromStart: true,
    });
  return out.reverse();
}
