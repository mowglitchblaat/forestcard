// Admin · Propositions (aPropos): the players' proposals by status, each with its card, author,
// type, rarity, collection (or the player's idea of one), proposed stats, idea and effects; the
// admin's note, accept / refuse / back to waiting, « Créer la carte », downloads, deletion.

import { describeCard, type DescribedCard } from '@forestcard/describe';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { adminKeys, fetchCollections, fetchRarities, type RarityRow } from '@/data/admin';
import {
  type AdminProposal,
  createCardFromProposal,
  deleteProposal,
  fetchAdminProposals,
  proposalImage,
  setProposalNote,
  setProposalStatus,
  type Status,
  STATUSES,
} from '@/data/admin-proposals';
import { ICONS } from '@/lib/icons';
import { AdminError, AdminSection, NoticeView, useAction } from './kit';

const FILTERS: [Status | 'toutes', string][] = [
  ['attente', '⏳ En attente'],
  ['acceptee', '✅ Acceptées'],
  ['refusee', '❌ Refusées'],
  ['toutes', 'Toutes'],
];
const TYPE_LABELS: Record<string, string> = {
  combattant: 'Combattant',
  magie: 'Magie',
  piege: 'Piège',
};

export function ProposalsAdmin() {
  const [filter, setFilter] = useState<Status | 'toutes'>('attente');
  const proposals = useQuery({
    queryKey: ['admin', 'proposals', filter],
    queryFn: () => fetchAdminProposals(filter),
  });
  const rarities = useQuery({ queryKey: adminKeys.rarities, queryFn: fetchRarities });
  const collections = useQuery({ queryKey: adminKeys.collections, queryFn: fetchCollections });
  const error = proposals.error ?? rarities.error ?? collections.error;
  if (error) return <AdminError error={error} />;
  if (!proposals.data || !rarities.data || !collections.data) return <PageSkeleton />;
  const collectionName = (id: number | null | undefined) =>
    collections.data.list.find((c) => c.id === id)?.nom ?? '?';

  return (
    <AdminSection title="Propositions des joueurs">
      <ToggleGroup
        type="single"
        variant="outline"
        value={filter}
        onValueChange={(v) => v && setFilter(v as Status | 'toutes')}
      >
        {FILTERS.map(([k, label]) => (
          <ToggleGroupItem key={k} value={k}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {!proposals.data.length && (
        <p className="text-sm text-muted-foreground">Aucune proposition ici.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {proposals.data.map((p) => (
          <ProposalTile
            key={`${p.id}-${p.statut}-${p.carte_id ?? 0}`}
            proposal={p}
            rarity={rarities.data.find((r) => r.id === p.rarete_id)}
            collection={p.collection_id ? collectionName(p.collection_id) : null}
          />
        ))}
      </div>
    </AdminSection>
  );
}

function ProposalTile({
  proposal: p,
  rarity,
  collection,
}: {
  proposal: AdminProposal;
  rarity: RarityRow | undefined;
  collection: string | null;
}) {
  const action = useAction();
  const [note, setNote] = useState(p.note_admin ?? '');
  const drawing = proposalImage(p.image_path);
  const card = p.image_carte ? proposalImage(p.image_carte) : null;
  const sections =
    p.ultime || p.passif || p.effet ? describeCard(p as unknown as DescribedCard) : [];
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 text-sm">
        <a href={card ?? drawing} target="_blank" rel="noreferrer">
          <img loading="lazy" src={card ?? drawing} alt="" className="w-full rounded-lg" />
        </a>
        {card && (
          <a href={drawing} target="_blank" rel="noreferrer" className="text-xs underline">
            Voir le dessin seul
          </a>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <b>{p.nom}</b>
          <Badge
            variant={
              p.statut === 'acceptee' ? 'success' : p.statut === 'refusee' ? 'danger' : 'warning'
            }
          >
            {STATUSES[p.statut]}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          Par <b>{p.pseudo ?? '?'}</b> · {new Date(p.cree_le).toLocaleDateString('fr-FR')}
        </span>
        <span className="text-xs">
          {TYPE_LABELS[p.type] ?? p.type} · {rarity?.nom ?? '?'} ·{' '}
          {collection ?? <i>Nouvelle collection : {p.collection_idee ?? ''}</i>}
        </span>
        <span className="text-xs">
          {p.atq !== null && p.atq !== undefined ? `ATQ ${p.atq}` : ''}
          {p.pv !== null && p.pv !== undefined ? ` · PV ${p.pv}` : ''}
          {(p.atq === null || p.atq === undefined) && (p.pv === null || p.pv === undefined)
            ? 'Pas de stats proposées'
            : ''}
        </span>
        {p.idee && <p className="whitespace-pre-wrap">{p.idee}</p>}
        {sections.map((s) => (
          <div key={s.kind} className="text-xs">
            <b>{s.title}</b>
            {s.meta && <span className="text-muted-foreground"> · {s.meta}</span>}
            {s.items.map((i) => (
              <div key={i.text} className="text-muted-foreground">
                • {i.text}
              </div>
            ))}
          </div>
        ))}
        {p.carte_id ? (
          <Link
            to="/admin/$sub"
            params={{ sub: 'cartes' }}
            search={{ carte: p.carte_id }}
            className="text-xs underline"
          >
            🃏 Carte créée dans le jeu (non publiée au départ) : la modifier
          </Link>
        ) : null}
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note !== (p.note_admin ?? '')) action.run(() => setProposalNote(p.id, note));
          }}
          placeholder="Note pour le joueur (facultatif)"
        />
        <div className="flex flex-wrap gap-2">
          {!p.carte_id && (
            <HoldButton
              size="sm"
              disabled={action.pending}
              onConfirm={() => action.run(() => createCardFromProposal(p, rarity))}
            >
              <ICONS.add />
              Créer la carte
            </HoldButton>
          )}
          {(Object.keys(STATUSES) as Status[])
            .filter((s) => s !== p.statut)
            .map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'acceptee' ? 'default' : 'outline'}
                disabled={action.pending}
                onClick={() => action.run(() => setProposalStatus(p.id, s, note))}
              >
                {s === 'acceptee'
                  ? '✅ Accepter'
                  : s === 'refusee'
                    ? '❌ Refuser'
                    : '⏳ En attente'}
              </Button>
            ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" asChild>
            <a href={drawing} download target="_blank" rel="noreferrer">
              <ICONS.download />
              Dessin
            </a>
          </Button>
          {card && (
            <Button size="sm" variant="ghost" asChild>
              <a href={card} download target="_blank" rel="noreferrer">
                <ICONS.download />
                Carte
              </a>
            </Button>
          )}
          <HoldButton
            size="sm"
            variant="destructive-ghost"
            disabled={action.pending}
            onConfirm={() => action.run(() => deleteProposal(p))}
          >
            <ICONS.delete />
            Supprimer
          </HoldButton>
        </div>
        <NoticeView notice={action.notice} />
      </CardContent>
    </Card>
  );
}
