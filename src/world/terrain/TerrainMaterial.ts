import { MeshStandardMaterial, Vector2, type Texture } from 'three';

export interface TerrainLayer {
  albedo: Texture;
  normal: Texture;
  orm: Texture;
  tileMeters: number;
}

/**
 * Three-layer splat terrain (R = sand, G = fused glass, B = paving) built
 * on MeshStandardMaterial so it gets full PBR lighting, shadows and IBL.
 * Layers are sampled with world-space XZ coordinates; a large-scale second
 * sand sample breaks up visible tiling across the dunes.
 */
export function createTerrainMaterial(layers: [TerrainLayer, TerrainLayer, TerrainLayer]): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  mat.name = 'TerrainSplat';
  const tiles = new Vector2();
  mat.onBeforeCompile = (shader) => {
    const u = shader.uniforms;
    layers.forEach((l, i) => {
      u[`tAlb${i}`] = { value: l.albedo };
      u[`tNrm${i}`] = { value: l.normal };
      u[`tOrm${i}`] = { value: l.orm };
      u[`uTile${i}`] = { value: 1 / l.tileMeters };
    });
    void tiles;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute vec3 splat;
         varying vec3 vSplat;
         varying vec3 vTerrainWorld;
         varying vec3 vTerrainNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vSplat = splat;
         vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
         vTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D tAlb0; uniform sampler2D tAlb1; uniform sampler2D tAlb2;
         uniform sampler2D tNrm0; uniform sampler2D tNrm1; uniform sampler2D tNrm2;
         uniform sampler2D tOrm0; uniform sampler2D tOrm1; uniform sampler2D tOrm2;
         uniform float uTile0; uniform float uTile1; uniform float uTile2;
         varying vec3 vSplat;
         varying vec3 vTerrainWorld;
         varying vec3 vTerrainNormal;
         vec3 terrainW;
         vec3 terrainOrm;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 twp = vec2(vTerrainWorld.x, -vTerrainWorld.z);
         vec4 a0 = texture2D(tAlb0, twp * uTile0);
         vec4 a1 = texture2D(tAlb1, twp * uTile1);
         vec4 a2 = texture2D(tAlb2, twp * uTile2);
         // Anti-tiling: modulate sand by a very large-scale sample of itself.
         vec3 macro = texture2D(tAlb0, twp * uTile0 * 0.083 + 0.37).rgb;
         a0.rgb *= mix(0.72, 1.02, dot(macro, vec3(0.333)) * 1.1);
         // Height-aware blending: sand fills the low parts of glass and paving.
         vec3 w = max(vSplat, vec3(0.0));
         float h1 = dot(a1.rgb, vec3(0.333));
         float h2 = dot(a2.rgb, vec3(0.333));
         w.y *= smoothstep(0.0, 0.6, w.y + h1 * 0.6 - 0.2);
         w.z *= smoothstep(0.0, 0.6, w.z + h2 * 0.8 - 0.25);
         w /= max(w.x + w.y + w.z, 1e-4);
         terrainW = w;
         diffuseColor.rgb *= a0.rgb * w.x + a1.rgb * w.y + a2.rgb * w.z;
         terrainOrm = texture2D(tOrm0, twp * uTile0).rgb * w.x + texture2D(tOrm1, twp * uTile1).rgb * w.y + texture2D(tOrm2, twp * uTile2).rgb * w.z;`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = terrainOrm.g;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = 0.0;')
      .replace(
        '#include <normal_fragment_maps>',
        `{
           vec3 n0 = texture2D(tNrm0, twp * uTile0).xyz * 2.0 - 1.0;
           vec3 n1 = texture2D(tNrm1, twp * uTile1).xyz * 2.0 - 1.0;
           vec3 n2 = texture2D(tNrm2, twp * uTile2).xyz * 2.0 - 1.0;
           vec3 tn = normalize(n0 * terrainW.x + n1 * terrainW.y + n2 * terrainW.z);
           vec3 N = normalize(vTerrainNormal);
           vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
           vec3 B = normalize(cross(N, T));
           vec3 worldN = normalize(T * tn.x + B * tn.y + N * tn.z);
           normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);
         }`,
      )
      .replace(
        '#include <aomap_fragment>',
        `float ambientOcclusion = mix(1.0, terrainOrm.r, 0.8);
         reflectedLight.indirectDiffuse *= ambientOcclusion;
         #if defined( USE_ENVMAP ) && defined( STANDARD )
           float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
           reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
         #endif`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-splat-v1';
  return mat;
}
