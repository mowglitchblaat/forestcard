// The status shaders: filters that transform the card's picture itself (deformation, colour, matter),
// taken from the shader bench (cartes-pixi-nihon-densetsu, essai.template.html, the right-hand card) with
// these changes: halo() never fades over a reach of 0 (there is no padding around the picture here);
// uLevel (1 to 3) is declared for the statuses that have levels; the stone is less present (STONE: it
// tints the picture instead of replacing it, with lighter cracks and sheen); the poison's bubbles are
// lenses over the picture instead of flat discs (POISON); the bleed seeps in from the edges instead of
// cartoon drips (BLEED); each picture-wide colour grade is scaled by uShare, so several statuses on a
// card blend their grades and all show their marks.
//
// Every shader reads: uTime (s), uAmt (0..1: the status fading in or out), uTick (0..1: the envelope of
// the status acting), uPad / uCard (px: where the card sits in the filter's input, and its size), uRadius.

export const COMMON = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize; // highp: must match the precision Pixi gives it in the vertex shader, or the program fails to link
uniform vec4 uInputClamp;
uniform float uTime;
uniform float uAmt;
uniform float uTick;
uniform vec2 uPad;
uniform vec2 uCard;
uniform float uRadius;
uniform float uLevel;
// share of the picture's colour grade (1 / the statuses on the card): grades blend, marks stay whole
uniform float uShare;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
// FBM_OCT: the octaves of fbm(), set by the quality (status/quality.ts): 5 at full quality
#ifndef FBM_OCT
#define FBM_OCT 5
#endif
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < FBM_OCT; i++){ v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
// card uv (0..1 over the card, y down) -> input texture coord
vec2 toTc(vec2 cuv){ cuv = clamp(cuv, 0.002, 0.998); return clamp((uPad + cuv * uCard) * uInputSize.zw, uInputClamp.xy, uInputClamp.zw); }
// signed distance to the rounded card outline, in px (negative inside)
float sdCard(vec2 cuv){ vec2 p = cuv * uCard; vec2 q = abs(p - uCard * 0.5) - (uCard * 0.5 - uRadius); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius; }
vec4 over(vec4 top, vec4 bottom){ return top + bottom * (1.0 - top.a); }
vec3 tex(vec2 cuv){ return texture(uTexture, toTc(cuv)).rgb; }
float lumi(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
// alpha of a glow outside the card, fading out over reach px
float halo(float d, float reach){ reach = max(reach, 1.0); float inside = clamp(0.5 - d, 0.0, 1.0); float o = (1.0 - inside) * (1.0 - smoothstep(0.0, reach, d)); return o * o; }
// cellular noise: distances to the nearest and second nearest cell points
vec2 vor(vec2 p){ vec2 n = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j)); vec2 o = vec2(hash(n + g), hash(n + g + 17.3)); vec2 r = g + o - f; float dd = dot(r, r);
    if (dd < d1){ d2 = d1; d1 = dd; } else if (dd < d2){ d2 = dd; } }
  return vec2(sqrt(d1), sqrt(d2)); }
`;
// first lines of every status shader: card uv, time, intensity, distance to the card outline
export const HEAD = `
  vec2 px = vTextureCoord * uInputSize.xy;
  vec2 cuv = (px - uPad) / uCard;
  float t = uTime, a = uAmt;
  float d = sdCard(cuv);
  float inside = clamp(0.5 - d, 0.0, 1.0);
  float edge = -d / (uCard.x * 0.5);
  float tk = uTick;
`;

// Each status has an idle look (a = intensity, eases in when the status lands) and a burst
// when it acts (tk = uTick, 0..1 envelope: up in 0.1 s, down over ~1 s). Idle deformations stay small.
export const BURN =
  COMMON +
  `
