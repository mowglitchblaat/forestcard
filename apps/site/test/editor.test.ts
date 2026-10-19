// The admin editor offers every effect the engine runs, in magics, ultimates or both, except the ones
// listed in NOT_EDITABLE. Passives and trap conditions need no test: their tables are keyed on the
// engine's lists, so a missing entry fails to compile.

import { expect, test } from 'vite-plus/test';
import { EDITOR_MAGICS, EDITOR_ULTIMATES, NOT_EDITABLE } from '@forestcard/describe';
import { EFFECT_TYPES } from '../../../packages/engine/src/index.ts';

const offered = new Set([...Object.keys(EDITOR_MAGICS), ...Object.keys(EDITOR_ULTIMATES)]);

test('every effect is offered by the editor, or listed as not editable', () => {
  expect(EFFECT_TYPES.filter((t) => !offered.has(t) && !NOT_EDITABLE.includes(t))).toEqual([]);
});

test('NOT_EDITABLE lists only effects the editor does not offer', () => {
  expect(NOT_EDITABLE.filter((t) => offered.has(t))).toEqual([]);
});
