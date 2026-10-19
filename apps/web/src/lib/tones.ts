// Every colour that carries a meaning, by meaning: views say what a colour is for (TONES.trap),
// and its value lives in one place, like an icon (src/lib/icons.ts). The values are pastel theme variables (index.css, --success and
// --success-ink…): a fill for bars, dots and soft backgrounds, and an ink to write with, darker in
// light mode so text stays readable. Views use TONES.success.badge, never a Tailwind palette colour. The
// classes exist because index.css lists them (@source inline): a new tone goes in both places.

const tone = (name: string) =>
  ({
    // A badge: a soft fill, a border, the ink.
    badge: `border border-${name}/50 bg-${name}/20 text-${name}-ink`,
    // A box around a message (a callout, a notice).
    box: `border border-${name}/40 bg-${name}/10`,
    // Text or an icon.
    text: `text-${name}-ink`,
    // A solid fill: a bar, a dot, a progress.
    fill: `bg-${name}`,
    // An outline (a ring, a border on its own).
    ring: `ring-${name}`,
    border: `border-${name}`,
    // The CSS variable, for what is not a class (chart colours, SVG strokes). Not --color-…: the
    // @theme inline mapping is substituted into the classes, never declared.
    colour: `var(--${name})`,
  }) as const;

export const TONES = {
  success: tone('success'), // a win, a gain, in use, accepted, done, healing, going up
  danger: tone('danger'), // a loss, refused, damage, going down
  warning: tone('warning'), // careful: not saved, pending, a rule to know
  new: tone('new'), // something not seen yet
  info: tone('info'), // something waiting for you (to read, to play, to open)
  draw: tone('draw'), // a draw
  // The game. Several share a hue (violet: Épique, Twitch, magic, statuses): the context tells them
  // apart; a token says where a colour goes, so one can change without touching the others.
  fighter: tone('fighter'),
  magic: tone('magic'),
  trap: tone('trap'),
  epic: tone('epic'), // the Épique rarity
  twitch: tone('twitch'), // Twitch: the channel points (the sauce)
  status: tone('status'), // a status (poison, burn…), in effect texts and the replay
  ultimate: tone('ultimate'),
  theft: tone('theft'), // a card or an ultimate stolen
  breath: tone('breath'),
  defence: tone('defence'), // a dodge, a block
  damage: tone('damage'),
  healing: tone('healing'), // healed, revived, protected
  attack: tone('attack'), // an attack, in effect texts
  percent: tone('percent'), // a chance, in effect texts
  turns: tone('turns'), // a duration, in effect texts
  gold: tone('gold'), // a big gold gain
  me: tone('me'), // the player, against
  opponent: tone('opponent'), // the opponent
} as const;
