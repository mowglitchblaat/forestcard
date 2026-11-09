// The lore (60-lore.sql): three tabs. Story: the chapters as cards, each opening in the reader
// (./chapter-reader.tsx; the one in the address opens by itself). Map: the interactive world map
// (./world-map.tsx), whose places open their chapter in the same reader. Events: a defence (each player places
// one of their fighters; the chance of success is the whole community's) or a vote (each player
// votes for an option, the most voted is sent). Once an event is resolved, the player who took part
// sees the draw played out the first time they open it.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cardKeys, type CollectionEntry, fetchCollection } from '@/data/cards';
import { fetchMirror, imageKeys, imageUrl } from '@/data/images';
import {
  EVENTS_REFRESH,
  fetchChapters,
  fetchEvents,
  joinEvent,
  type LoreEvent,
  loreKeys,
  markEventSeen,
  type Place,
} from '@/data/lore';
import { ICONS } from '@/lib/icons';
import { useSession } from '@/lib/session';
import { TONES } from '@/lib/tones';
import { LORE_TABS, type LoreTab } from './search';
import { ChapterReader, paragraphsOf } from './chapter-reader';
import { EventScene, hasScene, lightningPhase, type SceneOutcome, sentOption } from './event-scene';
import { WorldMap } from './world-map';

const route = getRouteApi('/lore');

const dateOf = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

function useImages() {
  const mirror = useQuery({
    queryKey: imageKeys.mirror,
    queryFn: fetchMirror,
    staleTime: Infinity,
  });
  const images = mirror.data ?? new Set<string>();
  return (path: string | null) => imageUrl(path, images);
}

export function LorePage() {
  const { onglet } = route.useSearch();
  const navigate = route.useNavigate();
  const tab: LoreTab = onglet ?? 'evenements';
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => void navigate({ search: { onglet: v as LoreTab }, replace: true })}
    >
      <TabsList>
        <TabsTrigger value="evenements">
          <ICONS.events />
          {LORE_TABS.evenements}
        </TabsTrigger>
        <TabsTrigger value="carte">
          <ICONS.worldMap />
          {LORE_TABS.carte}
        </TabsTrigger>
        <TabsTrigger value="histoire">
          <ICONS.lore />
          {LORE_TABS.histoire}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="evenements">
        <Events />
      </TabsContent>
      <TabsContent value="carte">
        <WorldMap />
      </TabsContent>
      <TabsContent value="histoire">
        <Story />
      </TabsContent>
    </Tabs>
  );
}

// ── Story ──

function Story() {
  const chapters = useQuery({ queryKey: loreKeys.chapters, queryFn: fetchChapters });
  const img = useImages();
  const { chapitre } = route.useSearch();
  const navigate = route.useNavigate();
  if (chapters.error) return <p className="text-destructive">{chapters.error.message}</p>;
  if (!chapters.data) return <PageSkeleton />;
  if (!chapters.data.length)
    return <p className="text-muted-foreground">L'histoire n'a pas encore commencé…</p>;
  const list = chapters.data;
  // the chapter open in the reader lives in the address, so a place of the map can link to it
  const index = chapitre === undefined ? null : list.findIndex((c) => c.id === chapitre);
  const show = (i: number | null) =>
    void navigate({
      search: (s) => ({ ...s, chapitre: i === null ? undefined : list[i]?.id }),
      replace: true,
    });
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((ch, i) => {
          const picture = img(ch.image_path);
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => show(i)}
              className="cursor-pointer rounded-xl text-left transition hover:-translate-y-0.5"
            >
              <Card className="h-full overflow-hidden pt-0">
                {picture ? (
                  <img src={picture} alt="" className="aspect-video w-full object-cover" />
                ) : (
                  <span className="block aspect-video w-full bg-muted" />
                )}
                <CardHeader>
                  <CardDescription>Chapitre {i + 1}</CardDescription>
                  <CardTitle>{ch.titre}</CardTitle>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {paragraphsOf(ch.texte)[0]}
                  </p>
                </CardHeader>
              </Card>
            </button>
          );
        })}
      </div>
      <ChapterReader
        chapters={list}
        index={index !== null && index >= 0 ? index : null}
        onIndex={show}
        img={img}
      />
    </>
  );
}

// ── World map ──