void main(){` +
  HEAD +
  `
  // heat haze: a slight wobble, stronger toward the bottom; flares when the burn deals damage
  float heat = smoothstep(0.1, 1.0, cuv.y) * a;
  vec2 wob = vec2(fbm(vec2(cuv.x * 6.0, cuv.y * 5.0 + t * 2.2)), fbm(vec2(cuv.x * 5.0 + 7.0, cuv.y * 6.0 + t * 1.7))) - 0.5;
  vec3 c = tex(cuv + wob * (0.014 + 0.03 * tk) * heat);
  c = mix(c, c * vec3(1.18, 0.88, 0.66) + vec3(0.22, 0.06, 0.0) * heat, (0.6 + 0.3 * tk) * a * uShare);
  // charred border eaten by noise, with a glowing ember rim
  float n = fbm(cuv * vec2(7.0, 5.0) + vec2(0.0, t * 0.12));
  float line = edge - n * 0.2 * a;
  float charred = 1.0 - smoothstep(0.0, 0.07 * a + 0.001, line);
  c = mix(c, c * 0.15, charred * 0.9);
  float rim = 1.0 - smoothstep(0.0, 0.025, abs(line - 0.07 * a));
  c += vec3(1.0, 0.42, 0.05) * rim * (0.9 + 0.5 * noise(cuv * 40.0 + t * 3.0)) * (0.8 + 0.8 * tk) * a;
  // flames from the bottom; they leap up on a tick
  float f = fbm(vec2(cuv.x * 3.2, cuv.y * 2.2 + t * 1.6));
  float fh = (cuv.y - 0.62 + 0.3 * tk) * 2.4 + (f - 0.5) * 1.5;
  float flame = smoothstep(0.0, 0.9, fh) * a;
  vec3 fc = mix(vec3(0.9, 0.15, 0.0), vec3(1.0, 0.72, 0.18), smoothstep(0.3, 1.0, fh));
  fc = mix(fc, vec3(1.0, 0.95, 0.75), smoothstep(0.9, 1.6, fh));
  c += fc * flame * 0.85;
  vec2 sg = vec2(cuv.x * 14.0, cuv.y * 10.0 + t * 2.4);
  vec2 cell = floor(sg); float h = hash(cell);
  vec2 off = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
  float spark = (1.0 - smoothstep(0.0, 0.09, length(fract(sg) - 0.5 - off * 0.6))) * step(0.86 - 0.12 * tk, h) * smoothstep(0.25, 1.0, cuv.y) * a;
  c += vec3(1.0, 0.7, 0.3) * spark * 2.0;
  c *= 1.0 + (0.04 + 0.12 * tk) * sin(t * 13.0) * a;
  float flick = 0.75 + 0.25 * fbm(vec2(cuv.x * 4.0, t * 3.0));
  float ga = clamp(halo(d, uPad.x) * 0.9 * a * flick * (1.0 + 1.2 * tk) * smoothstep(-0.3, 1.0, cuv.y), 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(1.0, 0.36, 0.03) * ga, ga));
}`;

export const FROST =
  COMMON +
  `
void main(){` +
  HEAD +
  `
  // frost creeps in from the borders; when it freezes an attack it jumps inward and flashes
  float n = fbm(cuv * vec2(9.0, 7.0));
  float front = (0.3 + 0.14 * tk) * a + 0.02 * sin(t * 0.9);
  float frost = 1.0 - smoothstep(front - 0.12, front, edge - (n - 0.5) * 0.28);
  float e = 0.02;
  vec2 gp = cuv * 30.0;
  vec2 g = vec2(fbm(gp + vec2(e, 0.0)) - fbm(gp - vec2(e, 0.0)), fbm(gp + vec2(0.0, e)) - fbm(gp - vec2(0.0, e)));
  vec2 q = cuv + g * (0.25 + 0.4 * tk) * frost;
  float r = (0.004 + 0.004 * tk) * frost;
  vec3 c = (tex(q) + tex(q + vec2(r, 0.0)) + tex(q - vec2(r, 0.0)) + tex(q + vec2(0.0, r)) + tex(q - vec2(0.0, r))) / 5.0;
  float l = lumi(c);
  c = mix(c, vec3(l) * vec3(0.78, 0.92, 1.12) + vec3(0.02, 0.05, 0.1), 0.72 * a * uShare);
  float n2 = fbm(cuv * vec2(26.0, 20.0) + 3.0);
  c = mix(c, vec3(0.86, 0.95, 1.0) * (0.72 + 0.38 * n2), frost * 0.75);
  float vein = 1.0 - abs(fbm(cuv * vec2(14.0, 11.0) + 7.0) * 2.0 - 1.0);
  c += vec3(0.8, 0.95, 1.0) * pow(vein, 10.0) * frost * (0.7 + 0.8 * tk);
  vec2 sg = cuv * vec2(60.0, 84.0);
  float h = hash(floor(sg));
  float tw = pow(max(0.0, sin(t * 3.0 + h * 40.0)), 24.0);
  c += vec3(1.0) * step(0.9, h) * tw * (1.0 - smoothstep(0.0, 0.45, length(fract(sg) - 0.5))) * frost * (1.6 + 2.0 * tk);
  c += vec3(0.7, 0.9, 1.0) * tk * 0.35 * a * (0.4 + 0.6 * frost);
  float ga = clamp(halo(d, uPad.x * 0.7) * 0.6 * a * (1.0 + tk), 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(0.55, 0.85, 1.0) * ga, ga));
}`;

export const POISON =
  COMMON +
  `
