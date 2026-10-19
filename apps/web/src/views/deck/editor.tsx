// One deck. Shown: its slots, its state and its actions (rename, make it the combat deck, delete).
// In the edition mode ("Modifier les cartes"): the player's cards beside the slots, a click puts a
// card in or out, the magnifier opens its details. The buttons follow the deck's state: nothing
// changed, "Terminer"; changes, "Enregistrer" (saves and leaves the edition) or hold to cancel
// them (the deck back as saved, still in the edition). Changes not saved are kept as a draft
// (draft.ts): a reload or a closed tab loses nothing, and the deck offers to resume them. For the combat deck, saving also changes the cards of the next combats,
// and the page says so. Leaving otherwise with changes not saved (another deck, a link) asks:
// save, drop the changes (holding the button), or stay.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useBlocker } from '@tanstack/react-router';
import { TONES } from '@/lib/tones';
import { ICONS } from '@/lib/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CollectionEntry } from '@/data/cards';
import { deckKeys, deleteDeck, type SavedDeck, saveDeck, setCombatDeck } from '@/data/decks';
import { imageUrl } from '@/data/images';
import { useSession } from '@/lib/session';
import { CardBrowser } from '@/views/collection/browser';
import type { CollectionSearch } from '@/views/collection/search';
import { clearDraft, draftKey, hasDraft, loadDraft, saveDraft } from './draft';
import { compose, refusal, sameCards } from './model';
import { CompositionBar, NameDialog, Slots } from './parts';
import { NEW_DECK } from './search';

const route = getRouteApi('/deck');

