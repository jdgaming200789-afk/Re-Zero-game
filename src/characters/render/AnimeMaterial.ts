import { BackSide, Color, MeshBasicMaterial, MeshToonMaterial, ShaderChunk, Uniform, Vector3, type Texture } from 'three';

export type AnimeRole = 'skin' | 'face' | 'hair' | 'cloth' | 'metal' | 'eye';

/** Scene-wide character lighting mood (set by areas / story beats). */
export const CharacterLighting = {
  rimColor: new Uniform(new Color(0.55, 0.62, 0.85)),
  rimStrength: new Uniform(0.35),
  /** Minimum light so faces stay readable in the dark (anime convention). */
  faceFloor: new Uniform(0.14),
  /** How dark a cast shadow makes a character (1 = only the tint). */
  castShadowDarken: new Uniform(0.72),
  /**
   * How much of a character's own palette survives coloured light (0 = the
   * light's colour wins, 1 = only its brightness matters). Anime keeps
   * characters' colours readable under a red hall or a blue moon.
   */
  paletteKeep: new Uniform(0.35),
  /** Characters dither out as the camera nears them (off for review shots). */
  cameraFade: true,
  /** Camera position (updated by the game each frame) for LOD decisions. */
  viewPosition: new Vector3(),
  /** Direction *towards* the key light (moon/sun), world space. Areas set it. */
  keyLightDir: new Vector3(-0.78, 0.46, 0.22).normalize(),
};

// Directional shadows feed the toon ramp instead of multiplying the light
// colour: a character in shadow shows the tinted shade colour (warm skin,
// cool cloth) rather than going flat grey.
const DIR_SHADOW = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap';
const ANIME_LIGHTS = ShaderChunk.lights_fragment_begin.includes(DIR_SHADOW)
  ? ShaderChunk.lights_fragment_begin.replace(DIR_SHADOW, 'animeShadow = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap')
  : ShaderChunk.lights_fragment_begin;

export interface AnimeMaterialOptions {
  color: Color;
  role: AnimeRole;
  map?: Texture | null;
  emissiveMap?: Texture | null;
  shadowTint?: Color;
  /**
   * Per-character environment shadow (0 in shadow .. 1 lit), for parts that
   * don't receive shadow maps (face, hair) so they still darken under cover.
   */
  envShadow?: Uniform<number>;
  /** Per-character dither fade (1 = opaque), e.g. near the camera. */
  fade?: Uniform<number>;
  /** Self-illumination (glowing eyes). */
  emissive?: Color;
}

/** Ordered-dither discard: screen-door transparency that needs no sorting. */
const DITHER_GLSL = `
  uniform float uFade;
  float animeBayer4( vec2 p ) {
    ivec2 i = ivec2( mod( p, 4.0 ) );
    int idx = i.x + i.y * 4;
    float m[16] = float[16]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
    return ( m[idx] + 0.5 ) / 16.0;
  }`;
const DITHER_TEST = `if ( uFade < 0.999 && uFade < animeBayer4( gl_FragCoord.xy ) ) discard;`;

/** Default shadow tints per role: warm for skin, cooler and deeper for cloth. */
const SHADOW_TINTS: Record<AnimeRole, [number, number, number]> = {
  skin: [0.86, 0.66, 0.66],
  face: [0.88, 0.7, 0.7],
  hair: [0.7, 0.68, 0.82],
  cloth: [0.62, 0.62, 0.74],
  metal: [0.5, 0.5, 0.6],
  eye: [0.9, 0.9, 0.95],
};

/**
 * Cel-shaded material for characters, built on MeshToonMaterial so it
 * receives every light type and shadows. Replaces the toon ramp with a
 * soft, tinted two-tone ramp (shadows keep saturation instead of going grey),
 * adds a view-dependent rim light and, for hair, the anime "angel ring".
 */
