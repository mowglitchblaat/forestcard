// TAC-002's jet of fire: a flame drawn live by a small WebGL shader (no picture), so it is never twice
// the same. It bursts out of the cannon's mouth (its length grows in a fraction of a second), then
// roars: ragged tongues streaming away from the mouth, a white-hot core cooling to yellow, orange and
// red, smoke rising off its end, embers torn from it; when it stops, thick smoke billows out of the
// mouth. The canvas covers the jet's box; its left edge's middle is the mouth. Without WebGL, nothing
// shows (the machine still works).

import { useEffect, useRef } from 'react';

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos; gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;

// u runs along the jet (0 at the mouth), v across it (0 in the middle). uGrow: how far the jet has
// come out (0 -> 1 as it bursts); uTime in seconds. The fire is a cone of turbulence pushed out of the
// mouth: domain-warped noise bends it, ridged noise cuts its tongues, its temperature (hottest at the
// mouth and in the core) gives its colour; smoke rises off its far half, embers fly along it.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uTime;
uniform float uGrow;
uniform float uAspect;
uniform float uEnd;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), w.x), w.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; mat2 r = mat2(0.8, 0.6, -0.6, 0.8); for (int i = 0; i < 6; i++) { v += a * noise(p); p = r * p * 2.02 + 1.7; a *= 0.5; } return v; }
// ridged: sharp creases, the flame's tongues
float ridged(vec2 p) { float v = 0.0, a = 0.5; mat2 r = mat2(0.8, 0.6, -0.6, 0.8); for (int i = 0; i < 5; i++) { v += a * (1.0 - abs(noise(p) * 2.0 - 1.0)); p = r * p * 2.1 + 3.3; a *= 0.5; } return v; }
// a flame's colour by temperature (0 cold red -> 1 white)
vec3 fireColour(float k) {
  vec3 c = mix(vec3(0.35, 0.02, 0.0), vec3(0.95, 0.22, 0.0), smoothstep(0.0, 0.35, k));
  c = mix(c, vec3(1.0, 0.58, 0.08), smoothstep(0.3, 0.6, k));
  c = mix(c, vec3(1.0, 0.86, 0.45), smoothstep(0.55, 0.8, k));
  return mix(c, vec3(1.0, 0.98, 0.92), smoothstep(0.8, 1.0, k));
}
void main() {
  float u = vUv.x;
  float v = (vUv.y - 0.5) * uAspect;
  float t = uTime;
  // the cone: half-width at u, the jet's own coordinates across it (-1..1 at its edge)
  float half_ = mix(0.06, 0.2, pow(u, 0.7));
  // the fire is pushed out fast near the mouth, slows down as it spreads
  float flow = u * 2.4 - t * (2.8 - u * 1.2);
  // domain warping: big slow swirls bend the jet, small fast ones tear its edge
  vec2 w1 = vec2(fbm(vec2(flow * 1.2, v * 4.0 + t * 0.4)), fbm(vec2(flow * 1.2 + 9.0, v * 4.0 - t * 0.3))) - 0.5;
  float bend = w1.y * 0.12 * u + sin(t * 2.3 + u * 3.0) * 0.012 * u - u * u * 0.025;
  float x = (v - bend) / half_;
  vec2 q = vec2(flow * 2.0, x * 1.4) + w1 * 1.6;
  float tongues = ridged(q * vec2(1.0, 1.3));
  float detail = fbm(q * 2.5 + t * 0.5);
  // how far it reaches as it bursts out, its end torn
  float reach = uGrow * (0.8 + 0.25 * w1.x);
  float along = 1.0 - smoothstep(reach - 0.35, reach, u);
  // density: full in the core, ragged tongues at the edge, thinning as it goes
  float edge = 1.0 - smoothstep(0.25, 1.0, abs(x) + (0.55 - tongues) * (0.6 + 0.7 * u));
  float dens = edge * along * (0.75 + 0.45 * detail);
  // temperature: hottest at the mouth and in the core, cooling outwards and along
  float k = dens * (1.02 - 0.7 * u) * (1.0 - 0.35 * abs(x)) * (0.75 + 0.5 * tongues);
  vec3 col = fireColour(clamp(k, 0.0, 1.0));
  float a = smoothstep(0.03, 0.3, dens);
  // smoke: soft, dark, rising off the jet's far half
  float sv = v + u * u * 0.12;
  float sx = sv / (half_ * 1.6);
  float smokeN = fbm(vec2(u * 3.0 - t * 1.1, sv * 6.0 + t * 0.3));
  float smoke = (1.0 - smoothstep(0.3, 1.2, abs(sx))) * smoothstep(0.35, 0.9, u) * smoothstep(0.45, 0.75, smokeN)
    * (1.0 - smoothstep(reach, reach + 0.15, u)) * (1.0 - a);
  // embers: bright points torn off the flame, flying along it
  vec2 ec = vec2(flow * 5.0, v * 40.0);
  vec2 cell = floor(ec);
  vec2 off = vec2(hash(cell), hash(cell + 3.7));
  float spark = (1.0 - smoothstep(0.0, 0.12, length(fract(ec) - off))) * step(0.93, hash(cell + 9.1))
    * along * smoothstep(0.1, 0.4, u) * (1.0 - smoothstep(1.4, 2.4, abs(x)));
  // the mouth: white-hot where the jet leaves it
  float mouth = exp(-u * 12.0) * (1.0 - smoothstep(0.4, 1.0, abs(v) / 0.07)) * uGrow;
  vec3 rgb = col * a + vec3(0.09, 0.06, 0.05) * smoke * 0.7 + vec3(1.0, 0.75, 0.35) * spark * 1.5 + vec3(1.0, 0.92, 0.7) * mouth;
  float alpha = clamp(a + smoke * 0.55 + spark + mouth, 0.0, 1.0);
  // once the fire stops (uEnd: seconds since, -1 while it burns): the flame dies in a blink, and a
  // thick smoke billows out of the mouth, drifts away rising and spreading, then thins out
  float after = max(uEnd, 0.0);
  float burning = uEnd < 0.0 ? 1.0 : 1.0 - smoothstep(0.0, 0.35, after);
  rgb *= burning;
  alpha *= burning;
  float puff = uEnd < 0.0 ? 0.0 : smoothstep(0.0, 0.3, after) * (1.0 - smoothstep(1.6, 3.0, after));
  float sy = v - (after * 0.07 + u * 0.09);
  float spread = mix(0.07, 0.28 * (1.0 + after * 0.8), pow(u, 0.8));
  float travel = 0.3 + after * 0.5;
  float billow = fbm(vec2(u * 3.5 - after * 1.3 - t * 0.2, sy * 7.0 + t * 0.35));
  float plume = (1.0 - smoothstep(0.35, 1.0, abs(sy) / spread)) * (1.0 - smoothstep(travel - 0.25, travel, u))
    * smoothstep(0.2, 0.6, billow) * puff * smoothstep(0.0, 0.08, u);
  vec3 grey = mix(vec3(0.55, 0.32, 0.2), vec3(0.36, 0.34, 0.33), smoothstep(0.0, 0.25, u + after * 0.3));
  rgb += grey * plume * 0.9;
  alpha = clamp(alpha + plume * 0.9, 0.0, 1.0);
  // nothing ever touches the canvas's edges (no straight cut)
  float frame = smoothstep(0.0, 0.18, vUv.y) * smoothstep(0.0, 0.18, 1.0 - vUv.y) * smoothstep(0.0, 0.12, 1.0 - u);
  outColor = vec4(rgb, alpha) * frame;
}`;

const BURST_S = 0.35;

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

const SMOKE_S = 3; // how long the smoke lasts once the fire stops

// `burning`: the fire is on. Each time it comes on, the jet bursts out again; when it goes off, the
// smoke plays, then the canvas stays clear and draws nothing (no frame asked) until the next time.
export function FlameJet({ burning, className }: { burning: boolean; className: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    start: 0,
    end: -1,
    frame: 0,
    draw: null as ((now: number) => void) | null,
  });
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
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uGrow = gl.getUniformLocation(program, 'uGrow');
    const uAspect = gl.getUniformLocation(program, 'uAspect');
    const uEnd = gl.getUniformLocation(program, 'uEnd');
    const s = state.current;
    const clear = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    };
    s.draw = (now: number) => {
      const width = Math.round(el.clientWidth * Math.min(devicePixelRatio, 2));
      const height = Math.round(el.clientHeight * Math.min(devicePixelRatio, 2));
      if (el.width !== width || el.height !== height) {
        el.width = width;
        el.height = height;
      }
      gl.viewport(0, 0, width, height);
      const after = s.end < 0 ? -1 : (now - s.end) / 1000;
      clear();
      if (after > SMOKE_S) {
        s.frame = 0; // done: nothing more to draw until the fire comes on again
        return;
      }
      const t = (now - s.start) / 1000;
      const grow = Math.min(1, t / BURST_S);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uGrow, 1 - (1 - grow) ** 3);
      gl.uniform1f(uAspect, height / Math.max(1, width));
      gl.uniform1f(uEnd, after);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      s.frame = requestAnimationFrame((n) => s.draw?.(n));
    };
    return () => {
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      s.draw = null;
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, []);
  useEffect(() => {
    const s = state.current;
    const now = performance.now();
    if (burning) {
      s.start = now;
      s.end = -1;
    } else if (s.start && s.end < 0) s.end = now;
    else return;
    if (!s.frame && s.draw) s.frame = requestAnimationFrame((n) => s.draw?.(n));
  }, [burning]);
  return <canvas ref={canvas} className={className} aria-hidden />;
}
