import type { EventBus } from '../core/events/EventBus';
import type { GameEvents } from '../core/events/GameEvents';
import { createLogger } from '../core/Log';
import { safeStorage } from '../save/SafeStorage';
import {
  defaultSettings,
  QUALITY_PRESETS,
  SETTINGS_VERSION,
  type GameSettings,
  type GraphicsSettings,
  type QualityPreset,
} from './Settings';

const log = createLogger('Settings');
const STORAGE_KEY = 'rzp.settings';

type Section = 'graphics' | 'audio' | 'gameplay';

export class SettingsManager {
  private data: GameSettings;

  constructor(private readonly events: EventBus<GameEvents>) {
    this.data = this.load();
  }

  get all(): Readonly<GameSettings> {
    return this.data;
  }
  get graphics(): Readonly<GameSettings['graphics']> {
    return this.data.graphics;
  }
  get audio(): Readonly<GameSettings['audio']> {
    return this.data.audio;
  }
  get gameplay(): Readonly<GameSettings['gameplay']> {
    return this.data.gameplay;
  }
  get bindings(): Readonly<Record<string, string[]>> {
    return this.data.bindings;
  }

  set<S extends Section, K extends keyof GameSettings[S]>(section: S, key: K, value: GameSettings[S][K]): void {
    const target = this.data[section] as GameSettings[S];
    if (target[key] === value) return;
    target[key] = value;
    if (section === 'graphics' && key !== 'preset' && key !== 'fieldOfView' && key !== 'showFps') {
      (this.data.graphics as GraphicsSettings).preset = 'custom';
    }
    this.save();
    this.events.emit('settings:changed', { key: `${section}.${String(key)}` });
  }

  applyPreset(preset: QualityPreset): void {
    Object.assign(this.data.graphics, QUALITY_PRESETS[preset], { preset });
    this.save();
    this.events.emit('settings:changed', { key: 'graphics.preset' });
  }

  setBinding(action: string, codes: string[]): void {
    this.data.bindings[action] = codes;
    this.save();
    this.events.emit('settings:changed', { key: `bindings.${action}` });
  }

  resetBindings(): void {
    this.data.bindings = {};
    this.save();
    this.events.emit('settings:changed', { key: 'bindings' });
  }

  resetAll(): void {
    this.data = defaultSettings();
    this.save();
    this.events.emit('settings:changed', { key: '*' });
  }

  private load(): GameSettings {
    const defaults = defaultSettings();
    const raw = safeStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    try {
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      // Merge section by section so settings added in later versions get
      // their defaults instead of `undefined`.
      return {
        version: SETTINGS_VERSION,
        graphics: { ...defaults.graphics, ...(parsed.graphics ?? {}) },
        audio: { ...defaults.audio, ...(parsed.audio ?? {}) },
        gameplay: { ...defaults.gameplay, ...(parsed.gameplay ?? {}) },
        bindings: { ...(parsed.bindings ?? {}) },
      };
    } catch (err) {
      log.warn('Settings were unreadable; restoring defaults.', err);
      return defaults;
    }
  }

  private save(): void {
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }
}
