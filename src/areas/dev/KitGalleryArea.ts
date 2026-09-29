import {
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  PMREMGenerator,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Area, type AtmosphereProfile } from '../../scene/Area';
import type { GameContext } from '../../game/GameContext';
import { KitBatch } from '../../scene/kit/KitBatch';
import { NEUTRAL_GRADE } from '../../render/effects/ColorGradeEffect';

/** Developer area: every kit piece laid out on a grid with its name. */
class KitGalleryArea extends Area {
  readonly id = 'kit_gallery';
  readonly displayName = 'Kit Gallery';
  readonly subtitle = 'Every modular piece from the Blender pipeline.';
  private env: Texture | null = null;
  private batch: KitBatch | null = null;
  /** Piece name → gallery position (used by automated screenshots). */
  readonly positions = new Map<string, [number, number, number]>();

  async build(onProgress: (p: number) => void): Promise<void> {
    const g = this.game;
    const kit = await g.environment.kit();
    onProgress(0.5);
    const batch = new KitBatch(kit, g.physics, 32);
    const names = kit.names();
    const cols = 7;
    const spacing = 9;
    // Floor
    for (let x = -1; x <= cols; x++) for (let z = -1; z <= Math.ceil(names.length / cols) + 1; z++) {
      for (let i = 0; i < 4; i++) batch.place('Floor_4x4_Stone', x * spacing + (i % 2) * 4 - 2, 0, -z * spacing + Math.floor(i / 2) * 4 - 2);
    }
    names.forEach((name, i) => {
      if (name.startsWith('Floor')) return;
      const x = (i % cols) * spacing;
      const z = -Math.floor(i / cols) * spacing;
      batch.place(name, x, 0, z, { rotY: 0 });
      this.positions.set(name, [x, kit.piece(name).bounds.max.y, z]);
      const label = makeLabel(name);
      label.position.set(x, kit.piece(name).bounds.max.y + 0.8, z);
      this.root.add(label);
    });
    batch.build(this.root);
    this.batch = batch;
    this.trackCollider(batch.colliders);

    this.root.add(new HemisphereLight(0xc8d4ff, 0x4a3a2a, 0.7));
    const sun = new DirectionalLight(0xffe2bd, 2.6);
    sun.position.set(30, 40, 20);
    sun.target.position.set(27, 0, -18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.root.add(sun, sun.target);
    const pmrem = new PMREMGenerator(g.render.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.addSpawn('default', -4, 0, 6, 180);
    onProgress(1);
  }

  override update(dt: number): void {
    this.batch?.update(dt, this.game.render.camera.position);
  }

  atmosphere(): AtmosphereProfile {
    return {
      background: new Color(0x7d8aa3),
      environment: this.env,
      environmentIntensity: 0.4,
      fog: { color: new Color(0x7d8aa3), density: 0.006, heightFalloff: 0.002, skyHaze: 0.5 },
      grade: NEUTRAL_GRADE,
      exposure: 1,
    };
  }

  override dispose(): void {
    this.batch?.dispose();
    this.env?.dispose();
    super.dispose();
  }
}

function makeLabel(text: string): Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8,10,18,0.75)';
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = '#d9c48f';
  g.strokeRect(2, 2, 508, 92);
  g.fillStyle = '#f3e2b0';
  g.font = '600 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: tex, depthTest: true }));
  s.scale.set(3.2, 0.6, 1);
  return s;
}

export default (game: GameContext) => new KitGalleryArea(game);
