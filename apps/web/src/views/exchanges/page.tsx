// Exchanges (the legacy page's vEchanges): the player's fragments and whether they may exchange
// today, their offers (accept with a share of the pot, add to it, counter-propose, refuse or cancel),
// then a new offer: the partner, the cards given and received, and the player's share of the pot.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import {
  cancelExchange,
  contribute,
  type Exchange,
  type ExchangeCard,
  exchangeKeys,
  type ExchangeInfo,
  fetchExchangeCollection,
  fetchExchangeInfo,
  fetchExchanges,
  leavingDeck,
  type Partner,
  proposeExchange,
  RANK_LABELS,
  RANKS,
  searchPartners,
} from '@/data/exchanges';
import { useSession } from '@/lib/session';
import { ICONS } from '@/lib/icons';
import { TONES } from '@/lib/tones';

type Draft = { partner: Partner; give: Map<number, number>; receive: Map<number, number> };

const when = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleString('fr-FR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

export function ExchangesPage() {
  const [mode, setMode] = useState<'list' | 'partner' | 'compose'>('list');
  const [draft, setDraft] = useState<Draft | null>(null);
  const info = useQuery({ queryKey: exchangeKeys.info, queryFn: fetchExchangeInfo });
  if (info.error) return <p role="alert">{info.error.message}</p>;
  if (!info.data) return <PageSkeleton />;
  if (mode === 'partner')
    return (
      <ChoosePartner
        onBack={() => setMode('list')}
        onPick={(partner) => {
          setDraft({ partner, give: new Map(), receive: new Map() });
          setMode('compose');
        }}
      />
    );
  if (mode === 'compose' && draft)
    return (
      <Compose
        info={info.data}
        initial={draft}
        onBack={() => setMode('list')}
        onSent={() => setMode('list')}
      />
    );
  return (
    <Offers
      info={info.data}
      onNew={() => setMode('partner')}
      onCounter={(d) => {
        setDraft(d);
        setMode('compose');
      }}
    />
  );
}

function CardChip({
  card,
  count,
  onClick,
  selected = false,
  empty = false,
  deck = false,
}: {
  card: ExchangeCard;
  count?: number;
  onClick?: () => void;
  selected?: boolean;
  empty?: boolean;
  deck?: boolean;
}) {
  const images = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const src = imageUrl(card.image ?? card.image_path ?? null, images.data ?? new Set());
  const body = (
    <>
      {src ? (
        <img
          loading="lazy"
          src={src}
          alt=""
          className="aspect-5/7 w-full rounded-md object-cover"
        />
      ) : (
        <div className="aspect-5/7 w-full rounded-md bg-muted" />
      )}
      <span className="line-clamp-2 text-xs">
        {(count ?? card.quantite) > 1 ? `${count ?? card.quantite}× ` : ''}
        {card.nom}
        {card.variante && card.variante !== 'Standard' ? ` (${card.variante})` : ''}
      </span>
      <small className="text-muted-foreground">
        🧩 {card.prix}
        {onClick ? ` · ×${card.quantite}` : ''}
        {deck ? ' · 🃏' : ''}
      </small>
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      disabled={empty}
      className={`relative flex w-24 cursor-pointer flex-col gap-1 rounded-lg p-1 text-left transition enabled:hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 ${selected ? 'bg-primary/10 ring-2 ring-primary' : ''}`}
      title={card.au_deck ? 'Dans ton deck' : undefined}
    >
      {body}
    </button>
  ) : (
    <div className="flex w-24 flex-col gap-1 p-1">{body}</div>
  );
}

function Offers({
  info,
  onNew,
  onCounter,
}: {
  info: ExchangeInfo;
  onNew: () => void;
  onCounter: (d: Draft) => void;
}) {
  const list = useQuery({ queryKey: exchangeKeys.list, queryFn: fetchExchanges });
  const prices = RANKS.map((k) => `${RANK_LABELS[k]} ${info.prix[k] ?? '?'}`).join(' · ');
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b>Tes fragments : 🧩 {info.fragments}</b>
            {info.ok ? (
              <Badge variant="success">✅ Tu peux échanger aujourd'hui</Badge>
            ) : (
              <Badge variant="danger">⛔ {(info.raisons ?? []).join(' · ')}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Chaque carte échangée ajoute sa valeur au <b>pot</b> (🧩 {prices}). Vous remplissez le
            pot à deux, comme vous voulez : quand il est plein et que les deux ont accepté,
            l'échange se fait et les fragments du pot disparaissent. {info.par_jour ?? 1} échange
            par jour · compte d'au moins {info.age_min ?? 0} jours (toi : {info.age_jours ?? 0}) ·
            au moins {info.boosters_min ?? 0} boosters ouverts (toi : {info.boosters ?? 0}) · une
            offre expire au bout de {info.expiration_h ?? 48} h. Les fragments s'obtiennent en
            recyclant tes doublons (Ma collection → recycler → 🧩).
          </p>
          <div>
            <Button disabled={!info.ok} onClick={onNew}>
              <ICONS.add />
              Proposer un échange
            </Button>
          </div>
        </CardContent>
      </Card>
      {list.error && <p role="alert">{list.error.message}</p>}
      {list.data && !list.data.length && (
        <p className="text-sm text-muted-foreground">Aucun échange pour l'instant.</p>
      )}
      {list.data?.map((x) => (
        <Offer key={x.id} exchange={x} info={info} onCounter={onCounter} />
      ))}
    </div>
  );
}

function Offer({
  exchange: x,
  info,
  onCounter,
}: {
  exchange: Exchange;
  info: ExchangeInfo;
  onCounter: (d: Draft) => void;
}) {
  const client = useQueryClient();
  const me = useSession()?.user.id ?? '';
  const left = Math.max(0, x.pot - x.ma_part - x.sa_part);
  const [amount, setAmount] = useState(left);
  const [done, setDone] = useState('');
  const settle = () => client.invalidateQueries();
  const mine = useQuery({
    queryKey: exchangeKeys.collection(me),
    queryFn: () => fetchExchangeCollection(me),
    enabled: me !== '',
  });
  const put = useMutation({
    mutationFn: async (accepting: boolean) => {
      if (amount > info.fragments) throw new Error(`Tu n'as que 🧩 ${info.fragments}.`);
      const outcome = await contribute(x.id, amount);
      return outcome === 'valide'
        ? `🎉 Échange réussi avec ${x.autre} ! Les cartes sont dans ta collection.`
        : outcome === 'annule'
          ? "Échange annulé : une des cartes n'est plus dans la collection de son propriétaire. Tes fragments t'ont été rendus."
          : accepting
            ? `Échange accepté. Il manque encore des fragments dans le pot : ${x.autre} doit compléter.`
            : 'Fragments ajoutés au pot.';
    },
    onSuccess: setDone,
    onSettled: settle,
  });
  const stop = useMutation({ mutationFn: () => cancelExchange(x.id), onSettled: settle });
  const counter = useMutation({
    mutationFn: async () => {
      await cancelExchange(x.id);
      const partner = (await searchPartners(x.autre)).find((p) => p.pseudo === x.autre);
      if (!partner) throw new Error(`${x.autre} n'est plus disponible pour un échange.`);
      const map = (cards: ExchangeCard[]) =>
        new Map(cards.map((c) => [c.variante_id, c.quantite] as [number, number]));
      onCounter({ partner, give: map(x.je_donne), receive: map(x.je_recois) });
    },
    onSettled: settle,
  });
  const leaving = leavingDeck(mine.data ?? [], x.je_donne);
  const busy = put.isPending || stop.isPending || counter.isPending;
  const error = put.error ?? stop.error ?? counter.error;
  const share = (v: number) => (x.pot ? (100 * v) / x.pot : 0);
  const status: Record<string, string> = {
    valide: '✅ Échange fait',
    refuse: '✖ Refusé',
    annule: '✖ Annulé',
    expire: '⌛ Expiré',
  };
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b>
            {x.moi_propose ? 'Ton offre à' : 'Offre de'} {x.autre}
          </b>
          <small className="text-muted-foreground">
            {x.ouvert
              ? `⏳ en cours · expire ${when(x.expire_le)}`
              : `${status[x.statut] ?? x.statut} · ${when(x.fini_le ?? x.cree_le)}`}
          </small>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <small className="text-muted-foreground">Tu donnes</small>
            <div className="flex flex-wrap gap-2">
              {x.je_donne.map((c) => (
                <CardChip key={c.variante_id} card={c} />
              ))}
            </div>
          </div>
          <span className="text-2xl">⇄</span>
          <div className="flex flex-col gap-1">
            <small className="text-muted-foreground">Tu reçois</small>
            <div className="flex flex-wrap gap-2">
              {x.je_recois.map((c) => (
                <CardChip key={c.variante_id} card={c} />
              ))}
            </div>
          </div>
        </div>
        {(x.ouvert || x.statut === 'valide') && (
          <div className="flex flex-col gap-1">
            <Progress value={share(x.ma_part + x.sa_part)} />
            <small className="text-muted-foreground">
              Pot : {x.ma_part + x.sa_part} / {x.pot} 🧩 — toi {x.ma_part} · {x.autre} {x.sa_part}
            </small>
          </div>
        )}
        {!x.ouvert && x.raison && <small className="text-muted-foreground">{x.raison}</small>}
        {x.ouvert && leaving.length > 0 && (
          <small className={TONES.warning.text}>
            ⚠ Dans ton deck de combat, et en sortira : {leaving.join(', ')}. Pense à compléter ton
            deck (10 cartes) avant ton prochain combat.
          </small>
        )}
        {x.ouvert && (
          <div className="flex flex-wrap items-end gap-2">
            {!x.moi_propose && !x.ok_pour ? (
              <>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Ta part du pot
                  <Input
                    type="number"
                    min={0}
                    max={left}
                    value={amount}
                    onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-24"
                  />
                </label>
                <HoldButton disabled={busy} onConfirm={() => put.mutate(true)}>
                  ✅ Accepter
                </HoldButton>
                <Button variant="outline" disabled={busy} onClick={() => counter.mutate()}>
                  ↩ Contre-proposer
                </Button>
                <HoldButton
                  variant="destructive-ghost"
                  disabled={busy}
                  onConfirm={() => stop.mutate()}
                >
                  ✖ Refuser
                </HoldButton>
              </>
            ) : (
              <>
                <small className="text-muted-foreground">
                  {x.moi_propose && !x.ok_pour
                    ? `En attente de la réponse de ${x.autre}.`
                    : left > 0
                      ? `Accepté par les deux : il manque ${left} 🧩 dans le pot.`
                      : ''}
                </small>
                {left > 0 && (
                  <>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Ajouter au pot
                      <Input
                        type="number"
                        min={1}
                        max={left}
                        value={amount}
                        onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
                        className="w-24"
                      />
                    </label>
                    <HoldButton disabled={busy || amount < 1} onConfirm={() => put.mutate(false)}>
                      🧩 Ajouter
                    </HoldButton>
                  </>
                )}
                <HoldButton
                  variant="destructive-ghost"
                  disabled={busy}
                  onConfirm={() => stop.mutate()}
                >
                  {x.moi_propose ? "Annuler l'offre" : '✖ Refuser'}
                </HoldButton>
              </>
            )}
          </div>
        )}
        {done && <p className="text-sm">{done}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ChoosePartner({ onBack, onPick }: { onBack: () => void; onPick: (p: Partner) => void }) {
  const [query, setQuery] = useState('');
  const partners = useQuery({
    queryKey: exchangeKeys.partners(query.trim()),
    queryFn: () => searchPartners(query.trim()),
  });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="outline" onClick={onBack}>
          ← Retour
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Avec qui veux-tu échanger ?</p>
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un pseudo…"
        className="max-w-sm"
      />
      {partners.error && <p role="alert">{partners.error.message}</p>}
      <div className="flex flex-wrap gap-2">
        {partners.data?.map((p) => (
          <Button
            key={p.id}
            variant={p.peut ? 'default' : 'outline'}
            disabled={!p.peut}
            title={p.peut ? undefined : (p.raisons ?? []).join(', ')}
            onClick={() => onPick(p)}
          >
            {p.pseudo}
            {p.peut ? '' : ' ⛔'}
          </Button>
        ))}
        {partners.data && !partners.data.length && (
          <small className="text-muted-foreground">Aucun joueur trouvé.</small>
        )}
      </div>
    </div>
  );
}

function Compose({
  info,
  initial,
  onBack,
  onSent,
}: {
  info: ExchangeInfo;
  initial: Draft;
  onBack: () => void;
  onSent: () => void;
}) {
  const client = useQueryClient();
  const me = useSession()?.user.id ?? '';
  const partner = initial.partner;
  const mine = useQuery({
    queryKey: exchangeKeys.collection(me),
    queryFn: () => fetchExchangeCollection(me),
    enabled: me !== '',
  });
  const theirs = useQuery({
    queryKey: exchangeKeys.collection(partner.id),
    queryFn: () => fetchExchangeCollection(partner.id),
  });
  const [give, setGive] = useState(initial.give);
  const [receive, setReceive] = useState(initial.receive);
  const [filterMine, setFilterMine] = useState('');
  const [filterTheirs, setFilterTheirs] = useState('');
  const [share, setShare] = useState<number | null>(null);
  const send = useMutation({
    mutationFn: async (part: number) => {
      if (part > info.fragments) throw new Error(`Tu n'as que 🧩 ${info.fragments}.`);
      await proposeExchange(partner.id, give, receive, part);
    },
    onSuccess: onSent,
    onSettled: () => client.invalidateQueries(),
  });
  const error = mine.error ?? theirs.error;
  if (error) return <p role="alert">{error.message}</p>;
  if (!mine.data || !theirs.data) return <PageSkeleton />;
  const max = info.max_cartes ?? 5;
  const total = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const priceOf = (list: ExchangeCard[], v: number) =>
    list.find((c) => c.variante_id === v)?.prix ?? 0;
  const pot =
    [...give].reduce((s, [v, n]) => s + n * priceOf(mine.data, v), 0) +
    [...receive].reduce((s, [v, n]) => s + n * priceOf(theirs.data, v), 0);
  const part = Math.min(pot, share ?? Math.min(info.fragments, Math.ceil(pot / 2)));
  const add = (m: Map<number, number>, set: (m: Map<number, number>) => void, c: ExchangeCard) => {
    if (total(m) >= max) return;
    if ((m.get(c.variante_id) ?? 0) >= c.quantite) return;
    set(new Map(m).set(c.variante_id, (m.get(c.variante_id) ?? 0) + 1));
  };
  const del = (m: Map<number, number>, set: (m: Map<number, number>) => void, v: number) => {
    const next = new Map(m);
    const n = (next.get(v) ?? 0) - 1;
    if (n > 0) next.set(v, n);
    else next.delete(v);
    set(next);
  };
  const chosen = (
    list: ExchangeCard[],
    m: Map<number, number>,
    set: (m: Map<number, number>) => void,
  ) =>
    m.size ? (
      [...m].map(([v, n]) => {
        const c = list.find((x) => x.variante_id === v);
        return c ? (
          <CardChip key={v} card={c} count={n} selected onClick={() => del(m, set, v)} />
        ) : null;
      })
    ) : (
      <small className="text-muted-foreground">—</small>
    );
  const grid = (
    list: ExchangeCard[],
    m: Map<number, number>,
    set: (m: Map<number, number>) => void,
    filter: string,
    own: boolean,
  ) => {
    const shown = list.filter(
      (c) => !filter || `${c.nom} ${c.rarete ?? ''}`.toLowerCase().includes(filter.toLowerCase()),
    );
    return shown.length ? (
      shown.map((c) => (
        <CardChip
          key={c.variante_id}
          card={c}
          count={m.get(c.variante_id) ?? 0}
          selected={m.has(c.variante_id)}
          empty={(m.get(c.variante_id) ?? 0) >= c.quantite}
          deck={own && !!c.au_deck}
          onClick={() => add(m, set, c)}
        />
      ))
    ) : (
      <small className="text-muted-foreground">Aucune carte.</small>
    );
  };
  const leaving = leavingDeck(
    mine.data,
    [...give].map(([variante_id, quantite]) => ({ variante_id, quantite })),
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={onBack}>
          ← Retour
        </Button>
        <h2 className="text-lg font-semibold">Échange avec {partner.pseudo}</h2>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-col gap-1">
              <small className="text-muted-foreground">
                Tu donnes ({total(give)}/{max})
              </small>
              <div className="flex flex-wrap gap-2">{chosen(mine.data, give, setGive)}</div>
            </div>
            <span className="text-2xl">⇄</span>
            <div className="flex flex-col gap-1">
              <small className="text-muted-foreground">
                Tu reçois ({total(receive)}/{max})
              </small>
              <div className="flex flex-wrap gap-2">{chosen(theirs.data, receive, setReceive)}</div>
            </div>
          </div>
          <small className="text-muted-foreground">
            Pot : <b>{pot} 🧩</b> · tu as 🧩 {info.fragments}. Clique sur une carte choisie pour la
            retirer.
          </small>
          {leaving.length > 0 && (
            <small className={TONES.warning.text}>
              ⚠ Dans ton deck de combat, et en sortira : {leaving.join(', ')}.
            </small>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Ta part du pot
              <Input
                type="number"
                min={0}
                max={pot}
                value={part}
                onChange={(e) => setShare(Math.max(0, Number(e.target.value) || 0))}
                className="w-24"
              />
            </label>
            <HoldButton
              disabled={send.isPending || !total(give) || !total(receive)}
              onConfirm={() => send.mutate(part)}
            >
              <ICONS.send />
              Proposer l'échange
            </HoldButton>
          </div>
          <small className="text-muted-foreground">
            {partner.pseudo} complètera le reste du pot en acceptant (ou vous ajusterez ensuite).
            Tes fragments sont retenus jusqu'à la fin de l'offre, et rendus si elle est refusée,
            annulée ou expirée.
          </small>
          {send.error && (
            <p role="alert" className="text-sm text-destructive">
              {send.error.message}
            </p>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <b>Tes cartes</b>
          <Input
            value={filterMine}
            onChange={(e) => setFilterMine(e.target.value)}
            placeholder="Filtrer…"
          />
          <div className="flex flex-wrap gap-2">
            {grid(mine.data, give, setGive, filterMine, true)}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <b>Cartes de {partner.pseudo}</b>
          <Input
            value={filterTheirs}
            onChange={(e) => setFilterTheirs(e.target.value)}
            placeholder="Filtrer…"
          />
          <div className="flex flex-wrap gap-2">
            {grid(theirs.data, receive, setReceive, filterTheirs, false)}
          </div>
        </div>
      </div>
    </div>
  );
}
