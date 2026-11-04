// Admin · Cadeaux (aCadeaux): give boosters or a card to a player or to every player, with a short
// note the player sees at their next sign-in (55-cadeaux-messages.sql, 56-cadeaux-cartes.sql).

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  adminKeys,
  fetchBoosterNames,
  fetchPlayers,
  fetchVariants,
  giveBoosters,
  giveCard,
  variantLabel,
} from '@/data/admin';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import { ICONS } from '@/lib/icons';
import { AdminError, AdminSection, Field, NoticeView, useAction } from './kit';

export function GiftsAdmin() {
  const players = useQuery({ queryKey: adminKeys.players, queryFn: fetchPlayers });
  const boosters = useQuery({ queryKey: adminKeys.boosters, queryFn: fetchBoosterNames });
  const variants = useQuery({ queryKey: adminKeys.variants, queryFn: fetchVariants });
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const boosterGift = useAction();
  const cardGift = useAction();
  const [boosterTo, setBoosterTo] = useState('');
  const [boosterType, setBoosterType] = useState('');
  const [boosterCount, setBoosterCount] = useState(1);
  const [boosterNote, setBoosterNote] = useState('');
  const [cardTo, setCardTo] = useState('');
  const [variant, setVariant] = useState('');
  const [cardCount, setCardCount] = useState(1);
  const [cardNote, setCardNote] = useState('');

  const error = players.error ?? boosters.error ?? variants.error;
  if (error) return <AdminError error={error} />;
  if (!players.data || !boosters.data || !variants.data) return <PageSkeleton />;

  const type = boosterType || String(boosters.data[0]?.id ?? '');
  const picked = variants.data.find((v) => String(v.id) === variant) ?? variants.data[0];
  const pickedImage = picked ? imageUrl(picked.image_path, mirror.data ?? new Set()) : null;
  const who = (id: string) =>
    id ? (players.data.find((p) => p.id === id)?.pseudo ?? '?') : 'TOUS les joueurs';
  const playerOptions = (
    <>
      <option value="">🎁 Tous les joueurs</option>
      {players.data.map((p) => (
        <option key={p.id} value={p.id}>
          {p.pseudo ?? p.id}
        </option>
      ))}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <AdminSection title="📦 Offrir des boosters">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="À qui">
            <NativeSelect
              value={boosterTo}
              onChange={(e) => setBoosterTo(e.target.value)}
              className="w-56"
            >
              {playerOptions}
            </NativeSelect>
          </Field>
          <Field label="Booster">
            <NativeSelect
              value={type}
              onChange={(e) => setBoosterType(e.target.value)}
              className="w-56"
            >
              {boosters.data.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nom}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Combien">
            <Input
              type="number"
              min={1}
              value={boosterCount}
              onChange={(e) => setBoosterCount(Math.max(1, Number(e.target.value) || 1))}
              className="w-20"
            />
          </Field>
          <Field label="Petit mot (facultatif), vu à sa prochaine connexion">
            <Input
              maxLength={500}
              value={boosterNote}
              onChange={(e) => setBoosterNote(e.target.value)}
              className="min-w-64"
            />
          </Field>
          <Button
            disabled={boosterGift.pending || !type}
            onClick={() =>
              boosterGift.run(async () => {
                const text = await giveBoosters(
                  boosterTo || null,
                  Number(type),
                  boosterCount,
                  boosterNote,
                );
                setBoosterNote('');
                return text;
              })
            }
          >
            <ICONS.gifts />
            Offrir
          </Button>
        </div>
        <NoticeView notice={boosterGift.notice} />
      </AdminSection>

      <AdminSection
        title="🃏 Offrir une carte"
        description="La carte arrive tout de suite dans la collection (une carte déjà possédée devient un doublon). « Tous les joueurs » : chaque joueur inscrit sur le site à ce moment-là."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="À qui">
            <NativeSelect
              value={cardTo}
              onChange={(e) => setCardTo(e.target.value)}
              className="w-56"
            >
              {playerOptions}
            </NativeSelect>
          </Field>
          <Field label="Carte (version)">
            <NativeSelect
              value={picked ? String(picked.id) : ''}
              onChange={(e) => setVariant(e.target.value)}
              className="w-80"
            >
              {variants.data.map((v) => (
                <option key={v.id} value={v.id}>
                  {variantLabel(v)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Combien">
            <Input
              type="number"
              min={1}
              max={100}
              value={cardCount}
              onChange={(e) =>
                setCardCount(Math.min(100, Math.max(1, Number(e.target.value) || 1)))
              }
              className="w-20"
            />
          </Field>
          <Field label="Petit mot (facultatif), ex : Joyeux Halloween ! 🎃">
            <Input
              maxLength={500}
              value={cardNote}
              onChange={(e) => setCardNote(e.target.value)}
              className="min-w-64"
            />
          </Field>
          <HoldButton
            disabled={cardGift.pending || !picked}
            onConfirm={() => {
              if (!picked) return;
              cardGift.run(async () => {
                const text = await giveCard(cardTo || null, picked.id, cardCount, cardNote);
                setCardNote('');
                return text;
              });
            }}
          >
            <ICONS.gifts />
            Offrir la carte
          </HoldButton>
        </div>
        {picked && (
          <p className="text-sm text-muted-foreground">
            {cardCount > 1 ? `${cardCount} × ` : ''}
            {variantLabel(picked)} pour {who(cardTo)} : maintiens le bouton pour l'offrir.
          </p>
        )}
        {pickedImage && <img src={pickedImage} alt="" className="w-28 rounded-lg shadow-md" />}
        <NoticeView notice={cardGift.notice} />
      </AdminSection>
    </div>
  );
}
