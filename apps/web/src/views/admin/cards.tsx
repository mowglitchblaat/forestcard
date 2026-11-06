// Admin · Cartes (aCartes): the card editor (name, type, collection, rarity, stats, ultimate and its
// trigger, passives with the programming, a magic's effect and timing, a trap's condition, effect
// and number of triggers, publishing), the composer (bare drawing → normal and combat images), the
// old way (images already made), alternative versions, the re-rendering of every composed card and
// a style for all, and the list of cards (publish, edit, delete). The card being edited is in the
// address (?carte=12), so the votes can link to it.

import {
  EDITOR_CONDITIONS,
  EDITOR_MAGICS,
  EDITOR_PASSIVES,
  EDITOR_ULTIMATES,
} from '@forestcard/describe';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { PageSkeleton } from '@/components/skeletons';
import { HoldButton } from '@/components/hold-button';
import { Badge } from '@/components/ui/badge';
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
  type CollectionRow,
  type CustomEffect,
  fetchCollections,
  fetchCustomEffects,
  fetchRarities,
  type RarityRow,
} from '@/data/admin';
import {
  addVariant,
  fetchAltVersions,
  NUMBER_STYLES,
  type NumberStyle,
  setNumberStyle,
  type CardRow,
  type CardWrite,
  createCard,
  deleteCard,
  fetchCard,
  fetchCardList,
  fetchStandard,
  publicImage,
  regenerateAll,
  saveComposed,
  saveReadyImages,
  setPublished,
  updateCard,
} from '@/data/admin-cards';
import { imageUrl } from '@/data/images';
import { type ComposerSettings, getComposer } from '@/lib/composer';
import { ICONS } from '@/lib/icons';
import { ComposerPanel, type ComposerState, emptyComposer } from './composer-panel';
import {
  bricksOf,
  type Catalog,
  clean,
  cleanMulti,
  EffectPicker,
  type Entry,
  fromBricks,
  type Fx,
  MultiPicker,
  ULTIMATE_TRIGGERS,
} from './effect-picker';
import { AdminError, AdminSection, Choice, Field, NoticeView, useAction } from './kit';

const route = getRouteApi('/admin/$sub');

const TYPES = { combattant: 'Combattant', magie: 'Magie', piege: 'Piège' } as const;
type CardType = keyof typeof TYPES;
const isType = (t: string): t is CardType => t in TYPES;

// The editor's lists, with the admin's custom effects (a text only, the engine does not run them,
// but a stunning one).
function catalogs(custom: CustomEffect[]) {
  const withCustom = (base: Catalog, category: string): Catalog => ({
    ...base,
    ...Object.fromEntries(
      custom
        .filter((c) => c.categorie === category)
        .map((c): [string, Entry] => [
          c.cle,
          [
            `${c.libelle}${/^perso_.*etourd/.test(c.cle) ? ' ✅ (exécuté comme un étourdissement)' : " ⚠️ texte seulement : le moteur ne l'exécute pas"}`,
            ...(c.params ?? []),
          ],
        ]),
    ),
  });
  const passives = withCustom(EDITOR_PASSIVES as Catalog, 'passif');
  const ultimates = withCustom(EDITOR_ULTIMATES as Catalog, 'ultime');
  const magics = withCustom(EDITOR_MAGICS as Catalog, 'magie');
  const conditions = withCustom(EDITOR_CONDITIONS as Catalog, 'condition');
  return {
    passives,
    ultimates,
    magics,
    conditions,
    trapEffects: { ...ultimates, ...magics, voler: ultimates.voler },
  };
}

