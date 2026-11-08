// Admin · Réglages, « Championnat » (62-admin-ceintures-avertissements.sql): put a belt back in play
// (vacant, the reign ends with the reason 'admin'), and clear a player's championship warnings, with
// the option to lift the deprivation they led to. And give back today's title fight on a belt, to one
// player or to all (71-titre-combat-rendu.sql).

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  clearWarnings,
  fetchTitleSanctions,
  fetchUsedTitleFights,
  giveBackTitleFight,
  vacateBelt,
} from '@/data/admin';
import { beltKeys, fetchBelts } from '@/data/belts';
import { AdminError, AdminSection, Choice, NoticeView, useAction } from './kit';

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export function ChampionshipAdmin() {
  const belts = useQuery({ queryKey: beltKeys.all, queryFn: fetchBelts });
  const sanctions = useQuery({
    queryKey: ['admin', 'titleSanctions'],
    queryFn: fetchTitleSanctions,
  });
  const used = useQuery({
    queryKey: ['admin', 'usedTitleFights'],
    queryFn: fetchUsedTitleFights,
  });
  const vacate = useAction();
  const giveBack = useAction();
  const warnings = useAction();
  const [lift, setLift] = useState(true);

  return (
    <AdminSection
      title="🏆 Championnat"
      description="Remettre une ceinture en jeu : le règne s'arrête (« remise en jeu par l'admin » dans l'histoire de la ceinture), les défis en attente contre le champion sont annulés, et la ceinture se reprend par un défi avec le @ d'un joueur. Retirer les avertissements d'un joueur remet son compteur à zéro."
    >
      <div className="flex flex-col gap-2">
        {(belts.data?.belts ?? []).map((b) => (
          <div key={b.division} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="min-w-40 font-medium">{b.nom}</span>
            <span className="min-w-32 text-muted-foreground">
              {b.pseudo ? `👑 ${b.pseudo}` : 'Vacante'}
            </span>
            {b.champion && (
              <HoldButton
                size="sm"
                variant="outline"
                disabled={vacate.pending || b.en_cours === true}
                onConfirm={() =>
                  vacate.run(async () => {
                    const who = await vacateBelt(b.division);
                    return `${b.nom} vacante : ${who} n'est plus champion.`;
                  })
                }
              >
                Rendre vacante (maintenir)
              </HoldButton>
            )}
          </div>
        ))}
        {belts.error && <AdminError error={belts.error} />}
        <NoticeView notice={vacate.notice} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">🔄 Combats pour le titre du jour</p>
        <p className="text-sm text-muted-foreground">
          Rendre le combat du jour : le joueur peut redéfier pour cette ceinture aujourd'hui (par
          exemple un défi d'hier accepté seulement aujourd'hui).
        </p>
        {used.error && <AdminError error={used.error} />}
        {(belts.data?.belts ?? []).map((b) => {
          const players = (used.data ?? []).filter((u) => u.division === b.division);
          return (
            <div key={b.division} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-40 font-medium">{b.nom}</span>
              {players.length === 0 && (
                <span className="text-muted-foreground">Aucun combat utilisé aujourd'hui</span>
              )}
              {players.map((u) => (
                <HoldButton
                  key={u.joueur}
                  size="sm"
                  variant="outline"
                  disabled={giveBack.pending}
                  onConfirm={() =>
                    giveBack.run(async () => {
                      await giveBackTitleFight(b.division, u.joueur);
                      return `${b.nom} : combat du jour rendu à ${u.pseudo ?? '?'}.`;
                    })
                  }
                >
                  Rendre à {u.pseudo ?? '?'}
                </HoldButton>
              ))}
              {players.length > 1 && (
                <HoldButton
                  size="sm"
                  variant="outline"
                  disabled={giveBack.pending}
                  onConfirm={() =>
                    giveBack.run(async () => {
                      const n = await giveBackTitleFight(b.division, null);
                      return `${b.nom} : combat du jour rendu à ${n} joueur(s).`;
                    })
                  }
                >
                  Rendre à tous (maintenir)
                </HoldButton>
              )}
            </div>
          );
        })}
        <NoticeView notice={giveBack.notice} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">⚠️ Avertissements et privations</p>
        {sanctions.error && <AdminError error={sanctions.error} />}
        {sanctions.data && sanctions.data.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun joueur averti ni privé.</p>
        )}
        {sanctions.data && sanctions.data.length > 0 && (
          <>
            <Choice>
              <Checkbox checked={lift} onChange={(e) => setLift(e.currentTarget.checked)} />
              Lever aussi la privation en cours
            </Choice>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Joueur</TableHead>
                  <TableHead>Avertissements</TableHead>
                  <TableHead>Privé jusqu'au</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sanctions.data.map((s) => (
                  <TableRow key={s.joueur}>
                    <TableCell>{s.pseudo ?? '?'}</TableCell>
                    <TableCell>{s.avertissements}</TableCell>
                    <TableCell>{s.prive_jusqua ? when(s.prive_jusqua) : '—'}</TableCell>
                    <TableCell>
                      <HoldButton
                        size="sm"
                        variant="outline"
                        disabled={warnings.pending}
                        onConfirm={() =>
                          warnings.run(async () => {
                            const r = await clearWarnings(s.joueur, lift);
                            return `${s.pseudo ?? '?'} : ${r.warnings} avertissement(s) retiré(s)${
                              r.deprivations ? ', privation levée' : ''
                            }.`;
                          })
                        }
                      >
                        Retirer (maintenir)
                      </HoldButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        <NoticeView notice={warnings.notice} />
      </div>
    </AdminSection>
  );
}