void main(){` +
  HEAD +
  `
  // nausea: a slight sway, sickly green, dark veins; a damage tick makes it heave and flush green
  vec2 sway = vec2(sin(cuv.y * 9.0 + t * 2.0), cos(cuv.x * 7.0 + t * 1.6)) * (0.0025 + 0.007 * tk) * a;
  vec3 c = tex(cuv + sway);
  float l = lumi(c);
  c = mix(c, vec3(l * 0.7, l * 1.05 + 0.05, l * 0.55), (0.5 + 0.25 * tk) * a * uShare);
  float vn = pow(1.0 - abs(fbm(cuv * vec2(6.0, 8.0) + vec2(0.0, t * 0.05)) * 2.0 - 1.0), 14.0);
  c = mix(c, vec3(0.04, 0.22, 0.04), vn * (0.6 + 0.3 * tk) * a);
  float vap = fbm(vec2(cuv.x * 3.0 + t * 0.15, cuv.y * 2.5 - t * 0.4));
  float vm = smoothstep(0.35 - 0.25 * tk, 1.0, cuv.y + (vap - 0.5) * 0.6) * a;
  c = mix(c, vec3(0.35, 0.85, 0.3), vm * (0.3 + 0.25 * tk));
  // bubbles (rewritten from the bench's flat discs): each one a lens over the picture. It rises with a
  // wobble, swells, then bursts into a ring that fades; inside, the picture seen through it, slightly
  // magnified and bent toward the rim (mostly clear, like a bubble of liquid); its rim iridescent,
  // stronger where it is seen edge-on (Fresnel); a sharp highlight up left, a faint one down right
  vec2 bg = vec2(cuv.x * 7.0, cuv.y * 9.0 + t * 0.9);
  vec2 bc = floor(bg), bf = fract(bg);
  float bh = hash(bc);
  float life = fract(t * (0.18 + 0.1 * hash(bc + 2.9)) + bh);
  vec2 bo = vec2(hash(bc + 1.3), hash(bc + 5.1)) * 0.3 + 0.35 + vec2(sin(t * 2.3 + bh * 6.28) * 0.06, 0.0);
  // a bubble is drawn in its own grid cell: it and its burst ring stay inside it, or they are cut
  float room = min(min(bo.x, 1.0 - bo.x), min(bo.y, 1.0 - bo.y)) - 0.02;
  float br = min(0.17 + 0.17 * hash(bc + 9.7), room * 0.7) * (0.45 + 0.55 * smoothstep(0.0, 0.8, life));
  float popping = smoothstep(0.88, 1.0, life);
  vec2 bv = bf - bo;
  float bd = length(bv);
  float on = step(0.74 - 0.16 * tk, bh) * smoothstep(0.2, 0.6, cuv.y) * a;
  float body = (1.0 - smoothstep(br - 0.015, br, bd)) * (1.0 - popping) * on;
  vec2 nrm = bv / max(br, 0.001);
  float z = sqrt(max(0.0, 1.0 - dot(nrm, nrm)));
  vec2 centre = vec2((bc.x + bo.x) / 7.0, (bc.y + bo.y - t * 0.9) / 9.0);
  vec3 seen = tex(centre + (cuv - centre) * (0.78 - 0.2 * (1.0 - z)));
  float fres = pow(1.0 - z, 2.5);
  vec3 film = 0.5 + 0.5 * cos(6.28318 * (fres * 1.3 + t * 0.07 + bh + vec3(0.0, 0.33, 0.67)));
  vec3 skin = mix(vec3(0.55, 1.0, 0.5), film, 0.55);
  // the wall sends some light back: what is behind looks lighter through it
  vec3 behind = mix(seen * vec3(0.95, 1.08, 0.95), vec3(0.78, 0.95, 0.8), 0.22) + vec3(0.03, 0.07, 0.03);
  vec3 bubble = mix(behind, skin, fres * 0.85);
  float hi = pow(max(0.0, dot(normalize(vec3(nrm, z)), normalize(vec3(-0.45, -0.5, 0.75)))), 28.0);
  float hi2 = pow(max(0.0, dot(normalize(vec3(nrm, z)), normalize(vec3(0.5, 0.45, 0.75)))), 12.0) * 0.25;
  bubble += vec3(1.0) * (hi * 1.3 + hi2);
  c = mix(c, bubble, body);
  float burst = (1.0 - smoothstep(0.0, 0.03, abs(bd - mix(br, room, popping)))) * popping * (1.0 - popping) * 4.0 * on;
  c += vec3(0.75, 1.0, 0.7) * burst * 0.6;
  c += vec3(0.1, 0.35, 0.05) * tk * a;
  float ga = clamp(halo(d, uPad.x * 0.8) * 0.7 * a * (0.8 + 0.2 * sin(t * 3.9) + tk), 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(0.2, 0.9, 0.3) * ga, ga));
}`;

export const BLEED =
  COMMON +
  `
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
void main(){` +
  HEAD +
  `
  // The card bleeds (after the live of 23 November: the seeping alone read badly): its colour drains to
  // a cold red; a red glow throbs inside its edges with a heartbeat (the legacy's box-shadow sg); drops
  // of blood run down the card, each with its trail, wet and catching the light; the blood gathers at
  // the bottom. uLevel 1 to 3: more drops, a stronger glow. A damage tick: the card contracts, the glow
  // and the blood surge, then ebb.
  float lv = clamp(uLevel, 1.0, 3.0);
  vec2 zq = 0.5 + (cuv - 0.5) * (1.0 - 0.012 * tk);
  vec3 c = tex(zq);
  float l = lumi(c);
  c = mix(c, vec3(l) * vec3(1.05, 0.72, 0.72), (0.35 + 0.2 * tk) * a * uShare);
  float beat = pow(max(0.0, sin(t * 2.6)), 10.0) + 0.6 * pow(max(0.0, sin(t * 2.6 - 0.6)), 10.0);
  // the glow inside the edges, throbbing
  float rimW = 0.16 + 0.04 * lv + 0.06 * beat + 0.12 * tk;
  float rim = 1.0 - smoothstep(0.0, rimW, edge + (fbm(cuv * 6.0 + t * 0.1) - 0.5) * 0.06);
  c = mix(c, vec3(0.55, 0.0, 0.03), rim * (0.55 + 0.2 * beat + 0.25 * tk) * a);
  // pooled at the bottom, uneven
  float pool = smoothstep(0.82, 1.0, cuv.y + (fbm(vec2(cuv.x * 7.0, t * 0.15)) - 0.5) * 0.12);
  c = mix(c, vec3(0.42, 0.0, 0.02), pool * 0.85 * a);
  // the drops: one per column, each starting from the top on its own beat, its trail behind it
  vec2 asp = vec2(uCard.x / uCard.y, 1.0);
  float drip = 0.0, gloss = 0.0;
  for (int i = 0; i < 9; i++){
    float fi = float(i);
    if (fi >= 3.0 + 3.0 * lv) break;
    float hx = hash(vec2(fi, 3.1));
    float x = 0.07 + 0.86 * hx;
    float sp = 0.10 + 0.08 * hash(vec2(fi, 7.7));
    float ph = fract(t * sp + hash(vec2(fi, 1.3)));
    float y0 = 0.02 + 0.12 * hash(vec2(fi, 5.9));
    float yh = y0 + ph * ph * 1.05;
    float w = 0.007 + 0.006 * hash(vec2(fi, 9.4));
    float fade = 1.0 - smoothstep(0.8, 1.0, ph);
    vec2 p = cuv * asp;
    // the trail: thin, widening toward the head, with a slight sway
    float sway = sin(cuv.y * 18.0 + fi) * 0.003;
    float dt = seg(p, vec2(x + sway, y0) * asp, vec2(x, yh) * asp) - w * (0.45 + 0.55 * smoothstep(y0, yh, cuv.y));
    // the head: a drop, rounder and heavier
    vec2 q = (p - vec2(x, yh + w * 0.6) * asp) / vec2(1.0, 1.3);
    float dh = length(q) - w * 1.5;
    float dd = min(dt, dh);
    float m = (1.0 - smoothstep(-0.002, 0.002, dd)) * fade;
    drip = max(drip, m);
    // its highlight, up left of the head and along the trail
    gloss = max(gloss, (1.0 - smoothstep(0.0, w * 0.7, length(p - vec2(x - w * 0.45, yh) * asp))) * fade * m);
    gloss = max(gloss, (1.0 - smoothstep(0.0, w * 0.25, abs(p.x - (x - w * 0.3) * asp.x))) * step(y0, cuv.y) * step(cuv.y, yh) * m * 0.5);
  }
  vec3 blood = mix(vec3(0.45, 0.0, 0.03), vec3(0.75, 0.02, 0.06), 0.5 + 0.5 * beat);
  c = mix(c, blood, drip * 0.88 * a);
  c += vec3(1.0, 0.75, 0.75) * gloss * 0.6 * a;
  float ga = clamp(halo(d, uPad.x) * (0.45 + 0.35 * beat + 0.8 * tk) * a, 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(0.9, 0.04, 0.06) * ga, ga));
}`;

export const CURSE =
  COMMON +
  `
