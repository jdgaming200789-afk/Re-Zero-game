import { MaterialLibrary } from '../render/materials/MaterialLibrary';
import { KitLibrary } from './kit/KitLibrary';

/**
 * Shared environment art: the material library and the modular kit. Loaded
 * once on first use and kept for the session (areas reference, never own, it).
 */
export class EnvironmentLibrary {
  readonly materials: MaterialLibrary;
  private kitPromise: Promise<KitLibrary> | null = null;
  private materialsReady: Promise<void> | null = null;

  constructor(anisotropy: number) {
    this.materials = new MaterialLibrary(anisotropy);
  }

  ready(): Promise<void> {
    this.materialsReady ??= this.materials.init();
    return this.materialsReady;
  }

  kit(): Promise<KitLibrary> {
    this.kitPromise ??= this.library('assets/models/kit/watchtower_kit.glb');
    return this.kitPromise;
  }

  private readonly libraries = new Map<string, Promise<KitLibrary>>();

  /** Any GLB authored with the kit conventions (e.g. the tower exterior). */
  library(url: string): Promise<KitLibrary> {
    let p = this.libraries.get(url);
    if (!p) {
      p = this.ready().then(() => KitLibrary.load(url, this.materials));
      this.libraries.set(url, p);
    }
    return p;
  }
}
