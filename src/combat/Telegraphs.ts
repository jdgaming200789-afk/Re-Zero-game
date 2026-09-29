import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, CircleGeometry, Vector3, type Object3D } from 'three';
import type { Faction } from './Damage';

export type TelegraphShape =
  | { kind: 'circle'; center: Vector3; radius: number }
  | { kind: 'cone'; origin: Vector3; dir: Vector3; reach: number; arc: number }
  | { kind: 'line'; origin: Vector3; dir: Vector3; length: number; width: number };

export interface Telegraph {
  id: number;
  shape: TelegraphShape;
  sourceId: number;
  faction: Faction;
  startsAt: number;
  hitsAt: number;
  group: Group;
  fill: Mesh;
}

/**
 * Warnings for incoming attacks: a faint outline on the ground with a fill
 * that grows until the moment of impact. Players read them; companions
 * query them to step out of the way.
 */
export class Telegraphs {
  readonly list: Telegraph[] = [];
  private nextId = 1;
  private readonly edgeMat = new MeshBasicMaterial({ color: new Color(1, 0.25, 0.2), transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  private readonly fillMat = new MeshBasicMaterial({ color: new Color(1, 0.35, 0.25), transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 });

  constructor(private readonly parent: Object3D) {}

  add(shape: TelegraphShape, sourceId: number, faction: Faction, now: number, seconds: number): Telegraph {
    const group = new Group();
    let edge: Mesh;
    let fill: Mesh;
    if (shape.kind === 'circle') {
      edge = new Mesh(new RingGeometry(shape.radius * 0.94, shape.radius, 40), this.edgeMat);
      fill = new Mesh(new CircleGeometry(shape.radius, 40), this.fillMat);
      group.position.copy(shape.center);
    } else if (shape.kind === 'cone') {
      const a = (shape.arc * Math.PI) / 180;
      edge = new Mesh(new RingGeometry(shape.reach * 0.95, shape.reach, 24, 1, Math.PI / 2 - a / 2, a), this.edgeMat);
      fill = new Mesh(new CircleGeometry(shape.reach, 24, Math.PI / 2 - a / 2, a), this.fillMat);
      group.position.copy(shape.origin);
      group.rotation.y = Math.atan2(shape.dir.x, shape.dir.z);
    } else {
      const eg = new PlaneGeometry(shape.width, shape.length);
      eg.translate(0, shape.length / 2, 0);
      edge = new Mesh(eg, this.edgeMat);
      const g = new PlaneGeometry(shape.width, shape.length);
      g.translate(0, shape.length / 2, 0);
      fill = new Mesh(g, this.fillMat);
      group.position.copy(shape.origin);
      group.rotation.y = Math.atan2(shape.dir.x, shape.dir.z);
    }
    // Shapes are authored in the XY plane with +Y forward; lay them flat
    // so +Y becomes +Z (the group then turns +Z towards `dir`).
    for (const m of [edge, fill]) {
      m.rotation.x = Math.PI / 2;
      group.add(m);
    }
    fill.scale.setScalar(0.001);
    group.position.y += 0.04;
    this.parent.add(group);
    const t: Telegraph = { id: this.nextId++, shape, sourceId, faction, startsAt: now, hitsAt: now + seconds, group, fill };
    this.list.push(t);
    return t;
  }

  cancel(id: number): void {
    const i = this.list.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.dispose(this.list[i]!);
    this.list.splice(i, 1);
  }

  /** Telegraphs from hostile sources whose area covers a body at `p` (radius `r`). */
  threatening(p: Vector3, r: number, victimFaction: Faction, hostile: (a: Faction, b: Faction) => boolean): Telegraph[] {
    return this.list.filter((t) => hostile(t.faction, victimFaction) && this.contains(t.shape, p, r));
  }

  contains(s: TelegraphShape, p: Vector3, r: number): boolean {
    if (s.kind === 'circle') return Math.hypot(p.x - s.center.x, p.z - s.center.z) <= s.radius + r;
    const o = s.origin;
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const fl = Math.hypot(s.dir.x, s.dir.z) || 1;
    const fx = s.dir.x / fl;
    const fz = s.dir.z / fl;
    const along = dx * fx + dz * fz;
    if (s.kind === 'line') {
      const across = Math.abs(dx * fz - dz * fx);
      return along >= -r && along <= s.length + r && across <= s.width / 2 + r;
    }
    const d = Math.hypot(dx, dz);
    if (d > s.reach + r) return false;
    if (d < r + 0.3) return true;
    return along / d >= Math.cos(((s.arc / 2) * Math.PI) / 180) - r / Math.max(d, 0.5);
  }

  update(now: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i]!;
      const u = (now - t.startsAt) / Math.max(1e-3, t.hitsAt - t.startsAt);
      if (t.shape.kind === 'line') t.fill.scale.set(1, Math.max(0.001, Math.min(1, u)), 1);
      else t.fill.scale.setScalar(Math.max(0.001, Math.min(1, u)));
      if (now > t.hitsAt + 0.12) {
        this.dispose(t);
        this.list.splice(i, 1);
      }
    }
  }

  private dispose(t: Telegraph): void {
    t.group.removeFromParent();
    t.group.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
    });
  }
}
