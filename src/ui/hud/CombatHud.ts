import { Vector3, type PerspectiveCamera } from 'three';
import { SubaruCombat } from '../../combat/SubaruCombat';
import type { Health } from '../../combat/Health';
import type { DamageType } from '../../combat/Damage';
import { CompanionCombat } from '../../combat/companions/CompanionCombat';
import type { GameContext } from '../../game/GameContext';
import type { ButtonAction } from '../../input/Actions';
import { el } from '../dom';

interface Bar {
  root: HTMLElement;
  fill: HTMLElement;
  lag: HTMLElement;
  shield?: HTMLElement;
  shown: number;
  lagValue: number;
}

function bar(cls: string, withShield = false): Bar {
  const fill = el('i', { class: 'fill' });
  const lag = el('i', { class: 'lag' });
  const shield = withShield ? el('i', { class: 'shield' }) : undefined;
  const root = el('div', { class: `rz-bar ${cls}` }, [lag, fill, shield ?? null]);
  return { root, fill, lag, shield, shown: 1, lagValue: 1 };
}

function setBar(b: Bar, value: number, dt: number, shield = 0): void {
  // The bright fill snaps; the pale "lag" trails behind so damage reads.
  b.shown = value;
  b.lagValue = b.lagValue > value ? Math.max(value, b.lagValue - dt * 0.6) : value;
  b.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, value))})`;
  b.lag.style.transform = `scaleX(${Math.max(0, Math.min(1, b.lagValue))})`;
  if (b.shield) b.shield.style.transform = `scaleX(${Math.max(0, Math.min(1, shield))})`;
}

interface Ability {
  id: string;
  action: ButtonAction;
  name: string;
  root: HTMLElement;
  sweep: HTMLElement;
  count?: HTMLElement;
}

interface Plate {
  root: HTMLElement;
  bar: Bar;
  seen: number;
}

const TYPE_CLASS: Record<DamageType, string> = {
  physical: 'phys',
  ice: 'ice',
  fire: 'fire',
  wind: 'wind',
  yin: 'yin',
  yang: 'yang',
  light: 'light',
  miasma: 'miasma',
};

/**
 * Battle HUD in the game's night-sky language: Subaru's panel (HP with
 * shield overlay, stamina, Beatrice's mana), the party roster, Subaru's
 * ability bar with cooldown sweeps, the lock-on reticle and target plate,
 * floating nameplates over hurt enemies, and damage numbers.
 */
export class CombatHud {
  private readonly root: HTMLElement;
  private readonly self: HTMLElement;
  private readonly hp = bar('hp', true);
  private readonly stamina = bar('stamina');
  private readonly mana = bar('mana');
  private readonly hpText: HTMLElement;
  private readonly party: HTMLElement;
  private readonly partyRows = new Map<string, { row: HTMLElement; bar: Bar }>();
  private readonly abilities: Ability[] = [];
  private readonly abilityBar: HTMLElement;
  private readonly reticle: HTMLElement;
  private readonly target: HTMLElement;
  private readonly targetName: HTMLElement;
  private readonly targetBar = bar('enemy');
  private readonly targetStatus: HTMLElement;
  private readonly plates = new Map<Health, Plate>();
  private readonly world: HTMLElement;
  private readonly numbers: HTMLElement;
  private visibility = 0;
  private lastHit = -10;
  private readonly lastHp = new Map<Health, number>();

  constructor(private readonly game: GameContext) {
    const ui = game.ui;
    this.world = ui.layers.world;
    this.hpText = el('span', { class: 'num' });
    this.self = el('div', { class: 'rz-self rz-panel' }, [
      el('div', { class: 'name' }, [el('span', { class: 'star', html: '&#10022;' }), 'Natsuki Subaru', this.hpText]),
      this.hp.root,
      el('div', { class: 'row' }, [el('span', { class: 'lbl', text: 'Stamina' }), this.stamina.root]),
      el('div', { class: 'row mana-row' }, [el('span', { class: 'lbl', text: 'Beatrice' }), this.mana.root]),
    ]);
    this.party = el('div', { class: 'rz-party' });
    const defs: Array<[string, ButtonAction, string]> = [
      ['snare', 'attackHeavy', 'Snare'],
      ['shamak', 'ability1', 'Shamak'],
      ['barrier', 'ability2', 'E·M·M'],
      ['tonic', 'useQuickItem', 'Tonic'],
      ['focus', 'partyCommand', 'Focus'],
      ['regroup', 'callParty', 'Regroup'],
    ];
    this.abilityBar = el('div', { class: 'rz-abilities' });
    for (const [id, action, name] of defs) {
      const sweep = el('i', { class: 'sweep' });
      const count = id === 'tonic' ? el('b', { class: 'count' }) : undefined;
      const root = el('div', { class: `ab ab-${id}` }, [el('span', { class: 'rz-key', text: ui.actionGlyph(action) }), el('span', { class: 'nm', text: name }), sweep, count ?? null]);
      this.abilityBar.append(root);
      this.abilities.push({ id, action, name, root, sweep, count });
    }
    this.reticle = el('div', { class: 'rz-reticle' }, [el('i'), el('i'), el('i'), el('i')]);
    this.targetName = el('div', { class: 'tname' });
    this.targetStatus = el('div', { class: 'tstatus' });
    this.target = el('div', { class: 'rz-target' }, [this.targetName, this.targetBar.root, this.targetStatus]);
    this.numbers = el('div', { class: 'rz-numbers' });
    this.root = el('div', { class: 'rz-combat-hud' }, [this.self, this.party, this.abilityBar, this.target]);
    ui.layers.hud.append(this.root);
    this.world.append(this.reticle, this.numbers);

    game.events.on('combat:hit', ({ targetId, position, amount, critical, attackerId, damageType }) => {
      const type = (damageType in TYPE_CLASS ? damageType : 'physical') as DamageType;
      this.spawnNumber(position, amount, critical, type, targetId === game.player?.entity.id, attackerId);
      if (targetId === game.player?.entity.id) this.lastHit = game.time.elapsed;
    });
  }

  // ------------------------------------------------------------------ numbers
  private spawnNumber(at: Vector3, amount: number, critical: boolean, type: DamageType, onPlayer: boolean, attackerId: number): void {
    if (amount <= 0) return;
    const n = el('div', { class: `dmg ${TYPE_CLASS[type]}${critical ? ' crit' : ''}${onPlayer ? ' hurt' : ''}`, text: String(Math.round(amount)) });
    n.dataset.x = String(at.x);
    n.dataset.y = String(at.y + 0.3);
    n.dataset.z = String(at.z);
    n.dataset.born = String(this.game.time.elapsed);
    n.dataset.dx = String((Math.random() - 0.5) * 40 + (attackerId === this.game.player?.entity.id ? 0 : 10));
    this.numbers.append(n);
    while (this.numbers.children.length > 24) this.numbers.firstElementChild?.remove();
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, camera: PerspectiveCamera): void {
    const g = this.game;
    const player = g.player;
    const sc = player?.entity.get(SubaruCombat);
    if (!player || !sc) return;
    const inCombat = g.combat.inCombat;
    const hurt = sc.health.hp < sc.health.max || sc.health.shield > 0;
    const want = inCombat || hurt || g.time.elapsed - this.lastHit < 4 ? 1 : 0;
    const blocked = g.mode === 'dialogue' || g.mode === 'cinematic' || g.mode === 'menu' || g.mode === 'loading';
    this.visibility += ((blocked ? 0 : want) - this.visibility) * Math.min(1, dt * 6);
    this.root.style.opacity = this.visibility.toFixed(3);
    this.root.classList.toggle('combat', inCombat);

    // Subaru
    setBar(this.hp, sc.health.fraction, dt, sc.health.shield / sc.health.max);
    this.hpText.textContent = `${Math.ceil(sc.health.hp)} / ${sc.health.max}`;
    setBar(this.stamina, player.stamina / player.movement.maxStamina, dt);
    setBar(this.mana, sc.mana / sc.maxMana, dt);
    this.self.classList.toggle('low', sc.health.fraction < 0.3);
    this.self.classList.toggle('no-bea', !sc.beatricePresent);

    // Party roster
    const present = new Set<string>();
    for (const a of g.party.active) {
      const cc = a.entity.get(CompanionCombat);
      if (!cc) continue;
      present.add(a.id);
      let row = this.partyRows.get(a.id);
      if (!row) {
        const b = bar('ally');
        const r = el('div', { class: 'member' }, [el('span', { class: 'nm', text: a.def.shortName, style: { color: a.def.nameColor } }), b.root]);
        this.party.append(r);
        row = { row: r, bar: b };
        this.partyRows.set(a.id, row);
      }
      setBar(row.bar, cc.health.fraction, dt, cc.health.shield / cc.health.max);
      row.row.classList.toggle('down', !cc.health.alive);
    }
    for (const [id, row] of this.partyRows) {
      if (present.has(id)) continue;
      row.row.remove();
      this.partyRows.delete(id);
    }

    // Abilities
    const cds: Record<string, [number, number]> = {
      snare: [sc.cooldowns.snare, 3],
      shamak: [sc.cooldowns.shamak, 12],
      barrier: [sc.cooldowns.barrier, 8],
    };
    for (const ab of this.abilities) {
      const cd = cds[ab.id];
      ab.sweep.style.transform = `scaleY(${cd ? Math.min(1, cd[0] / cd[1]) : 0})`;
      let disabled = false;
      if (ab.id === 'shamak') disabled = !sc.beatricePresent || sc.mana < 30;
      if (ab.id === 'barrier') disabled = !sc.beatricePresent || sc.mana < 25;
      if (ab.id === 'tonic') {
        disabled = sc.tonics <= 0;
        ab.count!.textContent = String(sc.tonics);
      }
      if (ab.id === 'focus' || ab.id === 'regroup') disabled = g.party.active.length === 0;
      ab.root.classList.toggle('disabled', disabled);
      ab.root.classList.toggle('active', (ab.id === 'focus' || ab.id === 'regroup') && g.party.order === ab.id);
    }

    // Lock-on reticle + target plate
    const lock = sc.lockTarget;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (lock && lock.alive) {
      const p = this.project(lock.center(_v), camera, w, h);
      this.reticle.classList.toggle('visible', p !== null);
      if (p) this.reticle.style.transform = `translate(${p.x}px, ${p.y}px)`;
      this.target.classList.add('visible');
      this.targetName.textContent = lock.name;
      setBar(this.targetBar, lock.fraction, dt);
      this.targetStatus.textContent = [...lock.statuses].map((s) => STATUS_NAMES[s] ?? s).join(' · ');
    } else {
      this.reticle.classList.remove('visible');
      this.target.classList.remove('visible');
    }

    // Floating plates over enemies that have been hurt (not the locked one).
    const now = g.time.elapsed;
    for (const e of g.combat.all()) {
      if (e.faction !== 'enemy' || e === lock) continue;
      const prev = this.lastHp.get(e) ?? e.hp;
      this.lastHp.set(e, e.hp);
      let plate = this.plates.get(e);
      if (e.hp < prev && !plate) {
        const b = bar('enemy small');
        plate = { root: el('div', { class: 'rz-plate' }, [b.root]), bar: b, seen: now };
        this.world.append(plate.root);
        this.plates.set(e, plate);
      }
      if (!plate) continue;
      if (e.hp < prev) plate.seen = now;
      const age = now - plate.seen;
      if (!e.alive || e.entity.destroyed || age > 5 || !inCombat) {
        plate.root.remove();
        this.plates.delete(e);
        continue;
      }
      const p = this.project(_v.copy(e.entity.object3D.position).setY(e.entity.object3D.position.y + e.height + 0.25), camera, w, h);
      plate.root.style.opacity = p ? String(Math.min(1, (5 - age) * 2)) : '0';
      if (p) plate.root.style.transform = `translate(${p.x}px, ${p.y}px)`;
      setBar(plate.bar, e.fraction, dt);
    }

    // Damage numbers rise and fade.
    for (const n of Array.from(this.numbers.children) as HTMLElement[]) {
      const age = now - Number(n.dataset.born);
      if (age > 1.1) {
        n.remove();
        continue;
      }
      const p = this.project(_v.set(Number(n.dataset.x), Number(n.dataset.y), Number(n.dataset.z)), camera, w, h);
      if (!p) {
        n.style.opacity = '0';
        continue;
      }
      const rise = 38 * (1 - Math.pow(1 - Math.min(1, age / 0.8), 3));
      n.style.transform = `translate(${p.x + Number(n.dataset.dx) * age}px, ${p.y - rise}px) scale(${age < 0.08 ? 1.5 - age * 6 : 1})`;
      n.style.opacity = String(age < 0.75 ? 1 : 1 - (age - 0.75) / 0.35);
    }
  }

  private project(p: Vector3, camera: PerspectiveCamera, w: number, h: number): { x: number; y: number } | null {
    _ndc.copy(p).project(camera);
    if (_ndc.z > 1 || _ndc.z < -1) return null;
    return { x: (_ndc.x * 0.5 + 0.5) * w, y: (-_ndc.y * 0.5 + 0.5) * h };
  }
}

const STATUS_NAMES: Record<string, string> = {
  frozen: 'Frozen',
  stopped: 'Stopped',
  blinded: 'Blinded',
  charmed: 'Charmed',
  marked: 'Weak point',
  burning: 'Burning',
  slowed: 'Slowed',
};

const _v = new Vector3();
const _ndc = new Vector3();
