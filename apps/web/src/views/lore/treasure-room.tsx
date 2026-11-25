// The treasure room of a vault (data/vaults.ts, 101-coffres-butin-partage.sql). Its treasure lies
// in piles: gold, fragments of every kind, boosters, drills, Perce-Abîme, and golden cards standing
// for cards of the vault's rarity. Each pile shows what a lot holds, its price in points and how
// many lots are left for everyone. Once the vault is open, those who drilled it come in with their
// points (one per drill they placed in it) and pick lots with a click, until their points run out
// or the room closes (three days after the event's end); points left then are lost. A card is
// drawn when it is picked: it flies out and turns over.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FragmentGem } from '@/components/fragment-gem';
import { Gold } from '@/components/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import {
  pickLot,
  type TreasureLot,
  type TreasureObject,
  type TreasurePick,
  type Vault,
  vaultKeys,
} from '@/data/vaults';
import { ICONS } from '@/lib/icons';
import { GIGA_DRILL, GLOW } from './vault-art';

const fr = (n: number) => n.toLocaleString('fr-FR');

export const TREASURE_NAMES: Record<TreasureObject, string> = {
  gold: 'Gold',
  fragments: 'Fragments',
  fragments_epique: 'Fragments épiques',
  fragments_legendaire: 'Fragments légendaires',
  fragments_ggez: 'Fragments GGEZ',
  booster: 'Booster',
  foreuse: 'Foreuse',
  perce_abime: 'Perce-Abîme',
  carte: 'Carte',
};

const CARD_RARITY: Record<Vault['teinte'], string> = {
  bleu: 'rare',
  violet: 'épique',
  or: 'légendaire',
};

const GEMS = {
  fragments: 'fragments',
  fragments_epique: 'epique',
  fragments_legendaire: 'legendaire',
  fragments_ggez: 'ggez',
} as const;

// A pile of the treasure, drawn big.
function LotArt({ objet }: { objet: TreasureObject }) {
  switch (objet) {
    case 'gold':
      return (
        <span className="text-5xl">
          <Gold />
        </span>
      );
    case 'fragments':
    case 'fragments_epique':
    case 'fragments_legendaire':
    case 'fragments_ggez':
      return (
        <span className="text-5xl">
          <FragmentGem kind={GEMS[objet]} />
        </span>
      );
    case 'booster':
      return <ICONS.boosterBox className="size-12" />;
    case 'foreuse':
      return <img src="cadres/foreuse.webp" alt="" draggable={false} className="h-14 select-none" />;
    case 'perce_abime':
      return <img src={GIGA_DRILL} alt="" draggable={false} className="h-14 select-none" />;
    case 'carte':
      return (
        <span className="treasure-card aspect-vault-card w-10 rounded-md border shadow-md" />
      );
  }
}

const lotLabel = (objet: TreasureObject, n: number, tint: Vault['teinte']) =>
  objet === 'carte'
    ? `${n} carte${n > 1 ? 's' : ''} ${CARD_RARITY[tint]}${n > 1 ? 's' : ''}`
    : `${fr(n)} ${TREASURE_NAMES[objet].toLowerCase()}`;

// One pile: a button while the player can pay for it.
// preview: the vault is still closed, the pile is only shown.
function Pile({
  lot: l,
  tint,
  left,
  busy,
  preview,
  onPick,
}: {
  lot: TreasureLot;
  tint: Vault['teinte'];
  left: number;
  busy: boolean;
  preview: boolean;
  onPick: () => void;
}) {
  const gone = l.stock < 1;
  const dear = !preview && l.prix > left;
  return (
    <button
      type="button"
      disabled={preview || gone || dear || busy || l.id == null}
      onClick={onPick}
      className={`flex w-36 flex-col items-center gap-1 rounded-xl border bg-card p-3 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-lg disabled:pointer-events-none ${preview ? '' : 'disabled:opacity-40'}`}
    >
      <span className="flex h-16 items-center justify-center">
        <LotArt objet={l.objet} />
      </span>
      <b className="text-sm">{lotLabel(l.objet, l.n, tint)}</b>
      <Badge variant={dear && !gone ? 'outline' : 'info'}>
        {l.prix} point{l.prix > 1 ? 's' : ''}
      </Badge>
      <small className="text-muted-foreground tabular-nums">
        {gone ? 'Épuisé' : `Reste ${l.stock} / ${l.total}`}
      </small>
    </button>
  );
}

