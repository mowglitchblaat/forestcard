// The status shaders written after the bench, in its manner (status/shaders.ts: COMMON, HEAD, an idle look
// eased in by uAmt, a burst on uTick, the colour grade scaled by uShare, a halo outside the card when the
// status glows). Three statuses the engine has and the bench did not (contamination, weakness, gag), and
// the lasting states of the mechanics that change what a card is made of while they run: mist, roots,
// insect mutation, molt, electric charges, a card under control (a puppet).
//
// Cost: every one of them is a single pass over the card's picture, like the bench's. They sample the
// picture once (twice for the molt, five times for the gag's ink), and keep their noise to fbm(), whose
// octaves the quality setting lowers (status/quality.ts).

import { COMMON, HEAD } from './shaders.ts';

const body = (code: string) => `${COMMON}\nvoid main(){${HEAD}${code}\n}`;

// Contamination (a status amplifier: each new one prolongs it). The infection spreads from low on the
// card through the picture: its colour sickens to a violet grey, dark veins with a toxic green light pulse
// outward, spores drift up. A tick (it is laid again and prolonged): the zone swells, the veins flare.
export const CONTAMINATION = body(`
  vec2 seed = vec2(0.5, 0.8);
  float dist = length((cuv - seed) * vec2(1.0, 0.75));
  float n = fbm(cuv * vec2(6.0, 8.0) + vec2(0.0, t * 0.08));
  float reach = (0.42 + 0.12 * clamp(uLevel - 1.0, 0.0, 2.0)) * a + 0.14 * tk;
  float zone = 1.0 - smoothstep(reach - 0.18, reach + 0.04, dist + (n - 0.5) * 0.35);
  vec2 sway = (vec2(noise(cuv * 7.0 + t * 0.4), noise(cuv * 7.0 + 3.1 - t * 0.35)) - 0.5) * 0.007 * zone * (1.0 + 2.0 * tk);
  vec3 c = tex(cuv + sway);
  float l = lumi(c);
  vec3 sick = vec3(l * 0.78 + 0.05, l * 0.62, l * 0.95 + 0.08);
  c = mix(c, sick, 0.6 * a * uShare * (0.35 + 0.65 * zone));
  // veins: the ridges of the noise, inside the zone; their light runs outward from the seed
  float v = 1.0 - abs(fbm(cuv * vec2(9.0, 12.0) + 1.7) * 2.0 - 1.0);
  float vein = pow(v, 9.0) * zone;
  float pulse = 0.55 + 0.45 * sin(dist * 26.0 - t * 4.0);
  c = mix(c, vec3(0.22, 0.04, 0.28), vein * 0.65 * a);
  c += vec3(0.45, 1.0, 0.25) * vein * pulse * (0.35 + 1.0 * tk) * a;
  // spores rising
  vec2 sg = vec2(cuv.x * 16.0, cuv.y * 12.0 + t * 0.6);
  vec2 cell = floor(sg);
  vec2 off = vec2(hash(cell + 2.3), hash(cell + 5.1)) - 0.5;
  float spore = (1.0 - smoothstep(0.0, 0.12, length(fract(sg) - 0.5 - off * 0.6))) * step(0.88 - 0.1 * tk, hash(cell)) * zone * a;
  c += vec3(0.6, 1.0, 0.4) * spore * 1.4;
  float ga = clamp(halo(d, uPad.x * 0.7) * 0.5 * a * (0.8 + 0.8 * tk), 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(0.5, 0.95, 0.3) * ga, ga));`);

