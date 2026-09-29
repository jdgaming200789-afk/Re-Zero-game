import { Vector2 } from 'three';
import { BUTTON_ACTIONS, PREVENT_DEFAULT_CODES, type ButtonAction, type ButtonActionDef, type InputContext } from './Actions';

export type InputDevice = 'kbm' | 'gamepad';

interface ActionState {
  def: ButtonActionDef;
  bindings: string[];
  held: boolean;
  pressed: boolean;
  released: boolean;
  /** Unscaled time of the most recent press (for input buffering). */
  lastPressTime: number;
  /** Press already handled by something (buffer consumed). */
  consumedPressTime: number;
  heldTime: number;
}

const STICK_DEADZONE = 0.18;
const TRIGGER_THRESHOLD = 0.35;

/**
 * Polled action-based input with context filtering.
 *
 * Raw device events are collected asynchronously, then resolved into action
 * states once per frame in `beginFrame`. Everything downstream reads actions.
 */
export class InputManager {
  private readonly actions = new Map<ButtonAction, ActionState>();
  private readonly activeContexts = new Set<InputContext>(['global']);

  // Raw state
  private readonly down = new Set<string>();
  private readonly pressedRaw = new Set<string>();
  private readonly releasedRaw = new Set<string>();
  private readonly consumedCodes = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelUp = false;
  private wheelDown = false;
  private padPrev: boolean[] = [];
  private padAxes: number[] = [0, 0, 0, 0];

  // Resolved per-frame values
  readonly move = new Vector2();
  readonly look = new Vector2();
  private time = 0;
  private _device: InputDevice = 'kbm';
  private textFocus = false;
  private pointerLockWanted = false;

  mouseSensitivity = 1;
  padLookSpeed = 2.6;
  invertY = false;
  onDeviceChanged?: (device: InputDevice) => void;
  /** The connected pad's id and which button symbols it wears. */
  padId = '';
  padFamily: 'xbox' | 'playstation' = 'xbox';

  constructor(private readonly element: HTMLElement) {
    for (const def of BUTTON_ACTIONS) {
      this.actions.set(def.id, {
        def,
        bindings: [...def.bindings],
        held: false,
        pressed: false,
        released: false,
        lastPressTime: -Infinity,
        consumedPressTime: -Infinity,
        heldTime: 0,
      });
    }
    this.attach();
  }

  // ---------------------------------------------------------------- contexts
  setContexts(contexts: InputContext[]): void {
    this.activeContexts.clear();
    this.activeContexts.add('global');
    for (const c of contexts) this.activeContexts.add(c);
    // Drop held state for actions that just lost context so a held attack
    // doesn't leak into dialogue.
    for (const s of this.actions.values()) {
      if (!this.isActionActive(s)) {
        s.held = false;
        s.heldTime = 0;
      }
    }
  }

  hasContext(ctx: InputContext): boolean {
    return this.activeContexts.has(ctx);
  }

  get contexts(): InputContext[] {
    return Array.from(this.activeContexts);
  }

  private isActionActive(s: ActionState): boolean {
    for (const c of s.def.contexts) if (this.activeContexts.has(c)) return true;
    return false;
  }

  // ---------------------------------------------------------------- bindings
  applyBindingOverrides(overrides: Readonly<Record<string, string[]>>): void {
    for (const s of this.actions.values()) {
      const o = overrides[s.def.id];
      s.bindings = o && s.def.rebindable ? [...o] : [...s.def.bindings];
    }
  }

  bindingsFor(action: ButtonAction): readonly string[] {
    return this.actions.get(action)?.bindings ?? [];
  }

  get device(): InputDevice {
    return this._device;
  }

  // ---------------------------------------------------------------- queries
  pressed(action: ButtonAction): boolean {
    const s = this.actions.get(action)!;
    return s.pressed && s.consumedPressTime !== s.lastPressTime && this.isActionActive(s);
  }

