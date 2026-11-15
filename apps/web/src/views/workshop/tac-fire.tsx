// TAC-002 on fire: one WebGL scene over the machine's portrait, drawn only while the fire burns and
// smokes. It redraws the portrait itself, so that the fire can act on it: the hot air above the jet
// bends the picture behind (heat haze), the burst pushes a ring of air out of the mouth (shockwave),
// the flames light the metal around the cannon, flickering with them. Then the jet, in layers: a wide
// soft glow, the fire itself (domain-warped turbulence, ragged tongues, its colour by temperature), a
// blue-white dart leaving the mouth, embers streaking along it. When it stops, the flame dies in a
// blink and thick smoke billows out of the mouth, rolls, rises and thins out.
// Geometry, in the portrait's pixels (1402 × 1122): the canvas spans x 0..2300, y -320..1180 (room
// for the jet and its smoke past the picture's edge); the mouth is at 1160 × 150, the jet runs 900 px,
// 14° down, along the barrel's axis. Without WebGL, nothing is drawn (the portrait stays as it is).

import { useEffect, useRef } from 'react';
import tacArt from './art/tac-002.webp';

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos; gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uImage;
uniform vec2 uRes;       // canvas size, px
uniform vec4 uImgRect;   // the machine's picture in the canvas: x, y (top-left), w, h, px
uniform vec2 uMouth;     // the cannon's mouth, px
uniform float uAngle;    // the jet's direction, radians (clockwise, y down)
uniform float uLen;      // the jet's length, px
uniform float uRadius;   // the picture's corner radius, px
uniform float uTime;     // s since the fire came on
uniform float uGrow;     // 0 -> 1 as the jet bursts out
uniform float uEnd;      // s since the fire stopped, -1 while it burns

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), w.x), w.y);
}
const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = ROT * p * 2.02 + 1.7; a *= 0.5; } return v; }
float ridged(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * (1.0 - abs(noise(p) * 2.0 - 1.0)); p = ROT * p * 2.1 + 3.3; a *= 0.5; } return v; }
vec3 fireColour(float k) {
  vec3 c = mix(vec3(0.3, 0.02, 0.0), vec3(0.95, 0.2, 0.0), smoothstep(0.0, 0.3, k));
  c = mix(c, vec3(1.0, 0.55, 0.06), smoothstep(0.28, 0.55, k));
  c = mix(c, vec3(1.0, 0.84, 0.42), smoothstep(0.52, 0.78, k));
  return mix(c, vec3(1.0, 0.98, 0.94), smoothstep(0.78, 1.0, k));
}
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

// the fire at a point of the jet (u along, 0 at the mouth; v across, in jet lengths): density, temperature
vec2 jet(float u, float v, float t, float reach, float widen, float speed) {
  float halfW = mix(0.055, 0.2, pow(max(u, 0.0), 0.7)) * widen;
  float flow = u * 2.4 - t * speed * (1.0 - u * 0.4);
  vec2 w = vec2(fbm(vec2(flow * 1.2, v * 4.0 + t * 0.4)), fbm(vec2(flow * 1.2 + 9.0, v * 4.0 - t * 0.3))) - 0.5;
  float bend = w.y * 0.1 * u - u * u * 0.03;
  float x = (v - bend) / halfW;
  vec2 q = vec2(flow * 2.0, x * 1.4) + w * 1.6;
  float tongues = ridged(q * vec2(1.0, 1.3));
  float along = (1.0 - smoothstep(reach - 0.35, reach, u)) * smoothstep(-0.02, 0.02, u);
  float edge = 1.0 - smoothstep(0.25, 1.0, abs(x) + (0.55 - tongues) * (0.6 + 0.7 * u));
  float dens = edge * along * (0.75 + 0.45 * fbm(q * 2.5 + t * 0.5));
  float k = dens * (1.05 - 0.7 * u) * (1.0 - 0.35 * abs(x)) * (0.75 + 0.5 * tongues);
  return vec2(dens, k);
}

