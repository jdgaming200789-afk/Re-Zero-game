import { SkinnedMesh, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const fmt = (e: ArrayLike<number>) => Array.from(e, (x) => x.toFixed(4)).join(',');

/**
 * Merge skinned meshes that share a skeleton, bind pose, parent, transform,
 * vertex layout and an equivalent material (`key`) into one mesh per group.
 * A creature modelled as dozens of parts then draws as a handful — which
 * matters three times over, since every mesh is also drawn as an outline
 * shell and into the shadow maps. Returns the meshes that remain.
 */
export function mergeSkinnedByMaterial(meshes: SkinnedMesh[], key: (m: Material) => string): SkinnedMesh[] {
  const groups = new Map<string, SkinnedMesh[]>();
  const out: SkinnedMesh[] = [];
  for (const m of meshes) {
    const g = m.geometry;
    if (Array.isArray(m.material) || !m.parent || Object.keys(g.morphAttributes).length > 0) {
      out.push(m);
      continue;
    }
    m.updateMatrix();
    const layout = Object.keys(g.attributes)
      .sort()
      .map((a) => `${a}:${g.attributes[a]!.itemSize}`)
      .join(',');
    const k = [key(m.material), m.skeleton.uuid, m.parent.uuid, layout, g.index ? 'i' : 'n', fmt(m.bindMatrix.elements), fmt(m.matrix.elements)].join('|');
    let list = groups.get(k);
    if (!list) groups.set(k, (list = []));
    list.push(m);
  }
  for (const list of groups.values()) {
    const first = list[0]!;
    if (list.length === 1) {
      out.push(first);
      continue;
    }
    const geometry = mergeGeometries(
      list.map((m) => m.geometry),
      false,
    );
    if (!geometry) {
      out.push(...list);
      continue;
    }
    const mesh = new SkinnedMesh(geometry, first.material);
    mesh.name = `${first.name}+${list.length - 1}`;
    mesh.position.copy(first.position);
    mesh.quaternion.copy(first.quaternion);
    mesh.scale.copy(first.scale);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.frustumCulled = first.frustumCulled;
    mesh.renderOrder = first.renderOrder;
    first.parent!.add(mesh);
    mesh.bind(first.skeleton, first.bindMatrix);
    for (const m of list) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    out.push(mesh);
  }
  return out;
}
