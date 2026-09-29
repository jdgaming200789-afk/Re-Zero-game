import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { Component } from '../core/ecs/Component';
import type { GameContext } from '../game/GameContext';
import { Health } from './Health';

/**
 * A straw practice target on a post (dev gym / tutorials). Wobbles on a
 * spring when hit, collapses when defeated and stands back up restored.
 */
export class TrainingDummy extends Component {
  readonly health: Health;
  private readonly body = new Group();
  private tilt = new Vector3();
  private tiltVel = new Vector3();
  private downTimer = 0;

  constructor(
    private readonly game: GameContext,
    max = 120,
  ) {
    super();
    this.health = new Health({ max, faction: 'enemy', name: 'Practice Dummy', radius: 0.32, height: 1.7, poise: 25 });
  }

  override onAttach(): void {
    const e = this.entity;
    e.add(this.health);
    this.game.combat.register(this.health);
    const straw = new MeshStandardMaterial({ color: 0xc9a867, roughness: 0.95 });
    const wood = new MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 });
    const cloth = new MeshStandardMaterial({ color: 0x8a2b36, roughness: 0.9 });
    const post = new Mesh(new CylinderGeometry(0.05, 0.06, 1.1, 8), wood);
    post.position.y = 0.55;
    const sack = new Mesh(new CylinderGeometry(0.24, 0.28, 0.75, 12), straw);
    sack.position.y = 1.2;
    const head = new Mesh(new SphereGeometry(0.17, 12, 10), straw);
    head.position.y = 1.72;
    const arms = new Mesh(new CylinderGeometry(0.035, 0.035, 0.95, 6), wood);
    arms.rotation.z = Math.PI / 2;
    arms.position.y = 1.35;
    const sash = new Mesh(new CylinderGeometry(0.285, 0.29, 0.1, 12), cloth);
    sash.position.y = 1.05;
    for (const m of [post, sack, head, arms, sash]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.body.add(m);
    }
    e.object3D.add(this.body);
    this.health.onHit = (_r, info) => {
      const d = info.direction ?? new Vector3(0, 0, 1);
      this.tiltVel.x += d.z * 3.5;
      this.tiltVel.z -= d.x * 3.5;
    };
    this.health.onDeath = () => {
      this.downTimer = 3;
    };
  }

  override onDetach(): void {
    this.game.combat.unregister(this.health);
  }

  override update(dt: number): void {
    // Damped spring wobble about the base of the post.
    const k = 40;
    const c = 5;
    this.tiltVel.addScaledVector(this.tilt, -k * dt).multiplyScalar(Math.max(0, 1 - c * dt));
    this.tilt.addScaledVector(this.tiltVel, dt);
    if (this.downTimer > 0) {
      this.downTimer -= dt;
      this.tilt.x = Math.min(1.35, this.tilt.x + dt * 4);
      this.tiltVel.set(0, 0, 0);
      if (this.downTimer <= 0) {
        this.health.revive(1);
        this.tilt.set(0.3, 0, 0);
      }
    }
    this.body.rotation.set(this.tilt.x, 0, this.tilt.z);
  }
}
