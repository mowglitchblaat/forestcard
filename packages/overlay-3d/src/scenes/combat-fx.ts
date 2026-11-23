// What the combat scene plays for the journal lines of the mechanics (scenes/combat.ts plays the deal,
// the turns, the blows, the numbers, the statuses of the bench; this, everything else): which status,
// which mark, which move, on which card. Kept apart so that the scene stays readable; the scene calls
// `mechanicsOf` for every line, after the numbers are synced and before its own handling.
//
// Most of it is detached (the line's pace, config/combat.ts, gives it time); the great moments (a card
// broken, brought back, an ultimate) are awaited, so that the next line waits for them.
// The journal's fields are read from the line (packages/journal/src/project.ts says what each carries).

import type { Application } from 'pixi.js';
import type { Card } from '../card/card.ts';
import type { Particles } from '../engine/particles.ts';
import { detach } from '../engine/time.ts';
import type { CombatLine } from '../input/combat-message.ts';
import type { CardMarks } from '../marks/host.ts';
import { CardMoves } from '../moves/host.ts';
import type { MoveKind } from '../moves/registry.ts';
import type { CardStatuses } from '../status/host.ts';
import { isTerrain, type CombatTerrain } from './terrain.ts';
import type { LegacyEffects } from '../legacy/effects.ts';

export type FxFighter = { card: Card; statuses: CardStatuses; marks: CardMarks; moves: CardMoves };
export type FxSide = { fighter: FxFighter; magic: Card | null; trap: Card | null };