void main(){` +
  HEAD +
  `
  vec3 c = tex(cuv);
  float l = lumi(c);
  c = mix(c, mix(vec3(0.07, 0.0, 0.14), vec3(0.86, 0.72, 1.0), l), 0.6 * a * uShare);
  // a ghost of the picture hovers just above it; on a tick it tears away further
  vec3 gh = tex(cuv + vec2(0.006 * sin(t * 1.3), -(0.01 + 0.025 * tk) - 0.004 * sin(t * 0.7)));
  c += vec3(0.6, 0.3, 1.0) * lumi(gh) * (0.18 + 0.25 * tk) * a;
  vec2 w = cuv * vec2(4.0, 3.0);
  vec2 q = vec2(fbm(w + vec2(0.0, t * 0.2)), fbm(w + vec2(5.2, 1.3) - vec2(0.0, t * 0.15)));
  float ten = fbm(w + 2.0 * q);
  float reach = max(smoothstep(0.4, 1.0, cuv.y), 1.0 - smoothstep(0.0, 0.35, edge));
  float v = ten * 0.6 + reach * (0.55 + 0.25 * tk) * a;
  c = mix(c, vec3(0.03, 0.0, 0.06), smoothstep(0.62, 0.78, v) * 0.88);
  c += vec3(0.75, 0.4, 1.0) * (1.0 - smoothstep(0.0, 0.035, abs(v - 0.62))) * (0.7 + 0.6 * tk) * a;
  c += vec3(0.25, 0.05, 0.4) * tk * a;
  float ga = clamp(halo(d, uPad.x) * (0.55 + 0.25 * sin(t * 1.7) + 0.6 * tk) * a, 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(0.55, 0.2, 0.95) * ga, ga));
}`;

export const STUN =
  COMMON +
  `
