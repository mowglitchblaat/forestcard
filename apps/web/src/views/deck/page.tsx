// "Mon deck", reworked to be explicit (the legacy page mixed the combat deck, the saved decks and an
// unsaved working copy in one menu). Two notions only:
//   - the player's decks, each with a name;
//   - one of them carries the "Deck de combat" mark: the cards the player's combats use. A role,
//     not a moment: "En combat" read as a fight going on.
// An inner sidebar lists the decks with their state (deck de combat, n/10), always in view; the deck
// picked shows beside it (editor.tsx), the combat deck on arrival. Its cards change only in the
// edition mode ("Modifier les cartes"), with the player's cards beside. Saving the combat deck updates
// the combats in the same gesture, so the mark never lies.
// A combat deck saved under no name (a player who never saved a deck) shows as "Sans nom", to be
// named before it can be edited.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { TONES } from '@/lib/tones';
import { ICONS } from '@/lib/icons';
import { type ReactNode, useMemo, useState } from 'react';
import { CollectionSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cardKeys, type CollectionEntry, fetchCollection } from '@/data/cards';
import {
  deckKeys,
  fetchCombatDeck,
  fetchDecks,
  MAX_DECKS,
  type SavedDeck,
  saveDeck,
} from '@/data/decks';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { useSession } from '@/lib/session';
import { draftKey, hasDraft } from './draft';
import { DeckEditor } from './editor';
import { byCard, type Composition, combatDeckId, compose, DECK_SIZE } from './model';
import { CompositionBar, NameDialog, Slots } from './parts';
import { NEW_DECK } from './search';

const route = getRouteApi('/deck');
// The combat deck when it has no name: it has no id either.
export const UNNAMED = 'sans-nom';

