// "Comment jouer": the author's text (legacy index.html, vRegles), split into sections the page
// lays out. Corrections of the rules text go here. Emoji are written as escapes: the source stays
// emoji-free.
//
// Changes from the legacy text, kept here so they stay deliberate:
//   - gold is written with the site's coin (<Gold>), amounts and the word alike, as everywhere;
//   - the shop's purchase confirmation is no longer explained (the interface shows it);
//   - step 1 lists the sources of boosters, the free ones first (daily gift, games, then the shop);
//   - notes are set apart as callouts (icon and frame), the special evenings' one titled;
//   - "Raretés & collections" and "Des effets partout" moved to the encyclopedia
//     (views/encyclopedia), the card types section links to it;
//   - a booster is the card emoji (U+1F3B4), not the box;
//   - the duel is a channel points reward to activate, not something to paste ("Duel + @pseudo");
//   - the deck tab is named « Mes decks », as the site names it (a player keeps several), and its
//     description follows the site's deck page (the combat deck as a mark, the edition mode);
//   - the daily games are no longer explained one by one: their page has their rules (opened on the
//     first visit, then behind "?"); the section links to it.

import { TONES } from '@/lib/tones';
import { ICONS, type LucideIcon } from '@/lib/icons';
import type { ReactNode } from 'react';
import { Gold } from '@/components/money';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Command, Reward } from './command';
import { EncyclopediaLinks, GamesLink } from './encyclopedia-links';

export type Block = { title: ReactNode; body: ReactNode };
export type Section = {
  id: string;
  title: string;
  icon: LucideIcon;
  subtitle?: string;
  blocks?: Block[];
  // Content under the blocks (notes, lists, tables).
  after?: ReactNode;
};

const List = ({ items }: { items: ReactNode[] }) => (
  <ul className="list-disc space-y-1 pl-5">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);

// A note set apart from the text, like a notification: an icon and a frame, not an emoji in front.
// Static content, so role="note" (not the alert's live announcement). A tone colours it in pastel
// (the Alert's note, warning and success variants) for the notes that matter to the player.
const Callout = ({
  icon: Icon = ICONS.info,
  title,
  tone = 'note',
  children,
}: {
  icon?: LucideIcon;
  title?: string;
  tone?: 'note' | 'warning' | 'success';
  children: ReactNode;
}) => (
  <Alert role="note" variant={tone}>
    <Icon />
    {title && <AlertTitle>{title}</AlertTitle>}
    <AlertDescription>{children}</AlertDescription>
  </Alert>
);

export const INTRO =
  'Le jeu de cartes à collectionner de la chaîne : ouvre des boosters, compose ton deck et affronte les autres viewers en direct.';

export const STEPS: Block[] = [
  {
    title: 'Obtiens des boosters',
    // Several sources, the free ones first.
    body: (
      <List
        items={[
          <>
            Cadeau du jour : <Command>!quotidien</Command> en live, 1 à 3 boosters gratuits
          </>,
          <>
            Mini-jeux du jour : des <Gold />, et un booster à gagner
          </>,
          <>
            Boutique du site : avec tes <Gold />
          </>,
        ]}
      />
    ),
  },
  {
    title: 'Ouvre-les en live',
    body: (
      <>
        Avec la commande <Command>!booster</Command> : les cartes apparaissent à l'écran.
      </>
    ),
  },
  {
    title: 'Compose ton deck',
    body: "10 cartes à choisir sur le site, dans l'onglet « Mes decks ».",
  },
  { title: 'Combats !', body: 'Duels et combats automatiques, avec animations en direct.' },
];

type Amount = { label: string; gold: number };