export function MapPins({
  places,
  onPick,
  picked,
}: {
  places: Place[];
  onPick: (p: Place) => void;
  picked?: number | null;
}) {
  return (
    <>
      {places.map((p) => (
        <button
          key={p.id}
          type="button"
          title={p.nom}
          onClick={(e) => {
            e.stopPropagation();
            onPick(p);
          }}
          style={{ '--x': `${p.x}%`, '--y': `${p.y}%` }}
          className="absolute top-(--y) left-(--x) flex -translate-x-1/2 -translate-y-full cursor-pointer flex-col items-center"
        >
          <span
            className={`rounded-full border-2 bg-background p-1.5 shadow-lg transition hover:scale-125 ${picked === p.id ? 'border-primary' : 'border-foreground'}`}
          >
            <ICONS.position className="size-4" />
          </span>
          <span className="mt-0.5 rounded bg-background px-1.5 text-xs font-medium shadow">
            {p.nom}
          </span>
        </button>
      ))}
    </>
  );
}

// ── Events ──

function Events() {
  const events = useQuery({
    queryKey: loreKeys.events,
    queryFn: fetchEvents,
    refetchInterval: EVENTS_REFRESH,
  });
  const userId = useSession()?.user.id ?? '';
  const collection = useQuery({
    queryKey: cardKeys.collection(userId),
    queryFn: () => fetchCollection(userId),
    enabled: userId !== '',
  });
  const [reveal, setReveal] = useState<LoreEvent | null>(null);
  const [dismissed, setDismissed] = useState<number[]>([]);
  // The first resolved event the player took part in and has not seen yet: played out at once.
  const unseen = events.data?.find(
    (e) =>
      e.statut === 'resolu' &&
      !e.vu &&
      !dismissed.includes(e.id) &&
      (e.ma_carte !== null || e.mon_option !== null),
  );
  useEffect(() => {
    if (unseen && !reveal) setReveal(unseen);
  }, [unseen, reveal]);

  if (events.error) return <p className="text-destructive">{events.error.message}</p>;
  if (!events.data) return <PageSkeleton />;
  if (!events.data.length)
    return (
      <p className="text-muted-foreground">
        Aucun événement pour l'instant. Le calme avant la tempête…
      </p>
    );
  const owned = collection.data ?? [];
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {events.data.map((e) => (
        <EventCard key={e.id} event={e} owned={owned} onReplay={() => setReveal(e)} />
      ))}
      {reveal && (
        <Reveal
          event={reveal}
          onClose={() => {
            setDismissed([...dismissed, reveal.id]);
            setReveal(null);
          }}
        />
      )}
    </div>
  );
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// A duration in hours, as « 4 h 05 » (or « 35 min »).
const hoursText = (hours: number): string => {
  const m = Math.round(hours * 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

function countdown(iso: string, now: number): string {
  const left = Math.max(0, new Date(iso).getTime() - now);
  const m = Math.floor(left / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d} j ${h} h` : h > 0 ? `${h} h ${m % 60} min` : `${m % 60} min`;
}

export function EventCard({
  event: e,
  owned,
  onReplay,
  children,
}: {
  event: LoreEvent;
  owned: CollectionEntry[];
  onReplay?: () => void;
  children?: ReactNode;
}) {
  const img = useImages();
  const picture = img(e.image_path);
  const now = useNow();
  const left = countdown(e.fin, now);
  const open = e.statut === 'ouvert';
  // A lightning event: after the vote, the faction sent travels before the result.
  const trip = e.eclair_x !== null ? lightningPhase(e, now).phase : null;
  const voting = open && new Date(e.fin).getTime() > now;
  const joined = e.ma_carte !== null || e.mon_option !== null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <ICONS.events />
          {e.titre}
          {open && trip && trip !== 'vote' ? (
            <Badge variant="info">
              <ICONS.travel />
              {trip === 'travel' && e.arrivee
                ? `En route · arrivée dans ${countdown(e.arrivee, now)}`
                : 'Arrivée : résultat imminent'}
            </Badge>
          ) : open ? (
            <Badge variant="info">
              <ICONS.wait />
              Encore {left}
            </Badge>
          ) : e.reussi ? (
            <Badge variant="success">Réussi</Badge>
          ) : (
            <Badge variant="danger">Échoué</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {voting
            ? `${trip ? 'Vote jusqu’au' : 'Se termine'} ${dateOf(e.fin)}`
            : open && e.arrivee
              ? `Vote terminé · arrivée ${dateOf(e.arrivee)}`
              : `Terminé ${dateOf(e.fin)}`}{' '}
          · {e.participants} participant{e.participants > 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {hasScene(e) ? (
          <EventScene event={e} />
        ) : (
          picture && <img src={picture} alt="" className="w-full rounded-lg" />
        )}
        {e.texte && <p className="whitespace-pre-line">{e.texte}</p>}
        <Reward event={e} />
        {e.type === 'defense' ? (
          <Defence event={e} owned={owned} scene={hasScene(e)} />
        ) : (
          <VoteOptions event={e} voting={voting} />
        )}
        {!open && (
          <p className="text-sm">
            {e.participants === 0
              ? 'Personne n’a répondu à l’appel : rien ne se passe.'
              : `Chance de réussite : ${e.chance_finale ?? 0} % · le destin a tiré ${e.tirage ?? '?'} (il fallait ${e.chance_finale ?? 0} ou moins).`}{' '}
            {joined &&
              (e.ma_recompense ? (
                <b className={TONES.success.text}>Tu as gagné {e.recompense_nom} !</b>
              ) : (
                <span className="text-muted-foreground">Pas de récompense pour toi.</span>
              ))}
          </p>
        )}
        {!open && joined && onReplay && (
          <div>
            <Button size="sm" variant="outline" onClick={onReplay}>
              <ICONS.replay />
              Revoir le résultat
            </Button>
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

function Reward({ event: e }: { event: LoreEvent }) {
  const img = useImages();
  if (!e.recompense_nom) return null;
  const picture = img(e.recompense_image);
  return (
    <div className="flex items-center gap-3 rounded-lg border p-2 text-sm">
      {picture && <img src={picture} alt="" className="aspect-5/7 w-12 rounded object-cover" />}
      <span>
        <b>Récompense :</b> en cas de réussite, chaque participant a {e.recompense_pct} % de chances
        de recevoir <b>{e.recompense_nom}</b>. En cas d’échec : rien.
      </span>
    </div>
  );
}

// scene: the boss scene above already shows the barrier (the chance) and the defence line.
function Defence({
  event: e,
  owned,
  scene,
}: {
  event: LoreEvent;
  owned: CollectionEntry[];
  scene: boolean;
}) {
  const client = useQueryClient();
  const img = useImages();
  const [picking, setPicking] = useState(false);
  const join = useMutation({
    mutationFn: (card: number) => joinEvent(e.id, card, null),
    onSuccess: () => setPicking(false),
    onSettled: () => client.invalidateQueries({ queryKey: loreKeys.events }),
  });
  const open = e.statut === 'ouvert';
  // One tile per fighter the player owns (its first version with an image).
  const fighters = [
    ...new Map(
      owned
        .filter((x) => x.card.type === 'combattant' && x.quantite > 0)
        .map((x) => [x.card.id, x] as const),
    ).values(),
  ].sort((a, b) => a.card.nom.localeCompare(b.card.nom, 'fr'));
  const mine = fighters.find((x) => x.card.id === e.ma_carte);
  const keys = e.combattants.filter((k) => k.role === 'cle');
  const harmful = e.combattants.filter((k) => k.role === 'nuisible');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-sm">
        <span>
          Chaque joueur place un de ses combattants. Combattant clé : +{e.cle_pct} % (une seule fois
          chacun) · autre combattant : +{e.autre_pct} % · combattant nuisible : −{e.nuisible_pct} %.
        </span>
        {e.chance !== null && open && !scene && (
          <span className="flex items-center gap-2">
            <b>Chance de réussite actuelle : {e.chance} %</b>
            <span className="w-48">
              <Progress value={e.chance} />
            </span>
          </span>
        )}
        {keys.length > 0 && (
          <span>
            Combattants clés : <b>{keys.map((k) => k.nom).join(', ')}</b>
          </span>
        )}
        {harmful.length > 0 && (
          <span>
            Nuisibles : <b>{harmful.map((k) => k.nom).join(', ')}</b>
          </span>
        )}
      </div>
      {mine ? (
        <div className="flex items-center gap-3 text-sm">
          {img(mine.variant.image_path) && (
            <img
              src={img(mine.variant.image_path) ?? undefined}
              alt=""
              className="aspect-5/7 w-16 rounded object-cover"
            />
          )}
          <span>
            Tu as placé <b>{mine.card.nom}</b>.
          </span>
        </div>
      ) : (
        e.ma_carte !== null && <span className="text-sm">Tu as placé un combattant.</span>
      )}
      {open && (
        <div>
          <Button
            size="sm"
            variant={mine ? 'outline' : 'default'}
            onClick={() => setPicking(!picking)}
          >
            <ICONS.combat />
            {mine ? 'Changer de combattant' : 'Placer un combattant'}
          </Button>
        </div>
      )}
      {open && picking && (
        <div className="grid grid-tiles-sm gap-2">
          {fighters.map((x) => {
            const src = img(x.variant.image_path);
            return (
              <button
                key={x.card.id}
                type="button"
                disabled={join.isPending}
                onClick={() => join.mutate(x.card.id)}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg p-1 text-left text-xs transition enabled:hover:-translate-y-0.5 ${x.card.id === e.ma_carte ? 'bg-primary/10 ring-2 ring-primary' : ''}`}
              >
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
                <span className="line-clamp-1">{x.card.nom}</span>
              </button>
            );
          })}
          {!fighters.length && (
            <p className="text-sm text-muted-foreground">Tu n'as encore aucun combattant.</p>
          )}
        </div>
      )}
      {join.error && (
        <small role="alert" className="text-destructive">
          {join.error.message}
        </small>
      )}
    </div>
  );
}

