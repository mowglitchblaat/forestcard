// The encyclopedia's selection lives in the address (`#/encyclopedie/effets?effet=poison`), so a
// link points straight at an effect or a rarity. An unknown or missing one means the first.

import { z } from 'zod';

const optional = z.string().optional().catch(undefined);

export const EffectsSearch = z.object({ effet: optional });
export const RaritiesSearch = z.object({ rarete: optional });
