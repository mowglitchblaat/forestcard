// The charm and the skins (November 2026), in the manner of status/shaders.ts: COMMON, HEAD, an idle
// look eased in by uAmt, a burst on uTick, the colour grade scaled by uShare, a halo outside the card.
//
// CHARM: the charmed card sees the world through rose glass. Its picture softens and blushes, a big
// heart frames it (outside the heart, a rosy veil), small hearts drift up through it, the picture sways
// slowly as if dazed, and a pink halo beats around the card. A tick (a blow held back): a ring of hearts
// bursts out from its middle and the blush flares.
//
// SKIN: the card wears its skin as a band of matter on its rim, eaten in by noise; uLevel says which
// (packages/engine mechanics/skin.ts, SKIN_STATUSES order): 1 lava (basalt plates, glowing cracks),
// 2 thorny bark (bark fibres, thorns on the rim with blood-red tips), 3 frost (ice facets, glints),
// 4 toxic (a green slime that glistens and bubbles), 5 cursed (black veins with a violet light, a dark
// smoke), 6 stone (grey plates, dark cracks, a lit bevel), 7 electric (arcs crackling along the rim).
// A tick (someone touched it): the band swells inward and its light flares.
//
// Cost: one pass each, one sample of the picture; the skin's cells are vor() (nine cells), its noise
// fbm(), whose octaves the quality lowers (status/quality.ts).

import { COMMON, HEAD } from './shaders.ts';

const body = (code: string) => `${COMMON}
float dot2(vec2 v){ return dot(v, v); }
// a heart, y up, its point at (0, 0) and its top near y = 1 (Inigo Quilez)
float sdHeart(vec2 p){ p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y); }
void main(){${HEAD}${code}
}`;

export const CHARM = body(`
  // dazed: the picture sways slowly around its middle
  vec2 m = cuv - 0.5;
  float sway = (0.012 + 0.02 * tk) * a;
  float ang = sin(t * 0.9) * sway * (1.0 - length(m));
  vec2 q = 0.5 + mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * m;
  q.y += sin(t * 1.3 + cuv.x * 4.0) * 0.004 * a;
  vec3 c = tex(q);
  // the blush: warm pink grade and a soft dreamy lift of the lights
  float l = lumi(c);
  vec3 blush = c * vec3(1.1, 0.84, 0.98) + vec3(0.16, 0.03, 0.09) + smoothstep(0.55, 1.0, l) * vec3(0.18, 0.08, 0.14);
  c = mix(c, blush, (0.55 + 0.25 * tk) * a * uShare);
  // the heart frame: outside a big heart over the card, a rosy veil; its rim glows
  vec2 hp = vec2((cuv.x - 0.5) * 1.55, (0.86 - cuv.y) * 1.25);
  float beat = 1.0 + 0.025 * sin(t * 5.0) + 0.06 * tk;
  float hd = sdHeart(hp / beat + vec2(0.0, 0.08));
  float outside = smoothstep(0.0, 0.06, hd);
  c = mix(c, c * vec3(0.85, 0.55, 0.75) + vec3(0.3, 0.05, 0.18), outside * 0.5 * a);
  float rim = exp(-pow(hd * 22.0, 2.0));
  c += vec3(1.0, 0.45, 0.75) * rim * (0.75 + 0.25 * sin(t * 5.0) + 0.8 * tk) * a;
  // small hearts drifting up, each in its cell
  vec2 sg = vec2(cuv.x * 7.0, cuv.y * 6.0 + t * 0.35);
  vec2 cell = floor(sg);
  float on = step(0.62 - 0.25 * tk, hash(cell + 4.2));
  vec2 f = fract(sg) - 0.5 - (vec2(hash(cell + 1.3), hash(cell + 8.9)) - 0.5) * 0.4;
  f.x += sin(t * 2.0 + cell.y * 1.7) * 0.06;
  float sz = 0.16 + 0.1 * hash(cell + 2.7);
  float sh = sdHeart(vec2(f.x, -f.y) / sz + vec2(0.0, 0.5));
  float small = (1.0 - smoothstep(-0.05, 0.05, sh)) * on * a;
  float shine = (1.0 - smoothstep(0.0, 0.25, length(vec2(f.x, -f.y) / sz + vec2(0.22, -0.22)))) * small;
  c = mix(c, vec3(1.0, 0.36, 0.62), small * 0.75);
  c += vec3(1.0) * shine * 0.5;
  // a tick: a ring of hearts bursts from the middle
  float r = length((cuv - 0.5) * vec2(1.0, 1.35));
  float ringR = (1.0 - tk) * 0.75;
  float ring = exp(-pow((r - ringR) * 18.0, 2.0)) * tk;
  float lobes = 0.5 + 0.5 * cos(atan(cuv.y - 0.5, cuv.x - 0.5) * 10.0);
  c += vec3(1.0, 0.55, 0.85) * ring * (1.0 + 1.2 * lobes);
  float ga = clamp(halo(d, uPad.x * 0.8) * (0.55 + 0.25 * sin(t * 5.0) + 0.7 * tk) * a, 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(1.0, 0.4, 0.72) * ga, ga));`);

