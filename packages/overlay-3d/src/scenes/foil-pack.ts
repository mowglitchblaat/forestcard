// The booster's pack as a foil object: its image on a subdivided sheet that the vertex shader puffs up
// like a real sachet (domed in the middle, flat on the top and bottom seals), turned in 3D and seen in
// perspective; the fragment shader lights it per pixel, from the sheet's normal plus a crinkle of the
// foil, so the highlights slide and break on the folds as the pack shakes. Nothing is drawn behind it.
// Two meshes share the sheet: the body keeps what lies below the tear line, the flap what lies above.
// The tear line is jagged (noise, a new seed per pack); the flap folds back around it, showing the foil's
// silver inside, then flies off.
// Coordinates: pack pixels, (0,0) at the pack's top left, z towards the viewer.

import { Container, Geometry, Mesh, Shader, type Texture } from 'pixi.js';
import { destroyWith } from '../engine/dispose.ts';
import { shaderDefines } from '../config/quality.ts';

const COLS = 30,
  ROWS = 45;

const VERTEX = `in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec3 vNormal;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec2 uPack;
uniform float uPuff;
uniform float uHinge;
uniform float uFold;
uniform vec2 uTurn;
uniform float uPersp;
uniform vec2 uLift;

const float PI = 3.14159265;
// the sachet's dome: 0 on the seals and the sides, 1 in the middle
float dome(vec2 uv) {
  float sx = pow(sin(PI * clamp(uv.x, 0.0, 1.0)), 0.7);
  float sy = smoothstep(0.03, 0.15, uv.y) * smoothstep(0.97, 0.85, uv.y);
  return sx * sy;
}
vec3 place(vec2 p, vec2 uv) {
  vec3 q = vec3(p - uPack * 0.5, uPuff * uPack.y * dome(uv));
  // the flap folds back around the tear line (rotation about the horizontal axis through it)
  float hy = uHinge - uPack.y * 0.5;
  if (q.y < hy) {
    float dy = q.y - hy, c = cos(uFold), s = sin(uFold);
    q = vec3(q.x, hy + dy * c - q.z * s, dy * s + q.z * c);
    q.xy += uLift;
  }
  // the whole pack turns: yaw about the vertical axis, then pitch about the horizontal one
  float cy = cos(uTurn.x), sy = sin(uTurn.x);
  q = vec3(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy);
  float cp = cos(uTurn.y), sp = sin(uTurn.y);
  q = vec3(q.x, q.y * cp - q.z * sp, q.y * sp + q.z * cp);
  return q;
}
vec2 project(vec3 q) {
  float d = uPersp * uPack.y;
  return q.xy * (d / (d - q.z)) + uPack * 0.5;
}
void main(void) {
  vec3 q = place(aPosition, aUV);
  // the normal from two neighbouring points of the same deformed sheet
  vec2 e = vec2(0.004, 0.0);
  vec3 qx = place(aPosition + e.xy * uPack, aUV + e.xy);
  vec3 qy = place(aPosition + e.yx * uPack, aUV + e.yx);
  vNormal = normalize(cross(qx - q, qy - q));
  vUV = aUV;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(project(q), 1.0)).xy, 0.0, 1.0);
}`;

const FRAGMENT = `precision highp float;
in vec2 vUV;
in vec3 vNormal;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uSide;
uniform vec4 uFrame;
uniform float uHingeV;
uniform float uTearAmp;
uniform float uSeed;
uniform float uCrinkle;
uniform float uAlpha;
uniform float uFibre;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
#ifndef FBM_OCT
#define FBM_OCT 5
#endif
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < FBM_OCT; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

void main(void) {
  // the jagged tear line: a slow wander plus fine teeth
  float tear = uHingeV
    + uTearAmp * (fbm(vec2(vUV.x * 6.0 + uSeed, uSeed)) - 0.5) * 2.0
    + uTearAmp * 0.4 * (noise(vec2(vUV.x * 120.0, uSeed)) - 0.5);
  if (uSide < 0.5 ? vUV.y < tear : vUV.y > tear) discard;
  // crinkles: the normal bent by the slope of a noise height field. The pressure keeps the middle
  // taut: the creases gather near the seals and the sides, where the foil is gathered.
  vec2 p = vUV * vec2(5.0, 8.0) + uSeed;
  float h0 = fbm(p), hx = fbm(p + vec2(0.015, 0.0)), hy = fbm(p + vec2(0.0, 0.015));
  float edgeX = 1.0 - smoothstep(0.0, 0.22, min(vUV.x, 1.0 - vUV.x));
  float edgeY = 1.0 - smoothstep(0.04, 0.2, min(vUV.y, 1.0 - vUV.y));
  float gather = 0.15 + 0.85 * max(edgeX, edgeY);
  vec3 n = normalize(vNormal + uCrinkle * gather * vec3(h0 - hx, h0 - hy, 0.0) * 40.0);
  // the inside of the foil, once the flap has turned past edge-on
  bool inside = n.z < 0.0;
  if (inside) n = -n;
  // the face's frame in its source (an image trimmed of its transparent margins: engine/trim.ts)
  vec4 tex = texture(uTexture, uFrame.xy + vUV * uFrame.zw);
  float a = inside ? 1.0 : tex.a;
  vec3 base = inside ? vec3(0.70, 0.72, 0.76) : (tex.a > 0.0 ? tex.rgb / tex.a : tex.rgb);
  // one light, up left and in front; the viewer straight ahead
  vec3 L = normalize(vec3(-0.45, -0.6, 0.66));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float diffuse = max(dot(n, L), 0.0);
  float nh = max(dot(n, H), 0.0);
  float metal = inside ? 1.0 : 0.65;
  vec3 col = base * (0.72 + 0.38 * diffuse)
    + mix(vec3(1.0), base, 0.3) * (pow(nh, 60.0) * 0.85 + pow(nh, 12.0) * 0.15) * metal;
  // the torn edge: pale foil fibres along the tear, once it opens (whole, the line does not show)
  float fibre = (1.0 - smoothstep(0.0, 0.005, abs(vUV.y - tear))) * uFibre;
  col = mix(col, vec3(0.93, 0.93, 0.95), fibre * 0.85);
  finalColor = vec4(col * a, a) * uAlpha;
}`;

