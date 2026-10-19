// A card's details: the image (leaning toward the pointer, turning over to the player's back),
// rarity and type, stat bars, the shared effect texts (packages/describe, keywords coloured), the
// description, and for a card of the player (with prices) its copies and the recycling of its
// duplicates.

import { describeCard, type Section } from '@forestcard/describe';
import { useQuery } from '@tanstack/react-query';
import { ICONS, type LucideIcon } from '@/lib/icons';
import { Keywords } from '@/components/keywords';
import { TiltCard } from '@/components/tilt-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { backKeys, fetchBacks } from '@/data/backs';
import type { CollectionEntry } from '@/data/cards';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { gainOf, type Prices } from '@/data/recycling';
import { textOn } from '@/lib/rarity';
import { collectionOf, num, TYPE_LABELS } from './model';
import { RecycleBlock } from './recycle';

const SECTION_ICONS: Record<Section['kind'], LucideIcon> = {
  passives: ICONS.passives,
  ultimate: ICONS.ultimate,
  magic: ICONS.magic,
  trap: ICONS.trap,
};

export function RarityBadge({ entry }: { entry: CollectionEntry }) {
  const { nom, couleur } = entry.card.raretes;
  return (
    <Badge
      variant={couleur ? 'rarity' : 'default'}
      style={{ '--rarity': couleur ?? undefined, '--rarity-ink': textOn(couleur) }}
    >
      {nom}
    </Badge>
  );
}

export function CardImage({
  entry,
  image,
  className,
}: {
  entry: CollectionEntry;
  image: string | null;
  className?: string;
}) {
  return image ? (
    <img
      loading="lazy"
      src={image}
      alt={entry.card.nom}
      className={`aspect-5/7 w-full rounded-lg object-cover ${className ?? ''}`}
    />
  ) : (
    <div
      className={`flex aspect-5/7 w-full items-center justify-center rounded-lg bg-muted p-3 text-center font-semibold ${className ?? ''}`}
    >
      {entry.card.nom}
    </div>
  );
}

export function CardDetails({
  entry,
  image,
  maxAtq,
  maxPv,
  prices,
  onStep,
}: {
  entry: CollectionEntry;
  image: string | null;
  maxAtq: number;
  maxPv: number;
  // None in the catalogue: no copies, nothing to recycle.
  prices?: Prices;
  onStep: ((step: 1 | -1) => void) | null;
}) {
  const { card, variant, quantite } = entry;
  const gain = prices ? gainOf(entry, prices) : null;
  const meta = [TYPE_LABELS[card.type].one, collectionOf(entry), variant.nom].filter(Boolean);
  // The back the card turns over to: the one in use, else the game's own (legacy dosActif).
  const backs = useQuery({ queryKey: backKeys.mine, queryFn: fetchBacks });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const inUse = backs.data?.find((b) => b.actif);
  const back = imageUrl(inUse?.image ?? null, mirror.data ?? new Set());
  const backName = !backs.data
    ? null
    : back && inUse
      ? `Dos équipé : ${inUse.nom}`
      : 'Dos standard du jeu';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Carte précédente"
          disabled={!onStep}
          onClick={() => onStep?.(-1)}
        >
          <ICONS.previous />
        </Button>
        <h2 className="text-center text-lg font-semibold">{card.nom}</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Carte suivante"
          disabled={!onStep}
          onClick={() => onStep?.(1)}
        >
          <ICONS.next />
        </Button>
      </div>
      <div className="mx-auto w-full max-w-64">
        {/* A new card per entry: each one opens face up. */}
        <TiltCard
          key={variant.id}
          front={<CardImage entry={entry} image={image} />}
          back={back}
          backName={backName}
          glow={card.raretes.couleur ?? '#888'}
        />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <RarityBadge entry={entry} />
        <span className="text-muted-foreground">{meta.join(' · ')}</span>
        {prices && <Badge variant="secondary">×{quantite}</Badge>}
      </div>
      {card.type === 'combattant' && (card.atq != null || card.pv != null) && (
        <div className="flex flex-col gap-2">
          <StatBar icon={ICONS.attack} label="ATQ" value={card.atq} max={maxAtq} />
          <StatBar icon={ICONS.hp} label="PV" value={card.pv} max={maxPv} />
        </div>
      )}
      <Effects entry={entry} />
      {card.description && (
        <p className="text-sm text-muted-foreground italic">{card.description}</p>
      )}
      {/* A new block per card: what it paid stays with the card recycled. */}
      {gain && <RecycleBlock key={entry.variant.id} variantId={entry.variant.id} gain={gain} />}
    </div>
  );
}

function StatBar({
  icon: Icon,
  label,
  value,
  max,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string | null;
  max: number;
}) {
  return (
    <div className="grid layout-label-bar-value-sm items-center gap-2 text-sm">
      <span className="flex items-center gap-1">
        <Icon className="size-4" /> {label}
      </span>
      <Progress value={Math.min(100, Math.round((num(value) / max) * 100))} />
      <b className="text-right">{value == null ? '?' : String(value)}</b>
    </div>
  );
}

function Effects({ entry }: { entry: CollectionEntry }) {
  const sections = describeCard(entry.card);
  if (!sections.length)
    return (
      <p className="text-sm text-muted-foreground">Cette carte n'a pas d'effet particulier.</p>
    );
  return (
    <div className="flex flex-col gap-3">
      {sections.map((s, i) => {
        const Icon = SECTION_ICONS[s.kind];
        return (
          <div key={i} className="rounded-lg border p-3">
            <h3 className="flex items-center gap-2 font-semibold">
              <Icon className="size-4" /> {s.title}
            </h3>
            {s.meta && <p className="text-xs text-muted-foreground">{s.meta}</p>}
            <ul className="mt-1 list-disc pl-5 text-sm">
              {s.items.map((item, j) => (
                <li key={j}>
                  <Keywords text={item.text} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
