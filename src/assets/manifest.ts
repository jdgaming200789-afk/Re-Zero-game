/**
 * The asset catalogue. Paths are relative to /public. Keys are stable ids
 * referenced by gameplay data; generated assets (Blender pipeline output)
 * are listed here as they come online.
 */
export type AssetEntry =
  | { type: 'gltf'; url: string }
  | { type: 'texture'; url: string; colorSpace: 'srgb' | 'linear'; repeat?: boolean }
  | { type: 'audio'; url: string }
  | { type: 'json'; url: string };

export const ASSET_MANIFEST: Record<string, AssetEntry> = {};

export type AssetKey = keyof typeof ASSET_MANIFEST & string;

/** Registers entries at runtime (used by generated manifests). */
export function registerAssets(entries: Record<string, AssetEntry>): void {
  Object.assign(ASSET_MANIFEST, entries);
}