  released(action: ButtonAction): boolean {
    const s = this.actions.get(action)!;
    return s.released && this.isActionActive(s);
  }

  held(action: ButtonAction): boolean {
    const s = this.actions.get(action)!;
    return s.held && this.isActionActive(s);
  }

  heldTime(action: ButtonAction): number {
    const s = this.actions.get(action)!;
    return s.held ? s.heldTime : 0;
  }

  /**
   * True if the action was pressed within `window` seconds and that press
   * has not been consumed yet. Combat uses this so an attack pressed slightly
   * before the previous swing ends still comes out.
   */
  buffered(action: ButtonAction, window = 0.2): boolean {
    const s = this.actions.get(action)!;
    if (!this.isActionActive(s)) return false;
    return this.time - s.lastPressTime <= window && s.consumedPressTime !== s.lastPressTime;
  }

  /** Marks the current press handled, including other actions sharing its physical input. */
  consume(action: ButtonAction): void {
    const s = this.actions.get(action)!;
    s.consumedPressTime = s.lastPressTime;
    for (const code of s.bindings) if (this.pressedRaw.has(code)) this.consumedCodes.add(code);
    // Same physical key may drive a different action in the same frame
    // (Space = jump + confirm). Consume those too.
    for (const other of this.actions.values()) {
      if (other === s || !other.pressed) continue;
      if (other.bindings.some((c) => this.consumedCodes.has(c))) other.consumedPressTime = other.lastPressTime;
    }
  }

  // ---------------------------------------------------------------- frame
  /** Resolve raw input into actions. Call once at the start of each frame. */
  beginFrame(unscaledTime: number, dt: number): void {
    this.time = unscaledTime;
    this.pollGamepad();

    for (const s of this.actions.values()) {
      let isHeld = false;
      let wasPressed = false;
      let wasReleased = false;
      for (const code of s.bindings) {
        if (code === 'Wheel:up') {
          if (this.wheelUp) wasPressed = true;
          continue;
        }
        if (code === 'Wheel:down') {
          if (this.wheelDown) wasPressed = true;
          continue;
        }
        if (this.down.has(code)) isHeld = true;
        if (this.pressedRaw.has(code) && !this.consumedCodes.has(code)) wasPressed = true;
        if (this.releasedRaw.has(code)) wasReleased = true;
      }
      const active = this.isActionActive(s);
      s.pressed = wasPressed && active;
      s.released = wasReleased && s.held;
      s.held = isHeld && active;
      s.heldTime = s.held ? s.heldTime + dt : 0;
      if (s.pressed) s.lastPressTime = unscaledTime;
    }

    this.resolveAxes();
  }

  /** Clear one-frame edges. Call at the end of each frame. */
  endFrame(): void {
    this.pressedRaw.clear();
    this.releasedRaw.clear();
    this.consumedCodes.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelUp = false;
    this.wheelDown = false;
  }

  private resolveAxes(): void {
    const gameplay = this.activeContexts.has('gameplay') || this.activeContexts.has('combat');
    this.move.set(0, 0);
    this.look.set(0, 0);
    if (!gameplay || this.textFocus) return;

    // Keyboard composite
    let kx = 0;
    let ky = 0;
    if (this.down.has('Key:KeyW') || this.down.has('Key:ArrowUp')) ky += 1;
    if (this.down.has('Key:KeyS') || this.down.has('Key:ArrowDown')) ky -= 1;
    if (this.down.has('Key:KeyD') || this.down.has('Key:ArrowRight')) kx += 1;
    if (this.down.has('Key:KeyA') || this.down.has('Key:ArrowLeft')) kx -= 1;
    if (kx !== 0 || ky !== 0) {
      this.move.set(kx, ky);
      if (this.move.lengthSq() > 1) this.move.normalize();
    }

    // Gamepad sticks with radial deadzone and response curve
    const [lx, ly, rx, ry] = this.padAxes;
    const stick = applyDeadzone(lx!, -ly!);
    if (stick.lengthSq() > this.move.lengthSq()) this.move.copy(stick);

    // Look: mouse deltas are in pixels, stick is rate-based
    const mouseScale = 0.0022 * this.mouseSensitivity;
    this.look.x = this.mouseDX * mouseScale;
    this.look.y = this.mouseDY * mouseScale;
    const rs = applyDeadzone(rx!, ry!);
    if (rs.lengthSq() > 0) {
      const curve = rs.length() ** 1.6 / Math.max(rs.length(), 1e-5);
      this.look.x += rs.x * curve * this.padLookSpeed * this.mouseSensitivity * (1 / 60);
      this.look.y += rs.y * curve * this.padLookSpeed * 0.75 * this.mouseSensitivity * (1 / 60);
    }
    if (this.invertY) this.look.y = -this.look.y;
  }

