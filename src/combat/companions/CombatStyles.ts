import { Color, Group, Mesh, MeshBasicMaterial, BoxGeometry, CylinderGeometry, Quaternion, SphereGeometry, Vector3 } from 'three';
import type { ActorController } from '../../actors/ActorController';
import type { GameContext } from '../../game/GameContext';
import { hostile, type Resistances } from '../Damage';
import { IceEruption, projectileMesh, SlashArc, SpiritOrbit } from '../effects/CombatVfx';
import type { Health } from '../Health';
import type { CompanionCombat } from './CompanionCombat';

export interface AbilityContext {
  game: GameContext;
  actor: ActorController;
  self: Health;
  target: Health | null;
  companion: CompanionCombat;
  /** Per-companion scratch state (combo step, props). */
  state: Record<string, unknown>;
}

export interface CompanionAbility {
  id: string;
  clip: string | ((ctx: AbilityContext) => string);
  cooldown: number;
  /** Distance band to the target's surface where this is usable. */
  range: [number, number];
  /** Seconds the companion commits (can't move / act). */
  commit: number;
  needsTarget?: boolean;
  /** Desirability right now (≤ 0 = don't). `d` = distance to target surface. */
  score(ctx: AbilityContext, d: number): number;
  /** Applied on the animation's contact beat. */
  execute(ctx: AbilityContext): void;
  bark?: string;
}

export interface CombatStyle {
  maxHp: number;
  poise: number;
  resist?: Resistances;
  /** Preferred distance band from the target (m). */
  range: [number, number];
  /** Stays by Subaru's side (Beatrice, Patrasche). */
  guard?: boolean;
  /** Chance to read and sidestep a telegraphed attack (0..1). */
  dodge: number;
  abilities: CompanionAbility[];
  downLine?: string;
  onEnterCombat?(ctx: AbilityContext): void;
  onExitCombat?(ctx: AbilityContext): void;
  tick?(ctx: AbilityContext, dt: number): void;
}

// ------------------------------------------------------------------ helpers
const forwardOf = (a: ActorController, out = new Vector3()) => out.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
const chest = (a: ActorController) => a.position.clone().setY(a.position.y + a.def.height * 0.62);
const enemiesNear = (ctx: AbilityContext, at: Vector3, r: number) => ctx.game.combat.sphere(at, r, { hostileTo: 'party' });

function melee(ctx: AbilityContext, opts: { reach: number; arc: number; damage: number; type: 'physical' | 'ice'; stagger: number; color: Color; rainbow?: boolean; critical?: boolean; hitStop?: number; max?: number; reverse?: boolean }): number {
  const a = ctx.actor;
  const origin = chest(a);
  const fwd = forwardOf(a);
  const hits = ctx.game.combat.arc(origin, fwd, opts.reach, opts.arc, { hostileTo: 'party', lineOfSightFrom: origin });
  for (const h of hits.slice(0, opts.max ?? 4)) {
    ctx.game.combat.damage(h, {
      amount: opts.damage,
      type: opts.type,
      sourceId: a.entity.id,
      point: h.center(new Vector3()),
      direction: h.entity.object3D.position.clone().sub(a.position).setY(0).normalize(),
      stagger: opts.stagger,
      critical: opts.critical,
      hitStop: opts.hitStop,
      tags: ['melee'],
    });
  }
  ctx.game.combat.addVfx(
    new SlashArc(ctx.game.render.scene, origin.setY(origin.y - 0.1), a.yaw, { radius: opts.reach, arc: (opts.arc * Math.PI) / 180, color: opts.color, rainbow: opts.rainbow, reverse: opts.reverse, duration: opts.rainbow ? 0.55 : 0.28 }),
  );
  return hits.length;
}