export function CardsAdmin() {
  const { carte } = route.useSearch();
  const collections = useQuery({ queryKey: adminKeys.collections, queryFn: fetchCollections });
  const rarities = useQuery({ queryKey: adminKeys.rarities, queryFn: fetchRarities });
  const cards = useQuery({ queryKey: adminKeys.cards, queryFn: fetchCardList });
  const custom = useQuery({ queryKey: adminKeys.effects, queryFn: fetchCustomEffects });
  const editing = useQuery({
    queryKey: ['admin', 'card', carte ?? 0],
    queryFn: () => fetchCard(carte ?? 0),
    enabled: carte !== undefined,
  });

  const error = collections.error ?? rarities.error ?? cards.error ?? editing.error;
  if (error) return <AdminError error={error} />;
  // Custom effects are optional (04-effets.sql): their absence leaves the base lists.
  if (!collections.data || !rarities.data || !cards.data || custom.isPending)
    return <PageSkeleton />;
  if (carte !== undefined && !editing.data) return <PageSkeleton />;
  const lists = catalogs(custom.data ?? []);

  return (
    <div className="flex flex-col gap-6">
      <CardEditor
        key={
          editing.data
            ? `edit-${editing.data.id}-${JSON.stringify(editing.data)}`
            : `new-${cards.data.length}`
        }
        card={carte !== undefined ? (editing.data ?? null) : null}
        collections={collections.data.list}
        rarities={rarities.data}
        lists={lists}
      />
      <VariantForm cards={cards.data} />
      <VersionNumbers />
      <Regenerate />
      <CardList cards={cards.data} collections={collections.data.list} />
    </div>
  );
}

type Lists = ReturnType<typeof catalogs>;

// The programming passive (collection mécanique): chosen in the passives' list, set in its own box.
type Programming = { chance: number; nbpassif: number; pumax: number; pdmax: number };
const PROGRAMMING_DEFAULTS: Programming = { chance: 50, nbpassif: 2, pumax: 3, pdmax: 2 };