export function DeckPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const userId = useSession()?.user.id ?? '';
  const decks = useQuery({ queryKey: deckKeys.saved, queryFn: fetchDecks });
  const combat = useQuery({
    queryKey: deckKeys.combat(userId),
    queryFn: () => fetchCombatDeck(userId),
    enabled: userId !== '',
  });
  const collection = useQuery({
    queryKey: cardKeys.collection(userId),
    queryFn: () => fetchCollection(userId),
    enabled: userId !== '',
  });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const owned = useMemo(() => byCard(collection.data ?? []), [collection.data]);
  const [creating, setCreating] = useState(false);

  const error = decks.error ?? combat.error ?? collection.error;
  if (error) return <p role="alert">Decks indisponibles pour le moment : {error.message}</p>;
  if (!decks.data || !combat.data || !collection.data) return <CollectionSkeleton />;

  const images = mirror.data ?? new Set<string>();
  const inCombat = combatDeckId(decks.data, combat.data);
  const unnamed = combat.data.length > 0 && inCombat === null;
  const sorted = [...decks.data].sort(
    (a, b) =>
      Number(b.id === inCombat) - Number(a.id === inCombat) || a.nom.localeCompare(b.nom, 'fr'),
  );
  // The deck open: the one in the address, else the combat deck, else the first.
  const open = search.deck ?? inCombat ?? (unnamed ? UNNAMED : (sorted[0]?.id ?? null));
  const full = decks.data.length >= MAX_DECKS;
  const typeOf = typeOfIn(owned);

  let main;
  if (open === null)
    main = (
      <p className="text-muted-foreground">
        Aucun deck pour l'instant : crée ton premier avec « Nouveau deck ».
      </p>
    );
  else if (open === UNNAMED)
    main = (
      <UnnamedCombat
        combat={combat.data}
        owned={owned}
        images={images}
        decks={decks.data}
        full={full}
      />
    );
  else {
    const saved = decks.data.find((d) => d.id === open) ?? null;
    main =
      saved || open === NEW_DECK ? (
        // A new key on entering or leaving the edition: leaving starts again from the saved deck.
        <DeckEditor
          key={`${open}:${search.mode ?? ''}`}
          deckKey={open}
          editing={search.mode === 'edition' || open === NEW_DECK}
          name={saved?.nom ?? search.nom ?? 'Nouveau deck'}
          saved={saved}
          inCombat={!!saved && saved.id === inCombat}
          owned={owned}
          decks={decks.data}
          images={images}
        />
      ) : (
        <p>Ce deck n'existe plus. Choisis-en un autre à gauche.</p>
      );
  }

  return (
    <div className="grid items-start gap-6 lg:layout-aside-main-14">
      <nav aria-label="Mes decks" className="flex flex-col gap-2 lg:sticky lg:top-4">
        <Button size="sm" onClick={() => setCreating(true)} disabled={full}>
          <ICONS.add /> Nouveau deck
        </Button>
        {full && (
          <p className="text-xs text-muted-foreground">
            {MAX_DECKS} decks au maximum : supprimes-en un d'abord.
          </p>
        )}
        <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {open === NEW_DECK && (
            <NavItem active label={search.nom ?? 'Nouveau deck'} detail="pas enregistré" />
          )}
          {unnamed && (
            <NavItem
              active={open === UNNAMED}
              to={UNNAMED}
              label="Sans nom"
              combat
              detail={<Fill c={compose(combat.data, typeOf)} />}
            />
          )}
          {sorted.map((d) => {
            const cards = d.cartes.filter((id) => typeOf(id));
            const c = compose(cards, typeOf);
            return (
              <NavItem
                key={d.id}
                active={open === d.id}
                to={d.id}
                label={d.nom}
                combat={d.id === inCombat}
                draft={hasDraft(draftKey(d.id))}
                detail={<Fill c={c} />}
              />
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          {decks.data.length
            ? `Decks enregistrés : ${decks.data.length} sur ${MAX_DECKS} possibles.`
            : `Aucun deck enregistré (${MAX_DECKS} possibles).`}{' '}
          Ton <b className="text-foreground">deck de combat</b> est celui que tes combats utilisent.
        </p>
      </nav>

      <div className="min-w-0">{main}</div>

      <NameDialog
        open={creating}
        onOpenChange={setCreating}
        title="Nouveau deck"
        description="Il sera enregistré quand tu cliqueras sur « Enregistrer »."
        decks={decks.data}
        confirm="Créer"
        onSubmit={(nom) => {
          setCreating(false);
          void navigate({ search: { deck: NEW_DECK, nom } });
        }}
      />
    </div>
  );
}

// How full a deck is, in the sidebar: a check once complete, the count in orange until then; the
// meaning on hover.
function Fill({ c }: { c: Composition }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {c.complete ? (
          <ICONS.complete className={`size-4 ${TONES.success.text}`} aria-label="Complet" />
        ) : (
          <span className={TONES.warning.text}>
            {c.size}/{DECK_SIZE}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>
        {c.complete
          ? 'Complet : 10 cartes, au moins 3 de chaque type'
          : `Incomplet : ${c.size} carte${c.size > 1 ? 's' : ''} sur ${DECK_SIZE}, il faut au moins 3 de chaque type`}
      </TooltipContent>
    </Tooltip>
  );
}

// An entry of the deck sidebar: its name, the sword of the combat deck, its fill.
function NavItem({
  active,
  to,
  label,
  combat,
  draft,
  detail,
}: {
  active: boolean;
  to?: string;
  label: string;
  combat?: boolean;
  // Changes not saved, kept as a draft.
  draft?: boolean;
  detail: ReactNode;
}) {
  const className = `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap transition hover:bg-accent ${
    active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground'
  }`;
  const body = (
    <>
      {combat ? (
        <ICONS.combat
          className={`size-4 shrink-0 ${TONES.success.text}`}
          aria-label="Deck de combat"
        />
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <span className="truncate">{label}</span>
      {draft && (
        <span
          aria-label="Modifications non enregistrées"
          title="Modifications non enregistrées"
          className={`size-2 shrink-0 rounded-full ${TONES.warning.fill}`}
        />
      )}
      <span className="ml-auto text-xs tabular-nums">{detail}</span>
    </>
  );
  return (
    <li>
      {to ? (
        <Link
          to="/deck"
          search={{ deck: to }}
          aria-current={active ? 'page' : undefined}
          className={className}
        >
          {body}
        </Link>
      ) : (
        <span aria-current="page" className={className}>
          {body}
        </span>
      )}
    </li>
  );
}

export const typeOfIn = (owned: CollectionEntry[]) => {
  const types = new Map(owned.map((e) => [e.card.id, e.card.type]));
  return (id: number) => types.get(id);
};

// The combat deck under no name: shown, and named on the way to editing it ("Modifier les cartes"
// asks the name, then opens the edition), or just named.
function UnnamedCombat({
  combat,
  owned,
  images,
  decks,
  full,
}: {
  combat: number[];
  owned: CollectionEntry[];
  images: Set<string>;
  decks: SavedDeck[];
  full: boolean;
}) {
  const navigate = route.useNavigate();
  const client = useQueryClient();
  // What naming leads to: the edition, or the deck shown under its name.
  const [naming, setNaming] = useState<'edit' | 'name' | null>(null);
  const name = useMutation({
    mutationFn: (nom: string) => saveDeck(nom, combat),
    onSuccess: async (id) => {
      await client.invalidateQueries({ queryKey: deckKeys.saved });
      const then = naming;
      setNaming(null);
      void navigate({
        search: { deck: id, mode: then === 'edit' ? 'edition' : undefined },
        replace: true,
      });
    },
  });
  const entries = owned.filter((e) => combat.includes(e.card.id));
  return (
    <div className="flex max-w-xl flex-col gap-4 rounded-xl border border-success/50 bg-card p-4 text-card-foreground">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Sans nom</h2>
        <span className={`flex items-center gap-1.5 text-sm ${TONES.success.text}`}>
          <ICONS.combat className="size-4" /> Deck de combat
        </span>
      </div>
      <CompositionBar c={compose(combat, typeOfIn(owned))} />
      <Slots entries={entries} image={(e) => imageUrl(e.variant.image_path, images)} />
      <p className="text-sm text-muted-foreground">
        Tes combats utilisent ce deck, mais il n'est enregistré sous aucun nom : pour modifier ses
        cartes, donne-lui d'abord un nom. Il reste ton deck de combat.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setNaming('edit')} disabled={full}>
          <ICONS.edit /> Modifier les cartes
        </Button>
        <Button variant="ghost" onClick={() => setNaming('name')} disabled={full}>
          Lui donner un nom
        </Button>
      </div>
      {full && (
        <p className="text-xs text-muted-foreground">
          {MAX_DECKS} decks au maximum : supprimes-en un d'abord.
        </p>
      )}
      <NameDialog
        open={naming !== null}
        onOpenChange={(open) => !open && setNaming(null)}
        title={naming === 'edit' ? 'D’abord, un nom pour ce deck' : 'Nommer ton deck de combat'}
        description="Il reste ton deck de combat ; il apparaîtra sous ce nom."
        decks={decks}
        confirm={naming === 'edit' ? 'Nommer et modifier' : 'Enregistrer'}
        pending={name.isPending}
        error={name.error?.message}
        onSubmit={(nom) => name.mutate(nom)}
      />
    </div>
  );
}