export function DeckEditor({
  deckKey,
  editing,
  name,
  saved,
  inCombat,
  owned,
  decks,
  images,
}: {
  deckKey: string;
  editing: boolean;
  name: string;
  saved: SavedDeck | null;
  inCombat: boolean;
  owned: CollectionEntry[];
  decks: SavedDeck[];
  images: Set<string>;
}) {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const client = useQueryClient();
  const userId = useSession()?.user.id ?? '';
  const isNew = deckKey === NEW_DECK;

  const types = useMemo(() => new Map(owned.map((e) => [e.card.id, e.card.type])), [owned]);
  const typeOf = (id: number) => types.get(id);
  const stored = saved?.cartes ?? [];
  // Cards of the deck no longer in the collection: left out, and saving removes them.
  const missing = stored.filter((id) => !types.has(id));
  const [savedIds, setSavedIds] = useState(stored);
  const draft = draftKey(deckKey, isNew ? name : undefined);
  // In the edition, the changes left there last time (a reload, a closed tab).
  const [restored] = useState(() => (editing ? loadDraft(draft, stored) : null));
  const [ids, setIds] = useState(() =>
    (Array.isArray(restored) ? restored : stored).filter((id) => types.has(id)),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = isNew ? ids.length > 0 : !sameCards(ids, savedIds);
  const c = compose(ids, typeOf);

  // Why saving is not possible right now (null: it is).
  const blocked =
    ids.length === 0
      ? 'Ajoute au moins une carte.'
      : inCombat && !c.complete
        ? 'C’est ton deck de combat : il doit rester complet (10 cartes, 3 de chaque type), tes prochains combats l’utilisent.'
        : null;

  const save = useMutation({
    mutationFn: async () => {
      const id = await saveDeck(name, ids);
      if (inCombat) await setCombatDeck(ids);
      return id;
    },
    onSuccess: async (id) => {
      setSavedIds(ids);
      clearDraft(draft);
      await Promise.all([
        client.invalidateQueries({ queryKey: deckKeys.saved }),
        client.invalidateQueries({ queryKey: deckKeys.combat(userId) }),
      ]);
      // Saved from the leave dialog: the navigation it held goes on. Otherwise saving ends the
      // edition, on the deck (a new one now has an id).
      if (blocker.status !== 'blocked') leave(id);
    },
  });

  // Leaving the edition by its own buttons: nothing to ask (saved, or dropped on purpose).
  const leaving = useRef(false);
  const leave = (id?: string) => {
    leaving.current = true;
    void navigate({
      search: isNew && !id ? {} : { deck: id ?? deckKey },
      replace: !!id,
      resetScroll: false,
    });
  };

  const blocker = useBlocker({
    shouldBlockFn: ({ next }) =>
      !leaving.current &&
      dirty &&
      !save.isPending &&
      !(
        next.pathname === '/deck' &&
        (next.search as { deck?: string }).deck === deckKey &&
        (next.search as { mode?: string }).mode === 'edition'
      ),
    withResolver: true,
    // No browser prompt on reload or close: the draft keeps the changes (draft.ts). The option is
    // on by default.
    enableBeforeUnload: false,
  });

  // The draft follows the changes: kept while there are some, removed once there are none.
  useEffect(() => {
    if (!editing) return;
    if (dirty) saveDraft(draft, savedIds, ids);
    else clearDraft(draft);
  }, [editing, dirty, draft, savedIds, ids]);

  const set = (patch: Partial<CollectionSearch>) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true, resetScroll: false });
  const byId = new Map(owned.map((e) => [e.card.id, e]));
  const entries = ids.map((id) => byId.get(id)).filter((e): e is CollectionEntry => !!e);

  const toggle = (e: CollectionEntry) => {
    const id = e.card.id;
    if (ids.includes(id)) {
      setIds(ids.filter((x) => x !== id));
      setNotice(null);
      return;
    }
    const why = refusal(ids, id, typeOf);
    setNotice(why);
    if (!why) setIds([...ids, id]);
  };

  return (
    <div className={`grid items-start gap-6 ${editing ? 'xl:layout-aside-main-20' : 'max-w-xl'}`}>
      <aside
        className={`flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground ${
          editing ? 'border-primary/60 xl:sticky xl:top-4' : ''
        }`}
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {editing ? 'Mode édition : tu modifies les cartes de' : 'Deck'}
          </span>
          <div className="flex items-center gap-1">
            <h2 className="text-xl font-semibold">{name}</h2>
            {saved && !editing && <RenameButton deck={saved} inCombat={inCombat} decks={decks} />}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {inCombat && (
              <Badge variant="success">
                <ICONS.combat /> Deck de combat
              </Badge>
            )}
            {isNew && <Badge variant="outline">Nouveau, pas encore enregistré</Badge>}
            {Array.isArray(restored) && dirty && (
              <Badge variant="outline">Modifications retrouvées</Badge>
            )}
            {dirty && !isNew && <Badge variant="warning">Modifié, pas enregistré</Badge>}
            {editing && !dirty && !isNew && <Badge variant="secondary">Enregistré</Badge>}
          </div>
        </div>
        <CompositionBar c={c} />
        <Slots
          entries={entries}
          image={(e) => imageUrl(e.variant.image_path, images)}
          onRemove={editing ? toggle : undefined}
        />
        {missing.length > 0 && (
          <p className={`rounded-lg p-2 text-xs ${TONES.warning.box}`}>
            {missing.length} carte{missing.length > 1 ? 's' : ''} de ce deck ne{' '}
            {missing.length > 1 ? 'sont' : 'est'} plus dans ta collection : l'enregistrement{' '}
            {missing.length > 1 ? 'les' : 'la'} retire.
          </p>
        )}
        {restored === 'stale' && (
          <p className={`rounded-lg p-2 text-xs ${TONES.warning.box}`}>
            Tes modifications non enregistrées ont été écartées : ce deck a été enregistré ailleurs
            depuis.
          </p>
        )}
        {!editing && hasDraft(draft) && (
          <p className={`rounded-lg p-2 text-xs ${TONES.warning.box}`}>
            Tu as des modifications non enregistrées sur ce deck : « Reprendre les modifications »
            les rouvre.
          </p>
        )}
        {!editing && (
          <Button
            onClick={() =>
              void navigate({
                // The deck named in the address: the edition stays on it while the filters change.
                search: (prev) => ({ ...prev, deck: deckKey, mode: 'edition' }),
                resetScroll: false,
              })
            }
          >
            <ICONS.edit /> {hasDraft(draft) ? 'Reprendre les modifications' : 'Modifier les cartes'}
          </Button>
        )}
        {saved && !editing && (
          <DeckActions deck={saved} inCombat={inCombat} complete={c.complete} />
        )}
        {editing && (
          <div className="flex flex-col gap-2">
            {dirty ? (
              <Button
                disabled={!!blocked || save.isPending}
                title={blocked ?? undefined}
                onClick={() => save.mutate()}
              >
                <ICONS.save />
                {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => leave()}>
                <ICONS.done /> Terminer
              </Button>
            )}
            {/* What saving the combat deck does, said beside the button rather than in it. */}
            {inCombat && (
              <p className="flex gap-1.5 text-xs text-muted-foreground">
                <ICONS.combat className={`size-3.5 shrink-0 ${TONES.success.text}`} />
                C'est ton deck de combat : tes prochains combats utiliseront ces cartes dès
                l'enregistrement.
              </p>
            )}
            {dirty && blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}
            {dirty &&
              (isNew ? (
                <HoldButton
                  variant="outline"
                  disabled={save.isPending}
                  onConfirm={() => {
                    clearDraft(draft);
                    leave();
                  }}
                >
                  Maintiens pour abandonner ce deck
                </HoldButton>
              ) : (
                // The deck back as saved; the edition stays open ("Terminer" comes back).
                <HoldButton
                  variant="outline"
                  disabled={save.isPending}
                  onConfirm={() => {
                    setIds(savedIds.filter((id) => types.has(id)));
                    setNotice(null);
                  }}
                >
                  Maintiens pour annuler les changements
                </HoldButton>
              ))}
            {save.error && (
              <p role="alert" className="text-sm text-destructive">
                {save.error.message}
              </p>
            )}
          </div>
        )}
      </aside>

      {editing && (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Clique une carte pour l'ajouter ou la retirer, la loupe pour voir ses détails.
          </p>
          {notice && (
            <p role="status" className={`rounded-lg p-2 text-sm ${TONES.warning.box}`}>
              {notice}
            </p>
          )}
          <CardBrowser
            entries={owned}
            search={search}
            set={set}
            images={images}
            pick={{
              has: (e) => ids.includes(e.card.id),
              refusal: (e) => refusal(ids, e.card.id, typeOf),
              toggle,
            }}
          />
        </div>
      )}

      <Dialog open={blocker.status === 'blocked'} onOpenChange={(o) => !o && blocker.reset?.()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>« {name} » n'est pas enregistré</DialogTitle>
            <DialogDescription>
              Tes modifications seront perdues si tu pars sans enregistrer.
            </DialogDescription>
          </DialogHeader>
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <DialogFooter className="flex-col sm:flex-row">
            <Button variant="ghost" onClick={() => blocker.reset?.()}>
              Rester
            </Button>
            <HoldButton
              variant="outline"
              disabled={save.isPending}
              onConfirm={() => {
                clearDraft(draft);
                blocker.proceed?.();
              }}
            >
              Maintiens pour partir sans enregistrer
            </HoldButton>
            <Button
              disabled={!!blocked || save.isPending}
              title={blocked ?? undefined}
              onClick={() => save.mutate(undefined, { onSuccess: () => blocker.proceed?.() })}
            >
              {save.isPending ? 'Enregistrement…' : 'Enregistrer et partir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const useRefresh = () => {
  const client = useQueryClient();
  const userId = useSession()?.user.id ?? '';
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: deckKeys.saved }),
      client.invalidateQueries({ queryKey: deckKeys.combat(userId) }),
    ]);
};

