import {
  LinearSRGBColorSpace,
  LoadingManager,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type Object3D,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createLogger } from '../core/Log';
import { ASSET_MANIFEST, type AssetEntry, type AssetKey } from './manifest';

const log = createLogger('Assets');

type Loaded = GLTF | Texture | AudioBuffer | unknown;

interface CacheSlot {
  promise: Promise<Loaded>;
  value: Loaded | null;
  refs: number;
}

/**
 * Keyed asynchronous asset loading with reference counting — the browser
 * analogue of Unity Addressables. Gameplay code requests assets by stable
 * key (`env.watchtower_kit`), never by path, so art can be swapped or
 * re-bundled without touching systems.
 */
export class AssetManager {
  private readonly cache = new Map<string, CacheSlot>();
  private readonly gltf: GLTFLoader;
  private readonly textures: TextureLoader;
  private audioContext: AudioContext | null = null;
  maxAnisotropy = 8;

  constructor() {
    const manager = new LoadingManager();
    this.gltf = new GLTFLoader(manager);
    this.textures = new TextureLoader(manager);
  }

  setAudioContext(ctx: AudioContext): void {
    this.audioContext = ctx;
  }

  static url(path: string): string {
    return `${import.meta.env.BASE_URL}${path}`.replace(/\/{2,}/g, '/');
  }

  has(key: string): boolean {
    return key in ASSET_MANIFEST;
  }

  /** Load (or share) an asset. Every `load` must be balanced by a `release`. */
  load<T = Loaded>(key: AssetKey): Promise<T> {
    let slot = this.cache.get(key);
    if (!slot) {
      const entry = ASSET_MANIFEST[key];
      if (!entry) return Promise.reject(new Error(`Unknown asset key "${key}"`));
      const promise = this.loadEntry(entry).then((v) => {
        slot!.value = v;
        return v;
      });
      slot = { promise, value: null, refs: 0 };
      this.cache.set(key, slot);
      promise.catch((err) => {
        log.error(`Failed to load "${key}"`, err);
        this.cache.delete(key);
      });
    }
    slot.refs++;
    return slot.promise as Promise<T>;
  }

  /** Synchronous access to an already-loaded asset. */
  get<T = Loaded>(key: AssetKey): T | null {
    return (this.cache.get(key)?.value as T) ?? null;
  }

  async preload(keys: AssetKey[], onProgress?: (p: number) => void): Promise<void> {
    let done = 0;
    onProgress?.(0);
    await Promise.all(
      keys.map((k) =>
        this.load(k).then(() => {
          done++;
          onProgress?.(done / keys.length);
        }),
      ),
    );
  }

  release(key: AssetKey): void {
    const slot = this.cache.get(key);
    if (!slot) return;
    slot.refs--;
    if (slot.refs > 0) return;
    this.cache.delete(key);
    const v = slot.value;
    if (v instanceof Texture) v.dispose();
    else if (v && typeof v === 'object' && 'scene' in (v as GLTF)) disposeObject((v as GLTF).scene);
  }

  private async loadEntry(entry: AssetEntry): Promise<Loaded> {
    const url = AssetManager.url(entry.url);
    switch (entry.type) {
      case 'gltf':
        return this.gltf.loadAsync(url);
      case 'texture': {
        const tex = await this.textures.loadAsync(url);
        tex.colorSpace = entry.colorSpace === 'srgb' ? SRGBColorSpace : LinearSRGBColorSpace;
        if (entry.repeat) {
          tex.wrapS = tex.wrapT = RepeatWrapping;
        }
        tex.anisotropy = this.maxAnisotropy;
        return tex;
      }
      case 'audio': {
        if (!this.audioContext) throw new Error('Audio context not ready');
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        return this.audioContext.decodeAudioData(buf);
      }
      case 'json': {
        const res = await fetch(url);
        return res.json();
      }
    }
  }
}

/**
 * Dispose GPU resources under `root`. Geometries/materials flagged with
 * `userData.shared` (kit pieces, library materials) are left alone.
 */
export function disposeObject(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as unknown as {
      geometry?: { dispose(): void; userData?: Record<string, unknown> };
      material?: { dispose(): void; userData?: Record<string, unknown> } | Array<{ dispose(): void; userData?: Record<string, unknown> }>;
    };
    if (mesh.geometry && !mesh.geometry.userData?.shared) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) if (!m.userData?.shared) m.dispose();
  });
}
