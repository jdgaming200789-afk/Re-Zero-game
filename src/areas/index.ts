import type { SceneManager } from '../scene/SceneManager';

/**
 * Area registry. Each area is a lazily imported module (its own chunk), so
 * only the areas the player is in are downloaded and built.
 */
export function registerAreas(scenes: SceneManager): void {
  scenes.register('dev_gym', () => import('./dev/DevGymArea'));
}