export const SKIN = body(`
  int kind = int(uLevel + 0.5);
  float n = fbm(cuv * vec2(5.0, 4.0) + 2.0);
  // the band of matter on the rim (edge: 0 on the border, 1 in the middle across)
  float w = (0.13 + 0.1 * tk) * a;
  float band = 1.0 - smoothstep(w - 0.05, w + 0.01, edge + (n - 0.5) * 0.18);
  float lip = exp(-pow((edge + (n - 0.5) * 0.18 - w) * 60.0, 2.0)) * a;
  vec3 c = tex(cuv);
  vec3 col = vec3(1.0);
  vec3 glow = vec3(1.0);
  vec2 v = vor(cuv * vec2(9.0, 12.0));
  float crack = 1.0 - smoothstep(0.0, 0.07, v.y - v.x);
  if (kind == 1) {
    // lava: basalt plates, molten cracks that breathe
    vec3 rock = vec3(0.09, 0.07, 0.07) + 0.08 * v.x;
    float heat = 0.65 + 0.35 * sin(t * 2.2 + v.x * 9.0) + 0.6 * tk;
    float soft = 1.0 - smoothstep(0.0, 0.22, v.y - v.x);
    vec3 lava = mix(vec3(1.0, 0.25, 0.0), vec3(1.0, 0.85, 0.3), crack * crack) * heat;
    col = mix(rock + vec3(0.5, 0.1, 0.0) * soft * heat * 0.6, lava, crack);
    glow = vec3(1.0, 0.4, 0.05);
    c = mix(c, c * vec3(1.08, 0.92, 0.82), 0.35 * a * uShare);
  } else if (kind == 2) {
    // thorny bark: a thin bark rim, thorns growing inward from it, their points dark with blood
    float fib = fbm(vec2(cuv.x * 40.0, cuv.y * 3.0)) * fbm(vec2(cuv.x * 3.0, cuv.y * 40.0));
    vec3 bark = mix(vec3(0.14, 0.08, 0.04), vec3(0.38, 0.24, 0.13), fib * 2.0);
    // along the nearest side: s runs along it, dp is the depth in from it (px)
    vec2 pp = cuv * uCard;
    vec2 dd = min(pp, uCard - pp);
    bool side = dd.x < dd.y;
    float sAlong = side ? pp.y : pp.x;
    float dp = side ? dd.x : dd.y;
    float per = uCard.x / 9.0;
    float k = fract(sAlong / per);
    float tri = clamp(abs(k - 0.5) * 2.0 / 0.55, 0.0, 1.0);
    float len = per * (1.6 + 0.8 * hash(vec2(floor(sAlong / per), side ? 1.0 : 0.0))) * (0.75 + 0.45 * tk) * a;
    float prof = pow(1.0 - tri, 1.6);
    float thorn = 1.0 - smoothstep(-1.5, 1.5, dp - len * prof);
    float tip = smoothstep(0.5, 0.95, dp / max(len, 1.0)) * thorn;
    float shade = 0.7 + 0.6 * (0.5 - k);
    vec3 thornCol = mix(vec3(0.3, 0.2, 0.1) * shade, vec3(0.5, 0.02, 0.05), tip);
    col = mix(bark, thornCol, thorn);
    band = max(band, thorn);
    lip *= 0.3;
    glow = vec3(0.7, 0.05, 0.08);
  } else if (kind == 3) {
    // frost: ice facets, glints running over them
    float facet = v.x;
    col = mix(vec3(0.75, 0.9, 1.0), vec3(0.45, 0.7, 0.95), facet) + crack * vec3(0.9, 0.97, 1.0) * 0.6;
    float glint = pow(max(0.0, sin(dot(cuv, vec2(14.0, 9.0)) - t * 2.5)), 24.0);
    col += glint * 0.8;
    glow = vec3(0.6, 0.85, 1.0);
    c = mix(c, vec3(lumi(c)) * vec3(0.85, 0.95, 1.1), 0.3 * a * uShare);
  } else if (kind == 4) {
    // toxic: a green slime that glistens, bubbles rising in it
    float s = fbm(cuv * vec2(7.0, 5.0) + vec2(0.0, t * 0.25));
    col = mix(vec3(0.1, 0.35, 0.05), vec3(0.55, 0.95, 0.2), s);
    float gloss = pow(max(0.0, 1.0 - abs(s - 0.55) * 8.0), 3.0);
    col += vec3(0.85, 1.0, 0.7) * gloss * 0.6;
    vec2 bg = vec2(cuv.x * 18.0, cuv.y * 14.0 + t * 0.8);
    float bub = (1.0 - smoothstep(0.18, 0.24, length(fract(bg) - 0.5))) * step(0.8, hash(floor(bg)));
    col = mix(col, vec3(0.8, 1.0, 0.5), bub * 0.7);
    glow = vec3(0.45, 1.0, 0.2);
  } else if (kind == 5) {
    // cursed: black flesh, violet veins of light, a dark smoke
    float r = 1.0 - abs(fbm(cuv * vec2(8.0, 10.0) + vec2(t * 0.05, 0.0)) * 2.0 - 1.0);
    float vein = pow(r, 8.0);
    col = mix(vec3(0.05, 0.02, 0.08), vec3(0.75, 0.3, 1.0), vein * (0.7 + 0.3 * sin(t * 3.0)));
    glow = vec3(0.55, 0.15, 0.85);
    c = mix(c, c * vec3(0.8, 0.7, 0.9), 0.3 * a * uShare);
  } else if (kind == 6) {
    // stone: grey plates, dark cracks, a light on their upper side
    vec3 stone = mix(vec3(0.32, 0.3, 0.28), vec3(0.55, 0.52, 0.48), hash(floor(cuv * vec2(9.0, 12.0)) + v.x));
    stone *= 0.85 + 0.3 * fbm(cuv * 30.0);
    float bevel = smoothstep(0.0, 0.15, v.y - v.x) * (1.0 - smoothstep(0.15, 0.4, v.y - v.x));
    col = mix(stone + bevel * 0.12, vec3(0.06, 0.05, 0.05), crack);
    glow = vec3(0.75, 0.68, 0.55);
  } else {
    // electric: dark plating, arcs crackling along the rim
    float flick = floor(t * 14.0);
    float arc = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float line = abs(fbm(cuv * vec2(10.0, 12.0) + vec2(flick * 0.37 + fi * 3.1, fi * 7.3)) - 0.5);
      arc += (1.0 - smoothstep(0.0, 0.025 + 0.02 * tk, line)) * step(0.35, hash(vec2(flick, fi)));
    }
    col = vec3(0.06, 0.08, 0.16) + vec3(0.55, 0.8, 1.0) * min(arc, 1.0) * 1.4;
    glow = vec3(0.45, 0.7, 1.0);
  }
  c = mix(c, col, band * 0.9);
  c += glow * lip * (0.8 + 1.2 * tk);
  float ga = clamp(halo(d, uPad.x * 0.6) * (0.35 + 0.9 * tk) * a, 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(glow * ga, ga));`);