// What a player picked, flown out of the pile; a card turns over to show its face.
export function PickView({ pick: p, mirror }: { pick: TreasurePick; mirror: Set<string> }) {
  const src = p.image ? imageUrl(p.image, mirror) : null;
  if (p.objet === 'carte')
    return (
      <div className="vault-card flex w-28 flex-col items-center gap-1 text-center">
        <div className="vault-card-flip relative aspect-vault-card w-full">
          <span className="vault-card-face treasure-card absolute inset-0 rounded-md border shadow-md" />
          <span className="vault-card-back absolute inset-0">
            {src && <img src={src} alt={p.nom ?? ''} className="size-full rounded-md shadow-md" />}
          </span>
        </div>
        <b className="text-sm">{p.nom}</b>
        {p.rarete && <small className="text-muted-foreground">{p.rarete}</small>}
      </div>
    );
  return (
    <div className="vault-card flex w-28 flex-col items-center gap-1 rounded-lg border bg-card p-2 text-center shadow-md">
      {p.objet === 'booster' && src ? (
        <img src={src} alt="" className="w-full rounded-md" />
      ) : (
        <span className="flex h-14 items-center justify-center">
          <LotArt objet={p.objet} />
        </span>
      )}
      <b className="text-sm">
        +{fr(p.n)} {p.objet === 'booster' ? (p.nom ?? 'Booster') : TREASURE_NAMES[p.objet]}
      </b>
    </div>
  );
}

export function TreasureRoom({
  vault: v,
  closesAt,
  onClose,
}: {
  vault: Vault;
  closesAt: string | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const mirror = useQuery({ queryKey: imageKeys.mirror, queryFn: fetchMirror });
  const [last, setLast] = useState<{ pick: TreasurePick; key: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const points = v.mes_points ?? 0;
  const left = Math.max(0, points - (v.mes_depenses ?? 0));
  const isOpen = !!v.ouvert_le;
  const closed = closesAt !== null && new Date(closesAt).getTime() < Date.now();
  const pick = useMutation({
    mutationFn: (lot: number) => pickLot(lot),
    onMutate: () => setError(null),
    onSuccess: (r) => setLast({ pick: r.prise, key: Date.now() }),
    onError: (e) => setError(e.message),
    onSettled: () => client.invalidateQueries({ queryKey: vaultKeys.state }),
  });
  const picks = v.mes_prises ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-dialog overflow-y-auto sm:max-w-4xl">
        <DialogTitle>
          <span className="flex items-center gap-2">
            <ICONS.vault />
            {isOpen ? `${v.nom} : la salle du trésor` : `${v.nom} : son trésor`}
          </span>
        </DialogTitle>
        <DialogDescription>
          {isOpen
            ? ''
            : 'Ce trésor attend derrière la porte. Quand le coffre cédera, ceux qui l’ont percé entreront dans la salle : '}
          Chaque foreuse que tu as posée dans ce coffre vaut 1 point. Prends ce que tu veux tant
          qu’il te reste des points : le trésor est le même pour tous, premier arrivé, premier
          servi.
          {closesAt &&
            ` La salle ferme le ${new Date(closesAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })} : les points pas dépensés seront perdus.`}
        </DialogDescription>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge variant={left > 0 ? 'success' : 'outline'}>
            <ICONS.drill />
            {left} point{left > 1 ? 's' : ''} à dépenser
          </Badge>
          <small className="text-muted-foreground">
            sur {points} (tes foreuses dans ce coffre)
          </small>
        </div>
        <div className={`flex flex-col items-center gap-4 rounded-xl bg-background p-4 ${GLOW[v.teinte]}`}>
          {last && (
            <div key={last.key} className="flex flex-col items-center gap-1">
              <small className="text-muted-foreground">Tu ramasses :</small>
              <PickView pick={last.pick} mirror={mirror.data ?? new Set()} />
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {(v.tresor_lots ?? []).map((l, i) => (
              <Pile
                key={l.id ?? i}
                lot={l}
                tint={v.teinte}
                left={closed ? 0 : left}
                preview={!isOpen}
                busy={pick.isPending}
                onPick={() => l.id != null && pick.mutate(l.id)}
              />
            ))}
          </div>
        </div>
        {error && <small className="text-center text-destructive">{error}</small>}
        {isOpen && points < 1 && (
          <p className="text-center text-sm text-muted-foreground">
            Tu n’as pas percé ce coffre : son trésor revient à ceux qui l’ont fait céder.
          </p>
        )}
        {picks.length > 0 && (
          <div className="flex flex-col gap-2">
            <b className="text-sm">Ton butin dans ce coffre</b>
            <div className="flex flex-wrap gap-1.5">
              {picks.map((p, i) => (
                <Badge key={i} variant={p.objet === 'carte' ? 'warning' : 'outline'}>
                  {p.objet === 'carte'
                    ? p.nom
                    : `+${fr(p.n)} ${p.objet === 'booster' ? (p.nom ?? 'Booster') : TREASURE_NAMES[p.objet]}`}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <Button onClick={onClose}>Fermer</Button>
      </DialogContent>
    </Dialog>
  );
}
