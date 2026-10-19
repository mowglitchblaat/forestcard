// Pieces shared by the deck list and the deck editor: the composition counters, the slots, a deck
// in miniature, the name dialog.

import { TONES } from '@/lib/tones';
import { ICONS, type LucideIcon } from '@/lib/icons';
import { type ReactNode, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CARD_TYPES, type CardType, type CollectionEntry } from '@/data/cards';
import type { SavedDeck } from '@/data/decks';
import { CardTooltip } from '@/views/collection/browser';
import { TYPE_LABELS } from '@/views/collection/model';
import { type Composition, DECK_SIZE, layout, nameProblem, PER_TYPE } from './model';

export const TYPE_ICONS: Record<CardType, LucideIcon> = {
  combattant: ICONS.fighter,
  magie: ICONS.magic,
  piege: ICONS.trap,
};

// What the star stands for: the tenth card, of any type.
function FreeCard() {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      Carte libre : <ICONS.fighter className="size-3.5" /> combattant,{' '}
      <ICONS.magic className="size-3.5" /> magie ou <ICONS.trap className="size-3.5" /> piège, au
      choix
    </span>
  );
}

// "⚔ 3/3 ✨ 2/3 🪤 3/3 ★ 1/1 · 9/10": a counter is green once full, orange while something is
// missing (what an incomplete deck lacks, at a glance); its meaning on hover.
export function CompositionBar({ c }: { c: Composition }) {
  const chip = (key: string, Icon: LucideIcon, n: number, of: number, label: ReactNode) => (
    <Tooltip key={key}>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums ${
            n >= of
              ? `border-success/50 ${TONES.success.text}`
              : `border-warning/50 ${TONES.warning.text}`
          }`}
        >
          <Icon className="size-3.5" /> {Math.min(n, of)}/{of}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CARD_TYPES.map((t) => chip(t, TYPE_ICONS[t], c.byType[t], PER_TYPE, TYPE_LABELS[t].many))}
      {chip('libre', ICONS.freeCard, c.free, 1, <FreeCard />)}
      <b
        className={`ml-1 text-sm tabular-nums ${
          c.complete ? TONES.success.text : TONES.warning.text
        }`}
      >
        {c.size}/{DECK_SIZE}
      </b>
    </div>
  );
}

export function DeckStatus({ inCombat, c }: { inCombat: boolean; c: Composition }) {
  if (inCombat)
    return (
      <Badge variant="success">
        <ICONS.combat /> Deck de combat
      </Badge>
    );
  return c.complete ? (
    <Badge variant="secondary">Complet</Badge>
  ) : (
    <Badge variant="outline">
      Incomplet {c.size}/{DECK_SIZE}
    </Badge>
  );
}

// The slots: 3 per type, the free slot, then any card beyond. onRemove: each filled slot removes
// its card when clicked (the editor); none, a picture only (the list).
export function Slots({
  entries,
  image,
  onRemove,
  small,
}: {
  entries: CollectionEntry[];
  image: (e: CollectionEntry) => string | null;
  onRemove?: (e: CollectionEntry) => void;
  small?: boolean;
}) {
  const l = layout(entries);
  const slot = (
    e: CollectionEntry | undefined | null,
    key: string,
    Icon: LucideIcon,
    label: string,
  ) => {
    if (!e)
      return (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <div className="flex aspect-5/7 items-center justify-center rounded-md border-2 border-dashed text-muted-foreground">
              <Icon className={small ? 'size-3' : 'size-5'} />
            </div>
          </TooltipTrigger>
          <TooltipContent>{key === 'libre' ? <FreeCard /> : `Case vide : ${label}`}</TooltipContent>
        </Tooltip>
      );
    const src = image(e);
    const picture = src ? (
      <img src={src} alt={e.card.nom} className="aspect-5/7 w-full rounded-md object-cover" />
    ) : (
      <span className="flex aspect-5/7 items-center justify-center rounded-md bg-muted p-1 text-center text-2xs font-semibold">
        {e.card.nom}
      </span>
    );
    if (!onRemove)
      return (
        <CardTooltip key={key} entry={e}>
          <div>{picture}</div>
        </CardTooltip>
      );
    return (
      <CardTooltip key={key} entry={e} hint="Clic : retirer du deck">
        <button type="button" onClick={() => onRemove(e)} className="group relative block">
          {picture}
          <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-background/90 opacity-0 shadow transition group-hover:opacity-100">
            <ICONS.remove className="size-3.5" />
          </span>
        </button>
      </CardTooltip>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <div className={`grid grid-cols-4 ${small ? 'gap-1' : 'gap-2'}`}>
        {CARD_TYPES.map((t) => [
          ...[0, 1, 2].map((i) =>
            slot(l.byType[t][i], `${t}${i}`, TYPE_ICONS[t], TYPE_LABELS[t].one),
          ),
          // The free slot ends the middle row; the others end with a gap.
          t === 'magie' ? (
            slot(l.free, 'libre', ICONS.freeCard, 'carte libre, de n’importe quel type')
          ) : (
            <div key={`${t}-gap`} />
          ),
        ])}
      </div>
      {l.beyond.length > 0 && (
        <div className={`flex flex-col gap-2 rounded-lg p-2 text-xs ${TONES.warning.box}`}>
          {l.beyond.length} carte{l.beyond.length > 1 ? 's' : ''} en trop : la carte libre est déjà
          prise. {onRemove ? 'Retire-les :' : ''}
          <div className="grid grid-cols-4 gap-2">
            {l.beyond.map((e) => slot(e, `beyond${e.card.id}`, ICONS.freeCard, 'en trop'))}
          </div>
        </div>
      )}
    </div>
  );
}

// Asks a name: trimmed, 1 to 30 characters, not another deck's.
export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  initial = '',
  decks,
  self,
  confirm,
  pending,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initial?: string;
  decks: SavedDeck[];
  self?: string;
  confirm: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const problem = nameProblem(name, decks, self);
  // Renaming to the same name would save and delete the deck for nothing: nothing to confirm.
  const unchanged = initial !== '' && name.trim() === initial.trim();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setName(initial);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem && !unchanged) onSubmit(name.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            maxLength={30}
            placeholder="Nom du deck"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!problem && name !== ''}
          />
          {/* Empty, the reason is a hint (the dialog just opened); otherwise an error. */}
          {problem && (
            <p className={`text-sm ${name === '' ? 'text-muted-foreground' : 'text-destructive'}`}>
              {problem}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!!problem || unchanged || pending}>
              {pending ? 'Enregistrement…' : confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
