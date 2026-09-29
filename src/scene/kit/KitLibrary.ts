import { Box3, Matrix4, Mesh, Vector3, type BufferGeometry, type Material, type Object3D } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createLogger } from '../../core/Log';
import type { MaterialLibrary } from '../../render/materials/MaterialLibrary';
import { AssetManager } from '../../assets/AssetManager';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const log = createLogger('Kit');

export interface KitPart {
  geometry: BufferGeometry;
  material: Material;
}

export interface KitCollider {
  type: 'box' | 'cyl' | 'hull' | 'mesh';
  /** Transform of the collider shape centre relative to the piece origin. */
  matrix: Matrix4;
  halfExtents: Vector3;
  radius: number;
  halfHeight: number;
  /** Local-space points (hull) or vertices (mesh). */
  points?: Float32Array;
  indices?: Uint32Array;
}

export interface KitPiece {
  name: string;
  lods: KitPart[][];
  colliders: KitCollider[];
  extras: Record<string, unknown>;
  bounds: Box3;
  radius: number;
}

/**
 * The modular environment kit produced by the Blender pipeline
 * (tools/blender/build_kit.py). Pieces are looked up by name; their
 * materials are resolved through the MaterialLibrary.
 */
export class KitLibrary {
  private readonly pieces = new Map<string, KitPiece>();

  static async load(url: string, materials: MaterialLibrary): Promise<KitLibrary> {
    const gltf: GLTF = await new GLTFLoader().loadAsync(AssetManager.url(url));
    const lib = new KitLibrary();
    await lib.index(gltf.scene, materials);
    return lib;
  }

  names(): string[] {
    return Array.from(this.pieces.keys()).sort();
  }

  has(name: string): boolean {
    return this.pieces.has(name);
  }

  piece(name: string): KitPiece {
    const p = this.pieces.get(name);
    if (!p) throw new Error(`Kit piece "${name}" not found`);
    return p;
  }

  private async index(root: Object3D, materials: MaterialLibrary): Promise<void> {
    root.updateMatrixWorld(true);
    const lodNodes = new Map<string, Object3D[]>();
    const colNodes = new Map<string, Object3D[]>();

    for (const node of root.children) {
      const n = node.name;
      if (n.startsWith('COL_')) {
        const m = /^COL_(.+)_(\d+)_(BOX|CYL|HULL|MESH)$/.exec(n);
        if (!m) continue;
        const list = colNodes.get(m[1]!) ?? [];
        list.push(node);
        colNodes.set(m[1]!, list);
      } else if (n.startsWith('KIT_')) {
        const m = /^KIT_(.+?)(?:_LOD(\d))?$/.exec(n);
        if (!m) continue;
        const name = m[1]!;
        const lod = m[2] ? Number(m[2]) : 0;
        const list = lodNodes.get(name) ?? [];
        list[lod] = node;
        lodNodes.set(name, list);
      }
    }

    for (const [name, nodes] of lodNodes) {
      const lods: KitPart[][] = [];
      for (const node of nodes) {
        if (!node) continue;
        lods.push(await this.extractParts(node, materials));
      }
      const base = nodes[0]!;
      const bounds = new Box3();
      for (const p of lods[0]!) {
        p.geometry.computeBoundingBox();
        bounds.union(p.geometry.boundingBox!);
      }
      const colliders = (colNodes.get(name) ?? []).map((c) => this.extractCollider(c));
      this.pieces.set(name, {
        name,
        lods,
        colliders,
        extras: { ...base.userData },
        bounds,
        radius: bounds.getSize(new Vector3()).length() / 2,
      });
    }
    log.info(`Kit indexed: ${this.pieces.size} pieces`);
  }

  private async extractParts(node: Object3D, materials: MaterialLibrary): Promise<KitPart[]> {
    const parts: KitPart[] = [];
    const meshes: Mesh[] = [];
    node.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    for (const mesh of meshes) {
      // Piece nodes sit at the GLB origin, so the world matrix is the
      // transform relative to the piece's snapping origin. Bake it in.
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      geometry.userData.shared = true;
      const srcMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const mat = await materials.get(srcMats[0]!.name || 'M_limestone_smooth');
      parts.push({ geometry, material: mat });
    }
    return parts;
  }

  private extractCollider(node: Object3D): KitCollider {
    const type = node.name.endsWith('_BOX') ? 'box' : node.name.endsWith('_CYL') ? 'cyl' : node.name.endsWith('_HULL') ? 'hull' : 'mesh';
    const mesh = node as Mesh;
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const size = bb.getSize(new Vector3());
    const center = bb.getCenter(new Vector3());
    const matrix = new Matrix4().copy(node.matrixWorld).multiply(new Matrix4().makeTranslation(center.x, center.y, center.z));
    const c: KitCollider = {
      type,
      matrix,
      halfExtents: size.clone().multiplyScalar(0.5),
      radius: Math.max(size.x, size.z) / 2,
      halfHeight: size.y / 2,
    };
    if (type === 'hull' || type === 'mesh') {
      const pos = geo.getAttribute('position');
      const pts = new Float32Array(pos.count * 3);
      const v = new Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
        pts.set([v.x, v.y, v.z], i * 3);
      }
      c.points = pts;
      c.matrix = new Matrix4();
      if (geo.index) c.indices = new Uint32Array(geo.index.array);
    }
    return c;
  }
}