function CardEditor({
  card,
  collections,
  rarities,
  lists,
}: {
  card: CardRow | null;
  collections: CollectionRow[];
  rarities: RarityRow[];
  lists: Lists;
}) {
  const navigate = route.useNavigate();
  const cpo = getComposer();
  const action = useAction();
  const file = useRef<HTMLInputElement>(null);
  const combatFile = useRef<HTMLInputElement>(null);

  const ultimate = (card?.ultime ?? null) as Fx | null;
  const effect = (card?.effet ?? null) as Record<string, unknown> | null;
  const storedPassives = bricksOf(card?.passif);
  const storedProgramming = storedPassives.find((b) => b.type === 'programmation');
  const num = (v: unknown, fallback: number) =>
    v === null || v === undefined || v === '' ? fallback : Number(v);

  const [name, setName] = useState(card?.nom ?? '');
  const [type, setType] = useState<CardType>(card && isType(card.type) ? card.type : 'combattant');
  const [collection, setCollection] = useState(String(card?.collection_id ?? ''));
  const [rarity, setRarity] = useState(String(card?.rarete_id ?? rarities[0]?.id ?? ''));
  const [atq, setAtq] = useState(
    card?.atq === null || card?.atq === undefined ? '' : String(card.atq),
  );
  const [pv, setPv] = useState(card?.pv === null || card?.pv === undefined ? '' : String(card.pv));
  const [description, setDescription] = useState(card?.description ?? '');
  const [published, setPublishedState] = useState(card?.actif === true);
  const [ult, setUlt] = useState<Fx | null>(ultimate);
  const [afterTurns, setAfterTurns] = useState(
    ultimate?.apres_tours ? String(ultimate.apres_tours as number) : '',
  );
  const [onCard, setOnCard] = useState(ultimate?.sur_carte === true);
  const [trigger, setTrigger] = useState(typeof ultimate?.udecl === 'string' ? ultimate.udecl : '');
  const [triggerX, setTriggerX] = useState(
    ultimate?.udx === null || ultimate?.udx === undefined ? '' : String(ultimate.udx as number),
  );
  const [uses, setUses] = useState(num(ultimate?.utilisations, 1));
  const [cooldown, setCooldown] = useState(num(ultimate?.delai_tours, 0));
  // The programming stays in the passives' list as a bare { type: 'programmation' }.
  const [passives, setPassives] = useState<unknown>(
    fromBricks(storedPassives.map((b) => (b.type === 'programmation' ? { type: b.type } : b))),
  );
  const [programming, setProgramming] = useState<Programming>({
    chance: num(storedProgramming?.chance, 50),
    nbpassif: num(storedProgramming?.nbpassif, 2),
    pumax: num(storedProgramming?.pumax, 3),
    pdmax: num(storedProgramming?.pdmax, 2),
  });
  const [magic, setMagic] = useState<unknown>(type === 'magie' ? effect : null);
  const [magicStart, setMagicStart] = useState(
    type === 'magie' && effect?.magdebut ? String(effect.magdebut as number) : '',
  );
  const [magicLength, setMagicLength] = useState(
    type === 'magie' && effect?.magduree ? String(effect.magduree as number) : '',
  );
  const [condition, setCondition] = useState<Fx | null>(
    type === 'piege' ? ((effect?.condition ?? null) as Fx | null) : null,
  );
  const [trapEffect, setTrapEffect] = useState<unknown>(
    type === 'piege' ? (effect?.effet ?? null) : null,
  );
  const [triggers, setTriggers] = useState(type === 'piege' ? num(effect?.declenchements, 1) : 1);
  const [composer, setComposer] = useState<ComposerState>(emptyComposer);

  // The composer: the card's kept drawing and its settings, else its current image as it is.
  useEffect(() => {
    if (!card) return;
    let gone = false;
    void (async () => {
      const standard = await fetchStandard(card.id);
      if (gone || !standard) return;
      if (standard.dessin_path) {
        const drawing = await cpo.dessinDe(publicImage(standard.dessin_path));
        if (gone) return;
        setComposer({
          ...emptyComposer(),
          drawing,
          drawingPath: drawing ? standard.dessin_path : null,
          settings: { ...cpo.DEF, ...(standard.compo ?? {}) } as ComposerSettings,
        });
      } else if (standard.image_path) {
        const image = await cpo.dessinDe(imageUrl(standard.image_path, new Set()) ?? '');
        if (!gone) setComposer({ ...emptyComposer(), image });
      }
    })();
    return () => {
      gone = true;
    };
  }, [card, cpo]);

  const hasProgramming = bricksOf(passives).some((b) => b.type === 'programmation');
  const tier = cpo.tierDe(rarities.find((r) => String(r.id) === rarity));

  // The card as written: the legacy page's form read back.
  const build = (): CardWrite => {
    let ultimeOut: Fx | null = null;
    let passifOut: unknown = null;
    let effetOut: unknown = null;
    if (type === 'combattant') {
      ultimeOut = clean(lists.ultimates, ult);
      if (ultimeOut) {
        if (Number(afterTurns)) ultimeOut.apres_tours = Number(afterTurns);
        if (onCard) ultimeOut.sur_carte = true;
        if (trigger) {
          ultimeOut.udecl = trigger;
          if (triggerX !== '') ultimeOut.udx = Number(triggerX);
        }
        ultimeOut.utilisations = uses || 0;
        ultimeOut.delai_tours = cooldown || 0;
      }
      const rest = bricksOf(cleanMulti(lists.passives, passives)).filter(
        (b) => b.type !== 'programmation',
      );
      if (hasProgramming)
        rest.push({ type: 'programmation', ...programming, passifs: null, ultimes: null });
      passifOut = fromBricks(rest);
    } else if (type === 'magie') {
      const m = cleanMulti(lists.magics, magic) as Record<string, unknown> | null;
      if (m) {
        if (Number(magicStart) > 1) m.magdebut = Number(magicStart);
        if (Number(magicLength) > 0) m.magduree = Number(magicLength);
      }
      effetOut = m;
    } else {
      const c = clean(lists.conditions, condition);
      const e = cleanMulti(lists.trapEffects, trapEffect);
      if (c || e) effetOut = { condition: c, effet: e, declenchements: triggers || 1 };
    }
    const fighter = type === 'combattant';
    return {
      nom: name.trim(),
      type,
      collection_id: collection ? Number(collection) : null,
      rarete_id: Number(rarity),
      atq: fighter && atq !== '' ? Number(atq) : null,
      pv: fighter && pv !== '' ? Number(pv) : null,
      description: description.trim() || null,
      actif: published,
      ultime: ultimeOut,
      passif: passifOut,
      effet: effetOut,
    };
  };
  const preview = build();

  const close = () =>
    void navigate({ search: (s) => ({ ...s, carte: undefined }), resetScroll: false });

  const save = () =>
    action.run(async () => {
      const row = build();
      if (!row.nom) throw new Error('Donne un nom à la carte.');
      const ready = file.current?.files?.[0] ?? null;
      const readyCombat = combatFile.current?.files?.[0] ?? null;
      let message = '';
      if (card) {
        await updateCard(card, row);
        if (ready || readyCombat)
          message = await saveReadyImages(card.id, ready, readyCombat, false);
        else if (composer.drawing) {
          const saved = await saveComposed(
            card.id,
            row,
            tier,
            composer.drawing,
            composer.drawingFile,
            composer.drawingPath,
            composer.settings,
            false,
          );
          message = saved.message;
        }
        close();
        return message || `« ${row.nom} » enregistrée.`;
      }
      if (!ready && !composer.drawing)
        throw new Error('Ajoute le dessin seul (ou une image complète déjà prête).');
      const id = await createCard(row);
      if (ready) message = await saveReadyImages(id, ready, readyCombat, true);
      else if (composer.drawing)
        message = (
          await saveComposed(
            id,
            row,
            tier,
            composer.drawing,
            composer.drawingFile,
            null,
            composer.settings,
            true,
          )
        ).message;
      return message || `Carte « ${row.nom} » créée.`;
    });

  return (
    <AdminSection title={card ? `Modifier : ${card.nom}` : 'Nouvelle carte'}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Nom">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-64" />
        </Field>
        <Field label="Type">
          <NativeSelect
            value={type}
            disabled={card !== null}
            onChange={(e) => {
              if (isType(e.target.value)) setType(e.target.value);
            }}
            className="w-40"
          >
            {Object.entries(TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Collection">
          <NativeSelect
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="w-56"
          >
            <option value="">Basique (aucune collection)</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Rareté">
          <NativeSelect value={rarity} onChange={(e) => setRarity(e.target.value)} className="w-40">
            {rarities.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nom}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {type === 'combattant' && (
          <>
            <Field label="ATQ">
              <Input
                type="number"
                value={atq}
                onChange={(e) => setAtq(e.target.value)}
                className="w-24"
              />
            </Field>
            <Field label="PV">
              <Input
                type="number"
                value={pv}
                onChange={(e) => setPv(e.target.value)}
                className="w-24"
              />
            </Field>
          </>
        )}
      </div>
      <Field label="Description (facultatif)">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <ComposerPanel
        title="🎨 Image de la carte"
        help="Envoie le dessin seul : le site pose le cadre, l'écriteau et les chiffres, et crée l'image normale et l'image de combat. Si la carte change plus tard (stats, ultime, passifs, rareté), l'image se refait à l'enregistrement."
        card={preview}
        tier={tier}
        name={name}
        state={composer}
        onChange={setComposer}
      >
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Ou envoyer des images déjà prêtes (ancien système)
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <Field label="Image complète de la carte">
              <Input ref={file} type="file" accept="image/*" />
            </Field>
            <Field label="Image pour le combat, sans les chiffres ATQ / PV (facultatif, combattants)">
              <Input ref={combatFile} type="file" accept="image/*" />
            </Field>
          </div>
        </details>
      </ComposerPanel>

      {type === 'combattant' && (
        <>
          <div className="flex flex-col gap-3">
            <b>Ultime</b>
            <EffectPicker catalog={lists.ultimates} value={ult} onChange={setUlt} />
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Après N tours">
                <Input
                  type="number"
                  min={0}
                  value={afterTurns}
                  onChange={(e) => setAfterTurns(e.target.value)}
                  className="w-24"
                />
              </Field>
              <Choice>
                <Checkbox checked={onCard} onChange={(e) => setOnCard(e.target.checked)} /> ou quand
                un piège se déclenche (ou qu'une magie revient)
              </Choice>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="ou quand… (vérifié au début de son tour, avant son attaque)">
                <NativeSelect
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  className="w-96"
                >
                  <option value="">— aucun autre —</option>
                  {ULTIMATE_TRIGGERS.map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="X">
                <Input
                  type="number"
                  min={0}
                  value={triggerX}
                  onChange={(e) => setTriggerX(e.target.value)}
                  className="w-20"
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Utilisations max (0 = illimité)">
                <Input
                  type="number"
                  min={0}
                  value={uses}
                  onChange={(e) => setUses(Number(e.target.value) || 0)}
                  className="w-24"
                />
              </Field>
              <Field label="Délai entre 2 utilisations (tours)">
                <Input
                  type="number"
                  min={0}
                  value={cooldown}
                  onChange={(e) => setCooldown(Number(e.target.value) || 0)}
                  className="w-24"
                />
              </Field>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <b>
              Passifs{' '}
              <small className="font-normal text-muted-foreground">
                (tu peux en cumuler plusieurs)
              </small>
            </b>
            <MultiPicker
              catalog={lists.passives}
              value={passives}
              onChange={setPassives}
              addLabel="+ Ajouter un passif"
              removeLabel="✕ Retirer ce passif"
            />
            {hasProgramming && (
              <div className="flex flex-col gap-2 border-l-2 border-info pl-3">
                <b>⚙️ Programmation (collection mécanique)</b>
                <span className="text-xs text-muted-foreground">
                  À chaque tour (avant d'attaquer) : X % de chances de lancer une programmation. Les
                  N premières sont passives (la carte acquiert au hasard un passif ou un ultime, qui
                  dort), ensuite 50 % passive / 50 % active. Jamais d'activation à vide. Une
                  programmation active installe ce qui dort, pour de bon : les passifs s'activent et
                  chaque ultime programmé devient un ultime de la carte, avec un nombre
                  d'utilisations, un délai et un déclencheur tirés au hasard, dans les limites
                  ci-dessous. Chaque programmation passive tire au hasard parmi tous les passifs et
                  ultimes du jeu.
                </span>
                <div className="flex flex-wrap items-end gap-3">
                  {(
                    [
                      ['chance', '% de chances à chaque tour'],
                      ['nbpassif', 'Programmations passives d’abord (N)'],
                      ['pumax', 'Ultime programmé : utilisations max'],
                      ['pdmax', 'Ultime programmé : délai max (tours)'],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <Input
                        type="number"
                        min={key === 'chance' || key === 'nbpassif' ? 0 : 1}
                        value={programming[key]}
                        onChange={(e) =>
                          setProgramming((p) => ({
                            ...p,
                            [key]:
                              e.target.value === ''
                                ? PROGRAMMING_DEFAULTS[key]
                                : Number(e.target.value),
                          }))
                        }
                        className="w-24"
                      />
                    </Field>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {type === 'magie' && (
        <div className="flex flex-col gap-3">
          <b>Effet de la magie</b>
          <MultiPicker catalog={lists.magics} value={magic} onChange={setMagic} />
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Agit à partir de son tour N (vide ou 1 = dès le début)">
              <Input
                type="number"
                min={0}
                value={magicStart}
                onChange={(e) => setMagicStart(e.target.value)}
                className="w-28"
              />
            </Field>
            <Field label="Dure N tours (vide ou 0 = tout le combat)">
              <Input
                type="number"
                min={0}
                value={magicLength}
                onChange={(e) => setMagicLength(e.target.value)}
                className="w-28"
              />
            </Field>
          </div>
        </div>
      )}

      {type === 'piege' && (
        <div className="flex flex-col gap-3">
          <b>Condition du piège</b>
          <EffectPicker catalog={lists.conditions} value={condition} onChange={setCondition} />
          <b>Effet du piège</b>
          <MultiPicker catalog={lists.trapEffects} value={trapEffect} onChange={setTrapEffect} />
          <Field label="Déclenchements max">
            <Input
              type="number"
              min={1}
              value={triggers}
              onChange={(e) => setTriggers(Number(e.target.value) || 1)}
              className="w-24"
            />
          </Field>
        </div>
      )}

      <Choice>
        <Checkbox checked={published} onChange={(e) => setPublishedState(e.target.checked)} />{' '}
        Publier (visible des joueurs et dans les boosters)
      </Choice>
      <div className="flex flex-wrap gap-2">
        <Button disabled={action.pending} onClick={save}>
          {card ? <ICONS.save /> : <ICONS.add />}
          {action.pending
            ? 'Enregistrement…'
            : card
              ? 'Enregistrer les modifications'
              : 'Créer la carte'}
        </Button>
        {card && (
          <Button variant="outline" disabled={action.pending} onClick={close}>
            Annuler la modification
          </Button>
        )}
      </div>
      <NoticeView notice={action.notice} />
    </AdminSection>
  );
}

function VariantForm({ cards }: { cards: { id: number; nom: string }[] }) {
  const action = useAction();
  const file = useRef<HTMLInputElement>(null);
  const combat = useRef<HTMLInputElement>(null);
  const [card, setCard] = useState(String(cards[0]?.id ?? ''));
  const [name, setName] = useState('');
  const [weight, setWeight] = useState(10);
  const [numbers, setNumbers] = useState('');
  return (
    <AdminSection
      title="Ajouter une version alternative"
      description="Une version alternative compte comme une carte à part entière de la collection. Taux d'apparition : la version Standard vaut 100."
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Carte">
          <NativeSelect value={card} onChange={(e) => setCard(e.target.value)} className="w-64">
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Nom (ex : Alt 1)">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-40" />
        </Field>
        <Field label="Taux d'apparition">
          <Input
            type="number"
            step="any"
            min={0}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value) || 0)}
            className="w-24"
          />
        </Field>
        <Field label="Image">
          <Input ref={file} type="file" accept="image/*" className="w-60" />
        </Field>
        <Field label="Image combat sans chiffres (facultatif)">
          <Input ref={combat} type="file" accept="image/*" className="w-60" />
        </Field>
        <Field label="Chiffres en combat">
          <NumberStyleSelect value={numbers} onChange={setNumbers} />
        </Field>
        <Button
          disabled={action.pending}
          onClick={() => {
            const image = file.current?.files?.[0];
            action.run(async () => {
              if (!name.trim() || !image)
                throw new Error('Donne un nom et une image à la version.');
              await addVariant(
                Number(card),
                name.trim(),
                weight,
                image,
                combat.current?.files?.[0] ?? null,
                (numbers || null) as NumberStyle | null,
              );
              setName('');
              if (file.current) file.current.value = '';
              if (combat.current) combat.current.value = '';
              return 'Version ajoutée.';
            });
          }}
        >
          <ICONS.add />
          Ajouter la version
        </Button>
      </div>
      <NoticeView notice={action.notice} />
    </AdminSection>
  );
}

function NumberStyleSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <NativeSelect
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-56"
    >
      <option value="">Auto (selon le nom)</option>
      {Object.entries(NUMBER_STYLES).map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </NativeSelect>
  );
}

// The live ATQ / PV numbers' style in combat, version by version (66-chiffres-versions.sql).
function VersionNumbers() {
  const versions = useQuery({ queryKey: ['admin', 'altVersions'], queryFn: fetchAltVersions });
  const action = useAction();
  return (
    <AdminSection
      title="🔢 Chiffres en combat des versions alternatives"
      description="Le style des chiffres ATQ / PV en direct pendant le combat. Auto : or pour les FULLEG, violet pour les FULLEP, style Seazer pour les « Seazer édition », standard sinon. Sur les versions or et violet, le chiffre imprimé est recouvert d'un médaillon et le chiffre en direct se pose dessus ; le style Seazer demande une image de combat sans chiffres."
    >
      {versions.error && <AdminError error={versions.error} />}
      <div className="flex flex-col gap-2">
        {(versions.data ?? []).map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="min-w-56">
              <b>{v.cartes.nom}</b> <span className="text-muted-foreground">· {v.nom}</span>
            </span>
            <NumberStyleSelect
              value={v.chiffres ?? ''}
              disabled={action.pending}
              onChange={(next) =>
                action.run(async () => {
                  await setNumberStyle(v.id, (next || null) as NumberStyle | null);
                  return `${v.cartes.nom} · ${v.nom} : chiffres enregistrés.`;
                })
              }
            />
          </div>
        ))}
      </div>
      <NoticeView notice={action.notice} />
    </AdminSection>
  );
}

function Regenerate() {
  const cpo = getComposer();
  const action = useAction();
  const [progress, setProgress] = useState('');
  const [font, setFont] = useState('');
  const [style, setStyle] = useState('');
  const [details, setDetails] = useState('');
  const [art, setArt] = useState('');
  const change: Partial<ComposerSettings> = {};
  if (font) change.police = font;
  if (style === 'pastille' || style === 'texte') change.style = style;
  if (details) change.details = details === '1';
  if (art) change.daUlt = art === '1';
  const run = (c: Partial<ComposerSettings> | null) =>
    action.run(() => regenerateAll(c, setProgress));
  return (
    <AdminSection
      title="♻️ Images composées"
      description="Refait les images de toutes les cartes qui ont un dessin seul, avec le rendu actuel du composeur. Garde la page ouverte : ça prend un moment."
    >
      <div className="flex flex-wrap items-center gap-3">
        <HoldButton variant="outline" disabled={action.pending} onConfirm={() => run(null)}>
          ♻️ Refaire toutes les images composées
        </HoldButton>
        {progress && <span className="text-sm text-muted-foreground">{progress}</span>}
      </div>
      <details>
        <summary className="cursor-pointer text-sm">
          <b>🎨 Style de toutes les cartes composées</b>{' '}
          <span className="text-muted-foreground">
            (change un réglage partout, puis refait les images)
          </span>
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="Police">
            <NativeSelect value={font} onChange={(e) => setFont(e.target.value)} className="w-48">
              <option value="">— ne pas changer —</option>
              {cpo.POLICES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Passifs">
            <NativeSelect value={style} onChange={(e) => setStyle(e.target.value)} className="w-48">
              <option value="">— ne pas changer —</option>
              <option value="pastille">Pastilles</option>
              <option value="texte">Texte coloré</option>
            </NativeSelect>
          </Field>
          <Field label="Explications">
            <NativeSelect
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-48"
            >
              <option value="">— ne pas changer —</option>
              <option value="1">Avec</option>
              <option value="0">Sans</option>
            </NativeSelect>
          </Field>
          <Field label="Ultime">
            <NativeSelect value={art} onChange={(e) => setArt(e.target.value)} className="w-56">
              <option value="">— ne pas changer —</option>
              <option value="1">À ta DA (italique rouge)</option>
              <option value="0">Couleur de sa catégorie</option>
            </NativeSelect>
          </Field>
          <HoldButton
            disabled={action.pending || Object.keys(change).length === 0}
            onConfirm={() => run(change)}
          >
            Appliquer à toutes les cartes composées
          </HoldButton>
        </div>
      </details>
      <NoticeView notice={action.notice} />
    </AdminSection>
  );
}

function CardList({
  cards,
  collections,
}: {
  cards: Awaited<ReturnType<typeof fetchCardList>>;
  collections: CollectionRow[];
}) {
  const navigate = route.useNavigate();
  const action = useAction();
  const [filter, setFilter] = useState('');
  const BASIC = 'Basique';
  const shown = cards.filter((c) => !filter || (c.collections?.nom ?? BASIC) === filter);
  return (
    <AdminSection title={`Cartes (${cards.length})`}>
      <Field label="Collection">
        <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value)} className="w-64">
          <option value="">Toutes les collections</option>
          {collections.map((c) => (
            <option key={c.id}>{c.nom}</option>
          ))}
          <option>{BASIC}</option>
        </NativeSelect>
      </Field>
      <NoticeView notice={action.notice} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Rareté</TableHead>
            <TableHead>Collection</TableHead>
            <TableHead>Versions</TableHead>
            <TableHead>Publiée</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.nom}</TableCell>
              <TableCell>{isType(c.type) ? TYPES[c.type] : c.type}</TableCell>
              <TableCell>{c.raretes?.nom ?? '?'}</TableCell>
              <TableCell>{c.collections?.nom ?? BASIC}</TableCell>
              <TableCell>{c.variantes_carte.length}</TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.pending}
                  onClick={() => action.run(() => setPublished(c.id, !c.actif))}
                >
                  {c.actif ? (
                    <Badge variant="success">Oui</Badge>
                  ) : (
                    <Badge variant="danger">Non</Badge>
                  )}
                </Button>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Modifier ${c.nom}`}
                    onClick={() => {
                      void navigate({ search: (s) => ({ ...s, carte: c.id }) });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    <ICONS.edit />
                  </Button>
                  <HoldButton
                    size="icon-sm"
                    variant="destructive-ghost"
                    aria-label={`Supprimer ${c.nom}`}
                    disabled={action.pending}
                    onConfirm={() =>
                      action.run(async () => {
                        await deleteCard(c.id);
                        return `« ${c.nom} » supprimée, aussi des collections et des decks des joueurs.`;
                      })
                    }
                  >
                    <ICONS.delete />
                  </HoldButton>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AdminSection>
  );
}
