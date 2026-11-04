// "Propositions": create a card from A to Z (form.tsx: effects and the admin's composer), then "Mes
// propositions" as cards, their status, the admin's note, and withdrawing (held: it does not come
// back) while one waits. The limit of 3 waiting is said before sending, not after.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HoldButton } from '@/components/hold-button';
import { PageSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  CARD_TYPE_LABELS,
  fetchMine,
  fetchRefs,
  imageUrl,
  type Proposal,
  proposalKeys,
  type RefCollection,
  type RefRarity,
  withdraw,
} from '@/data/proposals';
import { useSession } from '@/lib/session';
import { ProposalForm } from './form';

const STATUS = {
  attente: { label: 'En attente', variant: 'warning' },
  acceptee: { label: 'Acceptée', variant: 'success' },
  refusee: { label: 'Refusée', variant: 'danger' },
} as const;

export function ProposalsPage() {
  const userId = useSession()?.user.id ?? '';
  const refs = useQuery({ queryKey: proposalKeys.refs, queryFn: fetchRefs });
  const mine = useQuery({
    queryKey: proposalKeys.mine(userId),
    queryFn: () => fetchMine(userId),
    enabled: userId !== '',
  });

  if (refs.error ?? mine.error)
    return (
      <p role="alert">
        Propositions indisponibles pour le moment : {(refs.error ?? mine.error)?.message}
      </p>
    );
  if (!refs.data || !mine.data) return <PageSkeleton />;

  const waiting = mine.data.filter((p) => p.statut === 'attente').length;
  return (
    <div className="flex flex-col gap-10">
      <ProposalForm
        userId={userId}
        rarities={refs.data.rarities}
        collections={refs.data.collections}
        waiting={waiting}
      />
      <MyProposals
        list={mine.data}
        rarities={refs.data.rarities}
        collections={refs.data.collections}
      />
    </div>
  );
}

function MyProposals({
  list,
  rarities,
  collections,
}: {
  list: Proposal[];
  rarities: RefRarity[];
  collections: RefCollection[];
}) {
  const rarityName = (id: number | null) => rarities.find((r) => r.id === id)?.nom ?? '?';
  const collectionName = (id: number) => collections.find((c) => c.id === id)?.nom ?? '?';
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Mes propositions</h2>
      {list.length === 0 ? (
        <p className="text-muted-foreground">Tu n'as encore rien proposé.</p>
      ) : (
        <div className="grid grid-tiles-lg gap-4">
          {list.map((p) => (
            <ProposalCard
              key={p.id}
              p={p}
              rarity={rarityName(p.rarete_id)}
              collection={p.collection_id !== null ? collectionName(p.collection_id) : null}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProposalCard({
  p,
  rarity,
  collection,
}: {
  p: Proposal;
  rarity: string;
  collection: string | null;
}) {
  const userId = useSession()?.user.id ?? '';
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () => withdraw(p),
    onSuccess: () => client.invalidateQueries({ queryKey: proposalKeys.mine(userId) }),
  });
  const src = imageUrl(p.image_carte ?? p.image_path);
  const status = STATUS[p.statut];
  return (
    <Card className="gap-3 py-3">
      <CardContent className="flex flex-col gap-2 px-3">
        {/* A link to the full-size image (it opens in a new tab). */}
        {src ? (
          <a href={src} target="_blank" rel="noopener">
            <img
              loading="lazy"
              src={src}
              alt={p.nom}
              className="aspect-proposal w-full rounded-md object-cover"
            />
          </a>
        ) : (
          <div className="aspect-proposal w-full rounded-md bg-muted" />
        )}
        <div className="flex items-start justify-between gap-2">
          <b className="leading-tight">{p.nom}</b>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {CARD_TYPE_LABELS[p.type]} · {rarity} · {collection ?? <i>Idée : {p.collection_idee}</i>}
        </span>
        {(p.atq !== null || p.pv !== null) && (
          <span className="text-xs text-muted-foreground tabular-nums">
            ATQ {p.atq ?? '—'} · PV {p.pv ?? '—'}
          </span>
        )}
        {p.note_admin && (
          <p className="rounded-md bg-muted p-2 text-xs">
            <b>L'admin :</b> {p.note_admin}
          </p>
        )}
        {p.statut === 'attente' && (
          <HoldButton
            variant="destructive-ghost"
            size="sm"
            className="self-start"
            disabled={remove.isPending}
            onConfirm={() => remove.mutate()}
          >
            Maintiens pour retirer
          </HoldButton>
        )}
        {remove.error && (
          <p role="alert" className="text-xs text-destructive">
            {remove.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
