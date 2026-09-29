import { BackSide, Color, MeshBasicMaterial, MeshToonMaterial, Uniform, type Texture } from 'three';

export type AnimeRole = 'skin' | 'face' | 'hair' | 'cloth' | 'metal' | 'eye';

/** Scene-wide character lighting mood (set by areas / story beats). */
export const CharacterLighting = {
  rimColor: new Uniform(new Color(0.55, 0.62, 0.85)),
  rimStrength: new Uniform(0.35),
  /** Minimum light so faces stay readable in the dark (anime convention). */
  faceFloor: new Uniform(0.14),
};

export interface AnimeMaterialOptions {
  color: Color;
  role: AnimeRole;
  map?: Texture | null;
  emissiveMap?: Texture | null;
  shadowTint?: Color;
}

/** Default shadow tints per role: warm for skin, cooler and deeper for cloth. */
const SHADOW_TINTS: Record<AnimeRole, [number, number, number]> = {
  skin: [0.86, 0.66, 0.66],
  face: [0.88, 0.7, 0.7],
  hair: [0.55, 0.55, 0.68],
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
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vAnimeUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvAnimeUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <gradientmap_pars_fragment>',
        `uniform vec3 uShadowTint;
         uniform float uShadeThreshold;
         uniform float uShadeSoft;
         vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
           float h = dot( normal, lightDirection ) * 0.5 + 0.5;
           float lit = smoothstep( uShadeThreshold - uShadeSoft, uShadeThreshold + uShadeSoft, h );
           return mix( uShadowTint, vec3( 1.0 ), lit );
         }`,
      )
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uRimColor;
         uniform float uRimStrength;
         uniform float uFaceFloor;
         uniform float uIsHair;
         uniform float uIsFace;
         varying vec2 vAnimeUv;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
           vec3 V = normalize( vViewPosition );
           float ndv = saturate( dot( normal, V ) );
           float rim = smoothstep( 0.55, 0.85, 1.0 - ndv );
           outgoingLight += uRimColor * rim * uRimStrength * diffuseColor.rgb;
           if ( uIsHair > 0.5 ) {
             // Angel ring: a soft specular band that slides with the view.
             float band = 1.0 - smoothstep( 0.0, 0.07, abs( vAnimeUv.y - ( 0.24 + 0.08 * ( 1.0 - ndv ) ) ) );
             float spec = band * smoothstep( 0.2, 0.9, ndv );
             outgoingLight += diffuseColor.rgb * spec * 0.9 + vec3( 0.06 ) * spec;
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
export function createOutlineMaterial(color: Color, width = 0.0028): MeshBasicMaterial {
  const mat = new MeshBasicMaterial({ color, side: BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineWidth = { value: width };
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
         float depthScale = clamp( -mvPosition.z, 0.6, 14.0 );
         mvPosition.xyz += outlineN * uOutlineWidth * depthScale;
         gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  mat.customProgramCacheKey = () => 'anime-outline';
  return mat;
}