export const SECTIONS: Section[] = [
  {
    id: 'cartes',
    title: 'Trois types de cartes',
    icon: ICONS.cards,
    subtitle: 'Chaque combat met en jeu un combattant, une magie et un piège.',
    blocks: [
      {
        title: <span className={TONES.fighter.text}>Combattant</span>,
        body: (
          <List
            items={[
              'Des stats : ATQ et PV',
              'Des passifs : esquive, poison, renvoi…',
              "Un ultime, qui se déclenche après quelques tours ou quand une carte s'active",
            ]}
          />
        ),
      },
      {
        title: <span className={TONES.magic.text}>Magie</span>,
        body: (
          <List
            items={[
              'Prend effet dès le début du combat',
              'Reste active comme un bonus ou un malus : +ATQ, soins, protection…',
              'Peut être détruite ou volée',
            ]}
          />
        ),
      },
      {
        title: <span className={TONES.trap.text}>Piège</span>,
        body: (
          <List
            items={[
              'Reste caché, face retournée',
              "Se déclenche sous condition : l'adversaire attaque, utilise son ultime, passe sous X % de PV…",
              "Dévoilé en gros plan à l'écran",
            ]}
          />
        ),
      },
    ],
    after: <EncyclopediaLinks />,
  },
  {
    id: 'boosters',
    title: 'Les boosters',
    icon: ICONS.booster,
    subtitle: "Les cartes s'obtiennent uniquement par boosters.",
    blocks: [
      {
        title: 'Boutique du site',
        body: (
          <>
            Les boosters s'achètent avec des <Gold />, à partir de <Gold n={250} />. Ils vont dans
            ton stock, en attente d'être ouverts. « Détails du contenu » montre les cartes à
            l'affiche et ce que contient chaque booster.
          </>
        ),
      },
      {
        title: 'Ouverture en live',
        body: (
          <>
            Tape <Command>!booster</Command> pendant le stream : l'animation d'ouverture s'affiche à
            l'écran et les cartes rejoignent ta collection.
          </>
        ),
      },
      {
        title: 'Cadeau du jour',
        body: (
          <>
            Avec <Command>!quotidien</Command>, récupère chaque jour entre 1 et 3 boosters gratuits.
          </>
        ),
      },
    ],
  },
  {
    id: 'deck',
    title: 'Ton deck',
    icon: ICONS.deck,
    subtitle: 'Simple et volontairement limité.',
    blocks: [
      {
        title: 'Les règles',
        body: (
          <List
            items={[
              <>
                Exactement <b>10 cartes</b> : 3 combattants, 3 magies, 3 pièges + 1 carte libre (du
                type de ton choix)
              </>,
              'Un deck de 9 cartes ne peut pas combattre : complète-le avant de lancer un combat',
              'Une seule copie de chaque carte, pour éviter les combos trop forts',
            ]}
          />
        ),
      },
      {
        title: 'Onglet « Mes decks »',
        body: (
          <List
            items={[
              "Tes decks à gauche (10 maximum) ; ton deck de combat porte l'épée : c'est celui que tes combats utilisent",
              "« Modifier les cartes » ouvre le mode édition, tes cartes à côté : touche une carte pour l'ajouter ou la retirer, la loupe \u{1F50D} pour voir ses détails",
              'Recherche, filtres par type, rareté et collection, tri par rareté, nom, ATQ ou PV',
              'Un deck peut être enregistré incomplet ; seul un deck complet peut devenir ton deck de combat',
              '« En faire mon deck de combat » change le deck qui se bat ; enregistrer ton deck de combat met tes prochains combats à jour',
            ]}
          />
        ),
      },
    ],
  },
  {
    id: 'combat',
    title: 'Le combat',
    icon: ICONS.combat,
    subtitle:
      'Un combattant, une magie et un piège sont tirés au hasard dans le deck de chaque joueur. Le calcul est automatique.',
    blocks: [
      { title: 'Début', body: "Les magies s'activent et dévoilent leur carte." },
      {
        title: 'Chaque tour',
        body: 'Chaque carte joue à son tour, toujours dans le même ordre : malédiction et régénération, ultime, attaque, ses effets « à chaque tour » (ATQ qui augmente, soin, effet aléatoire), puis ses dégâts de statut (poison, brûlure, saignement) et la fin de ses durées.',
      },
      { title: 'Pièges', body: 'Ils se déclenchent dès que leur condition est remplie.' },
      {
        title: 'Fin',
        body: "Le combat s'arrête quand une carte tombe à 0 PV. Si les deux tombent en même temps : match nul. Chaque carte qui joue compte pour un tour (tour 1 : le premier joueur, tour 2 : le deuxième, et ainsi de suite).",
      },
      {
        title: 'Prolongations',
        body: "Si personne n'est tombé après 10 tours de chaque carte, chacun tire 3 nouvelles cartes de son deck (1 combattant, 1 magie, 1 piège) et le combat repart, jusqu'à 3 prolongations. Après la dernière, le plus de PV l'emporte.",
      },
    ],
    after: (
      <Callout icon={ICONS.replayedOnScreen}>
        Tout est rejoué à l'écran avec des animations : coups, esquives, poison, brûlure, boucliers,
        cartes qui se brisent, aura dorée pour le vainqueur. Tes 10 derniers combats sont à
        retrouver dans l'onglet « Historique », une fois leur animation terminée en live (pas de
        spoil !).
      </Callout>
    ),
  },
  {
    id: 'lancer',
    title: 'Lancer un combat',
    icon: ICONS.launchCombat,
    subtitle: 'Deux façons de se battre.',
    blocks: [
      {
        title: (
          <>
            <Command>!combat</Command> · Combat du jour
          </>
        ),
        body: 'Des combats gratuits chaque jour (leur nombre est fixé par le streamer), contre un adversaire pris au hasard parmi ceux qui ont un deck de 10 cartes.',
      },
      {
        title: (
          <>
            <Reward>Duel</Reward> · Défi ciblé
          </>
        ),
        body: 'Une récompense de points de chaîne : ouvre les points de chaîne, active « Duel », puis entre le pseudo du viewer que tu veux défier.',
      },
    ],
    after: (
      <Callout icon={ICONS.absentOpponent}>
        Même absent du live, l'adversaire peut être défié : il gagne lui aussi des <Gold /> et des
        statistiques.
      </Callout>
    ),
  },
  {
    id: 'economie',
    title: 'Récompenses & économie',
    icon: ICONS.gold,
    subtitle: 'Tout le monde gagne quelque chose à chaque combat.',
    blocks: [
      {
        title: 'Gains par combat',
        body: (
          <>
            <Amounts
              rows={[
                { label: 'Victoire', gold: 50 },
                { label: 'Match nul', gold: 20 },
                { label: 'Défaite', gold: 10 },
              ]}
            />
            <Callout icon={ICONS.specialNights} title="Soirées spéciales" tone="warning">
              Les gains peuvent être multipliés (×2…) : c'est annoncé dans le chat après chaque
              combat.
            </Callout>
          </>
        ),
      },
      {
        title: 'Et ensuite ?',
        body: (
          <>
            Les <Gold /> servent à acheter des boosters sur le site, à partir de <Gold n={250} /> :
            environ 5 victoires pour un nouveau booster. Plus on joue, plus la collection grandit.
          </>
        ),
      },
      {
        title: 'Recyclage des doublons',
        body: (
          <>
            Dans « Ma collection », recycle tes cartes en double en <Gold /> :
            <Amounts
              rows={[
                { label: 'Commun', gold: 5 },
                { label: 'Rare', gold: 10 },
                { label: 'Épique', gold: 35 },
                { label: 'Légendaire', gold: 80 },
              ]}
            />
            <Callout icon={ICONS.keptCopy} tone="success">
              Tu gardes toujours 1 exemplaire de chaque carte.
            </Callout>
          </>
        ),
      },
    ],
  },
  {
    id: 'jeux',
    title: 'Jeux du jour',
    icon: ICONS.dailyGames,
    subtitle:
      'Quatre petits jeux gratuits : une partie de chaque par jour, remise à zéro à minuit. Leurs règles sont dans leur page, derrière « ? ».',
    after: <GamesLink />,
  },
  {
    id: 'profil',
    title: 'Ton profil',
    icon: ICONS.profile,
    subtitle: 'Visible par tous les joueurs connectés.',
    blocks: [
      {
        title: 'Combats',
        body: (
          <List
            items={[
              'Victoires et défaites',
              'Plus grande série de victoires',
              'Plus gros coup infligé',
            ]}
          />
        ),
      },
      {
        title: 'Records',
        body: (
          <List
            items={[
              'Victoire la plus rapide',
              'Carte la plus jouée',
              'Boosters ouverts',
              'Collection et deck',
            ]}
          />
        ),
      },
      {
        title: 'Classement & historique',
        body: (
          <List
            items={[
              'Onglet \u{1F3C6} Classement : trie par victoires, % de victoires, combats…',
              'Onglet Historique : tes 10 derniers combats et tes 5 derniers boosters ouverts',
            ]}
          />
        ),
      },
    ],
  },
  {
    id: 'communaute',
    title: 'La communauté',
    icon: ICONS.players,
    subtitle: 'Le jeu évolue avec vous.',
    blocks: [
      {
        title: '\u{1F4DC} Patch notes',
        body: "Chaque jour, les nouveautés et corrections du jeu, et tous les changements d'équilibrage des cartes.",
      },
      {
        title: '\u{1F5F3}\u{FE0F} Votes',
        body: 'Chaque semaine, vote pour le nerf, le up ou le rework de tes cartes (5 maximum) : les plus votées sont étudiées.',
      },
      {
        title: '\u{1F3A8} Propositions',
        body: 'Propose ton splash art et ton idée de carte : les meilleures pourront entrer dans le jeu !',
      },
    ],
  },
  {
    id: 'commandes',
    title: "Les commandes en un coup d'œil",
    icon: ICONS.chatCommands,
    subtitle: 'Tout ce que le chat peut faire.',
    after: <CommandsTable />,
  },
  {
    id: 'bientot',
    title: 'Et bientôt ?',
    icon: ICONS.comingSoon,
    subtitle: 'Les idées qui arrivent ensuite.',
    blocks: [
      {
        title: 'Le combat pour le titre',
        body: "Un champion de la chaîne, un deck de 20 cartes, trois combats d'affilée : la première équipe entièrement éliminée perd. Le champion doit accepter le défi dans le chat.",
      },
      { title: 'Échanges', body: 'Échanger tes cartes avec les autres joueurs.' },
    ],
  },
];

