// Proposing a card, from A to Z (30-propositions-completes.sql): the name, type, rarity, stats, the
// ultimate and its trigger, the passives, a magic's or a trap's effect, chosen in the game's own
// lists (without the programming, the admin's), the drawing composed live by the admin's composer,
// the collection (or an idea of one) and the idea. As the legacy page's vPropos.

import {
  EDITOR_CONDITIONS,
  EDITOR_MAGICS,
  EDITOR_PASSIVES,
  EDITOR_ULTIMATES,
} from '@forestcard/describe';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  CARD_TYPE_LABELS,
  MAX_IMAGE_BYTES,
  MAX_WAITING,
  propose,
  proposalKeys,
  type ProposalType,
  type RefCollection,
  type RefRarity,
} from '@/data/proposals';
import { getComposer } from '@/lib/composer';
import { ComposerPanel, type ComposerState, emptyComposer } from '@/views/admin/composer-panel';
import {
  type Catalog,
  clean,
  cleanMulti,
  EffectPicker,
  type Fx,
  MultiPicker,
  ULTIMATE_TRIGGERS,
} from '@/views/admin/effect-picker';
import { Choice, Field } from '@/views/admin/kit';

const OTHER = 'autre';
const withoutProgramming = (c: Catalog): Catalog =>
  Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'programmation'));
const LISTS = {
  passives: withoutProgramming(EDITOR_PASSIVES as Catalog),
  ultimates: withoutProgramming(EDITOR_ULTIMATES as Catalog),
  magics: withoutProgramming(EDITOR_MAGICS as Catalog),
  conditions: EDITOR_CONDITIONS as Catalog,
};
const TRAP_EFFECTS: Catalog = { ...LISTS.ultimates, ...LISTS.magics };