float star5(vec2 p, float r){ float an = atan(p.y, p.x); float k = pow(0.5 + 0.5 * cos(5.0 * an), 3.0); float rr = r * (0.45 + 0.55 * k); return 1.0 - smoothstep(rr - 0.004, rr + 0.002, length(p)); }
void main(){` +
  HEAD +
  `
  // a gentle sway around the head at rest; when the stun skips a turn, a full swirl that unwinds
  float asp = uCard.y / uCard.x;
  vec2 head = vec2(0.5, 0.34);
  vec2 p = (cuv - head) * vec2(1.0, asp);
  float r = length(p);
  float ang = a * 0.3 * exp(-r * 3.5) * sin(t * 1.4) + tk * 1.3 * exp(-r * 3.0);
  float cs = cos(ang), sn = sin(ang);
  p = mat2(cs, -sn, sn, cs) * p;
  vec2 q = head + p / vec2(1.0, asp);
  float sep = (0.005 + 0.014 * tk) * (0.6 + 0.4 * sin(t * 2.1)) * a;
  vec3 c = 0.5 * (tex(q + vec2(sep, 0.0)) + tex(q - vec2(sep, 0.004)));
  float l = lumi(c);
  c = mix(c, vec3(l) * vec3(1.08, 1.02, 0.82), 0.35 * a * uShare);
  c *= 1.0 - (0.14 + 0.12 * tk) * a * smoothstep(0.1, 0.6, r);
  vec2 sp = (cuv - vec2(0.5, 0.17)) * vec2(1.0, asp);
  float s = 0.0;
  for (int i = 0; i < 3; i++){
    float an = t * 2.6 + float(i) * 2.094;
    s = max(s, star5(sp - vec2(cos(an) * 0.3, sin(an) * 0.07), (0.05 + 0.025 * tk) * (0.75 + 0.25 * sin(an))));
  }
  c = mix(c, vec3(1.0, 0.88, 0.3), s * a);
  c += vec3(1.0, 0.9, 0.4) * s * (0.3 + 0.5 * tk) * a;
  float ga = clamp(halo(d, uPad.x * 0.6) * (0.5 + 0.6 * tk) * a, 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(1.0, 0.85, 0.2) * ga, ga));
}`;

export const RAGE =
  COMMON +
  `