export const RULES_ICON = ICONS.rules;

function Amounts({ rows }: { rows: Amount[] }) {
  return (
    <table className="my-2 w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b last:border-0">
            <td className="py-1">{r.label}</td>
            <td className="py-1 text-right font-semibold">
              <Gold n={r.gold} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Chat commands (copied on click) and channel points rewards (activated in Twitch, nothing to paste).
const COMMANDS: { name: string; reward?: boolean; effect: string }[] = [
  { name: '!booster', effect: 'Ouvre un booster de ton stock, en direct' },
  { name: '!quotidien', effect: 'Récupère 1 à 3 boosters gratuits, une fois par jour' },
  { name: '!combat', effect: 'Combat gratuit du jour contre un adversaire au hasard' },
  {
    name: 'Duel',
    reward: true,
    effect: 'Récompense de points de chaîne : active-la puis entre le pseudo du viewer à défier',
  },
];

function CommandsTable() {
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Commande</th>
            <th className="px-4 py-2 text-left font-medium">Effet</th>
          </tr>
        </thead>
        <tbody>
          {COMMANDS.map(({ name, reward, effect }) => (
            <tr key={name} className="border-t">
              <td className="px-4 py-2">
                {reward ? <Reward>{name}</Reward> : <Command>{name}</Command>}
              </td>
              <td className="px-4 py-2">{effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
