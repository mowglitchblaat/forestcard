// The assembled card of a proposal, as the legacy page draws it (vPropos: rendre, texte, ECR,
// cadresAEssayer): the drawing under the rarity's frame; for a fighter, its name on the rarity's
// plaque (a light dark band for a common fighter, which has none) and its ATQ and HP. Ported as it
// is: the admin compares these cards with the real ones. Coordinates are on a 2070 px high card.

import type { ProposalType } from '@/data/proposals';

export const RARITY_TIERS = ['ggez', 'legendaire', 'epique', 'rare', 'commun'] as const;
export type RarityTier = (typeof RARITY_TIERS)[number];

// The tier of a rarity name (accents and case ignored); common if none matches.
export function tierOfName(name: string | undefined): RarityTier {
  const n = String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return RARITY_TIERS.find((k) => n.includes(k)) ?? 'commun';
}

// The frames to try, in order: the type's at the rarity, then at the rarities below; for a magic or
// a trap, then the fighter's at the rarity. (Frames are served under cadres/.)
export function framesToTry(type: ProposalType, tier: RarityTier): string[] {
  const i = RARITY_TIERS.indexOf(tier);
  const list = RARITY_TIERS.slice(i).map((r) => `cadres/${type}-${r}.png`);
  if (type !== 'combattant') list.push(`cadres/combattant-${tier}.png`);
  return list;
}

// A fighter's name plaque: its band on the card, the text and outline colours. Common: none.
export const PLAQUES: Partial<
  Record<RarityTier, { y0: number; y1: number; text: string; outline: string }>
> = {
  ggez: { y0: 1294, y1: 1789, text: '#ffffff', outline: '#6b21a8' },
  legendaire: { y0: 1350, y1: 1847, text: '#ffffff', outline: '#7a4504' },
  epique: { y0: 1200, y1: 1708, text: '#ffffff', outline: '#3b0764' },
  rare: { y0: 1094, y1: 1650, text: '#ffffff', outline: '#1e3a8a' },
};
export const plaqueFor = (tier: RarityTier) => `cadres/ecriteau-${tier}.png`;

const FONT = '"Arial Black","Segoe UI",Arial,Helvetica,sans-serif';

// Filled and outlined text, its size lowered (by 4, down to 20) until it fits the width.
function text(
  x: CanvasRenderingContext2D,
  t: string,
  cx: number,
  cy: number,
  maxW: number,
  size: number,
  colour: string,
  outline: string,
) {
  let s = size;
  x.font = `900 ${s}px ${FONT}`;
  while (x.measureText(t).width > maxW && s > 20) {
    s -= 4;
    x.font = `900 ${s}px ${FONT}`;
  }
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.lineWidth = s * 0.16;
  x.strokeStyle = outline;
  x.strokeText(t, cx, cy);
  x.fillStyle = colour;
  x.fillText(t, cx, cy);
}

export type Placement = { zoom: number; x: number; y: number }; // x, y: shift in card widths / heights

export type Scene = {
  drawing: HTMLImageElement | null;
  frame: HTMLImageElement | null;
  plaque: HTMLImageElement | null; // fighters of a rarity that has one
  placement: Placement;
  type: ProposalType;
  tier: RarityTier;
  name: string;
  atq: string;
  pv: string;
};

export function render(canvas: HTMLCanvasElement, W: number, H: number, sc: Scene): void {
  const x = canvas.getContext('2d');
  if (!x) return;
  const k = H / 2070;
  const fighter = sc.type === 'combattant';
  const plaque = fighter ? PLAQUES[sc.tier] : undefined;
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#14141c';
  x.fillRect(0, 0, W, H);
  if (sc.drawing) {
    const a = sc.drawing;
    const s = Math.max(W / a.naturalWidth, H / a.naturalHeight) * sc.placement.zoom;
    const w = a.naturalWidth * s;
    const h = a.naturalHeight * s;
    x.drawImage(a, (W - w) / 2 + sc.placement.x * W, (H - h) / 2 + sc.placement.y * H, w, h);
  }
  if (plaque && sc.plaque) x.drawImage(sc.plaque, 0, 0, W, H);
  if (sc.frame) x.drawImage(sc.frame, 0, 0, W, H);
  const name = sc.name.trim();
  if (fighter && name) {
    if (plaque)
      text(
        x,
        name,
        W / 2,
        ((plaque.y0 + plaque.y1) / 2) * k,
        W * 0.8,
        120 * k,
        plaque.text,
        plaque.outline,
      );
    else {
      // Common: no plaque, the name on a light dark band.
      const y = 1560 * k;
      const g = x.createLinearGradient(0, y - 110 * k, 0, y + 110 * k);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, 'rgba(0,0,0,.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, y - 110 * k, W, 220 * k);
      text(x, name, W / 2, y, W * 0.8, 110 * k, '#fff', '#27272a');
    }
  }
  if (fighter) {
    const atq = sc.atq.trim();
    const pv = sc.pv.trim();
    if (atq !== '') text(x, atq, W * 0.13, H * 0.925, W * 0.2, 140 * k, '#ff3b3b', '#ffffff');
    if (pv !== '') text(x, pv, W * 0.87, H * 0.925, W * 0.2, 140 * k, '#3ba4ff', '#ffffff');
  }
}
