import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetManager } from '../assets/AssetManager';

const gltfCache = new Map<string, Promise<GLTF>>();

/** Shared, parsed glTF per URL; instances are made with SkeletonUtils.clone. */
export function loadModel(url: string): Promise<GLTF> {
  let p = gltfCache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(AssetManager.url(url));
    p.catch(() => gltfCache.delete(url));
    gltfCache.set(url, p);
  }
  return p;
}