// ------------------------------------------------------------------ Emilia
const emilia: CombatStyle = {
  dodge: 0.55,
  maxHp: 150,
  poise: 30,
  resist: { ice: 0.2 },
  range: [4, 9],
  downLine: 'Ah— Subaru, be careful...!',
  abilities: [
    {
      id: 'iceBlade',
      clip: 'iceSlash',
      cooldown: 1.5,
      range: [0, 2.2],
      commit: 0.6,
      score: () => 2.5,
      execute: (ctx) => melee(ctx, { reach: 2.6, arc: 110, damage: 10, type: 'ice', stagger: 12, color: new Color(0.6, 0.85, 1) }),
    },
    {
      id: 'iceSpears',
      clip: 'castForward',
      cooldown: 3.2,
      range: [2.5, 17],
      commit: 0.85,
      score: () => 1.6,
      bark: 'Huma!',
      execute: (ctx) => {
        const a = ctx.actor;
        const from = chest(a).addScaledVector(forwardOf(a), 0.4);
        const fwd = forwardOf(a);
        const side = new Vector3(-fwd.z, 0, fwd.x);
        for (let i = -1; i <= 1; i++) {
          const dir = fwd.clone().addScaledVector(side, i * 0.12).add(new Vector3(0, 0.05, 0)).normalize();
          ctx.game.combat.fire({
            mesh: projectileMesh('iceSpear'),
            from: from.clone().addScaledVector(side, i * 0.35),
            direction: dir,
            speed: 17,
            homing: 3,
            target: ctx.target,
            radius: 0.2,
            maxDistance: 22,
            faction: 'party',
            damage: { amount: 7, type: 'ice', sourceId: a.entity.id, stagger: 6, status: { id: 'slowed', seconds: 2, magnitude: 0.5 }, tags: ['projectile'] },
          });
        }
      },
    },
    {
      id: 'iceField',
      clip: 'castRaise',
      cooldown: 11,
      range: [0, 12],
      commit: 1.15,
      score: (ctx) => (ctx.target && enemiesNear(ctx, ctx.target.entity.object3D.position, 3.2).length >= 2 ? 3.5 : 0.4),
      bark: 'El Huma!',
      execute: (ctx) => {
        const t = ctx.target;
        if (!t) return;
        const c = t.entity.object3D.position.clone();
        ctx.game.combat.addVfx(new IceEruption(ctx.game.render.scene, c, 3));
        for (const h of enemiesNear(ctx, c, 3)) {
          ctx.game.combat.damage(h, { amount: 14, type: 'ice', sourceId: ctx.actor.entity.id, point: h.center(new Vector3()), stagger: 20, status: { id: 'frozen', seconds: 2.5 }, tags: ['area'] });
        }
        ctx.game.camera.shake.add(0.15);
      },
    },
  ],
};

// ------------------------------------------------------------------ Beatrice
const beatrice: CombatStyle = {
  dodge: 0.4,
  maxHp: 100,
  poise: 20,
  resist: { yin: 0 },
  range: [3, 8],
  guard: true,
  downLine: 'Su... Subaru...!',
  abilities: [
    {
      id: 'ward',
      clip: 'ward',
      cooldown: 14,
      range: [0, 99],
      commit: 1.0,
      needsTarget: false,
      score: (ctx) => {
        const s = ctx.game.combat.get(ctx.game.player?.entity.id);
        if (!s || !s.alive || s.shield > 0) return 0;
        const threatened = enemiesNear(ctx, ctx.game.party.leaderPosition, 3.5).length > 0;
        return s.fraction < 0.75 || threatened ? 4 : 0;
      },
      bark: 'Betty will not let them touch you, I suppose.',
      execute: (ctx) => {
        const s = ctx.game.combat.get(ctx.game.player?.entity.id);
        if (!s) return;
        s.addShield(30, 8);
        ctx.game.combat.impacts.burst('yin', s.center(new Vector3()), 24);
      },
    },
    {
      id: 'minya',
      clip: 'castPoint',
      cooldown: 5.5,
      range: [1.5, 15],
      commit: 0.9,
      score: () => 2,
      bark: 'Minya!',
      execute: (ctx) => {
        const a = ctx.actor;
        ctx.game.combat.fire({
          mesh: projectileMesh('minya'),
          from: chest(a).addScaledVector(forwardOf(a), 0.4),
          direction: forwardOf(a).add(new Vector3(0, 0.08, 0)),
          speed: 12,
          homing: 4,
          target: ctx.target,
          radius: 0.25,
          maxDistance: 20,
          faction: 'party',
          spin: 6,
          damage: { amount: 16, type: 'yin', sourceId: a.entity.id, stagger: 14, status: { id: 'stopped', seconds: 1.5 }, tags: ['projectile'] },
        });
      },
    },
  ],
};