// Weakness: the strength leaves the card. Its colour and contrast drain to a cold pale grey, the picture
// droops a little in its middle, the corners dull, a few pale motes fall. A tick (it weakens a blow): a
// shiver and a grey wave down the card.
export const WEAKNESS = body(`
  vec2 q = cuv;
  q.x += sin(t * 31.0) * 0.003 * tk;
  q.y -= 0.014 * a * (1.0 - cuv.y) * sin(cuv.x * 3.14159);
  vec3 c = tex(q);
  float l = lumi(c);
  vec3 pale = mix(vec3(l), c, 0.35);
  pale = mix(vec3(0.5), pale, 0.7) * vec3(0.92, 0.95, 1.04) + 0.04;
  c = mix(c, pale, 0.75 * a * uShare);
  float vig = smoothstep(0.25, 0.95, length((cuv - 0.5) * vec2(1.0, 0.8)) * 1.4);
  c *= 1.0 - 0.35 * vig * a;
  vec2 sg = vec2(cuv.x * 12.0, cuv.y * 9.0 - t * 0.35);
  float mote = (1.0 - smoothstep(0.0, 0.1, length(fract(sg) - 0.5))) * step(0.9, hash(floor(sg))) * a;
  c += vec3(0.7, 0.75, 0.85) * mote * 0.5;
  float wave = exp(-pow((cuv.y - (1.0 - tk)) * 6.0, 2.0)) * tk;
  c = mix(c, vec3(lumi(c)) * 0.75, wave * 0.65);
  float ga = clamp(halo(d, uPad.x * 0.5) * 0.3 * a, 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(0.6, 0.65, 0.75) * ga, ga));`);

// The gag (Toon): the picture turns cartoon, posterised with inked edges and a halftone in its shadows,
// and wobbles. A gag landing (tick): the card squashes from the bottom, and a comic impact bursts in it
// (spiky star, white core, red rim, ink speed lines) and fades as it grows.
export const GAG = body(`
  vec2 q = cuv;
  float sq = tk * 0.1;
  q.x = 0.5 + (q.x - 0.5) * (1.0 - sq * 0.6);
  q.y = 1.0 - (1.0 - q.y) * (1.0 + sq);
  q.x += sin(t * 2.0 + cuv.y * 5.0) * 0.004 * a;
  vec3 c0 = tex(q);
  vec3 poster = floor(c0 * 5.0 + 0.5) / 5.0;
  vec2 e = vec2(1.5 / uCard.x, 1.5 / uCard.y);
  float gx = lumi(tex(q + vec2(e.x, 0.0))) - lumi(tex(q - vec2(e.x, 0.0)));
  float gy = lumi(tex(q + vec2(0.0, e.y))) - lumi(tex(q - vec2(0.0, e.y)));
  float ink = smoothstep(0.12, 0.3, length(vec2(gx, gy)));
  vec3 c = mix(c0, poster, 0.8 * a * uShare);
  c = mix(c, vec3(0.05), ink * 0.85 * a);
  vec2 hc = fract(px / 7.0) - 0.5;
  float dotr = (1.0 - lumi(c0)) * 0.55;
  c = mix(c, c * 0.6, (1.0 - smoothstep(dotr - 0.08, dotr, length(hc))) * smoothstep(0.55, 0.25, lumi(c0)) * 0.35 * a);
  // the impact: it grows as the pulse dies, and fades with it
  vec2 p = (cuv - vec2(0.5, 0.42)) * vec2(1.0, 1.4);
  float ang = atan(p.y, p.x), r = length(p);
  float spikes = 0.22 + 0.08 * step(0.5, fract(ang * 12.0 / 6.2832));
  float rad = spikes * (0.7 + 0.8 * (1.0 - tk));
  float burst = (1.0 - smoothstep(rad - 0.01, rad, r)) * step(0.03, tk) * min(1.0, tk * 2.5);
  float rim = burst * smoothstep(rad - 0.05, rad, r);
  c = mix(c, vec3(1.0, 0.88, 0.2), burst * 0.85);
  c = mix(c, vec3(1.0, 1.0, 0.95), burst * (1.0 - smoothstep(0.0, rad * 0.55, r)) * 0.9);
  c = mix(c, vec3(0.9, 0.15, 0.1), rim);
  float lines = step(0.85, hash(vec2(floor(ang * 30.0), 0.0))) * smoothstep(rad, rad * 1.25, r) * (1.0 - smoothstep(0.5, 0.75, r)) * tk;
  c = mix(c, vec3(0.05), lines * 0.8);
  finalColor = vec4(c * inside, inside);`);