export type MechanicsContext = {
  app: Application;
  sides: () => readonly FxSide[];
  terrain: CombatTerrain;
  sparks: Particles; // the scene's particles, for the terrain's bursts
  // where a fighter stands on the stage, and its height there
  at: (side: 0 | 1) => { x: number; y: number; h: number };
  // the author's effects, kept as the legacy drew them (legacy/effects.ts): the fracture's bone, the
  // execution's blades and cut, the swallow, the parasitic link's tendril, the mist
  legacy: LegacyEffects;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const sideOf = (v: unknown): 0 | 1 | null => (v === 0 || v === 1 ? v : null);
const other = (c: 0 | 1): 0 | 1 => (c === 0 ? 1 : 0);

// a stat line's kind that raises, or lowers, what the card is worth
const STAT_UP = new Set(['defense', 'esq', 'fureur', 'bonus']);
const STAT_DOWN = new Set(['calcine']);

export function mechanicsOf(ctx: MechanicsContext) {
  // the moves of a magic or a trap (the fighters have theirs)
  const handMoves = new WeakMap<Card, CardMoves>();
  const movesOn = (card: Card, side: 0 | 1) => {
    let m = handMoves.get(card);
    if (!m) handMoves.set(card, (m = new CardMoves(card, ctx.app, { away: side === 0 ? -1 : 1 })));
    return m;
  };
  const fighter = (c: 0 | 1 | null) => (c === null ? null : (ctx.sides()[c]?.fighter ?? null));
  const move = (c: 0 | 1 | null, kind: MoveKind) => {
    const f = fighter(c);
    if (f) detach(f.moves.play(kind));
  };
  const awaitMove = async (c: 0 | 1 | null, kind: MoveKind) => {
    const f = fighter(c);
    if (f) await f.moves.play(kind);
  };
  const handMove = (c: 0 | 1 | null, slot: 'magic' | 'trap', kind: MoveKind) => {
    if (c === null) return;
    const card = ctx.sides()[c]?.[slot];
    if (card && card.faceUp) detach(movesOn(card, c).play(kind));
  };

  /** Plays what line `l` does to the cards, for the mechanics. Resolves when it may go on. */
  return async function play(l: CombatLine): Promise<void> {
    const c = l.c,
      k = l.k ?? '',
      f = fighter(c),
      raw = l.raw;
    // the legacy's link and mist find the fighters by their side
    const both = ctx.sides();
    ctx.legacy.setFighters(both[0]?.fighter.card ?? null, both[1]?.fighter.card ?? null);
    switch (l.t) {
      case 'ultime':
        if (k === 'contre_ultime') {
          move(sideOf(raw['cible']), 'cancelled');
          return move(c, 'block');
        }
        return awaitMove(c, 'ultimate');
      case 'bloque':
        return move(c, 'block');
      case 'piege':
        if (k === 'bloque') move(c, 'block');
        return;
      case 'protege':
        return awaitMove(c, 'deathAvoid');
      case 'missile':
        return move(c, 'missile');
      case 'souffle':
        return move(c, 'breath');
      case 'detonation':
        return move(c, 'detonate');
      case 'reanim_mort':
        f?.statuses.clear();
        if (f) detach(f.marks.clear());
        // an executed card already lies in two halves: it does not break a second time
        if (f && ctx.legacy.isCut(f.card)) return;
        return awaitMove(c, 'shatter');
      case 'reanim':
        if (f && ctx.legacy.isCut(f.card)) return ctx.legacy.reformCut(f.card);
        return awaitMove(c, 'reform');
      case 'terrain': {
        const t = raw['terrain'];
        if (isTerrain(t)) detach(ctx.terrain.set(t));
        return;
      }
      case 'vol':
        switch (k) {
          case 'piege_detruit': {
            // cut by an execution: the red blade goes through it, it falls in two halves (legacy)
            const trap = c === null ? null : ctx.sides()[c]?.trap;
            if (trap && raw['tranche']) return ctx.legacy.sliceTrap(trap);
            return handMove(c, 'trap', 'shatter');
          }
          case 'magie_annulee':
            return handMove(c, 'magic', 'cancelled');
          case 'vol_carte':
          case 'vol_ultime':
          case 'copie_ultime': {
            const from = sideOf(raw['from']) ?? (c === null ? null : other(c));
            return move(from, 'steal');
          }
        }
        return;
      case 'stat':
        if (k === 'echange') return move(c ?? sideOf((raw['cs'] as unknown[] | undefined)?.[0]), 'swap');
        if (STAT_UP.has(k)) return move(c, 'buff');
        if (STAT_DOWN.has(k)) return move(c, 'debuff');
        return;
      case 'soin':
        return move(c, 'heal');
      case 'degats':
        switch (k) {
          case 'laser':
            return move(c, 'laser');
          case 'fauche':
            return move(c, 'reap');
          case 'orage':
            return move(c, 'lightning');
          case 'execution':
            return move(c, 'execute');
          case 'detonation':
            return move(c, 'detonate');
          case 'souffle':
            return move(c, 'breath');
          case 'choc':
            return move(c, 'iceBurst');
          case 'lames':
            if (f) detach(f.marks.tick('blades'));
            return;
          case 'renvoi': {
            // the blow came back: the mirror is on the card that sent it back
            const from = sideOf(raw['from']) ?? (c === null ? null : other(c));
            return move(from, 'mirror');
          }
          case 'epines':
          case 'replique':
            if (c !== null) move(other(c), 'thorns');
            return;
          case 'mache': {
            // the swallower chews (legacy: teeth, CRUNCH !, the belly's points); "(bite/bites)" in the text
            const by = sideOf(raw['by']);
            const eater = by === null ? null : fighter(by);
            const m = /\((\d+)\/(\d+)\)/.exec(l.txt);
            const bites = m ? Number(m[2]) : 1,
              bite = m ? Number(m[1]) : bites;
            if (eater) await ctx.legacy.chew(eater.card, bite, bites, null, null);
            return;
          }
          case 'fracture':
            // the bone tenses, trembles, breaks (legacy)
            if (f) detach(ctx.legacy.fracture(f.card));
            return;
        }
        return;
    }
    if (l.t !== 'statut' && l.t !== 'finstatut') return;
    const on = l.t === 'statut';
    if (!f) {
      // a terrain acting on a card may still name no fighter
      return;
    }
    if (!on) {
      switch (k) {
        case 'brume':
          return ctx.legacy.mistEnd(c!);
        case 'enracinement':
          return f.statuses.set('roots', false);
        case 'courant':
        case 'surcharge':
        case 'foudre':
          return f.statuses.set('volt', false);
        case 'lien': {
          const nb = num(raw['nb']) ?? 0;
          return ctx.legacy.link(c!, null, nb > 0, nb);
        }
        case 'marque':
          // a mark taken away: the blades above what is left go
          return ctx.legacy.marksDown(f.card, l.n ?? 0);
        case 'cible':
          return detach(f.marks.set('target', 0));
        case 'garde':
          return detach(f.marks.set('guard', 0));
      }
      return;
    }
    switch (k) {
      // the terrains acting on a card
      case 'essaim':
      case 'foret':
      case 'cathedrale':
      case 'lune':
      case 'grimoire':
      case 'theatre': {
        if (c !== null) {
          const p = ctx.at(c);
          ctx.terrain.act(ctx.sparks, p.x, p.y, p.h);
        }
        if (k === 'foret') move(c, 'heal');
        if (k === 'cathedrale') detach(f.marks.tick('programmed'));
        return;
      }
      case 'orage':
      case 'foudre_coup':
        return move(sideOf(raw['cible']) ?? c, 'lightning');
      case 'foudre_rebond':
        return handMove(c, raw['s'] === 'piege' ? 'trap' : 'magic', 'lightning');
      case 'foudre':
        f.statuses.set('volt', true, { level: num(raw['n']) ?? 1 });
        return;
      // the threads and the control
      case 'fils':
        return detach(f.marks.set('threads', num(raw['n']) ?? 1));
      case 'fils_cout':
        detach(f.statuses.tick('puppet'));
        return detach(f.marks.tick('threads'));
      // the parasitic link (legacy: a tendril of flesh between the two cards)
      case 'lien':
        return ctx.legacy.link(c!, sideOf(raw['to']), true, num(raw['nb']) ?? 1);
      case 'lien_soin':
        return detach(ctx.legacy.linkHeal(c!));
      // the execution (legacy: a blade for each mark, then the red slash that cuts the card in two)
      case 'marque':
        return detach(ctx.legacy.markBlade(f.card, l.n ?? 1));
      case 'execution':
        return ctx.legacy.execute(f.card);
      case 'fracture':
        detach(ctx.legacy.fracture(f.card));
        return;
      // the shield
      case 'bouclier':
        if (!f.marks.level('shield')) detach(f.marks.set('shield', 1));
        return;
      case 'couche':
        return detach(f.marks.set('shield', Math.max(1, num(raw['n']) ?? 1)));
      case 'bouclier_encaisse': {
        const left = num(raw['v']);
        if (left !== null && left <= 0) return detach(f.marks.set('shield', 0, 'drop'));
        return detach(f.marks.tick('shield'));
      }
      // the aim
      case 'cible':
        return detach(f.marks.set('target', Math.max(1, num(raw['n']) ?? 1)));
      case 'visee':
        if (!f.marks.level('target')) detach(f.marks.set('target', 1));
        return detach(f.marks.tick('target'));
      case 'cible_rate':
        return detach(f.marks.set('target', 0, 'drop'));
      case 'headshot':
        return move(sideOf(raw['cible']) ?? (c === null ? null : other(c)), 'headshot');
      case 'critique':
        return move(sideOf(raw['cible']) ?? (c === null ? null : other(c)), 'critical');
      // the guard
      case 'garde':
        return detach(f.marks.set('guard', 1));
      // the forge
      case 'forge':
        detach(f.marks.set('forge', num(raw['n']) ?? f.marks.level('forge') + 1));
        return move(c, 'forgeStrike');
      case 'forge_vide':
        return move(c, 'forgeStrike');
      case 'forge_creation':
        return move(c, 'forgeCreate');
      case 'arme_feu':
        return detach(f.marks.tick('forge'));
      // blades and charges
      case 'lames':
        return detach(f.marks.set('blades', num(raw['n']) ?? 1));
      case 'charge':
        return detach(f.marks.set('charges', num(raw['n']) ?? 1));
      case 'jauge_pleine':
        return detach(f.marks.tick('charges'));
      case 'volt':
        f.statuses.set('volt', true, { level: num(raw['n']) ?? 1 });
        if (raw['plein'] === 1) detach(f.statuses.tick('volt'));
        return;
      case 'courant':
        f.statuses.set('volt', true, { level: Math.max(1, num(raw['s']) ?? 1) });
        return;
      case 'surcharge':
        f.statuses.set('volt', true, { level: 4 });
        return;
      case 'decharge':
        detach(f.statuses.tick('volt'));
        detach(f.marks.tick('charges'));
        return;
      // mist, roots, mutation, molt
      // the mist (legacy: fog turning around the card; level 2, the turned wind)
      case 'brume':
        return ctx.legacy.mist(c!, num(raw['n']) ?? 1);
      case 'brume_bloque':
        return ctx.legacy.mistBlocks(c!, raw['s']);
      case 'brume_renvoi': {
        const to = sideOf(raw['to']) ?? other(c!);
        return detach(ctx.legacy.mistReturns(c!, to, raw['s']));
      }
      case 'enracinement':
        f.statuses.set('roots', true);
        return detach(f.statuses.tick('roots'));
      case 'mutation': {
        const was = f.statuses.has('mutation');
        f.statuses.set('mutation', true, { level: num(raw['niv']) ?? 1 });
        if (was) detach(f.statuses.tick('mutation'));
        return;
      }
      case 'mue_debut':
        f.statuses.set('molt', true);
        return;
      case 'mue':
        detach(f.statuses.tick('molt'));
        // the molt sheds the statuses and the marks; the links go with it
        detach(f.marks.set('links', 0, 'drop'));
        setTimeout(() => f.statuses.set('molt', false), 900);
        return;
      // the swallow (legacy: fork and knife, the tongue, the belly, the teeth, the spit)
      case 'av_marque':
        f.marks.set('swallow', l.n ?? 1);
        ctx.legacy.say(f.card, l.n === 2 ? '🔪 Couteau' : '🍴 Fourchette', '#e2e8f0');
        return;
      case 'av_rate':
        detach(f.marks.set('swallow', 0, 'drop'));
        ctx.legacy.say(f.card, 'Trop gros à avaler !', '#fca5a5');
        return;
      case 'aval_prep':
        return ctx.legacy.say(f.card, '🍴 Prêt à avaler', '#f9a8d4');
      case 'avale': {
        const v = fighter(sideOf(raw['cible']));
        if (!v) return;
        detach(v.marks.set('swallow', 0));
        return ctx.legacy.swallow(f.card, v.card);
      }
      case 'av_transfert': {
        const from = fighter(sideOf(raw['from']));
        if (from) await ctx.legacy.passStatuses(f.card, from.card, Array.isArray(raw['ks']) ? (raw['ks'] as string[]) : []);
        return;
      }
      case 'recrache': {
        const v = fighter(sideOf(raw['cible']));
        if (v) return ctx.legacy.spit(f.card, v.card);
        return;
      }
      case 'digere_debut':
        return ctx.legacy.say(f.card, '😴 Digestion…', '#c4b5fd');
      case 'digere':
        return ctx.legacy.say(f.card, '😴 Digère', '#c4b5fd');
      // ice and fire
      case 'glaciation':
        return detach(f.statuses.tick('frost'));
      case 'eclat_glace':
        return move(c, 'iceBurst');
      case 'degel':
      case 'feu_eteint':
      case 'vaporisation':
        return move(c, 'steam');
      // life
      case 'regen':
      case 'sangsue_soin':
        return move(c, 'heal');
      case 'sangsue':
        return move(c, 'drain');
      case 'purif':
        return move(c, 'purify');
      case 'riposte':
        return move(c, 'thorns');
      case 'protection_brisee':
        return move(c, 'wardBreak');
      case 'magie_annulee':
        return handMove(c, 'magic', 'cancelled');
      case 'magie_miroir':
        return handMove(c, 'magic', 'mirror');
      case 'piege_rearme':
      case 'piege_amorce':
        return handMove(c, 'trap', 'buff');
      case 'ultime_desespoir':
        return move(c, 'ultimate');
    }
  };
}