// ------------------------------------------------------------------ Julius
function makeSword(): Group {
  const g = new Group();
  const steel = new MeshBasicMaterial({ color: new Color(0.86, 0.9, 0.98) });
  const gold = new MeshBasicMaterial({ color: new Color(0.85, 0.68, 0.3) });
  const navy = new MeshBasicMaterial({ color: new Color(0.14, 0.18, 0.36) });
  const blade = new Mesh(new BoxGeometry(0.04, 0.9, 0.012), steel);
  blade.position.y = 0.55;
  const guard = new Mesh(new BoxGeometry(0.18, 0.03, 0.04), gold);
  guard.position.y = 0.09;
  const grip = new Mesh(new CylinderGeometry(0.016, 0.016, 0.16, 8), navy);
  const pommel = new Mesh(new SphereGeometry(0.024, 8, 6), gold);
  pommel.position.y = -0.09;
  g.add(blade, guard, grip, pommel);
  return g;
}

const julius: CombatStyle = {
  dodge: 0.8,
  maxHp: 180,
  poise: 45,
  range: [1.2, 2.2],
  downLine: 'Forgive me... Subaru...',
  onEnterCombat: (ctx) => {
    let sword = ctx.state.sword as Group | undefined;
    if (!sword) {
      sword = makeSword();
      // Blade along the thumb side of the grip (character-forward at rest).
      ctx.actor.visual.attach?.(sword, 'handR', new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(0, -0.35, 1).normalize()), 0.06);
      ctx.state.sword = sword;
    }
    sword.visible = true;
    ctx.actor.visual.setPartVisible?.('julius_sword', false);
    const orbit = (ctx.state.orbit as SpiritOrbit | undefined) ?? new SpiritOrbit(ctx.game.render.scene);
    ctx.state.orbit = orbit;
    orbit.target = 1;
  },
  onExitCombat: (ctx) => {
    const sword = ctx.state.sword as Group | undefined;
    if (sword) sword.visible = false;
    ctx.actor.visual.setPartVisible?.('julius_sword', true);
    const orbit = ctx.state.orbit as SpiritOrbit | undefined;
    if (orbit) orbit.target = 0;
  },
  tick: (ctx, dt) => {
    (ctx.state.orbit as SpiritOrbit | undefined)?.update(dt, chest(ctx.actor));
  },
  abilities: [
    {
      id: 'clauzeria',
      clip: 'clauzeria',
      cooldown: 18,
      range: [0, 3.5],
      commit: 1.7,
      score: (ctx) => (ctx.target && (ctx.target.elite || enemiesNear(ctx, ctx.target.entity.object3D.position, 3).length >= 2) ? 5 : 1.2),
      bark: 'Al Clauzeria!',
      execute: (ctx) => {
        melee(ctx, { reach: 4.6, arc: 160, damage: 32, type: 'physical', stagger: 45, color: new Color(1, 1, 1), rainbow: true, critical: true, hitStop: 0.12, max: 6 });
        ctx.game.camera.shake.add(0.3);
      },
    },
    {
      id: 'slash',
      clip: (ctx) => {
        const step = ((ctx.state.combo as number | undefined) ?? 0) % 3;
        ctx.state.combo = step + 1;
        return ['slash1', 'slash2', 'thrust'][step]!;
      },
      cooldown: 0.9,
      range: [0, 2.4],
      commit: 0.55,
      score: () => 2.2,
      execute: (ctx) => {
        const step = (((ctx.state.combo as number) ?? 1) - 1) % 3;
        melee(ctx, { reach: step === 2 ? 2.9 : 2.5, arc: step === 2 ? 40 : 120, damage: step === 2 ? 15 : 12, type: 'physical', stagger: step === 2 ? 18 : 10, color: new Color(0.75, 0.85, 1), reverse: step === 1 });
      },
    },
  ],
};