// The mist (level 1: it shields from negative statuses; level 2, the turned wind: it sends them back).
// Layers of fog slide across the picture, thicker at the edges; at level 2 they swirl. A tick (a status
// stopped or sent back): the fog billows and thickens, then settles.
export const MIST = body(`
  float lv = clamp(uLevel, 1.0, 2.0) - 1.0;
  vec2 cc = cuv - 0.5;
  float ang = lv * (0.9 + 0.8 * tk) * (0.55 - length(cc)) * sin(t * 0.5) * 2.0;
  vec2 sw = vec2(cos(ang) * cc.x - sin(ang) * cc.y, sin(ang) * cc.x + cos(ang) * cc.y) + 0.5;
  float f1 = fbm(sw * vec2(3.0, 4.0) + vec2(t * 0.12, t * 0.03));
  float f2 = noise(sw * vec2(5.0, 3.5) - vec2(t * 0.09, -t * 0.05) + 4.0);
  float fog = smoothstep(0.35, 0.85, f1 * 0.65 + f2 * 0.45);
  float edgeFog = 1.0 - smoothstep(0.0, 0.35, edge);
  float dens = clamp(fog * (0.45 + 0.45 * tk) + edgeFog * 0.6, 0.0, 1.0) * a;
  vec3 c = tex(cuv + (vec2(f1, f2) - 0.5) * 0.01 * a);
  c = mix(c, c * vec3(0.9, 0.97, 1.05) + 0.03, 0.4 * a * uShare);
  vec3 fogc = mix(vec3(0.84, 0.88, 0.94), vec3(0.72, 0.84, 1.0), lv);
  c = mix(c, fogc, dens * 0.72);
  float ga = clamp(halo(d, uPad.x) * 0.65 * a * (0.55 + 0.45 * f1 + 0.6 * tk), 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(fogc * ga, ga));`);

// Rooted (enracinement, an Earth mechanic): roots climb from the bottom of the card and grip it, dark
// and knotted, with glints of moss; the picture takes an earthen tone. A tick (they hold the card): they
// tighten, creep higher, and the card darkens a moment.
export const ROOTS = body(`
  vec3 c = tex(cuv);
  c = mix(c, c * vec3(1.02, 0.95, 0.8) + vec3(0.03, 0.02, 0.0), 0.45 * a * uShare);
  float reach = (0.42 + 0.06 * clamp(uLevel, 1.0, 3.0)) * a + 0.1 * tk;
  float yy = 1.0 - cuv.y;
  float root = 0.0;
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    float x0 = 0.08 + fi * 0.168 + (hash(vec2(fi, 3.0)) - 0.5) * 0.06;
    float top = reach * (0.65 + 0.55 * hash(vec2(fi, 9.0)));
    float wig = (noise(vec2(yy * 5.0 + fi * 7.1, fi)) - 0.5) * 0.18 + sin(yy * 9.0 + fi) * 0.02;
    float w = 0.034 * (1.0 - yy / max(top, 0.001));
    float dx = abs(cuv.x - x0 - wig);
    root = max(root, (1.0 - smoothstep(w * 0.55, w, dx)) * step(0.0, w));
  }
  vec3 bark = vec3(0.23, 0.14, 0.07) * (0.65 + 0.7 * noise(cuv * vec2(40.0, 9.0)));
  c = mix(c, bark, root * 0.95);
  c += vec3(0.4, 0.8, 0.2) * root * pow(noise(cuv * 60.0 + 2.0), 6.0) * 1.4;
  c *= 1.0 - 0.25 * tk * a;
  finalColor = vec4(c * inside, inside);`);