void main(){` +
  HEAD +
  `
  float pulse = 0.5 + 0.5 * sin(t * 10.0);
  // a faint tremor and colour fringe at rest; on each hit of the bearer the picture jolts and splits
  vec2 shake = (vec2(hash(vec2(floor(t * 24.0), 1.0)), hash(vec2(floor(t * 24.0), 2.0))) - 0.5) * (0.0015 + 0.006 * tk) * a;
  vec2 dir = cuv - 0.5;
  float ca = (0.003 + 0.003 * pulse + 0.012 * tk) * a;
  vec2 b = cuv + shake;
  vec3 c = vec3(tex(b + dir * ca).r, tex(b).g, tex(b - dir * ca).b);
  float l = lumi(c);
  c = mix(c, vec3(l * 1.45, l * 0.42, l * 0.32), (0.5 + 0.2 * tk) * a * uShare);
  c = mix(c, smoothstep(0.05, 0.95, c), 0.5 * a * uShare);
  float vig = 1.0 - smoothstep(0.0, 0.5, edge);
  c = mix(c, vec3(0.7, 0.02, 0.0), vig * (0.3 + 0.25 * pulse + 0.35 * tk) * a);
  float vn = pow(1.0 - abs(fbm(cuv * vec2(5.0, 7.0) + 11.0) * 2.0 - 1.0), 18.0);
  c += vec3(1.0, 0.1, 0.05) * vn * (0.3 + 0.4 * pulse + 0.8 * tk) * a;
  float ga = clamp(halo(d, uPad.x) * (0.5 + 0.35 * pulse + 0.8 * tk) * a, 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(1.0, 0.1, 0.02) * ga, ga));
}`;

export const TIRED =
  COMMON +
  `
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
void main(){` +
  HEAD +
  `
  // Fatigue (after the live of 23 November: the grade alone did not say it): the picture sags, blurs a
  // little and goes blue-grey; the eyelids are heavy: dark bands at the top and bottom that close
  // slowly, and blink; drops of sweat run down; « Z » rise from the top right, swaying and growing, as
  // in the legacy overlay. Fatigue does not act after landing.
  float lv = clamp(uLevel, 1.0, 3.0);
  vec2 q = cuv + vec2(0.0, sin(t * 0.8) * 0.003 * a);
  float r = 0.004 * a;
  vec3 c = (tex(q) * 2.0 + tex(q + vec2(r, 0.0)) + tex(q - vec2(r, 0.0)) + tex(q + vec2(0.0, r)) + tex(q - vec2(0.0, r))) / 6.0;
  float l = lumi(c);
  c = mix(c, vec3(l) * vec3(0.72, 0.82, 1.1), 0.75 * a * uShare);
  c *= 1.0 - 0.28 * a * uShare;
  // heavy eyelids, and now and then a long blink
  float bl = pow(max(0.0, sin(t * 0.9)), 30.0);
  float lid = (0.06 + 0.025 * lv + 0.04 * (0.5 + 0.5 * sin(t * 1.1)) + 0.16 * bl) * a;
  float lids = max(1.0 - smoothstep(lid, lid + 0.06, cuv.y), 1.0 - smoothstep(lid * 0.45, lid * 0.45 + 0.05, 1.0 - cuv.y));
  c = mix(c, vec3(0.02, 0.03, 0.07), lids * 0.92 * a);
  // a blue-grey mist drifting
  float hz = fbm(vec2(cuv.x * 2.5 + t * 0.08, cuv.y * 2.0));
  c = mix(c, vec3(0.42, 0.5, 0.72), smoothstep(0.45, 0.8, hz) * 0.3 * a);
  vec2 asp = vec2(uCard.x / uCard.y, 1.0), p = cuv * asp;
  // sweat: drops running down, pale and wet
  float sweat = 0.0, shine = 0.0;
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    if (fi >= 3.0 + 2.0 * lv) break;
    float x = 0.08 + 0.84 * hash(vec2(fi, 2.3));
    float ph = fract(t * (0.13 + 0.07 * hash(vec2(fi, 4.1))) + hash(vec2(fi, 8.8)));
    float y = -0.03 + ph * 1.06;
    float w = 0.011 + 0.006 * hash(vec2(fi, 6.6));
    vec2 o = p - vec2(x, y) * asp;
    // a teardrop: round below, pointed above
    o.y *= o.y < 0.0 ? 0.55 : 1.0;
    float dd = length(o) - w;
    float al = sin(3.14159 * ph);
    float m = (1.0 - smoothstep(-0.0015, 0.0015, dd)) * al;
    sweat = max(sweat, m);
    shine = max(shine, (1.0 - smoothstep(0.0, w * 0.45, length(p - vec2(x - w * 0.35, y) * asp))) * al);
  }
  c = mix(c, vec3(0.62, 0.82, 1.0), sweat * 0.75 * a);
  c += vec3(1.0) * shine * 0.7 * a;
  // the « Z »: three at a time, rising, swaying, growing, fading
  float zf = 0.0, zo = 0.0;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float ph = fract(t * 0.32 + fi / 3.0);
    vec2 ctr = vec2(0.7 + 0.05 * fi + 0.035 * sin(t * 1.7 + fi * 2.1), 0.44 - ph * 0.32);
    float sz = (0.045 + 0.06 * ph) * (0.85 + 0.15 * lv);
    vec2 z = (p - ctr * asp) / sz;
    float an = -0.2;
    z = mat2(cos(an), -sin(an), sin(an), cos(an)) * z;
    float dz = min(min(seg(z, vec2(-0.45, -0.5), vec2(0.45, -0.5)), seg(z, vec2(0.45, -0.5), vec2(-0.45, 0.5))), seg(z, vec2(-0.45, 0.5), vec2(0.45, 0.5)));
    float al = sin(3.14159 * ph);
    zf = max(zf, (1.0 - smoothstep(0.1, 0.13, dz)) * al);
    zo = max(zo, (1.0 - smoothstep(0.17, 0.21, dz)) * al);
  }
  c = mix(c, vec3(0.05, 0.08, 0.2), zo * 0.85 * a);
  c = mix(c, vec3(0.82, 0.9, 1.0), zf * a);
  float ga = clamp(halo(d, uPad.x * 0.5) * 0.4 * a, 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(0.3, 0.38, 0.6) * ga, ga));
}`;

export const STONE =
  COMMON +
  `