export function ProposalForm({
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
  const cpo = getComposer();
  const [name, setName] = useState('');
  const [type, setType] = useState<ProposalType>('combattant');
  const [rarity, setRarity] = useState(String(rarities[0]?.id ?? ''));
  const [atq, setAtq] = useState('');
  const [pv, setPv] = useState('');
  const [ult, setUlt] = useState<Fx | null>(null);
  const [afterTurns, setAfterTurns] = useState('');
  const [onCard, setOnCard] = useState(false);
  const [trigger, setTrigger] = useState('');
  const [triggerX, setTriggerX] = useState('');
  const [uses, setUses] = useState(1);
  const [cooldown, setCooldown] = useState(0);
  const [passives, setPassives] = useState<unknown>(null);
  const [magic, setMagic] = useState<unknown>(null);
  const [condition, setCondition] = useState<Fx | null>(null);
  const [trapEffect, setTrapEffect] = useState<unknown>(null);
  const [triggers, setTriggers] = useState(1);
  const [collection, setCollection] = useState(String(collections[0]?.id ?? OTHER));
  const [collectionIdea, setCollectionIdea] = useState('');
  const [idea, setIdea] = useState('');
  const [composer, setComposer] = useState<ComposerState>(emptyComposer);
  const [sent, setSent] = useState(false);
  const full = waiting >= MAX_WAITING;
  const tier = cpo.tierDe(rarities.find((r) => String(r.id) === rarity));

  const effects = () => {
    let ultime: Fx | null = null;
    let passif: unknown = null;
    let effet: unknown = null;
    if (type === 'combattant') {
      ultime = clean(LISTS.ultimates, ult);
      if (ultime) {
        if (Number(afterTurns)) ultime.apres_tours = Number(afterTurns);
        if (onCard) ultime.sur_carte = true;
        if (trigger) {
          ultime.udecl = trigger;
          if (triggerX !== '') ultime.udx = Number(triggerX);
        }
        ultime.utilisations = uses || 0;
        ultime.delai_tours = cooldown || 0;
      }
      passif = cleanMulti(LISTS.passives, passives);
    } else if (type === 'magie') effet = cleanMulti(LISTS.magics, magic);
    else {
      const c = clean(LISTS.conditions, condition);
      const e = cleanMulti(TRAP_EFFECTS, trapEffect);
      if (c || e) effet = { condition: c, effet: e, declenchements: triggers || 1 };
    }
    return { ultime, passif, effet };
  };
  const fx = effects();
  const card = { type, atq, pv, ultime: fx.ultime, passif: fx.passif, effet: fx.effet };

  const send = useMutation({
    mutationFn: async () => {
      const file = composer.drawingFile;
      if (!file || !composer.drawing) throw new Error('Ajoute ton dessin.');
      if (file.size > MAX_IMAGE_BYTES) throw new Error('Image trop lourde (8 Mo maximum).');
      if (!name.trim()) throw new Error('Donne un nom à ta carte.');
      const other = collection === OTHER;
      if (other && !collectionIdea.trim()) throw new Error('Écris ton idée de collection.');
      let composed: Blob | null = null;
      try {
        composed = (
          await cpo.images({ dessin: composer.drawing, carte: card, tier, o: composer.settings })
        ).carte;
      } catch {
        composed = null;
      }
      const fighter = type === 'combattant';
      await propose(userId, {
        drawing: file,
        card: composed,
        nom: name.trim(),
        type,
        rarityId: rarity ? Number(rarity) : null,
        collectionId: other ? null : Number(collection),
        collectionIdea: other ? collectionIdea : '',
        idea,
        atq: fighter && atq !== '' ? Number(atq) : null,
        pv: fighter && pv !== '' ? Number(pv) : null,
        ...fx,
        compo: { ...composer.settings },
      });
    },
    onSuccess: () => {
      setSent(true);
      setName('');
      setComposer(emptyComposer());
    },
    onSettled: () => client.invalidateQueries({ queryKey: proposalKeys.mine(userId) }),
  });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Crée ta carte</h2>
      <p className="text-sm text-muted-foreground">
        Imagine ta carte de A à Z : ton dessin, son nom, sa rareté, ses stats et ses vrais effets,
        choisis dans les mêmes listes que celles du jeu. La carte se compose sous tes yeux, comme
        les cartes officielles. L'admin regarde chaque proposition ; les meilleures pourront entrer
        dans le jeu ! ({MAX_WAITING} propositions en attente au maximum, dessin de 8 Mo au maximum.)
      </p>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Nom de la carte">
              <Input
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. : Le Wendigo des neiges"
                className="w-72"
              />
            </Field>
            <Field label="Type">
              <NativeSelect
                value={type}
                onChange={(e) => {
                  const t = e.target.value;
                  if (t === 'combattant' || t === 'magie' || t === 'piege') setType(t);
                }}
                className="w-40"
              >
                {Object.entries(CARD_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Rareté">
              <NativeSelect
                value={rarity}
                onChange={(e) => setRarity(e.target.value)}
                className="w-40"
              >
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
                    min={0}
                    max={999}
                    value={atq}
                    onChange={(e) => setAtq(e.target.value)}
                    placeholder="Ex. : 25"
                    className="w-24"
                  />
                </Field>
                <Field label="PV">
                  <Input
                    type="number"
                    min={1}
                    max={9999}
                    value={pv}
                    onChange={(e) => setPv(e.target.value)}
                    placeholder="Ex. : 110"
                    className="w-24"
                  />
                </Field>
              </>
            )}
          </div>

          {type === 'combattant' && (
            <>
              <div className="flex flex-col gap-3">
                <b>
                  Ultime <small className="font-normal text-muted-foreground">(facultatif)</small>
                </b>
                <EffectPicker catalog={LISTS.ultimates} value={ult} onChange={setUlt} />
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Se déclenche après N tours">
                    <Input
                      type="number"
                      min={0}
                      value={afterTurns}
                      onChange={(e) => setAfterTurns(e.target.value)}
                      className="w-24"
                    />
                  </Field>
                  <Choice>
                    <Checkbox checked={onCard} onChange={(e) => setOnCard(e.target.checked)} /> ou
                    quand un piège se déclenche (ou qu'une magie revient)
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
                  catalog={LISTS.passives}
                  value={passives}
                  onChange={setPassives}
                  addLabel="+ Ajouter un passif"
                  removeLabel="✕ Retirer ce passif"
                />
              </div>
            </>
          )}
          {type === 'magie' && (
            <div className="flex flex-col gap-3">
              <b>Effet de la magie</b>
              <MultiPicker catalog={LISTS.magics} value={magic} onChange={setMagic} />
            </div>
          )}
          {type === 'piege' && (
            <div className="flex flex-col gap-3">
              <b>Condition du piège</b>
              <EffectPicker catalog={LISTS.conditions} value={condition} onChange={setCondition} />
              <b>Effet du piège</b>
              <MultiPicker catalog={TRAP_EFFECTS} value={trapEffect} onChange={setTrapEffect} />
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

          <ComposerPanel
            title="🎨 Ta carte"
            help="Ajoute ton dessin seul (sans cadre, ni texte) : le cadre de la rareté, l'écriteau avec tes effets et leurs explications, et les chiffres se posent tout seuls. Glisse le dessin pour le placer, zoome, étire si besoin."
            card={card}
            tier={tier}
            name={name}
            state={composer}
            onChange={setComposer}
          />

          <div className="flex flex-wrap items-end gap-3">
            <Field label="Collection">
              <NativeSelect
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                className="w-64"
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
                <option value={OTHER}>✏️ Autre : je propose une idée de collection</option>
              </NativeSelect>
            </Field>
            {collection === OTHER && (
              <Field label="Ton idée de collection">
                <Input
                  value={collectionIdea}
                  maxLength={80}
                  onChange={(e) => setCollectionIdea(e.target.value)}
                  placeholder="Ex. : Légendes du folklore"
                  className="w-72"
                />
              </Field>
            )}
          </div>
          <Field label="Ton idée, l'histoire de ta carte (facultatif)">
            <Textarea
              value={idea}
              maxLength={600}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Ambiance, histoire, comment tu imagines la jouer…"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={full || send.isPending} onClick={() => send.mutate()}>
              {full
                ? `${MAX_WAITING} propositions déjà en attente`
                : send.isPending
                  ? 'Envoi…'
                  : 'Envoyer ma proposition'}
            </Button>
            {sent && !send.isPending && !send.error && (
              <small className="text-muted-foreground">Proposition envoyée, merci !</small>
            )}
            {send.error && (
              <small role="alert" className="text-destructive">
                {send.error.message}
              </small>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
