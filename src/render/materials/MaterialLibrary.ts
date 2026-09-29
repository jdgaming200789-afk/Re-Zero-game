import {
  Color,
  DoubleSide,
  LinearSRGBColorSpace,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  type Material,
  type Texture,
} from 'three';
import { AssetManager } from '../../assets/AssetManager';
import { createLogger } from '../../core/Log';

const log = createLogger('Materials');

interface TextureSetInfo {
  name: string;
  tileMeters: number;
  normalScale: number;
  tintable?: boolean;
}

export interface TextureSet {
  albedo: Texture;
  normal: Texture;
  orm: Texture;
  info: TextureSetInfo;
}

/** How a `M_<base>__<variant>` material differs from its base texture set. */
interface VariantSpec {
  base?: string;
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  physical?: boolean;
  clearcoat?: number;
  untextured?: boolean;
}

const VARIANTS: Record<string, VariantSpec> = {
  'fabric__crimson': { color: 0x8e1f2c },
  'fabric__azure': { color: 0x3b5b8f },
  'fabric__violet': { color: 0x5a4a8c },
  'fabric__linen': { color: 0xe9e2d2 },
  'fabric__canvas': { color: 0xcbb994 },
  'fabric__emerald': { color: 0x2f6b52 },
  'plaster_worn__paper': { color: 0xf0e6cc, roughness: 0.9 },
  'sandglass__clay': { base: 'limestone_smooth', color: 0xb9714a, roughness: 0.75 },
  'leather__oxblood': { color: 0x5b1d22 },
  'leather__navy': { color: 0x1f2c4c },
  'leather__moss': { color: 0x344a2c },
  'leather__umber': { color: 0x5a3a24 },
  gold: { base: 'bronze', color: 0xffe0a0, metalness: 1, roughness: 0.3 },
  'glow__embers': { untextured: true, color: 0x1a0a04, emissive: 0xff5a1a, emissiveIntensity: 2.2, roughness: 1 },
  'glow__lantern': { untextured: true, color: 0x302010, emissive: 0xffb45e, emissiveIntensity: 3.0, roughness: 0.4 },
  'glow__star': { untextured: true, color: 0x0a1020, emissive: 0xbfe0ff, emissiveIntensity: 3.5, roughness: 0.2 },
  dark: { untextured: true, color: 0x070708, roughness: 0.9 },
  sandglass: { physical: true, clearcoat: 0.6 },
  marble_tiles: { physical: true, clearcoat: 0.25, color: 0xc9c2b6 },
};

/**
 * Builds PBR materials from the generated texture library by name.
 *
 * Kit meshes carry material names like `M_sandstone_ashlar` or
 * `M_fabric__crimson`; this resolves them to shared three.js materials so
 * art can change without touching level code. UVs are authored in metres,
 * so texture repeat is 1 / tileMeters.
 */
export class MaterialLibrary {
  private readonly sets = new Map<string, TextureSet>();
  private readonly materials = new Map<string, Material>();
  private index: Record<string, TextureSetInfo> = {};
  private readonly loader = new TextureLoader();

  constructor(private anisotropy = 8) {}

  private initPromise: Promise<void> | null = null;

  /** Loads the material index once; every lookup awaits it, so callers can't race it. */
  init(): Promise<void> {
    this.initPromise ??= (async () => {
      const res = await fetch(AssetManager.url('assets/textures/materials.json'));
      this.index = (await res.json()) as Record<string, TextureSetInfo>;
    })();
    return this.initPromise;
  }

  setAnisotropy(a: number): void {
    this.anisotropy = a;
    for (const set of this.sets.values()) for (const t of [set.albedo, set.normal, set.orm]) {
      t.anisotropy = a;
      t.needsUpdate = true;
    }
  }

  /** Raw texture maps of a generated material (terrain splats, custom shaders). */
  async textureSet(name: string): Promise<TextureSet | null> {
    await this.init();
    const cached = this.sets.get(name);
    if (cached) return cached;
    const info = this.index[name];
    if (!info) return null;
    const base = `assets/textures/${name}/`;
    const load = async (file: string, srgb: boolean) => {
      const t = await this.loader.loadAsync(AssetManager.url(base + file));
      t.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace;
      t.wrapS = t.wrapT = RepeatWrapping;
      t.repeat.set(1 / info.tileMeters, 1 / info.tileMeters);
      t.anisotropy = this.anisotropy;
      return t;
    };
    const [albedo, normal, orm] = await Promise.all([load('albedo.webp', true), load('normal.webp', false), load('orm.webp', false)]);
    const set = { albedo, normal, orm, info };
    this.sets.set(name, set);
    return set;
  }

  /** Resolve a material by its authored name (with or without the `M_` prefix). */
  async get(rawName: string): Promise<Material> {
    await this.init();
    const name = rawName.replace(/^M_/, '').replace(/\.\d+$/, '');
    const existing = this.materials.get(name);
    if (existing) return existing;

    const variant = VARIANTS[name] ?? {};
    const baseName = variant.base ?? name.split('__')[0]!;
    let mat: MeshStandardMaterial;
    if (variant.physical) {
      mat = new MeshPhysicalMaterial({ clearcoat: variant.clearcoat ?? 0, clearcoatRoughness: 0.35 });
    } else {
      mat = new MeshStandardMaterial();
    }
    mat.name = name;
    mat.userData.shared = true;
    // Cloth (banners, tents, canvas) is single-sheet geometry.
    if (name.startsWith('fabric')) mat.side = DoubleSide;
    if (!variant.untextured) {
      const set = await this.textureSet(baseName);
      if (set) {
        mat.map = set.albedo;
        mat.normalMap = set.normal;
        mat.normalScale = new Vector2(set.info.normalScale, set.info.normalScale);
        mat.aoMap = set.orm;
        mat.aoMapIntensity = 1;
        mat.roughnessMap = set.orm;
        mat.metalnessMap = set.orm;
        mat.roughness = 1;
        mat.metalness = 1;
      } else {
        log.warn(`No texture set for material "${name}"`);
      }
    }
    if (variant.color !== undefined) mat.color = new Color(variant.color);
    if (variant.roughness !== undefined) {
      // Scalar multiplies the map, so this acts as a cap.
      mat.roughness = variant.roughness;
    }
    if (variant.metalness !== undefined) mat.metalness = variant.metalness;
    if (variant.untextured) {
      mat.roughness = variant.roughness ?? 0.8;
      mat.metalness = variant.metalness ?? 0;
    }
    if (variant.emissive !== undefined) {
      mat.emissive = new Color(variant.emissive);
      mat.emissiveIntensity = variant.emissiveIntensity ?? 1;
    }
    this.materials.set(name, mat);
    return mat;
  }

  /** Synchronous access to an already-resolved material. */
  peek(name: string): Material | undefined {
    return this.materials.get(name.replace(/^M_/, ''));
  }

  /** Preload a list of materials. */
  async preload(names: string[]): Promise<void> {
    await Promise.all(names.map((n) => this.get(n)));
  }
}