// The insect mutation (levels 1 to 3): a beetle's carapace grows from the card's edges inward, a band
// of small domed scales with a green-gold thin-film sheen, its front glowing, a few claws reaching
// further in; a little deeper with each level, never over the picture's heart nor its numbers. Just
// beyond the front, veins of light pulse in the flesh. A level gained (tick): a wave runs inward from
// the edges and the seams flash. (November 2026: the plates covered the whole card.)
export const MUTATION = body(`
  float lv = clamp(uLevel, 1.0, 3.0);
  float n = fbm(cuv * vec2(5.0, 6.0) + 1.3);
  // the carapace's front: from the edges inward, with claws reaching further in, deeper each level
  float ang = atan(cuv.y - 0.5, cuv.x - 0.5);
  float claws = pow(noise(vec2(ang * 7.0, 2.7)), 4.0) * 0.06 * lv;
  float front = ((0.015 + 0.03 * lv) + claws + (n - 0.5) * 0.04) * a;
  float plate = 1.0 - smoothstep(front - 0.012, front, edge);
  // overlapping scales: cells, each one domed and lit from the top left
  vec2 v = vor(cuv * vec2(18.0, 24.0) + 0.7);
  float seam = v.y - v.x;
  float dome = smoothstep(0.0, 0.4, seam);
  // lit from the top left: the dome a little further toward the light (no derivatives: they do not
  // compile everywhere, OBS's browser among them, and the card then went black)
  vec2 v2 = vor(cuv * vec2(18.0, 24.0) + 0.7 - vec2(0.04, 0.04));
  float lit = clamp(0.55 + (dome - smoothstep(0.0, 0.4, v2.y - v2.x)) * 1.6, 0.0, 1.0);
  vec3 c = tex(cuv);
  // thin-film iridescence of a beetle's shell: green, teal, gold, a touch of violet
  float h = fract(dome * 0.9 + n * 0.8 + t * 0.06 + edge * 2.0);
  vec3 film = 0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.18, 0.42)));
  film = mix(vec3(0.25, 0.75, 0.2), film * vec3(0.8, 1.0, 0.6), 0.35);
  vec3 chitin = vec3(0.03, 0.05, 0.03) + film * (0.25 + 0.55 * lit) * (0.35 + 0.65 * dome);
  chitin += vec3(0.95, 1.0, 0.8) * pow(lit * dome, 8.0) * 0.6;
  chitin = mix(vec3(0.0, 0.02, 0.0), chitin, smoothstep(0.0, 0.05, seam));
  // the picture under the mutation: a little greener, more contrasted
  c = mix(c, pow(c, vec3(1.15)) * vec3(0.92, 1.06, 0.88), 0.45 * a * uShare);
  // veins of light in the flesh just beyond the front, pulsing inward
  float beyond = edge - front;
  float vn = 1.0 - abs(fbm(cuv * vec2(10.0, 13.0) + 4.0) * 2.0 - 1.0);
  float vein = pow(vn, 14.0) * (1.0 - smoothstep(0.0, 0.16, beyond)) * step(0.0, beyond);
  float pulse = 0.5 + 0.5 * sin(beyond * 60.0 - t * 3.0);
  c += vec3(0.45, 1.0, 0.3) * vein * (0.5 + 0.5 * pulse) * 0.8 * a;
  c = mix(c, chitin + c * 0.15, plate * 0.9);
  // the growing front glows
  float rim = exp(-abs(beyond) / 0.006) * a * (0.55 + 0.25 * sin(t * 2.4 + ang * 3.0));
  c += vec3(0.5, 1.0, 0.25) * rim * 0.9;
  // a level gained (tick): a wave runs inward from the edges, the seams flash
  float wave = exp(-pow((edge - front - (1.0 - tk) * 0.35) / 0.03, 2.0)) * tk;
  c += vec3(0.6, 1.0, 0.4) * wave * 1.2;
  c += vec3(0.7, 1.0, 0.5) * plate * (1.0 - smoothstep(0.0, 0.06, seam)) * tk * 1.5;
  float ga = clamp(halo(d, uPad.x * 0.5) * 0.35 * a * (0.7 + tk), 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(0.45, 0.9, 0.25) * ga, ga));`);

// The molt (mue): the old skin loosens. A pale shell of the picture lifts off it, a little larger, its
// seams cracking dark; under it the picture is raw and pinkish. A tick (the molt is done): the shell
// splits along the seams and fades away.
export const MOLT = body(`
  float lift = (0.012 + 0.05 * tk) * a;
  vec2 sc = (cuv - 0.5) * (1.0 - 0.03 * a - 0.06 * tk) + 0.5 + vec2(0.0, -lift);
  vec3 under = tex(cuv);
  under = mix(under, under * vec3(1.1, 0.95, 0.92) + 0.05, 0.4 * a * uShare);
  vec3 shell = tex(sc);
  shell = mix(vec3(lumi(shell)), vec3(0.95, 0.92, 0.8), 0.45) * 1.05;
  vec2 v = vor(cuv * vec2(4.0, 5.5));
  float seam = 1.0 - smoothstep(0.0, 0.03 + 0.08 * tk, v.y - v.x);
  float sheet = (1.0 - seam) * (0.36 - 0.3 * tk) * a;
  vec3 c = mix(under, shell, sheet);
  c = mix(c, vec3(0.2, 0.15, 0.1), seam * 0.6 * a);
  c += vec3(1.0) * pow(max(0.0, sin((cuv.x + cuv.y) * 9.0 - t * 0.7)), 18.0) * sheet * 0.4;
  finalColor = vec4(c * inside, inside);`);