// The pencil beside the deck's name.
function RenameButton({
  deck,
  inCombat,
  decks,
}: {
  deck: SavedDeck;
  inCombat: boolean;
  decks: SavedDeck[];
}) {
  const navigate = route.useNavigate();
  const refresh = useRefresh();
  const [renaming, setRenaming] = useState(false);
  // Saved under the new name first, then the old one deleted: a failure in between leaves two
  // decks, never none.
  const rename = useMutation({
    mutationFn: async (nom: string) => {
      const id = await saveDeck(nom, deck.cartes);
      await deleteDeck(deck.id);
      return id;
    },
    onSuccess: async (id) => {
      await refresh();
      setRenaming(false);
      void navigate({ search: { deck: id }, replace: true });
    },
  });
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Renommer"
            onClick={() => setRenaming(true)}
          >
            <ICONS.edit />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Renommer</TooltipContent>
      </Tooltip>
      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={`Renommer « ${deck.nom} »`}
        description={inCombat ? 'Il reste ton deck de combat.' : 'Ses cartes ne changent pas.'}
        initial={deck.nom}
        decks={decks}
        self={deck.id}
        confirm="Renommer"
        pending={rename.isPending}
        error={rename.error?.message}
        onSubmit={(nom) => rename.mutate(nom)}
      />
    </>
  );
}

// The deck's actions on itself (shown outside the edition, so on the saved deck).
function DeckActions({
  deck,
  inCombat,
  complete,
}: {
  deck: SavedDeck;
  inCombat: boolean;
  complete: boolean;
}) {
  const navigate = route.useNavigate();
  const refresh = useRefresh();
  const fight = useMutation({ mutationFn: () => setCombatDeck(deck.cartes), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => deleteDeck(deck.id),
    onSuccess: async () => {
      await refresh();
      void navigate({ search: {}, replace: true });
    },
  });
  const error = fight.error ?? remove.error;
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="flex flex-wrap gap-2">
        {!inCombat && (
          <Button
            size="sm"
            variant="outline"
            disabled={!complete || fight.isPending}
            onClick={() => fight.mutate()}
          >
            <ICONS.combat /> {fight.isPending ? 'Changement…' : 'En faire mon deck de combat'}
          </Button>
        )}
        {!inCombat && (
          <HoldButton
            size="sm"
            variant="destructive-ghost"
            disabled={remove.isPending}
            onConfirm={() => remove.mutate()}
          >
            {remove.isPending ? 'Suppression…' : 'Maintiens pour supprimer'}
          </HoldButton>
        )}
      </div>
      {/* The reason in words, not only in a tooltip: a disabled button shows none, and a finger none. */}
      {!inCombat && !complete && (
        <p className="text-xs text-muted-foreground">
          Pour en faire ton deck de combat, il faut un deck complet : 10 cartes, 3 de chaque type.
        </p>
      )}
      {inCombat && (
        <p className="text-xs text-muted-foreground">
          Pour supprimer ce deck, choisis d'abord un autre deck de combat.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
    </div>
  );
}
