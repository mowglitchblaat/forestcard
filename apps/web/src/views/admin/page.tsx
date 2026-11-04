// The admin's sub-views, one per page (the legacy page's vAdmin tabs). A sub-view not ported yet
// says so.

import type { ReactNode } from 'react';
import type { AdminView } from '@/views';
import { BacksAdmin } from './backs';
import { BoostersAdmin } from './boosters';
import { CardsAdmin } from './cards';
import { CollectionsAdmin } from './collections';
import { EffectsAdmin } from './effects';
import { GiftsAdmin } from './gifts';
import { PlayersAdmin } from './players';
import { ProposalsAdmin } from './proposals';
import { RaritiesAdmin } from './rarities';
import { SettingsAdmin } from './settings';
import { VotesAdmin } from './votes';

const SUB_VIEWS: Partial<Record<AdminView, () => ReactNode>> = {
  cartes: CardsAdmin,
  collections: CollectionsAdmin,
  boosters: BoostersAdmin,
  effets: EffectsAdmin,
  raretes: RaritiesAdmin,
  cadeaux: GiftsAdmin,
  dos: BacksAdmin,
  reglages: SettingsAdmin,
  joueurs: PlayersAdmin,
  votes: VotesAdmin,
  propos: ProposalsAdmin,
};

export function AdminSubView({ sub }: { sub: AdminView }) {
  const View = SUB_VIEWS[sub];
  return View ? (
    <View />
  ) : (
    <p className="text-muted-foreground">Cette page de l'admin n'est pas encore portée.</p>
  );
}
