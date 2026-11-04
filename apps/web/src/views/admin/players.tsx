// Admin · Joueurs (aJoueurs): a player's cards (remove one copy or all), and the resets: empty a
// player or every player (cards and deck, unopened boosters, gold, stats), or their stats only.
// Everything here is final: a reset of every player asks to type a word, as the legacy page did.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  adminKeys,
  emptyPlayer,
  fetchPlayerCards,
  fetchPlayers,
  removePlayerCard,
  resetStats,
} from '@/data/admin';
import { ICONS } from '@/lib/icons';
import { AdminError, AdminSection, Choice, Field, NoticeView, useAction } from './kit';

export function PlayersAdmin() {
  const players = useQuery({ queryKey: adminKeys.players, queryFn: fetchPlayers });
  const [player, setPlayer] = useState('');
  const cards = useQuery({
    queryKey: adminKeys.playerCards(player),
    queryFn: () => fetchPlayerCards(player),
    enabled: player !== '',
  });
  const cardAction = useAction();
  const reset = useAction();
  const stats = useAction();
  const [boosters, setBoosters] = useState(true);
  const [withStats, setWithStats] = useState(false);
  const [gold, setGold] = useState('');
  const [word, setWord] = useState('');

  if (players.error) return <AdminError error={players.error} />;
  if (!players.data) return <PageSkeleton />;
  const chosen = players.data.find((p) => p.id === player);
  const total = (cards.data ?? []).reduce((sum, c) => sum + c.quantite, 0);
  const goldValue = gold === '' ? null : Math.max(0, Number(gold) || 0);

  return (
    <div className="flex flex-col gap-6">
      <AdminSection
        title="Cartes d'un joueur"
        description="Gère les cartes des membres, par exemple pour nettoyer après les tests. Les suppressions sont définitives."
      >
        <Field label="Joueur">
          <NativeSelect value={player} onChange={(e) => setPlayer(e.target.value)} className="w-72">
            <option value="">— Choisir un joueur —</option>
            {players.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.pseudo ?? p.id}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {chosen && (
          <p className="text-sm">
            <b>{chosen.pseudo}</b> · 💰 {chosen.monnaie ?? 0} · {total} carte{total > 1 ? 's' : ''}
          </p>
        )}
        {cards.error && <AdminError error={cards.error} />}
        {chosen && cards.data && cards.data.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune carte dans la collection.</p>
        )}
        {chosen && cards.data && cards.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carte</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Qté</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.data.map((c) => (
                <TableRow key={String(c.variante_id)}>
                  <TableCell>{c.carte}</TableCell>
                  <TableCell>{c.type}</TableCell>
                  <TableCell>{c.variante}</TableCell>
                  <TableCell>{c.quantite}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cardAction.pending}
                        onClick={() =>
                          cardAction.run(() => removePlayerCard(player, c.variante_id, 1))
                        }
                      >
                        −1
                      </Button>
                      <HoldButton
                        size="sm"
                        variant="destructive-ghost"
                        disabled={cardAction.pending}
                        onConfirm={() =>
                          cardAction.run(() => removePlayerCard(player, c.variante_id, null))
                        }
                      >
                        Tout retirer
                      </HoldButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <NoticeView notice={cardAction.notice} />
      </AdminSection>

      <AdminSection
        title="Remise à zéro"
        description="Vide la collection et le deck. C'est définitif."
      >
        <div className="flex flex-col gap-2">
          <Choice>
            <Checkbox checked={boosters} onChange={(e) => setBoosters(e.target.checked)} /> vider
            aussi les boosters non ouverts
          </Choice>
          <Choice>
            <Checkbox checked={withStats} onChange={(e) => setWithStats(e.target.checked)} />{' '}
            remettre aussi les <b>stats</b> à zéro (victoires, records, séries, classement,
            historique)
          </Choice>
          <Field label="Monnaie remise à (vide : inchangée)">
            <Input
              type="number"
              min={0}
              value={gold}
              onChange={(e) => setGold(e.target.value)}
              placeholder="inchangée"
              className="w-32"
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <HoldButton
            variant="outline"
            disabled={reset.pending || !chosen}
            onConfirm={() =>
              reset.run(async () => {
                await emptyPlayer(player, boosters, goldValue);
                const summary = withStats ? await resetStats(player) : '';
                return `${chosen?.pseudo ?? 'Le joueur'} remis à zéro.${summary ? ` ${summary}` : ''}`;
              })
            }
          >
            Vider {chosen ? chosen.pseudo : 'le joueur choisi'}
          </HoldButton>
        </div>
        <NoticeView notice={reset.notice} />
      </AdminSection>

      <AdminSection
        title="Stats seulement"
        description="Remet à zéro victoires, défaites, séries, records, boosters ouverts, cartes les plus jouées et historique des combats, sans toucher aux cartes."
      >
        <div className="flex flex-wrap gap-2">
          <HoldButton
            variant="outline"
            disabled={stats.pending || !chosen}
            onConfirm={() =>
              stats.run(async () => `Stats remises à zéro. ${await resetStats(player)}`)
            }
          >
            {chosen ? `Stats de ${chosen.pseudo ?? '?'} à zéro` : 'Stats du joueur choisi à zéro'}
          </HoldButton>
        </div>
        <NoticeView notice={stats.notice} />
      </AdminSection>

      <AdminSection
        title="⚠️ Tous les joueurs"
        description="Pour repartir de zéro (sortie officielle, fin des tests). Tape VIDER pour vider les cartes de TOUS les joueurs, toi compris (avec les cases de « Remise à zéro »), ou STATS pour remettre à zéro les stats, le classement et l'historique de tous."
      >
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Mot de confirmation">
            <Input value={word} onChange={(e) => setWord(e.target.value)} className="w-40" />
          </Field>
          <HoldButton
            variant="destructive"
            disabled={reset.pending || word !== 'VIDER'}
            onConfirm={() =>
              reset.run(async () => {
                await emptyPlayer(null, boosters, goldValue);
                const summary = withStats ? await resetStats(null) : '';
                setWord('');
                return `Tous les joueurs ont été remis à zéro.${summary ? ` ${summary}` : ''}`;
              })
            }
          >
            <ICONS.delete />
            Vider TOUS les joueurs
          </HoldButton>
          <HoldButton
            variant="destructive"
            disabled={stats.pending || word !== 'STATS'}
            onConfirm={() =>
              stats.run(async () => {
                const summary = await resetStats(null);
                setWord('');
                return `Stats de tous les joueurs remises à zéro. ${summary}`;
              })
            }
          >
            Stats de TOUS les joueurs à zéro
          </HoldButton>
        </div>
      </AdminSection>
    </div>
  );
}
