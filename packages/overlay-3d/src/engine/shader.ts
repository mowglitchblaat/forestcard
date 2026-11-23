// Shader plumbing for Pixi 8 (WebGL, GLSL ES 3). Two ways to put a shader on screen:
// - a FILTER reworks pixels that already exist (the card back, the frame metal). Its coordinates span
//   the filtered object's visible area: if the object is cut by the screen edge, that area shrinks;
// - a MESH generates pixels on a quad of its own (aura, sheen). Its coordinates belong to the quad,
//   whatever part of it is visible. Anything centred on a card is a mesh.
// Uniforms are written from a values object ({ uTime: 0, uOrigin: [x, y] }): declared in GLSL for you,
// typed as f32 / vecN<f32> for Pixi, read and written through `u`.

import { Filter, Geometry, GlProgram, Mesh, Shader, type BLEND_MODES } from 'pixi.js';
import { destroyWith } from './dispose.ts';
import { shaderDefines } from '../config/quality.ts';

export type UniformValue = number | readonly number[];
export type UniformValues = Readonly<Record<string, UniformValue>>;
type UniformStore = Record<string, number | Float32Array>;

// Filter vertex shader (Pixi 8 default) + vLocal: the pixel's position across the filtered object, 0..1.
const FILTER_VERTEX = `in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vLocal;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  vLocal = aPosition;
}`;

// Mesh vertex shader: vUV runs 0..1 across the quad.
const MESH_VERTEX = `in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main(void) {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

// Noise and colour helpers available to every fragment body.
const LIB = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 17.31)); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
#ifndef FBM_OCT
#define FBM_OCT 5
#endif
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < FBM_OCT; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
`;

const glslType = (v: UniformValue) => (typeof v === 'number' ? 'float' : `vec${v.length}`);
const pixiType = (v: UniformValue) => (typeof v === 'number' ? 'f32' : `vec${v.length}<f32>`);
const declare = (values: UniformValues) =>
  Object.entries(values)
    .map(([k, v]) => `uniform ${glslType(v)} ${k};`)
    .join('\n');
const store = (v: UniformValue) => (typeof v === 'number' ? v : new Float32Array(v));
function resources(values: UniformValues) {
  const group: Record<string, { value: number | Float32Array; type: string }> = {};
  for (const [k, v] of Object.entries(values)) group[k] = { value: store(v), type: pixiType(v) };
  return group;
}

// A shader's uniforms, typed after the values it was created with.
export type Uniforms<V extends UniformValues> = {
  [K in keyof V]: V[K] extends number ? number : Float32Array;
};
export type ShaderHandle<V extends UniformValues> = {
  u: Uniforms<V>;
  set<K extends keyof V & string>(name: K, value: V[K]): void;
};
const handle = <V extends UniformValues>(u: UniformStore): ShaderHandle<V> => ({
  u: u as Uniforms<V>,
  set: (name, value) => {
    u[name] = store(value as UniformValue);
  },
});

/**
 * A filter from a fragment body (`void main(void) { ... }`). Inputs: vTextureCoord, vLocal, uTexture;
 * output: finalColor. With `textureHelpers`, the body may also use uInputSize / uOutputFrame / uInputClamp,
 * toTex(d) (a fraction of the object -> a texture offset) and sampleAt(uv) (sampling clamped to the input).
 * The fragment declares `precision highp float`: it may read uniforms the vertex stage declares too, and a
 * precision mismatch between stages stops the program from linking (the object then disappears, silently).
 */
export function makeFilter<V extends UniformValues>(
  name: string,
  body: string,
  values: V,
  { blend, textureHelpers = false }: { blend?: BLEND_MODES; textureHelpers?: boolean } = {},
): ShaderHandle<V> & { filter: Filter } {
  const fragment = `precision highp float;
${shaderDefines()}in vec2 vTextureCoord;
in vec2 vLocal;
out vec4 finalColor;
uniform sampler2D uTexture;
${textureHelpers ? 'uniform vec4 uInputSize;\nuniform vec4 uOutputFrame;\nuniform vec4 uInputClamp;' : ''}
${declare(values)}
${LIB}
${textureHelpers ? 'vec2 toTex(vec2 d) { return d * uOutputFrame.zw * uInputSize.zw; }\nvec4 sampleAt(vec2 uv) { return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)); }' : ''}
${body}`;
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment, name }),
    resources: { params: resources(values) },
    padding: 0,
  });
  if (blend) filter.blendMode = blend;
  return { filter, ...handle<V>(filter.resources.params.uniforms as UniformStore) };
}

const quad = (positions: number[]) =>
  new Geometry({
    attributes: { aPosition: positions, aUV: [0, 0, 1, 0, 1, 1, 0, 1] },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  });
let centred: Geometry | null = null,
  corner: Geometry | null = null;
// quad centred on (0,0), side 1: scale it to the size needed, position it on its centre
export const centredQuad = (): Geometry =>
  (centred ??= quad([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]));
// quad from (0,0) to (1,1): scale it to a card's W x H to cover the card
export const cornerQuad = (): Geometry => (corner ??= quad([0, 0, 1, 0, 1, 1, 0, 1]));

/**
 * A mesh drawn by its own shader. Input: vUV (0..1 across the quad); output: finalColor. Its light is
 * added (blend 'add') unless told otherwise. Avoid a uniform named uColor: Pixi already declares one
 * for every mesh (its tint).
 */
export function makeMesh<V extends UniformValues>(
  name: string,
  body: string,
  values: V,
  { geometry = centredQuad(), blend = 'add' }: { geometry?: Geometry; blend?: BLEND_MODES } = {},
): ShaderHandle<V> & { mesh: Mesh<Geometry, Shader> } {
  const fragment = `precision highp float;
${shaderDefines()}in vec2 vUV;
out vec4 finalColor;
${declare(values)}
${LIB}
${body}`;
  const shader = Shader.from({
    gl: { vertex: MESH_VERTEX, fragment, name },
    resources: { params: resources(values) },
  });
  const mesh = new Mesh({ geometry, shader });
  destroyWith(mesh, shader);
  mesh.blendMode = blend;
  return { mesh, ...handle<V>(shader.resources.params.uniforms as UniformStore) };
}
