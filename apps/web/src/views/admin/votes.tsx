// Admin · Votes (aVotes): the ten most backed proposals of a week (the most yes, then the fewest
// no), with a link to edit the card and the deletion of a proposal (the card can be proposed again).

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cardKeys, fetchGameCardsFull } from '@/data/cards';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import {
  aspectLabel,
  DIRECTIONS,
  fetchProposals,
  mostBacked,
  voteKeys,
  withdraw,
  yesShare,
} from '@/data/votes';
import { ICONS } from '@/lib/icons';
import { AdminError, AdminSection, NoticeView, useAction } from './kit';

const WEEKS = ['Cette semaine', 'Semaine dernière', 'Il y a 2 semaines', 'Il y a 3 semaines'];

export function VotesAdmin() {
  const [week, setWeek] = useState(0);
  const proposals = useQuery({
    queryKey: voteKeys.proposals(week),
    queryFn: () => fetchProposals(week),
  });
  const cards = useQuery({ queryKey: cardKeys.gameCardsFull, queryFn: fetchGameCardsFull });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const action = useAction();
  const error = proposals.error ?? cards.error;
  if (error) return <AdminError error={error} />;
  if (!proposals.data || !cards.data) return <PageSkeleton />;
  const byId = new Map(cards.data.map((c) => [c.id, c]));
  const top = mostBacked(proposals.data);
  const all = proposals.data.length;

  return (
    <AdminSection
      title="Les 10 propositions les plus soutenues"
      description={`${all} proposition${all > 1 ? 's' : ''}. Classement par nombre de oui (l'auteur compte pour oui), puis le moins de non. « Modifier » ouvre la carte dans l'admin (le changement apparaîtra tout seul dans l'équilibrage des patch notes). « Supprimer » libère la carte, qui redevient proposable.`}
    >
      <ToggleGroup
        type="single"
        variant="outline"
        value={String(week)}
        onValueChange={(v) => v && setWeek(Number(v))}
      >
        {WEEKS.map((label, i) => (
          <ToggleGroupItem key={label} value={String(i)}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <NoticeView notice={action.notice} />
      {!top.length && (
        <p className="text-sm text-muted-foreground">Aucune proposition pour cette semaine.</p>
      )}
      {top.map((p, i) => {
        const card = byId.get(p.carte_id);
        const picture =
          card?.variantes_carte.find((v) => v.nom === 'Standard' && v.image_path)?.image_path ??
          card?.variantes_carte.find((v) => v.image_path)?.image_path ??
          null;
        const src = imageUrl(picture, mirror.data ?? new Set());
        return (
          <div key={p.id} className="flex gap-3 rounded-xl border p-3">
            <span className="w-6 text-lg font-bold text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            {src && <img src={src} alt="" className="aspect-5/7 w-16 rounded-md object-cover" />}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2 font-semibold">
                {p.carte_nom}
                <Badge
                  variant={p.sens === 'up' ? 'success' : p.sens === 'nerf' ? 'danger' : 'info'}
                >
                  {DIRECTIONS[p.sens]}
                </Badge>
              </span>
              <span className="text-sm text-muted-foreground">{aspectLabel(card, p.aspect)}</span>
              {p.commentaire && <span className="text-sm italic">« {p.commentaire} »</span>}
              <span className="flex flex-wrap gap-4 text-sm tabular-nums">
                <span>
                  ✅ Oui <b>{p.oui}</b>
                </span>
                <span>
                  ❌ Non <b>{p.non}</b>
                </span>
                <small className="text-muted-foreground">{yesShare(p)} % de oui</small>
              </span>
              <div className="flex flex-wrap gap-2">
                {card && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/admin/$sub" params={{ sub: 'cartes' }} search={{ carte: card.id }}>
                      <ICONS.edit />
                      Modifier la carte
                    </Link>
                  </Button>
                )}
                <HoldButton
                  size="sm"
                  variant="destructive-ghost"
                  disabled={action.pending}
                  onConfirm={() =>
                    action.run(async () => {
                      await withdraw(p.id);
                      return `Proposition sur « ${p.carte_nom} » supprimée.`;
                    })
                  }
                >
                  <ICONS.delete />
                  Supprimer
                </HoldButton>
              </div>
            </div>
          </div>
        );
      })}
    </AdminSection>
  );
}