void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  float t = uTime;
  float after = max(uEnd, 0.0);
  float burning = uEnd < 0.0 ? 1.0 : 1.0 - smoothstep(0.0, 0.35, after);
  // the jet's frame
  vec2 d = px - uMouth;
  float ca = cos(uAngle), sa = sin(uAngle);
  vec2 j = vec2(d.x * ca + d.y * sa, -d.x * sa + d.y * ca) / uLen; // j.x along, j.y across (down +)
  float reach = uGrow * 1.02;

  // HEAT HAZE: the air above and around the jet wavers, bending the picture behind it
  float hazeZone = smoothstep(-0.05, 0.1, j.x) * (1.0 - smoothstep(0.2, 0.6, abs(j.y + 0.06) / (0.12 + j.x * 0.4)))
    * (1.0 - smoothstep(reach * 0.8, reach * 1.1, j.x)) * burning * uGrow;
  vec2 haze = (vec2(fbm(px * 0.035 + vec2(0.0, t * 3.0)), fbm(px * 0.035 + vec2(5.0, t * 3.0))) - 0.5) * 9.0 * hazeZone;
  // SHOCKWAVE: the burst pushes a ring of air out of the mouth
  float ring = length(d) / uLen - t * 1.6;
  float shock = exp(-pow(ring * 14.0, 2.0)) * (1.0 - smoothstep(0.0, 0.45, t)) * step(uEnd, 0.0);
  vec2 push = normalize(d + 0.001) * shock * 10.0;

  // the picture, bent, with its rounded corners
  vec2 ip = px + haze - push;
  vec2 iuv = (ip - uImgRect.xy) / uImgRect.zw;
  float inImg = 1.0 - smoothstep(-0.5, 0.5, sdBox(px - uImgRect.xy - uImgRect.zw * 0.5, uImgRect.zw * 0.5, uRadius));
  vec3 pic = texture(uImage, clamp(iuv, 0.0, 1.0)).rgb;
  // LIGHT: the fire lights the metal around the mouth, flickering with it
  float flick = 0.75 + 0.25 * noise(vec2(t * 9.0, 0.0)) + 0.15 * sin(t * 31.0);
  float lit = exp(-length(d) / (uLen * 0.6)) * flick * burning * uGrow;
  float lum = dot(pic, vec3(0.3, 0.59, 0.11));
  pic += vec3(1.0, 0.45, 0.12) * lit * (0.3 + 1.8 * lum) * 1.3;
  vec4 col = vec4(pic * inImg, inImg);

  // THE JET, in layers
  if (j.x > -0.05 && j.x < 1.1 && abs(j.y) < 0.45) {
    // a wide soft glow under everything
    vec2 glow = jet(j.x, j.y, t, reach, 1.5, 2.0);
    vec3 glowC = vec3(1.0, 0.5, 0.12) * smoothstep(0.1, 0.9, glow.x) * 0.3;
    // the main fire
    vec2 f = jet(j.x, j.y, t, reach, 1.0, 2.8);
    float a = smoothstep(0.03, 0.3, f.x);
    vec3 fire = fireColour(clamp(f.y, 0.0, 1.0));
    // the core: a thin blue-white dart leaving the mouth
    float core = exp(-pow(j.y / (0.02 + j.x * 0.05), 2.0)) * (1.0 - smoothstep(0.0, 0.22, j.x)) * smoothstep(-0.01, 0.01, j.x) * uGrow;
    vec3 coreC = mix(vec3(0.55, 0.75, 1.0), vec3(1.0), 0.6) * core * 1.2;
    // embers streaking along the jet
    vec2 ec = vec2((j.x * 2.4 - t * 2.4) * 6.0, j.y * 45.0);
    vec2 cell = floor(ec);
    vec2 o = vec2(hash(cell), hash(cell + 3.7));
    vec2 r = fract(ec) - o; r.x *= 0.25;
    float ember = (1.0 - smoothstep(0.0, 0.1, length(r))) * step(0.94, hash(cell + 9.1)) * exp(-pow(j.y / (0.05 + 0.18 * j.x), 2.0)) * smoothstep(0.08, 0.3, j.x) * (1.0 - smoothstep(reach, reach + 0.1, j.x));
    vec3 add = (glowC + coreC + vec3(1.0, 0.8, 0.4) * ember * 2.0) * burning;
    col.rgb = col.rgb * (1.0 - a * burning) + fire * a * burning + add;
    col.a = clamp(max(col.a, a * burning) + dot(add, vec3(0.33)) * 0.35, 0.0, 1.0);
  }

  // SMOKE once the fire stops: it billows out of the mouth, rolls, rises and thins
  if (uEnd >= 0.0) {
    float puff = smoothstep(0.0, 0.3, after) * (1.0 - smoothstep(1.8, 3.2, after));
    float sy = j.y + (after * 0.07 + j.x * 0.1);
    float spread = mix(0.07, 0.3 * (1.0 + after * 0.8), pow(max(j.x, 0.0), 0.8));
    float travel = 0.3 + after * 0.5;
    float billow = fbm(vec2(j.x * 3.5 - after * 1.3 - t * 0.2, sy * 7.0 + t * 0.35));
    float roll = fbm(vec2(j.x * 7.0 - after * 2.0, sy * 12.0) + billow * 2.0);
    float plume = (1.0 - smoothstep(0.35, 1.0, abs(sy) / spread)) * (1.0 - smoothstep(travel - 0.25, travel, j.x))
      * smoothstep(0.2, 0.6, billow) * puff * smoothstep(0.0, 0.08, j.x);
    vec3 grey = mix(vec3(0.55, 0.32, 0.2), vec3(0.36, 0.34, 0.33), smoothstep(0.0, 0.25, j.x + after * 0.3)) * (0.75 + 0.5 * roll);
    float pa = plume * 0.9;
    col.rgb = col.rgb * (1.0 - pa) + grey * pa;
    col.a = clamp(col.a + pa * (1.0 - col.a), 0.0, 1.0);
  }
  // soft edges of the canvas, out of the picture
  float frame = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.08, 1.0 - vUv.x) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(0.0, 0.1, 1.0 - vUv.y);
  col *= mix(frame, 1.0, inImg);
  outColor = col;
}`;

const ART = { w: 1402, h: 1122 };
export const FIRE_BOX = { x: 0, y: -320, w: 2300, h: 1500 };
const MOUTH = { x: 1160, y: 150 };
const JET = { length: 900, angle: (14 * Math.PI) / 180 };
const BURST_S = 0.35;
const SMOKE_S = 3.3;

function compile(gl: WebGL2RenderingContext): WebGLProgram | null {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    gl.attachShader(program, shader);
  }
  gl.bindAttribLocation(program, 0, 'aPos');
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

type Run = { start: number; end: number; frame: number; draw: ((now: number) => void) | null };

// `burning`: the fire is on. Each time it comes on, the jet bursts out again; when it goes off, the
// smoke plays, then the canvas is cleared and nothing more is drawn until the next time.
export function TacFire({ burning, className }: { burning: boolean; className: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef<Run>({ start: 0, end: -1, frame: 0, draw: null });
  useEffect(() => {
    const el = canvas.current;
    const gl = el?.getContext('webgl2', { premultipliedAlpha: true, alpha: true });
    if (!el || !gl) return;
    const program = compile(gl);
    if (!program) return;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);
    const texture = gl.createTexture();
    let ready = false;
    const image = new Image();
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      ready = true;
    };
    image.src = tacArt;
    const u = (name: string) => gl.getUniformLocation(program, name);
    const uniforms = {
      res: u('uRes'),
      rect: u('uImgRect'),
      mouth: u('uMouth'),
      angle: u('uAngle'),
      len: u('uLen'),
      radius: u('uRadius'),
      time: u('uTime'),
      grow: u('uGrow'),
      end: u('uEnd'),
    };
    const r = run.current;
    r.draw = (now: number) => {
      const dpr = Math.min(devicePixelRatio, 1.5);
      const width = Math.round(el.clientWidth * dpr);
      const height = Math.round(el.clientHeight * dpr);
      if (el.width !== width || el.height !== height) {
        el.width = width;
        el.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const after = r.end < 0 ? -1 : (now - r.end) / 1000;
      if (after > SMOKE_S) {
        r.frame = 0; // done: the canvas stays clear until the fire comes on again
        return;
      }
      if (ready) {
        // canvas pixels per portrait pixel
        const s = width / FIRE_BOX.w;
        const t = (now - r.start) / 1000;
        const grow = Math.min(1, t / BURST_S);
        gl.uniform2f(uniforms.res, width, height);
        gl.uniform4f(uniforms.rect, -FIRE_BOX.x * s, -FIRE_BOX.y * s, ART.w * s, ART.h * s);
        gl.uniform2f(uniforms.mouth, (MOUTH.x - FIRE_BOX.x) * s, (MOUTH.y - FIRE_BOX.y) * s);
        gl.uniform1f(uniforms.angle, JET.angle);
        gl.uniform1f(uniforms.len, JET.length * s);
        gl.uniform1f(uniforms.radius, 16 * dpr);
        gl.uniform1f(uniforms.time, t);
        gl.uniform1f(uniforms.grow, 1 - (1 - grow) ** 3);
        gl.uniform1f(uniforms.end, after);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      r.frame = requestAnimationFrame((n) => r.draw?.(n));
    };
    return () => {
      cancelAnimationFrame(r.frame);
      r.frame = 0;
      r.draw = null;
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
    };
  }, []);
  useEffect(() => {
    const r = run.current;
    const now = performance.now();
    if (burning) {
      r.start = now;
      r.end = -1;
    } else if (r.start && r.end < 0) r.end = now;
    else return;
    if (!r.frame && r.draw) r.frame = requestAnimationFrame((n) => r.draw?.(n));
  }, [burning]);
  return <canvas ref={canvas} className={className} aria-hidden />;
}