// Electric charges (volt, current, overload): thin arcs crawl along the card's edge, one more ring with
// each charge (uLevel), their path redrawn twelve times a second; a static shimmer in the picture. A
// discharge (tick): arcs everywhere, a bolt across the picture, a white-blue flash.
export const VOLT = body(`
  vec3 c = tex(cuv + (hash(floor(cuv * 60.0) + floor(t * 20.0)) - 0.5) * 0.003 * tk);
  c = mix(c, c * vec3(0.9, 0.97, 1.12) + vec3(0.0, 0.02, 0.06), 0.4 * a * uShare);
  float lv = clamp(uLevel, 1.0, 5.0);
  float tt = floor(t * 12.0);
  float ang = atan(cuv.y - 0.5, cuv.x - 0.5);
  float arcs = 0.0;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float j = (noise(vec2(cuv.x * 20.0 + cuv.y * 14.0, tt + fi * 11.0)) - 0.5) * 0.08;
    float band = abs(edge - 0.05 - fi * 0.05 - j);
    float on = step(fi, lv - 1.0 + tk * 3.0);
    float gaps = step(0.5 - 0.3 * tk, noise(vec2(ang * 3.0 + fi * 5.0, tt)));
    arcs += (1.0 - smoothstep(0.0, 0.006, band)) * on * gaps;
  }
  float bolt = abs(cuv.x - 0.5 - (fbm(vec2(cuv.y * 6.0, floor(t * 14.0))) - 0.5) * 0.6);
  arcs += (1.0 - smoothstep(0.0, 0.008, bolt)) * step(0.15, tk) * tk;
  arcs = min(arcs, 1.5) * a;
  c += vec3(0.55, 0.8, 1.0) * arcs * 1.6 + vec3(1.0) * arcs * 0.6;
  c += vec3(0.6, 0.8, 1.0) * tk * 0.35 * a;
  float ga = clamp(halo(d, uPad.x * 0.7) * (0.3 + 0.12 * lv) * a * (0.7 + 0.3 * noise(vec2(t * 9.0, 0.0)) + tk), 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(0.5, 0.75, 1.0) * ga, ga));`);

// Under control (the threads: the puppeteer holds the card). It hangs and sways from above like a
// puppet, its colour turns to violet and varnished wood, two dark joints cross it. A tick (the
// puppeteer pays for it): a jerk of the strings.
export const PUPPET = body(`
  float sway = sin(t * 1.6) * 0.02 * a + sin(t * 9.0) * 0.012 * tk;
  vec2 o = vec2(0.5, -0.2), q = cuv - o;
  float s = sin(sway), co = cos(sway);
  q = vec2(co * q.x - s * q.y, s * q.x + co * q.y) + o;
  q.y -= 0.01 * tk * sin(t * 25.0);
  vec3 c = tex(q);
  float l = lumi(c);
  vec3 wood = vec3(l * 0.95 + 0.05, l * 0.72, l * 1.05 + 0.07);
  c = mix(c, wood, 0.6 * a * uShare);
  c += vec3(1.0) * pow(max(0.0, sin((q.x * 0.4 + q.y) * 7.0 + 1.0)), 30.0) * 0.18 * a;
  float seam = (1.0 - smoothstep(0.0, 0.004, abs(q.y - 0.38))) + (1.0 - smoothstep(0.0, 0.004, abs(q.y - 0.66)));
  c = mix(c, vec3(0.12, 0.05, 0.15), seam * 0.7 * a);
  c += vec3(0.7, 0.3, 1.0) * tk * 0.25 * a;
  float ga = clamp(halo(d, uPad.x * 0.8) * 0.5 * a * (1.0 + tk), 0.0, 1.0);
  finalColor = over(vec4(c * inside, inside), vec4(vec3(0.6, 0.25, 0.95) * ga, ga));`);