// ------------------------------------------------------------------ Ram
const ram: CombatStyle = {
  dodge: 0.6,
  maxHp: 110,
  poise: 20,
  resist: { wind: 0.3 },
  range: [5, 10],
  downLine: 'Tch... Barusu, you owe Ram for this.',
  abilities: [
    {
      id: 'fula',
      clip: 'castForward',
      cooldown: 3.6,
      range: [2, 16],
      commit: 0.85,
      score: () => 2,
      bark: 'Fula.',
      execute: (ctx) => {
        const a = ctx.actor;
        ctx.game.combat.fire({
          mesh: projectileMesh('windBlade'),
          from: chest(a).addScaledVector(forwardOf(a), 0.5),
          direction: forwardOf(a),
          speed: 22,
          homing: 1.5,
          target: ctx.target,
          radius: 0.45,
          maxDistance: 20,
          faction: 'party',
          spin: 0,
          damage: { amount: 13, type: 'wind', sourceId: a.entity.id, stagger: 16, tags: ['projectile'] },
        });
      },
    },
  ],
};

// ------------------------------------------------------------------ Anastasia / Echidna
const anastasia: CombatStyle = {
  dodge: 0.35,
  maxHp: 100,
  poise: 18,
  range: [6, 11],
  downLine: 'This body is... not mine to break...',
  abilities: [
    {
      id: 'analyze',
      clip: 'castPoint',
      cooldown: 16,
      range: [0, 18],
      commit: 0.9,
      score: (ctx) => (ctx.target && !ctx.target.hasStatus('marked') ? (ctx.target.elite ? 4 : 1.5) : 0),
      bark: 'There — Natsuki-kun, its weak point.',
      execute: (ctx) => {
        const t = ctx.target;
        if (!t) return;
        t.applyStatus({ id: 'marked', seconds: 10 });
        ctx.game.combat.impacts.burst('light', t.center(new Vector3()), 14);
      },
    },
  ],
};

// ------------------------------------------------------------------ Meili (charm comes with the witchbeasts)
const meili: CombatStyle = {
  dodge: 0.5,
  maxHp: 90,
  poise: 16,
  range: [6, 11],
  downLine: 'Owie... Onii-san...',
  abilities: [
    {
      // Divine protection of beast-taming: a witchbeast turns on its pack.
      id: 'charm',
      clip: 'castPoint',
      cooldown: 16,
      range: [0, 14],
      commit: 0.9,
      score: (ctx) => {
        const t = ctx.target;
        if (!t || t.elite || !t.tags.includes('witchbeast') || t.hasStatus('charmed')) return 0;
        return ctx.game.combat.enemies.length >= 2 ? 4 : 0.5;
      },
      bark: 'Come here, doggy~ Fight for us now.',
      execute: (ctx) => {
        const t = ctx.target;
        if (!t || !t.tags.includes('witchbeast')) return;
        t.applyStatus({ id: 'charmed', seconds: 12 });
        ctx.game.combat.impacts.burst('light', t.center(new Vector3()), 20);
      },
    },
  ],
};

// ------------------------------------------------------------------ Patrasche
const patrasche: CombatStyle = {
  dodge: 0.3,
  maxHp: 240,
  poise: 70,
  range: [1.4, 2.6],
  guard: true,
  downLine: '(Patrasche lets out a pained cry.)',
  abilities: [
    {
      id: 'tailSweep',
      clip: 'shake',
      cooldown: 5,
      range: [0, 2.2],
      commit: 1.0,
      score: (ctx) => enemiesNear(ctx, ctx.actor.position, 3).length * 1.2,
      execute: (ctx) => {
        for (const h of enemiesNear(ctx, ctx.actor.position, 3)) {
          ctx.game.combat.damage(h, { amount: 9, type: 'physical', sourceId: ctx.actor.entity.id, point: h.center(new Vector3()), direction: h.entity.object3D.position.clone().sub(ctx.actor.position).setY(0).normalize(), stagger: 18, tags: ['melee'] });
        }
      },
    },
    {
      id: 'ram',
      clip: 'roar',
      cooldown: 7,
      range: [0, 3],
      commit: 1.4,
      score: () => 1.6,
      execute: (ctx) => {
        melee(ctx, { reach: 3, arc: 70, damage: 15, type: 'physical', stagger: 32, color: new Color(0.9, 0.9, 1), hitStop: 0.08, max: 2 });
      },
    },
  ],
};

export const COMBAT_STYLES: Record<string, CombatStyle> = { emilia, beatrice, julius, ram, anastasia, meili, patrasche };

/** Is `h` fair game for the party? */
export const isPartyTarget = (h: Health) => hostile('party', h.effectiveFaction);