export function createAnimeMaterial(o: AnimeMaterialOptions): MeshToonMaterial {
  const mat = new MeshToonMaterial({ color: o.color, map: o.map ?? null });
  if (o.emissiveMap) {
    mat.emissiveMap = o.emissiveMap;
    mat.emissive = new Color(0.55, 0.55, 0.55);
  }
  if (o.emissive) mat.emissive = o.emissive.clone();
  const tint = o.shadowTint ?? new Color(...SHADOW_TINTS[o.role]);
  const threshold = o.role === 'skin' || o.role === 'face' ? 0.42 : 0.5;
  const soft = o.role === 'hair' ? 0.05 : 0.035;
  mat.userData.role = o.role;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uShadowTint = { value: tint };
    shader.uniforms.uShadeThreshold = { value: threshold };
    shader.uniforms.uShadeSoft = { value: soft };
    shader.uniforms.uRimColor = CharacterLighting.rimColor;
    shader.uniforms.uRimStrength = CharacterLighting.rimStrength;
    shader.uniforms.uFaceFloor = CharacterLighting.faceFloor;
    shader.uniforms.uIsHair = { value: o.role === 'hair' ? 1 : 0 };
    shader.uniforms.uIsFace = { value: o.role === 'face' || o.role === 'skin' ? 1 : 0 };
    shader.uniforms.uCastDarken = CharacterLighting.castShadowDarken;
    shader.uniforms.uPaletteKeep = CharacterLighting.paletteKeep;
    shader.uniforms.uEnvShadow = o.envShadow ?? { value: 1 };
    shader.uniforms.uFade = o.fade ?? { value: 1 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vAnimeUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvAnimeUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <gradientmap_pars_fragment>',
        `uniform vec3 uShadowTint;
         uniform float uShadeThreshold;
         uniform float uShadeSoft;
         uniform float uCastDarken;
         uniform float uEnvShadow;
         float animeShadow = 1.0;
         vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
           float h = dot( normal, lightDirection ) * 0.5 + 0.5;
           float sh = min( animeShadow, uEnvShadow );
           float lit = smoothstep( uShadeThreshold - uShadeSoft, uShadeThreshold + uShadeSoft, h ) * sh;
           return mix( uShadowTint, vec3( 1.0 ), lit ) * mix( uCastDarken, 1.0, sh );
         }`,
      )
      .replace('#include <lights_fragment_begin>', ANIME_LIGHTS)
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uRimColor;
         uniform float uRimStrength;
         uniform float uFaceFloor;
         uniform float uIsHair;
         uniform float uIsFace;
         uniform float uPaletteKeep;
         varying vec2 vAnimeUv;
         ${DITHER_GLSL}`,
      )
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${DITHER_TEST}`)
      .replace(
        '#include <opaque_fragment>',
        `{
           vec3 V = normalize( vViewPosition );
           float ndv = saturate( dot( normal, V ) );
           float rim = smoothstep( 0.55, 0.85, 1.0 - ndv );
           outgoingLight += uRimColor * rim * uRimStrength * diffuseColor.rgb;
           if ( uIsHair > 0.5 ) {
             // Angel ring: a sheen band where the (smoothed) hair surface
             // curves over the crown towards the viewer, so it arcs with the
             // head's shape and slides as the view changes. Cool-tinted so
             // black hair gets a blue sheen rather than a grey stripe.
             float arc = 1.0 - smoothstep( 0.06, 0.13, abs( normal.y - 0.5 ) );
             float spec = arc * smoothstep( 0.45, 0.85, ndv ) * uEnvShadow;
             outgoingLight += ( diffuseColor.rgb * 0.45 + vec3( 0.035, 0.045, 0.07 ) ) * spec;
           }
           {
             // Keep the palette: the lit colour, pulled back towards the
             // material's own hue at the same brightness.
             const vec3 LUMA = vec3( 0.299, 0.587, 0.114 );
             float lumAlbedo = max( dot( diffuseColor.rgb, LUMA ), 1e-3 );
             vec3 own = diffuseColor.rgb * ( dot( outgoingLight, LUMA ) / lumAlbedo );
             outgoingLight = mix( outgoingLight, own, uPaletteKeep );
           }
           if ( uIsFace > 0.5 ) {
             // Keep faces readable in darkness.
             outgoingLight = max( outgoingLight, diffuseColor.rgb * uFaceFloor );
           }
         }
         #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => `anime-${o.role}`;
  return mat;
}

/**
 * Inverted-hull outline: back faces pushed out along the (skinned) normal in
 * view space, with width kept roughly constant on screen.
 */
export function createOutlineMaterial(color: Color, width = 0.0028, fade?: Uniform<number>): MeshBasicMaterial {
  const mat = new MeshBasicMaterial({ color, side: BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineWidth = { value: width };
    shader.uniforms.uFade = fade ?? { value: 1 };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DITHER_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${DITHER_TEST}`);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutlineWidth;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
         #ifdef USE_BATCHING
           mvPosition = batchingMatrix * mvPosition;
         #endif
         #ifdef USE_INSTANCING
           mvPosition = instanceMatrix * mvPosition;
         #endif
         mvPosition = modelViewMatrix * mvPosition;
         #ifdef USE_SKINNING
           vec3 outlineN = normalize( normalMatrix * objectNormal );
         #else
           vec3 outlineN = normalize( normalMatrix * normal );
         #endif
         float depthScale = clamp( -mvPosition.z, 0.6, 9.0 );
         mvPosition.xyz += outlineN * uOutlineWidth * depthScale;
         // Push the shell away from the camera so it can't bleed through
         // layered geometry (hair over the scalp cap, skirt layers).
         mvPosition.z -= uOutlineWidth * depthScale * 1.6;
         gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  mat.customProgramCacheKey = () => 'anime-outline';
  return mat;
}