  // ---------------------------------------------------------------- gamepad
  private pollGamepad(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    if (!pad) {
      this.padAxes = [0, 0, 0, 0];
      return;
    }
    if (pad.id !== this.padId) {
      this.padId = pad.id;
      this.padFamily = padFamily(pad.id);
    }
    const axes = pad.axes;
    this.padAxes = [axes[0] ?? 0, axes[1] ?? 0, axes[2] ?? 0, axes[3] ?? 0];
    let anyActivity = Math.hypot(this.padAxes[0]!, this.padAxes[1]!) > 0.3 || Math.hypot(this.padAxes[2]!, this.padAxes[3]!) > 0.3;

    for (let i = 0; i < pad.buttons.length; i++) {
      const b = pad.buttons[i]!;
      const isDown = b.pressed || b.value > TRIGGER_THRESHOLD;
      const was = this.padPrev[i] ?? false;
      const code = `Pad:${i}`;
      if (isDown && !was) {
        this.pressedRaw.add(code);
        this.down.add(code);
        anyActivity = true;
      } else if (!isDown && was) {
        this.releasedRaw.add(code);
        this.down.delete(code);
      }
      this.padPrev[i] = isDown;
    }
    if (anyActivity) this.setDevice('gamepad');
  }

  private setDevice(d: InputDevice): void {
    if (this._device === d) return;
    this._device = d;
    this.onDeviceChanged?.(d);
  }

  // ---------------------------------------------------------------- pointer lock
  /** Gameplay wants the mouse captured for camera control. */
  setPointerLockWanted(wanted: boolean): void {
    this.pointerLockWanted = wanted;
    if (!wanted && document.pointerLockElement) document.exitPointerLock?.();
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  private tryLockPointer(): void {
    if (!this.pointerLockWanted || this.pointerLocked) return;
    try {
      const p = this.element.requestPointerLock?.() as unknown;
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => undefined);
    } catch {
      /* not allowed yet (needs a user gesture) */
    }
  }

