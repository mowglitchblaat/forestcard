// The effects of the encyclopedia: for an effect, the card showing it (a fighter first, then the
// rarest real card that has it) with the effect's text on that card, and the combat overlay's own
// animation playing it. An effect no card has yet shows its name only. Colours: the catalogue's
// legend (packages/describe).

import { CATEGORY_STYLES, categoryOf, describeCard } from '@forestcard/describe';
import { useQuery } from '@tanstack/react-query';
import { ICONS, type LucideIcon } from '@/lib/icons';
import { FxPreview, type PreviewCard } from '@/components/fx-preview';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cardKeys, fetchGameCardsFull, type GameCardFull } from '@/data/cards';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { rarityRank, textOn } from '@/lib/rarity';

// An effect as the rules name it, and the engine types behind it (effect and passive keys; a basic
// attack effect `atk_x` counts as `x`).
// target: where the effect lands, on the card that has it (self), on its opponent, or both.
// preview: the effect's animation in the overlay preview (fx-preview/preview.js), if it has one.
export type Target = 'self' | 'opponent' | 'both';
export type RuleEffect = { label: string; types: string[]; target: Target; preview?: string };

const TARGETS: Record<Target, { label: string; icon: LucideIcon }> = {
  self: { label: 'Sur soi', icon: ICONS.targetSelf },
  opponent: { label: "Sur l'adversaire", icon: ICONS.targetOpponent },
  both: { label: 'Sur les deux', icon: ICONS.targetBoth },
};

// The opponent of the preview: a common fighter, the first by name, other than the example card.
export function opponentFor(
  cards: GameCardFull[],
  example: GameCardFull | null,
): GameCardFull | null {
  return (
    cards
      .filter((c) => c.type === 'combattant' && c !== example && rarityRank(c.raretes)[0] === 4)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))[0] ?? null
  );
}

export const previewCard = (card: GameCardFull | null, fallback: string): PreviewCard =>
  card
    ? { nom: card.nom, image: card.variantes_carte[0]?.image_path ?? null, rar: card.raretes }
    : { nom: fallback, image: null, rar: null };

// The effect's colours, by its category in the catalogue's legend.
export const effectStyle = (effect: RuleEffect) =>
  CATEGORY_STYLES[categoryOf(effect.types[0])] ?? CATEGORY_STYLES['autre'];

const base = (type: string) => type.replace(/^atk_/, '');

// The card showing an effect: a fighter first (magics and traps do not attack), then the rarest,
// then by name; and the lines describing the effect on that card.
export function exampleFor(
  effect: RuleEffect,
  cards: GameCardFull[],
): { card: GameCardFull; lines: string[] } | null {
  const wanted = new Set(effect.types.map(base));
  const found = cards
    .map((card) => ({
      card,
      lines: describeCard(card)
        .flatMap((s) => s.items)
        .filter((i) => wanted.has(base(i.type)))
        .map((i) => i.text),
    }))
    .filter((x) => x.lines.length)
    .sort(
      (a, b) =>
        // A fighter shows the effect in action (it attacks); a magic or a trap only as a fallback.
        Number(b.card.type === 'combattant') - Number(a.card.type === 'combattant') ||
        rarityRank(a.card.raretes)[0] - rarityRank(b.card.raretes)[0] ||
        rarityRank(a.card.raretes)[1] - rarityRank(b.card.raretes)[1] ||
        a.card.nom.localeCompare(b.card.nom, 'fr'),
    );
  return found[0] ?? null;
}

export function Example({ effect }: { effect: RuleEffect }) {
  const cards = useQuery({ queryKey: cardKeys.gameCardsFull, queryFn: fetchGameCardsFull });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  if (cards.error) return <p className="text-sm">Exemple indisponible : {cards.error.message}</p>;
  if (!cards.data)
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-72 w-full rounded-md" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-full" />
      </div>
    );
  const example = exampleFor(effect, cards.data);
  const target = TARGETS[effect.target];
  const where = (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <target.icon className="size-3.5" /> {target.label}
    </span>
  );
  const info = example ? (
    <CardInfo card={example.card} lines={example.lines} />
  ) : (
    <p className="text-sm text-muted-foreground">
      <b className="text-foreground">{effect.label}</b> : aucune carte n'a encore cet effet.
    </p>
  );
  // With an animation: the overlay plays it on the example card (or a blank one).
  if (effect.preview)
    return (
      <div className="flex flex-col gap-3">
        <FxPreview
          effect={effect.preview}
          card={previewCard(example?.card ?? null, effect.label)}
          opponent={previewCard(opponentFor(cards.data, example?.card ?? null), 'Adversaire')}
          className="h-72"
        />
        {where}
        {info}
      </div>
    );
  if (!example)
    return (
      <div className="flex flex-col gap-2">
        {where}
        {info}
      </div>
    );
  const image = imageUrl(
    example.card.variantes_carte[0]?.image_path ?? null,
    mirror.data ?? new Set(),
  );
  return (
    <div className="flex gap-3">
      {image ? (
        <img
          src={image}
          alt={example.card.nom}
          className="aspect-5/7 w-32 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex aspect-5/7 w-32 shrink-0 items-center justify-center rounded-md bg-muted p-2 text-center text-xs font-semibold">
          {example.card.nom}
        </div>
      )}
      {info}
    </div>
  );
}

function CardInfo({ card, lines }: { card: GameCardFull; lines: string[] }) {
  const { nom, couleur } = card.raretes;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <b className="leading-tight">{card.nom}</b>
        <Badge
          variant={couleur ? 'rarity' : 'default'}
          className="w-fit"
          style={{ '--rarity': couleur ?? undefined, '--rarity-ink': textOn(couleur) }}
        >
          {nom}
        </Badge>
      </div>
      <ul className="list-disc pl-4 text-sm">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
