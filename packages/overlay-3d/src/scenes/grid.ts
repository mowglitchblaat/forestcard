// n cards on a grid: pure arithmetic, no Pixi (tested without a browser).

import { H, W } from '@forestcard/layout';

export type Placement = {
  scale: number;
  cardW: number;
  cardH: number;
  points: { x: number; y: number }[];
  box: { x: number; y: number; w: number; h: number };
};

/**
 * n cards on a grid inside an area, as big as the area allows: every row count is tried, the one giving
 * the widest cards kept. Rows are centred; the last one may be shorter (10 -> 2 x 5, 15 -> 3 x 5 on a wide
 * screen, 7 -> 4 + 3). maxWidth: one card at most, fraction of the area's width; gap: fraction of a card's width.
 * align: where the grid sits in the area when it does not fill it, and where a shorter row sits, per axis
 * (0 = left / top, 0.5 = centre, 1 = right / bottom): a grid anchored bottom left hugs that corner.
 */
export function gridLayout(
  n: number,
  area: { x0: number; y0: number; w: number; h: number },
  {
    maxWidth = 0.16,
    maxRows = 4,
    gap = 0.1,
    align = [0.5, 0.5],
  }: { maxWidth?: number; maxRows?: number; gap?: number; align?: readonly [number, number] } = {},
): Placement {
  const { x0, y0, w, h } = area;
  let best = { rows: 1, cols: n, cardW: 0 };
  for (let rows = 1; rows <= Math.min(maxRows, n); rows++) {
    const cols = Math.ceil(n / rows);
    const byW = w / (cols + gap * (cols - 1));
    const byH = (h / (rows + gap * (rows - 1))) * (W / H);
    const cardW = Math.min(byW, byH, w * maxWidth);
    if (cardW > best.cardW + 0.5) best = { rows, cols, cardW };
  }
  const { rows, cols, cardW } = best,
    cardH = cardW * (H / W),
    g = cardW * gap;
  const [ax, ay] = align;
  const totalH = rows * cardH + (rows - 1) * g,
    fullW = cols * cardW + (cols - 1) * g;
  const top = y0 + (h - totalH) * ay,
    left = x0 + (w - fullW) * ax;
  const points: Placement['points'] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, n - r * cols);
    const rowW = inRow * cardW + (inRow - 1) * g;
    for (let i = 0; i < inRow; i++) {
      points.push({
        x: left + (fullW - rowW) * ax + cardW / 2 + i * (cardW + g),
        y: top + cardH / 2 + r * (cardH + g),
      });
    }
  }
  return { scale: cardW / W, cardW, cardH, points, box: { x: left, y: top, w: fullW, h: totalH } };
}
