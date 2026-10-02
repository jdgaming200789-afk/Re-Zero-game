import { Color, SkinnedMesh, type BufferGeometry, type Material, type MeshStandardMaterial, type Object3D, type Uniform } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createOutlineMaterial, type AnimeRole } from './AnimeMaterial';

export interface OutlineOptions {
  base: Color;
  fade: Uniform<number>;
  /** Width per role (view-space scale factor). */
  width?: (role: AnimeRole) => number;
  color?: (role: AnimeRole, material: MeshStandardMaterial, base: Color) => Color;
}

/**
 * Inverted-hull outlines for skinned meshes: one shell per source mesh.
 * Multi-material glTF meshes arrive split per material; they are merged
 * back so outlines don't draw along internal material seams. Returns the
 * GPU resources it created (for disposal).
 */
export function buildOutlines(skinned: SkinnedMesh[], opts: OutlineOptions): Array<{ dispose(): void }> {
  const owned: Array<{ dispose(): void }> = [];
  const groups = new Map<Object3D, SkinnedMesh[]>();
  for (const mesh of skinned) {
    // A glTF mesh with several materials arrives as a group holding only its
    // primitives: those share one shell. Separate meshes that merely share a
    // parent (the rig) keep their own — each has its own role, and parts
    // the game hides (a hood) must take their outline with them.
    const p = mesh.parent;
    const primitives = p && p.children.length > 1 && p.children.every((c) => (c as SkinnedMesh).isSkinnedMesh);
    const key = primitives ? p : mesh;
    const list = groups.get(key) ?? [];
    list.push(mesh);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    const first = list[0]!;
    const mat0 = (Array.isArray(first.material) ? first.material[0] : first.material) as MeshStandardMaterial;
    const role = (mat0.userData.role as AnimeRole) ?? 'cloth';
    const geometry = list.length > 1 ? (mergeGeometries(list.map((m) => stripForOutline(m.geometry)), false) ?? first.geometry) : first.geometry;
    const color = opts.color ? opts.color(role, mat0, opts.base) : opts.base;
    const width = opts.width ? opts.width(role) : 0.0026;
    const outline = new SkinnedMesh(geometry, createOutlineMaterial(color, width, opts.fade));
    if (geometry !== first.geometry) owned.push(geometry);
    owned.push(outline.material as Material);
    outline.bind(first.skeleton, first.bindMatrix);
    outline.position.copy(first.position);
    outline.quaternion.copy(first.quaternion);
    outline.scale.copy(first.scale);
    outline.frustumCulled = false;
    outline.castShadow = false;
    outline.name = `${first.name}_outline`;
    first.parent!.add(outline);
  }
  return owned;
}

/** Keep only the attributes an outline shell needs (so split primitives merge). */
function stripForOutline(g: BufferGeometry): BufferGeometry {
  const out = g.clone();
  for (const name of Object.keys(out.attributes)) {
    if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(name)) out.deleteAttribute(name);
  }
  out.clearGroups();
  return out;
}
