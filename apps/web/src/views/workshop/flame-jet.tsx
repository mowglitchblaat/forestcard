// TAC-002's jet of fire: a flame drawn live by a small WebGL shader (no picture), so it is never twice
// the same. It bursts out of the cannon's mouth (its length grows in a fraction of a second), then
// roars: turbulent tongues streaming away from the mouth, a white-hot core, yellow, orange, red, then
// dark smoke at its tip. The canvas covers the jet's box; its left edge's middle is the mouth.
// Drawn only while mounted; without WebGL, nothing shows (the machine still works).

import { useEffect, useRef } from 'react';

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos; gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;

// u runs along the jet (0 at the mouth), v across it (0 in the middle). uGrow: how far the jet has
// come out (0 -> 1 as it bursts); uTime in seconds.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uTime;
uniform float uGrow;
uniform float uAspect;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), w.x), w.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 3.1; a *= 0.5; } return v; }
void main() {
  float u = vUv.x;
  float v = (vUv.y - 0.5) * uAspect;
  float t = uTime;
  // two layers of noise streaming away from the mouth: broad swells, and fine tongues on them
  float n1 = fbm(vec2(u * 4.0 - t * 3.2, v * 7.0 + t * 0.6));
  float n2 = fbm(vec2(u * 9.0 - t * 6.5, v * 15.0 + n1 * 2.5));
  // as wide as the mouth where it leaves it, it widens and wavers as it goes, curling up a little
  float width = mix(0.07, 0.26, pow(u, 0.6)) * (0.8 + 0.5 * n1);
  float centre = (n1 - 0.5) * 0.09 * u - u * u * 0.03;
  float across = abs(v - centre) / width;
  // how far it reaches: grows as it bursts out, its end torn by the noise
  float reach = uGrow * (0.78 + 0.22 * n1);
  float along = 1.0 - smoothstep(reach - 0.3, reach, u);
  // the tongues: the flame is eaten by the fine noise, more and more as it goes
  float density = ((1.0 - across) * 1.7 - (1.0 - n2) * (0.3 + 0.75 * u)) * along;
  float heat = clamp(density, 0.0, 1.0) * (1.0 - u * 0.6) * (0.55 + 0.65 * n2);
  // white-hot core, yellow, orange, deep red
  vec3 col = mix(vec3(0.5, 0.04, 0.0), vec3(1.0, 0.33, 0.02), smoothstep(0.02, 0.3, heat));
  col = mix(col, vec3(1.0, 0.72, 0.2), smoothstep(0.3, 0.6, heat));
  col = mix(col, vec3(1.0, 0.96, 0.82), smoothstep(0.65, 0.95, heat));
  float alpha = smoothstep(0.0, 0.18, heat);
  // dark smoke curling off its far end
  float smoke = (1.0 - smoothstep(0.2, 1.2, across * 0.6)) * smoothstep(0.45, 0.95, u) * along
    * smoothstep(0.45, 0.8, n1) * (1.0 - alpha);
  // the mouth glows white where the jet leaves it
  float mouth = exp(-u * 14.0) * (1.0 - smoothstep(0.0, 1.0, abs(v) / 0.1)) * uGrow;
  col = col * alpha + vec3(0.1, 0.07, 0.06) * smoke * 0.5 + vec3(1.0, 0.85, 0.5) * mouth;
  outColor = vec4(col, clamp(alpha + smoke * 0.5 + mouth, 0.0, 1.0));
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

export function FlameJet({ className }: { className: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
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
    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const width = Math.round(el.clientWidth * Math.min(devicePixelRatio, 2));
      const height = Math.round(el.clientHeight * Math.min(devicePixelRatio, 2));
      if (el.width !== width || el.height !== height) {
        el.width = width;
        el.height = height;
      }
      const t = (now - start) / 1000;
      const grow = Math.min(1, t / BURST_S);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uGrow, 1 - (1 - grow) ** 3);
      gl.uniform1f(uAspect, height / Math.max(1, width));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, []);
  return <canvas ref={canvas} className={className} aria-hidden />;
}