void main(){` +
  HEAD +
  `
  // when the stone blocks something, the card jolts and its cracks light up
  vec2 jolt = vec2(hash(vec2(floor(t * 30.0), 3.0)) - 0.5, 0.0) * 0.006 * tk;
  vec2 sc = cuv + jolt;
  vec3 c = tex(sc);
  float front = 1.0 - a * 1.08;
  float wob = (fbm(vec2(cuv.x * 6.0, 1.0)) - 0.5) * 0.06;
  float st = smoothstep(front - 0.01, front + 0.01, cuv.y + wob);
  float l = lumi(c);
  float gran = fbm(sc * vec2(30.0, 42.0));
  vec2 v = vor(sc * vec2(5.0, 7.0));
  float crack = 1.0 - smoothstep(0.0, 0.05, v.y - v.x);
  float e = 0.004;
  float gx = fbm((sc + vec2(e, 0.0)) * vec2(30.0, 42.0)) - gran;
  float gy = fbm((sc + vec2(0.0, e)) * vec2(30.0, 42.0)) - gran;
  float lit = clamp(0.5 - (gx - gy) * 6.0, 0.0, 1.0);
  vec3 stone = vec3(0.62, 0.58, 0.53) * (0.35 + 0.75 * l) * (0.75 + 0.45 * gran) * (0.8 + 0.4 * lit);
  stone *= 1.0 - crack * 0.4 * (1.0 - tk);
  stone += vec3(1.0, 0.95, 0.85) * crack * tk * 0.8;
  float sheen = 1.0 - smoothstep(0.0, 0.08, abs(cuv.x + cuv.y * 0.6 - mod(t * 0.45, 2.4) + 0.4));
  stone += vec3(1.0, 0.97, 0.9) * sheen * 0.1;
  // less present than the bench: the stone tints the picture (55 %) instead of replacing it
  c = mix(c, stone, st * 0.55 * step(0.001, a));   // fully gone once the status has faded out
  float line = 1.0 - smoothstep(0.0, 0.012, abs(cuv.y + wob - front));
  c = mix(c, vec3(0.9, 0.86, 0.8), line * step(0.02, 1.0 - a) * step(0.001, a) * 0.9);
  float ga = clamp(halo(d, uPad.x * 0.4) * (0.3 + 0.6 * tk) * st, 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(0.5, 0.48, 0.45) * ga, ga));
}`;

// Not in the bench: written in its manner, for the two statuses it did not have.
export const KNELL =
  COMMON +
  `