  // ---------------------------------------------------------------- raw events
  private attach(): void {
    window.addEventListener('keydown', (e) => {
      if (this.isTypingTarget(e.target)) return;
      const code = `Key:${e.code}`;
      if (PREVENT_DEFAULT_CODES.has(e.code) || this.isBoundCode(code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(code);
      this.pressedRaw.add(code);
      this.setDevice('kbm');
    });
    window.addEventListener('keyup', (e) => {
      const code = `Key:${e.code}`;
      this.down.delete(code);
      this.releasedRaw.add(code);
    });
    window.addEventListener('blur', () => {
      // Avoid stuck keys when the tab loses focus mid-press.
      for (const code of this.down) if (!code.startsWith('Pad:')) this.releasedRaw.add(code);
      for (const code of Array.from(this.down)) if (!code.startsWith('Pad:')) this.down.delete(code);
    });
    this.element.addEventListener('mousedown', (e) => {
      const code = `Mouse:${e.button}`;
      this.down.add(code);
      this.pressedRaw.add(code);
      this.setDevice('kbm');
      this.tryLockPointer();
    });
    window.addEventListener('mouseup', (e) => {
      const code = `Mouse:${e.button}`;
      if (this.down.delete(code)) this.releasedRaw.add(code);
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (this.down.has('Mouse:2') || this.down.has('Mouse:0')) {
        // Drag-to-look fallback when pointer lock is unavailable.
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    this.element.addEventListener(
      'wheel',
      (e) => {
        if (e.deltaY < 0) this.wheelUp = true;
        else if (e.deltaY > 0) this.wheelDown = true;
        e.preventDefault();
      },
      { passive: false },
    );
    this.element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('focusin', (e) => (this.textFocus = this.isTypingTarget(e.target)));
    document.addEventListener('focusout', () => (this.textFocus = false));
  }

  private isBoundCode(code: string): boolean {
    for (const s of this.actions.values()) if (s.bindings.includes(code) && this.isActionActive(s)) return true;
    return false;
  }

  private isTypingTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
  }

  /** Test/automation hook: simulate a raw input edge. */
  simulate(code: string, down: boolean): void {
    if (down) {
      if (!this.down.has(code)) this.pressedRaw.add(code);
      this.down.add(code);
    } else {
      if (this.down.delete(code)) this.releasedRaw.add(code);
    }
  }

  /** Test/automation hook: pretend the last input came from a device. */
  simulateDevice(device: InputDevice, family: 'xbox' | 'playstation' = this.padFamily): void {
    this.padFamily = family;
    const changed = this._device !== device;
    this.setDevice(device);
    if (!changed) this.onDeviceChanged?.(device);
  }

  /** Test/automation hook: inject mouse look deltas. */
  simulateLook(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }
}

const _dz = new Vector2();
function applyDeadzone(x: number, y: number): Vector2 {
  _dz.set(x, y);
  const mag = _dz.length();
  if (mag < STICK_DEADZONE) return _dz.set(0, 0);
  const scaled = Math.min(1, (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE));
  return _dz.multiplyScalar(scaled / mag);
}

/** Human-readable glyph text for a binding code, used by prompts and settings. */
/** Which button symbols a connected pad wears, from its id string (Sony's vendor id is 054c). */
export function padFamily(id: string): 'xbox' | 'playstation' {
  // Microsoft's pads also call themselves "Wireless Controller" (vendor 045e).
  if (/xbox|045e/i.test(id)) return 'xbox';
  return /054c|dualshock|dualsense|playstation|wireless controller/i.test(id) ? 'playstation' : 'xbox';
}

export function bindingLabel(code: string): string {
  const [kind, value = ''] = code.split(':');
  if (kind === 'Key') {
    if (value.startsWith('Key')) return value.slice(3);
    if (value.startsWith('Digit')) return value.slice(5);
    const names: Record<string, string> = {
      Space: 'Space',
      ShiftLeft: 'Shift',
      ShiftRight: 'Shift',
      ControlLeft: 'Ctrl',
      ControlRight: 'Ctrl',
      AltLeft: 'Alt',
      AltRight: 'Alt',
      Escape: 'Esc',
      Enter: 'Enter',
      Tab: 'Tab',
      Backquote: '`',
      Backspace: 'Bksp',
      ArrowUp: '↑',
      ArrowDown: '↓',
      ArrowLeft: '←',
      ArrowRight: '→',
    };
    return names[value] ?? value;
  }
  if (kind === 'Mouse') return ['LMB', 'MMB', 'RMB', 'M4', 'M5'][Number(value)] ?? `M${value}`;
  if (kind === 'Wheel') return value === 'up' ? 'Wheel ↑' : 'Wheel ↓';
  if (kind === 'Pad') {
    const pad = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→'];
    return pad[Number(value)] ?? `Pad ${value}`;
  }
  return code;
}
