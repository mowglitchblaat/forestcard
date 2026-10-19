// "Propositions", reimagined: propose a card (drawing, name, type, rarity, collection or a collection
// idea, the idea; ATQ and HP for a fighter) with its assembled card drawn live beside the form, as
// the admin will see it (render.ts); then "Mes propositions" as cards, their status, the admin's
// note, and withdrawing (held: it does not come back) while one waits. The limit of 3 waiting is
// said before sending, not after.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TONES } from '@/lib/tones';
import { ICONS } from '@/lib/icons';
import { type FormEvent, useMemo, useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { PageSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  CARD_TYPE_LABELS,
  fetchMine,
  fetchRefs,
  imageUrl,
  MAX_IMAGE_BYTES,
  MAX_WAITING,
  propose,
  type Proposal,
  proposalKeys,
  type ProposalType,
  type RefCollection,
  type RefRarity,
  withdraw,
} from '@/data/proposals';
import { useSession } from '@/lib/session';
import { CENTRED, Editor, useFileImage, useFirstImage } from './editor';
import {
  framesToTry,
  PLAQUES,
  plaqueFor,
  type Placement,
  render,
  type Scene,
  tierOfName,
} from './render';

const OTHER = 'autre';
const STATUS = {
  attente: { label: 'En attente', variant: 'warning' },
  acceptee: { label: 'Acceptée', variant: 'success' },
  refusee: { label: 'Refusée', variant: 'danger' },
} as const;

const field = 'flex flex-col gap-1.5 text-sm';
const select =
  'h-9 rounded-md border bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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

function ProposalForm({
  userId,
  rarities,
  collections,
  waiting,
}: {
  userId: string;
  rarities: RefRarity[];
  collections: RefCollection[];
  waiting: number;
}) {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<ProposalType>('combattant');
  const [rarityId, setRarityId] = useState<number | null>(rarities[0]?.id ?? null);
  const [atq, setAtq] = useState('');
  const [pv, setPv] = useState('');
  // No collection yet: an idea is the only choice.
  const [collection, setCollection] = useState<string>(
    collections[0] ? String(collections[0].id) : OTHER,
  );
  const [collectionIdea, setCollectionIdea] = useState('');
  const [idea, setIdea] = useState('');
  const [placement, setPlacement] = useState<Placement>(CENTRED);
  const [sent, setSent] = useState(false);

  const rarity = rarities.find((r) => r.id === rarityId);
  const tier = tierOfName(rarity?.nom);
  const drawing = useFileImage(file);
  const frame = useFirstImage(framesToTry(type, tier));
  const plaque = useFirstImage(type === 'combattant' && PLAQUES[tier] ? [plaqueFor(tier)] : []);
  const scene: Scene = useMemo(
    () => ({ drawing, frame, plaque, placement, type, tier, name, atq, pv }),
    [drawing, frame, plaque, placement, type, tier, name, atq, pv],
  );

  const send = useMutation({
    mutationFn: async () => {
      // The assembled card at full size (1488 x 2070), as the legacy page sends it.
      const big = document.createElement('canvas');
      big.width = 1488;
      big.height = 2070;
      render(big, 1488, 2070, scene);
      const card = await new Promise<Blob | null>((ok) => big.toBlob(ok, 'image/webp', 0.9));
      await propose(userId, {
        drawing: file as File,
        card,
        nom: name,
        type,
        rarityId,
        collectionId: collection === OTHER ? null : Number(collection),
        collectionIdea,
        idea,
        atq: type === 'combattant' && atq !== '' ? Number(atq) : null,
        pv: type === 'combattant' && pv !== '' ? Number(pv) : null,
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: proposalKeys.mine(userId) });
      setFile(null);
      setName('');
      setAtq('');
      setPv('');
      setCollectionIdea('');
      setIdea('');
      setPlacement(CENTRED);
      setSent(true);
    },
  });

  // Why it cannot be sent yet (null: it can).
  const blocked =
    waiting >= MAX_WAITING
      ? `Tu as déjà ${MAX_WAITING} propositions en attente : attends que l'admin les regarde.`
      : !file
        ? 'Ajoute ton dessin.'
        : !name.trim()
          ? 'Donne un nom à ta carte.'
          : collection === OTHER && !collectionIdea.trim()
            ? 'Écris ton idée de collection.'
            : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!blocked) send.mutate();
  };

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">Propose ta carte</h2>
        <p className="text-sm text-muted-foreground">
          Envoie ton splash art et ton idée de carte : l'admin regarde chaque proposition, les
          meilleures pourront entrer dans le jeu. {MAX_WAITING} propositions en attente au maximum,
          image de 8 Mo au maximum.
        </p>
      </div>
      <div className="grid items-start gap-6 md:layout-aside-shrink-main-22">
        <Editor scene={scene} onPlacement={setPlacement} />
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className={field}>
            Ton splash art (PNG, JPG, WEBP, GIF)
            <span className="flex items-center gap-2">
              <ICONS.addImage className="size-4 shrink-0 text-muted-foreground" />
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > MAX_IMAGE_BYTES) {
                    setFileError('Image trop lourde (8 Mo maximum).');
                    e.target.value = '';
                    setFile(null);
                    return;
                  }
                  setFileError(null);
                  setFile(f);
                  setPlacement(CENTRED);
                  setSent(false);
                }}
              />
            </span>
            {fileError && <span className="text-destructive">{fileError}</span>}
          </label>
          <label className={field}>
            Nom de la carte
            <Input
              value={name}
              maxLength={60}
              placeholder="Ex. : Le Wendigo des neiges"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={field}>
              Type
              <select
                className={select}
                value={type}
                onChange={(e) => setType(e.target.value as ProposalType)}
              >
                {(Object.keys(CARD_TYPE_LABELS) as ProposalType[]).map((t) => (
                  <option key={t} value={t}>
                    {CARD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className={field}>
              Rareté
              <select
                className={select}
                value={rarityId ?? ''}
                onChange={(e) => setRarityId(Number(e.target.value) || null)}
              >
                {rarities.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nom}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {type === 'combattant' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={field}>
                ATQ (facultatif)
                <Input
                  type="number"
                  min={0}
                  max={999}
                  value={atq}
                  onChange={(e) => setAtq(e.target.value)}
                />
              </label>
              <label className={field}>
                PV (facultatif)
                <Input
                  type="number"
                  min={1}
                  max={9999}
                  value={pv}
                  onChange={(e) => setPv(e.target.value)}
                />
              </label>
            </div>
          )}
          <label className={field}>
            Collection
            <select
              className={select}
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
            >
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
              <option value={OTHER}>Autre : je propose une idée de collection</option>
            </select>
          </label>
          {collection === OTHER && (
            <label className={field}>
              Ton idée de collection
              <Input
                value={collectionIdea}
                maxLength={80}
                placeholder="Ex. : Légendes du folklore"
                onChange={(e) => setCollectionIdea(e.target.value)}
              />
            </label>
          )}
          <label className={field}>
            Ton idée (facultatif)
            <textarea
              value={idea}
              maxLength={600}
              rows={4}
              placeholder="Ambiance, histoire, capacités que tu imagines…"
              onChange={(e) => setIdea(e.target.value)}
              className="rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={!!blocked || send.isPending} className="self-start">
              <ICONS.send /> {send.isPending ? 'Envoi…' : 'Envoyer ma proposition'}
            </Button>
            {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}
            {send.error && (
              <p role="alert" className="text-sm text-destructive">
                {send.error.message}
              </p>
            )}
            {sent && !send.error && (
              <p role="status" className={`text-sm ${TONES.success.text}`}>
                Proposition envoyée : elle apparaît dans « Mes propositions ».
              </p>
            )}
          </div>
        </form>
      </div>
    </section>
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