void main(){` +
  HEAD +
  `
  // the Knell: the picture dies from the left, as far as its shadow on the life bar (uLevel: its
  // threshold, 0 to 100 % of the max HP, scenes/combat.ts); behind the front its colour drains, it
  // darkens and grains away; the front is ragged and faintly violet; a tick pushes it on
  float n = fbm(vec2(cuv.y * 7.0, t * 0.15));
  float front = (clamp(uLevel, 0.0, 100.0) / 100.0 + 0.06 * tk) * a;
  float x = cuv.x + (n - 0.5) * 0.09;
  float dead = 1.0 - smoothstep(front - 0.08, front, x);
  vec2 drift = vec2(0.0, (fbm(cuv * 9.0 + t * 0.2) - 0.5) * 0.012 * dead);
  vec3 c = tex(cuv + drift);
  float l = lumi(c);
  vec3 ash = vec3(l) * vec3(0.55, 0.5, 0.62) * (0.45 + 0.4 * fbm(cuv * vec2(30.0, 42.0)));
  c = mix(c, ash, dead);
  float edgeLine = exp(-pow((x - front) * 32.0, 2.0)) * step(0.001, a);
  c += vec3(0.62, 0.42, 1.0) * edgeLine * (0.45 + 0.8 * tk);
  c *= 1.0 - 0.1 * tk * dead;
  finalColor = vec4(c * inside, inside);
}`;

export const FRACTURE =
  COMMON +
  `
void main(){` +
  HEAD +
  `
  // the picture splits along bone-like cracks: each shard is shifted a little, the cracks are pale,
  // the light catches their edges; a tick (the fracture dealing damage) opens them and flashes
  vec2 p = cuv * vec2(4.0, 5.5);
  vec2 v = vor(p);
  float crack = 1.0 - smoothstep(0.0, 0.04 + 0.03 * tk, v.y - v.x);
  vec2 cell = floor(p + 0.5);
  vec2 shift = (vec2(hash(cell + 1.7), hash(cell + 4.1)) - 0.5) * (0.004 + 0.012 * tk) * a;
  vec3 c = tex(cuv + shift);
  float bone = smoothstep(0.35, 0.7, fbm(cuv * vec2(5.0, 7.0) + 2.0));
  float on = crack * bone * a;
  c = mix(c, c * 0.35, on * 0.6);
  c += vec3(1.0, 0.95, 0.82) * on * (0.35 + 0.9 * tk);
  finalColor = vec4(c * inside, inside);
}`;

// The transcendence (DIVINE in the bench): a soft golden bloom, rays from above the card, motes of light
// rising, a golden rim; a level gained (tick) floods the card with light. Its rays grow with the level.
export const DIVINE =
  COMMON +
  `
void main(){` +
  HEAD +
  `
  vec3 c = tex(cuv);
  float lv = clamp(uLevel, 1.0, 3.0) / 3.0;
  vec3 bl = vec3(0.0);
  for (int i = 0; i < 8; i++){ float an = float(i) * 0.785; bl += max(tex(cuv + vec2(cos(an), sin(an)) * 0.018) - 0.55, 0.0); }
  bl /= 8.0;
  c = mix(c, c * vec3(1.08, 1.0, 0.85) + vec3(0.06, 0.04, 0.0), 0.6 * a * uShare);
  c += bl * vec3(1.6, 1.3, 0.7) * (1.0 + 2.0 * tk) * a;
  vec2 dv = cuv - vec2(0.5, -0.15);
  float ang = atan(dv.x, dv.y);
  float rays = 0.5 + 0.5 * sin(ang * 22.0 + t * 0.6) * sin(ang * 13.0 - t * 0.4);
  c += vec3(1.0, 0.9, 0.6) * pow(rays, 3.0) * (1.0 - smoothstep(0.0, 1.2, length(dv))) * (0.2 + 0.25 * lv + 0.7 * tk) * a;
  vec2 mg = vec2(cuv.x * 18.0, cuv.y * 24.0 + t * 1.2), mc = floor(mg);
  vec2 mo = vec2(hash(mc + 2.1), hash(mc + 4.3)) * 0.6 + 0.2;
  float mote = (1.0 - smoothstep(0.0, 0.18, length(fract(mg) - mo))) * step(0.86 - 0.1 * tk, hash(mc)) * (0.5 + 0.5 * sin(t * 3.0 + hash(mc) * 30.0));
  c += vec3(1.0, 0.92, 0.6) * mote * 0.9 * a;
  float rim = 1.0 - smoothstep(0.0, 6.0 + 8.0 * tk, abs(d + 3.0));
  c = mix(c, vec3(1.0, 0.85, 0.45), rim * (0.6 + 0.3 * sin(t * 3.0) + 0.3 * tk) * a);
  c += vec3(1.0, 0.9, 0.6) * tk * 0.25 * a;
  float ga = clamp(halo(d, uPad.x) * (0.6 + 0.15 * sin(t * 2.0) + 0.7 * tk) * a, 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(1.0, 0.82, 0.4) * ga, ga));
}`;