function VoteOptions({ event: e, voting }: { event: LoreEvent; voting: boolean }) {
  const client = useQueryClient();
  const img = useImages();
  const vote = useMutation({
    mutationFn: (option: number) => joinEvent(e.id, null, option),
    onSettled: () => client.invalidateQueries({ queryKey: loreKeys.events }),
  });
  const open = voting;
  const lightning = e.eclair_x !== null;
  const total = e.options.reduce((s, o) => s + o.voix, 0);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm">
        {lightning
          ? 'Chaque joueur vote pour la faction à envoyer : la plus votée part de chez elle vers l’éclair à la fin du vote (trajet = distance ÷ vitesse). À son arrivée, sa chance de réussite décide.'
          : 'Chaque joueur vote : l’option la plus votée est envoyée, avec sa chance de réussite.'}
      </span>
      <div className="grid gap-3 sm:grid-cols-2">
        {e.options.map((o) => {
          const picture = img(o.image_path);
          const mine = e.mon_option === o.id;
          const sent = e.option_gagnante === o.id;
          const pct = total ? Math.round((o.voix * 100) / total) : 0;
          return (
            <button
              key={o.id}
              type="button"
              disabled={!open || vote.isPending}
              onClick={() => vote.mutate(o.id)}
              className={`flex flex-col gap-2 rounded-xl border p-2 text-left transition enabled:cursor-pointer enabled:hover:-translate-y-0.5 enabled:hover:bg-muted ${mine ? 'bg-primary/10 ring-2 ring-primary' : ''}`}
            >
              {picture && (
                <img
                  src={picture}
                  alt=""
                  loading="lazy"
                  className="aspect-4/3 w-full rounded-lg bg-muted object-contain"
                />
              )}
              <span className="flex items-center gap-2 font-medium">
                {mine && <ICONS.done className="size-4" />}
                {sent && <ICONS.events className="size-4" />}
                {o.libelle}
                <Badge variant="outline">{o.chance} % de réussite</Badge>
              </span>
              {lightning && o.trajet_heures !== null && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ICONS.travel className="size-3.5" />
                  Vitesse {o.vitesse} · trajet {hoursText(o.trajet_heures)}
                </span>
              )}
              <span className="flex flex-col gap-1 text-xs text-muted-foreground">
                <Progress value={pct} />
                {o.voix} voix ({pct} %)
              </span>
            </button>
          );
        })}
      </div>
      {vote.error && (
        <small role="alert" className="text-destructive">
          {vote.error.message}
        </small>
      )}
    </div>
  );
}

