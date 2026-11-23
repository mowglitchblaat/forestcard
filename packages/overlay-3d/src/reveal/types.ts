// A reveal shader: the card back goes away over the face, pixel by pixel, driven by uProgress 0 -> 1.
// Every reveal shader receives uProgress, uTime (s), uColor (rarity colour, rgb), uOrigin (where it
// starts, 0..1 across the card), uAspect (H / W), uSeed; its own parameters come from the configuration,
// each mapped to a uniform.

export type ShaderParamValue = number | readonly number[];

export type RevealShaderDef<P extends Readonly<Record<string, ShaderParamValue>>> = {
  // configuration name -> uniform name
  uniforms: { readonly [K in keyof P]: `u${string}` };
  defaults: P;
  // fragment body (`void main(void) { ... }`), with the texture helpers toTex / sampleAt available
  body: string;
};

export const defineRevealShader = <P extends Readonly<Record<string, ShaderParamValue>>>(
  def: RevealShaderDef<P>,
): RevealShaderDef<P> => def;
