import type { SceneManager } from '../scene/SceneManager';

/**
 * Area registry. Each area is a lazily imported module (its own chunk), so
 * only the areas the player is in are downloaded and built.
 */
export function registerAreas(scenes: SceneManager): void {
  scenes.register('dev_gym', () => import('./dev/DevGymArea'));
  scenes.register('kit_gallery', () => import('./dev/KitGalleryArea'));
  scenes.register('tower_foot', () => import('./towerfoot/TowerFootArea'));
  scenes.register('celaeno', () => import('./celaeno/CelaenoArea'));
  scenes.register('alcyone', () => import('./alcyone/AlcyoneArea'));
  scenes.register('taygeta', () => import('./taygeta/TaygetaArea'));
  scenes.register('electra', () => import('./electra/ElectraArea'));
}