// With a boss scene: the boss's charge and the line's shake, before the verdict (index.css,
// --animate-boss-charge and --animate-line-shake last 1.1 s and 1.3 s).
const CLASH_MS = 1500;

// The result played out: the destiny's die rolls, lands on its number against the chance, then the
// verdict and the reward. Once closed, it is marked seen (it does not play again by itself).
function Reveal({ event: e, onClose }: { event: LoreEvent; onClose: () => void }) {
  const client = useQueryClient();
  const img = useImages();
  // With a boss scene, the clash plays between the draw and the verdict.
  const scene = hasScene(e);
  const [phase, setPhase] = useState<'roll' | 'clash' | 'verdict'>('roll');
  const [shown, setShown] = useState(1);
  const chance = e.chance_finale ?? 0;
  useEffect(() => {
    let k = 0;
    const later: ReturnType<typeof setTimeout>[] = [];
    const t = setInterval(() => {
      k++;
      setShown(1 + Math.floor(Math.random() * 100));
      if (k >= 26) {
        clearInterval(t);
        setShown(e.tirage ?? 100);
        later.push(
          setTimeout(() => {
            if (scene) {
              setPhase('clash');
              later.push(setTimeout(() => setPhase('verdict'), CLASH_MS));
            } else setPhase('verdict');
          }, 900),
        );
      }
    }, 70);
    return () => {
      clearInterval(t);
      later.forEach(clearTimeout);
    };
  }, [e.tirage, scene]);
  const outcome: SceneOutcome =
    phase === 'roll' ? 'idle' : phase === 'clash' ? 'clash' : e.reussi ? 'won' : 'lost';
  const close = () => {
    if (!e.vu)
      void markEventSeen(e.id).then(() => client.invalidateQueries({ queryKey: loreKeys.events }));
    onClose();
  };
  const reward = img(e.recompense_image);
  const body = (
    <>
      <DialogTitle>{e.titre}</DialogTitle>
      <DialogDescription>
        {e.participants === 0
          ? 'Personne n’a répondu à l’appel.'
          : `Chance de réussite : ${chance} %. Le destin doit tirer ${chance} ou moins.`}
      </DialogDescription>
      {scene && <EventScene event={e} outcome={outcome} />}
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <ICONS.dailyGames
          className={`size-12 ${phase === 'roll' ? 'animate-spin' : 'animate-in zoom-in-50'}`}
        />
        <span className="text-6xl font-black tabular-nums">{shown}</span>
        <div className="w-64 max-w-full">
          <Progress value={chance} />
        </div>
        {phase === 'verdict' && (
          <div className="flex flex-col items-center gap-3 animate-in fade-in-0 zoom-in-50 duration-500">
            {e.reussi ? (
              <b className={`text-4xl ${TONES.success.text}`}>VICTOIRE !</b>
            ) : (
              <b className="text-4xl text-destructive">DÉFAITE…</b>
            )}
            {scene && e.participants > 0 && (
              <span className="font-medium">
                {e.eclair_x !== null
                  ? e.reussi
                    ? `${sentOption(e)?.libelle ?? 'La faction'} a percé le secret de l’éclair !`
                    : `${sentOption(e)?.libelle ?? 'La faction'} est revenue bredouille…`
                  : e.reussi
                    ? `La défense a tenu : ${e.attaquant_nom ?? 'l’attaque'} est repoussé${e.attaquant_nom ? '' : 'e'} !`
                    : 'Les défenseurs sont tombés…'}
              </span>
            )}
            {e.reussi &&
              (e.ma_recompense ? (
                <>
                  {reward && (
                    <img
                      src={reward}
                      alt=""
                      className="aspect-5/7 w-40 rounded-lg object-cover shadow-xl animate-in spin-in-12 zoom-in-50 duration-700"
                    />
                  )}
                  <span>
                    Tu reçois <b>{e.recompense_nom}</b> ! Elle est dans ta collection.
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  La victoire est là, mais la carte ne t'a pas choisi cette fois.
                </span>
              ))}
            {!e.reussi && <span className="text-muted-foreground">Aucune récompense.</span>}
            <Button onClick={close}>Fermer</Button>
          </div>
        )}
      </div>
    </>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      {scene ? (
        <DialogContent className="max-h-dialog overflow-y-auto sm:max-w-2xl">{body}</DialogContent>
      ) : (
        <DialogContent className="max-h-dialog overflow-y-auto sm:max-w-md">{body}</DialogContent>
      )}
    </Dialog>
  );
}
