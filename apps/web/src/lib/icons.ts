// Every icon of the app, by meaning: an icon means one thing, and one thing has one icon. Views use
// ICONS.trap, never Bomb: the choice of an icon happens here, once. test/icons.test.ts fails if two
// meanings share an icon, or if a file outside this one (and the shadcn components, components/ui)
// imports lucide-react.

import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Axe,
  Bomb,
  BookOpen,
  BowArrow,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleCheck,
  CircleHelp,
  Clock,
  Coins,
  Copy,
  CopyCheck,
  Crosshair,
  Dices,
  ExternalLink,
  Flame,
  Focus,
  FolderTree,
  Gem,
  Gift,
  Heart,
  HeartCrack,
  History,
  Hourglass,
  ImagePlus,
  Info,
  Library,
  LibraryBig,
  Link,
  LogOut,
  type LucideIcon,
  MapPin,
  MessageSquare,
  Monitor,
  MonitorPlay,
  Moon,
  Palette,
  PartyPopper,
  Pencil,
  PlayingCard,
  PlayingCardsFan,
  Plus,
  Printer,
  Recycle,
  RefreshCw,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  Send,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquareCenterlineDashedHorizontal,
  SquareStack,
  Star,
  Store,
  Sun,
  Sword,
  Swords,
  Telescope,
  Ticket,
  Timer,
  TreePine,
  TrendingUp,
  Trophy,
  Tv,
  User,
  UserRound,
  Users,
  UserX,
  Vote,
  WalletCards,
  WandSparkles,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react';

export type { LucideIcon };

export const ICONS = {
  // ── The game ──
  brand: TreePine, // Forest Card
  cards: WalletCards, // cards in general: the admin's card list, "Trois types de cartes"
  fighter: Sword,
  magic: Sparkles,
  trap: Bomb,
  ultimate: Zap,
  passives: Shield,
  attack: Axe, // ATQ, and the biggest attack of a combat
  hp: Heart,
  damageDealt: HeartCrack, // damage dealt in total, every source
  combat: Swords, // combats, the combat deck, "Le combat"
  launchCombat: BowArrow, // "Lancer un combat"
  deck: PlayingCardsFan,
  freeCard: Star, // the deck's free slot
  booster: PlayingCard,
  rarities: Gem,
  effects: WandSparkles,
  backs: SquareStack,
  sauce: Flame, // the channel points
  gold: Coins, // the game's economy
  streak: Link, // wins or losses in a row
  reversal: TrendingUp, // the winner gets ahead in HP during the replay
  fastestWin: Timer,
  longestCombat: Clock,
  keptCopy: ShieldCheck, // one copy of each card is always kept
  absentOpponent: UserX, // an opponent off the live can be challenged
  replayedOnScreen: MonitorPlay, // every combat is replayed on the stream
  scratchAll: Ticket,
  specialNights: PartyPopper,
  // ── Targets of an effect ──
  targetOpponent: Crosshair,
  targetSelf: UserRound,
  targetBoth: ArrowLeftRight,
  // ── Views and sections ──
  collection: Library,
  catalogue: LibraryBig,
  collections: FolderTree,
  shop: Store,
  dailyGames: Dices,
  history: History,
  stats: ChartColumn,
  profile: User,
  players: Users, // the admin's player list, "La communauté"
  leaderboard: Trophy,
  position: MapPin, // "Tu es Ne"
  rules: BookOpen,
  patchNotes: ScrollText,
  proposals: Palette,
  gifts: Gift,
  settings: SlidersHorizontal,
  votes: Vote,
  live: Tv,
  chatCommands: MessageSquare,
  comingSoon: Telescope,
  recycle: Recycle,
  // ── Actions ──
  edit: Pencil,
  add: Plus,
  save: Save,
  send: Send,
  remove: X, // a filter, a card from a deck slot
  search: Search,
  zoom: ZoomIn,
  addImage: ImagePlus,
  print: Printer,
  copy: Copy,
  copied: CopyCheck,
  flip: SquareCenterlineDashedHorizontal, // turn a card over
  replay: RotateCcw, // play an animation again
  recenter: Focus,
  rework: RefreshCw, // a balance vote
  externalLink: ExternalLink,
  logOut: LogOut,
  // ── States ──
  done: Check, // done, your current choice
  complete: CircleCheck, // a deck with every slot filled
  wait: Hourglass, // until the next games
  info: Info,
  help: CircleHelp,
  up: ArrowUp, // up, a buff, "plus"
  down: ArrowDown, // down, a nerf, "moins"
  becomes: ArrowRight,
  sorted: ArrowDownWideNarrow, // a column sorted, largest first
  // ── Navigation ──
  previous: ChevronLeft,
  next: ChevronRight, // the next card, a link into a page
  expand: ChevronDown,
  menu: ChevronsUpDown,
  // ── Theme ──
  themeLight: Sun,
  themeDark: Moon,
  themeSystem: Monitor,
} satisfies Record<string, LucideIcon>;

export type IconMeaning = keyof typeof ICONS;
