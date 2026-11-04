// Admin · Annonces (58-annonces.sql): publish a plain announcement (title, text, picture) or a vote
// (options, each with its picture: the next collection, say), then close or reopen a vote, or
// delete an announcement. The admin sees the counts at any time.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { HoldButton } from '@/components/hold-button';
import { PageSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  announcementKeys,
  type AnnouncementDraft,
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncements,
  setAnnouncementOpen,
} from '@/data/announcements';
import { ICONS } from '@/lib/icons';
import { AnnouncementCard } from '@/views/announcements/page';
import { AdminError, AdminSection, Field, NoticeView, useAction } from './kit';

const emptyDraft = (): AnnouncementDraft => ({
  type: 'annonce',
  titre: '',
  texte: '',
  image: null,
  options: [
    { libelle: '', image: null },
    { libelle: '', image: null },
  ],
});

export function AnnouncementsAdmin() {
  const list = useQuery({ queryKey: announcementKeys.all, queryFn: fetchAnnouncements });
  const add = useAction();
  const action = useAction();
  const [draft, setDraft] = useState(emptyDraft);
  // A new key empties the file inputs after a publication.
  const [form, setForm] = useState(0);
  const set = (patch: Partial<AnnouncementDraft>) => setDraft({ ...draft, ...patch });
  const setOption = (i: number, patch: Partial<AnnouncementDraft['options'][number]>) =>
    set({ options: draft.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  if (list.error) return <AdminError error={list.error} />;
  if (!list.data) return <PageSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <AdminSection
        title="Nouvelle annonce"
        description="Une annonce simple, ou un vote : chaque joueur choisit une option (il peut changer d'avis tant que le vote est ouvert) et voit les résultats après avoir voté. Une pastille signale la nouvelle annonce dans la barre latérale."
      >
        <div key={form} className="flex flex-col gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            value={draft.type}
            onValueChange={(v) => v && set({ type: v === 'vote' ? 'vote' : 'annonce' })}
          >
            <ToggleGroupItem value="annonce">
              <ICONS.announcements />
              Annonce
            </ToggleGroupItem>
            <ToggleGroupItem value="vote">
              <ICONS.votes />
              Vote
            </ToggleGroupItem>
          </ToggleGroup>
          <Field label="Titre">
            <Input value={draft.titre} onChange={(e) => set({ titre: e.target.value })} />
          </Field>
          <Field label="Texte (facultatif)">
            <Textarea
              rows={4}
              value={draft.texte}
              onChange={(e) => set({ texte: e.target.value })}
            />
          </Field>
          <Field label="Image (facultative)">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => set({ image: e.target.files?.[0] ?? null })}
            />
          </Field>
          {draft.type === 'vote' && (
            <div className="flex flex-col gap-3">
              <b className="text-sm">Options du vote</b>
              {draft.options.map((o, i) => (
                <div key={i} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-2">
                  <Field label={`Option ${i + 1}`}>
                    <Input
                      value={o.libelle}
                      onChange={(e) => setOption(i, { libelle: e.target.value })}
                    />
                  </Field>
                  <Field label="Image de l'option">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setOption(i, { image: e.target.files?.[0] ?? null })}
                    />
                  </Field>
                  {draft.options.length > 2 && (
                    <div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => set({ options: draft.options.filter((_, j) => j !== i) })}
                      >
                        <ICONS.remove />
                        Retirer cette option
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => set({ options: [...draft.options, { libelle: '', image: null }] })}
                >
                  <ICONS.add />
                  Ajouter une option
                </Button>
              </div>
            </div>
          )}
          <div>
            <Button
              disabled={add.pending}
              onClick={() =>
                add.run(async () => {
                  await createAnnouncement(draft);
                  setDraft(emptyDraft());
                  setForm(form + 1);
                  return draft.type === 'vote' ? 'Vote publié.' : 'Annonce publiée.';
                })
              }
            >
              <ICONS.send />
              {add.pending ? 'Publication…' : 'Publier'}
            </Button>
          </div>
        </div>
        <NoticeView notice={add.notice} />
      </AdminSection>

      <NoticeView notice={action.notice} />
      {list.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune annonce publiée.</p>
      ) : (
        list.data.map((a) => (
          <AnnouncementCard key={a.id} announcement={a}>
            <div className="flex flex-wrap gap-2">
              {a.type === 'vote' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.pending}
                  onClick={() =>
                    action.run(async () => {
                      await setAnnouncementOpen(a.id, !a.ouvert);
                      return a.ouvert
                        ? `Vote « ${a.titre} » clos.`
                        : `Vote « ${a.titre} » rouvert.`;
                    })
                  }
                >
                  <ICONS.closed />
                  {a.ouvert ? 'Clore le vote' : 'Rouvrir le vote'}
                </Button>
              )}
              <HoldButton
                size="sm"
                variant="destructive-ghost"
                disabled={action.pending}
                onConfirm={() =>
                  action.run(async () => {
                    await deleteAnnouncement(a.id);
                    return `« ${a.titre} » supprimée.`;
                  })
                }
              >
                <ICONS.delete />
                Supprimer
              </HoldButton>
            </div>
          </AnnouncementCard>
        ))
      )}
    </div>
  );
}
