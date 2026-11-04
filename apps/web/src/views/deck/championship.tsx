// A championship deck (33-championnat.sql): one per belt, 15 cards (5 fighters, 5 magics, 5 traps),
// used by the title combats and the tournaments. Rare: common and rare cards only; Épique: up to
// épique; Libre: every rarity. The database checks the deck again when it is saved
// (enregistrer_deck_championnat). As the legacy page's deck modes (dkModes, dkDiv).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { rarityRank } from '@/data/admin';
import type { CollectionEntry } from '@/data/cards';
import { imageUrl } from '@/data/images';
import { DIVISIONS, type Division } from '@/data/tournaments';
import { supabase } from '@/lib/supabase';
import { TONES } from '@/lib/tones';

export const CHAMPIONSHIP_PREFIX = 'ceinture-';
export const PER_TYPE = 5;
const TYPES = { combattant: 'Combattants', magie: 'Magies', piege: 'Pièges' } as const;
type CardType = keyof typeof TYPES;

// Too rare for the belt: the rarity's rank (0 GGEZ … 4 commune) under the belt's limit.
export function tooRare(entry: CollectionEntry, division: Division): boolean {
  const [rank] = rarityRank(entry.card.raretes);
  return rank < 9 && rank < DIVISIONS[division].max;
}

async function saveChampionshipDeck(division: Division, cards: number[]): Promise<void> {
  const { error } = await supabase.rpc('enregistrer_deck_championnat', {
    p_division: division,
    p_cartes: cards,
  });
  if (error) throw new Error(error.message);
}

export function ChampionshipEditor({
  division,
  saved,
  owned,
  images,
}: {
  division: Division;
  saved: number[];
  owned: CollectionEntry[];
  images: Set<string>;
}) {
  const client = useQueryClient();
  const [cards, setCards] = useState<number[]>(saved);
  const [type, setType] = useState<CardType>('combattant');
  const [query, setQuery] = useState('');
  const save = useMutation({
    mutationFn: (list: number[]) => saveChampionshipDeck(division, list),
    onSettled: () => client.invalidateQueries({ queryKey: ['championshipDecks'] }),
  });
  const d = DIVISIONS[division];
  const byId = new Map(owned.map((e) => [e.card.id, e]));
  const inType = (t: CardType) => cards.filter((id) => byId.get(id)?.card.type === t);
  const complete = (['combattant', 'magie', 'piege'] as const).every(
    (t) => inType(t).length === PER_TYPE,
  );
  const changed = JSON.stringify([...cards].sort()) !== JSON.stringify([...saved].sort());
  const needle = query.trim().toLowerCase();
  const pool = owned.filter(
    (e) => e.card.type === type && (!needle || e.card.nom.toLowerCase().includes(needle)),
  );
  const toggle = (e: CollectionEntry) => {
    if (cards.includes(e.card.id)) setCards(cards.filter((id) => id !== e.card.id));
    else if (!tooRare(e, division) && inType(e.card.type).length < PER_TYPE)
      setCards([...cards, e.card.id]);
  };
  const picture = (e: CollectionEntry) => imageUrl(e.variant.image_path, images);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">
          {d.icon} Deck de championnat · {d.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          15 cartes : 5 combattants, 5 magies, 5 pièges, pour les combats pour le titre et les
          tournois de cette ceinture.{' '}
          {division === 'rare'
            ? 'Cartes communes et rares seulement.'
            : division === 'epique'
              ? "Jusqu'aux cartes épiques."
              : 'Toutes les raretés.'}{' '}
          Une carte figure une seule fois.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {(['combattant', 'magie', 'piege'] as const).map((t) => {
          const list = inType(t);
          return (
            <section key={t} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {TYPES[t]}
                <Badge variant={list.length === PER_TYPE ? 'success' : 'warning'}>
                  {list.length}/{PER_TYPE}
                </Badge>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {Array.from({ length: PER_TYPE }, (_, i) => {
                  const e = byId.get(list[i] ?? -1);
                  const src = e ? picture(e) : null;
                  return e ? (
                    <button
                      key={e.card.id}
                      type="button"
                      title={`${e.card.nom} : retirer`}
                      onClick={() => toggle(e)}
                      className="cursor-pointer"
                    >
                      {src ? (
                        <img
                          src={src}
                          alt={e.card.nom}
                          className="aspect-5/7 w-full rounded-sm object-cover"
                        />
                      ) : (
                        <span className="block aspect-5/7 w-full rounded-sm bg-muted text-xs">
                          {e.card.nom}
                        </span>
                      )}
                    </button>
                  ) : (
                    <span
                      key={`empty-${i}`}
                      className="block aspect-5/7 w-full rounded-sm border border-dashed"
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={save.isPending || !changed || (!complete && cards.length > 0)}
          onClick={() => save.mutate(cards)}
        >
          {save.isPending ? 'Enregistrement…' : 'Enregistrer le deck'}
        </Button>
        {saved.length > 0 && (
          <HoldButton
            variant="destructive-ghost"
            disabled={save.isPending}
            onConfirm={() => {
              setCards([]);
              save.mutate([]);
            }}
          >
            Vider ce deck
          </HoldButton>
        )}
        {!complete && cards.length > 0 && (
          <small className={TONES.warning.text}>
            Il faut exactement 5 cartes de chaque type pour l'enregistrer.
          </small>
        )}
        {save.isSuccess && !changed && (
          <small className={TONES.success.text}>Deck enregistré ✓</small>
        )}
        {save.error && (
          <small role="alert" className="text-destructive">
            {save.error.message}
          </small>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            value={type}
            onValueChange={(v) => v && setType(v as CardType)}
          >
            {Object.entries(TYPES).map(([k, label]) => (
              <ToggleGroupItem key={k} value={k}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une carte…"
            className="max-w-xs"
          />
        </div>
        <div className="grid grid-tiles-sm gap-3">
          {pool.map((e) => {
            const chosen = cards.includes(e.card.id);
            const rare = tooRare(e, division);
            const src = picture(e);
            return (
              <button
                key={e.card.id}
                type="button"
                disabled={rare && !chosen}
                onClick={() => toggle(e)}
                title={
                  rare
                    ? `Trop rare pour la ${d.name}`
                    : chosen
                      ? 'Retirer du deck'
                      : 'Ajouter au deck'
                }
                className={`flex cursor-pointer flex-col gap-1 rounded-lg p-1 text-left text-xs transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 ${chosen ? 'bg-primary/10 ring-2 ring-primary' : ''}`}
              >
                {src ? (
                  <img
                    loading="lazy"
                    src={src}
                    alt=""
                    className="aspect-5/7 w-full rounded-md object-cover"
                  />
                ) : (
                  <div className="aspect-5/7 w-full rounded-md bg-muted" />
                )}
                <span className="line-clamp-1">{e.card.nom}</span>
                <small className="text-muted-foreground">{e.card.raretes?.nom ?? ''}</small>
              </button>
            );
          })}
          {!pool.length && <p className="text-sm text-muted-foreground">Aucune carte.</p>}
        </div>
      </section>
    </div>
  );
}