// The texture's frame in its source, normalised: x, y, width, height.
const frameOf = (t: Texture) =>
  new Float32Array([
    t.frame.x / t.source.width,
    t.frame.y / t.source.height,
    t.frame.width / t.source.width,
    t.frame.height / t.source.height,
  ]);

function sheet(pw: number, ph: number): Geometry {
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  for (let j = 0; j <= ROWS; j++)
    for (let i = 0; i <= COLS; i++) {
      const u = i / COLS,
        v = j / ROWS;
      pos.push(u * pw, v * ph);
      uv.push(u, v);
    }
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      const a = j * (COLS + 1) + i,
        b = a + 1,
        c = a + COLS + 1,
        d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  return new Geometry({ attributes: { aPosition: pos, aUV: uv }, indexBuffer: idx });
}

// What the scene animates. All shared by both meshes except the flap's fold and lift.
export type FoilPackState = {
  puff: number; // dome height, in pack heights
  turn: [number, number]; // yaw, pitch (rad)
  crinkle: number;
  fold: number; // flap fold angle (rad), 0 = flat
  lift: [number, number]; // flap offset (px)
  flapAlpha: number;
};

export type FoilPack = {
  readonly root: Container;
  readonly state: FoilPackState;
  /** writes `state` into the shaders: call after changing it */
  update(): void;
  /** the flap is gone: stop drawing it */
  dropFlap(): void;
};

/**
 * `texture`: the pack's face (the booster image, or the generic pack rendered to a texture).
 * `cut`: the tear line's height from the top (px); `tearAmp`: its jag, in pack heights.
 */
export function foilPack(
  texture: Texture,
  o: { pw: number; ph: number; cut: number; tearAmp: number; perspective: number },
): FoilPack {
  const geometry = sheet(o.pw, o.ph);
  const seed = Math.random() * 50;
  const make = (side: 0 | 1) => {
    const shader = Shader.from({
      gl: { vertex: VERTEX, fragment: FRAGMENT.replace('precision highp float;\n', `precision highp float;\n${shaderDefines()}`), name: 'foil-pack' },
      resources: {
        uTexture: texture.source,
        params: {
          uPack: { value: new Float32Array([o.pw, o.ph]), type: 'vec2<f32>' },
          uPuff: { value: 0, type: 'f32' },
          // the fold's axis, just under the tear's lowest teeth: the whole flap turns with it
          uHinge: { value: o.cut + o.tearAmp * 1.3 * o.ph, type: 'f32' },
          uFold: { value: 0, type: 'f32' },
          uTurn: { value: new Float32Array(2), type: 'vec2<f32>' },
          uPersp: { value: o.perspective, type: 'f32' },
          uLift: { value: new Float32Array(2), type: 'vec2<f32>' },
          uSide: { value: side, type: 'f32' },
          uFrame: { value: frameOf(texture), type: 'vec4<f32>' },
          uHingeV: { value: o.cut / o.ph, type: 'f32' },
          uTearAmp: { value: o.tearAmp, type: 'f32' },
          uSeed: { value: seed, type: 'f32' },
          uCrinkle: { value: 0, type: 'f32' },
          uAlpha: { value: 1, type: 'f32' },
          uFibre: { value: 0, type: 'f32' },
        },
      },
    });
    const mesh = new Mesh({ geometry, shader });
    // its bind group keeps the pack's image, unloaded after the scene (card/texture-store.ts)
    destroyWith(mesh, shader);
    return { mesh, u: shader.resources.params.uniforms as Record<string, number | Float32Array> };
  };
  const body = make(0),
    flap = make(1);
  const root = new Container({ label: 'foil-pack' });
  root.addChild(body.mesh, flap.mesh);
  const state: FoilPackState = {
    puff: 0,
    turn: [0, 0],
    crinkle: 0,
    fold: 0,
    lift: [0, 0],
    flapAlpha: 1,
  };
  const write = (u: Record<string, number | Float32Array>, isFlap: boolean) => {
    u.uPuff = state.puff;
    u.uCrinkle = state.crinkle;
    (u.uTurn as Float32Array).set(state.turn);
    u.uFold = isFlap ? state.fold : 0;
    (u.uLift as Float32Array).set(isFlap ? state.lift : [0, 0]);
    u.uAlpha = isFlap ? state.flapAlpha : 1;
    u.uFibre = Math.min(1, state.fold * 3);
  };
  let flapAlive = true;
  const update = () => {
    write(body.u, false);
    if (flapAlive) write(flap.u, true);
  };
  update();
  root.on('destroyed', () => geometry.destroy());
  return {
    root,
    state,
    update,
    dropFlap() {
      if (!flapAlive) return;
      flapAlive = false;
      flap.mesh.destroy();
    },
  };
}
