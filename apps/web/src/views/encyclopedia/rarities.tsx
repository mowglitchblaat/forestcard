// A card of a rarity as the combat overlay shows it: its frame and its rarity shine (GGEZ's
// rainbow aura, legendary glow…).

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { cardKeys, fetchGameCardsFull, type GameCardFull } from '@/data/cards';
import { type Tier, tierOf } from '@/lib/rarity';
import { FxPreview } from '@/components/fx-preview';
import { previewCard } from './effects';

export type RarityBadge = { label: string; background: string; tier: Tier };

// A card of the rarity: a fighter first (the overlay shows fighters), then by name.
export function rarityExample(tier: Tier, cards: GameCardFull[]): GameCardFull | null {
  return (
    cards
      .filter((c) => tierOf(c.raretes) === tier)
      .sort(
        (a, b) =>
          Number(b.type === 'combattant') - Number(a.type === 'combattant') ||
          a.nom.localeCompare(b.nom, 'fr'),
      )[0] ?? null
  );
}

export function RarityExample({ rarity }: { rarity: RarityBadge }) {
  const cards = useQuery({ queryKey: cardKeys.gameCardsFull, queryFn: fetchGameCardsFull });
  if (cards.error) return <p className="text-sm">Exemple indisponible : {cards.error.message}</p>;
  if (!cards.data) return <Skeleton className="h-72 w-full rounded-md" />;
  const card = rarityExample(rarity.tier, cards.data);
  if (!card)
    return (
      <p className="text-sm text-muted-foreground">Aucune carte {rarity.label} pour l'instant.</p>
    );
  return (
    <div className="flex flex-col gap-2">
      <FxPreview card={previewCard(card, card.nom)} className="h-72" />
      <p className="text-sm">
        <b>{card.nom}</b> <span className="text-muted-foreground">· {rarity.label}</span>
      </p>
    </div>
  );
}
