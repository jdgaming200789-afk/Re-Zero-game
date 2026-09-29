/**
 * Player-facing settings, persisted separately from save games so they
 * survive new playthroughs and never corrupt story data.
 */
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high' | 'ultra';
export type TierQuality = 'low' | 'medium' | 'high';
export type PostQuality = 'off' | 'low' | 'high';
export type ViewDistance = 'near' | 'medium' | 'far';
export type AntiAliasing = 'off' | 'fxaa' | 'smaa';
export type TextSpeed = 'slow' | 'normal' | 'fast' | 'instant';
export type Difficulty = 'story' | 'normal' | 'hard';

export interface GraphicsSettings {
  preset: QualityPreset | 'custom';
  /** Multiplier on device pixel ratio (render resolution). */
  resolutionScale: number;
  shadowQuality: ShadowQuality;
  textureQuality: TierQuality;
  effectsQuality: TierQuality;
  postProcessing: PostQuality;
  viewDistance: ViewDistance;
  antiAliasing: AntiAliasing;
  ambientOcclusion: boolean;
  bloom: boolean;
  volumetrics: boolean;
  fieldOfView: number;
  showFps: boolean;
}

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
  voice: number;
  ui: number;
}

export interface GameplaySettings {
  cameraSensitivity: number;
  invertY: boolean;
  cameraShake: number;
  subtitles: boolean;
  textSpeed: TextSpeed;
  autoAdvance: boolean;
  autoAdvanceDelay: number;
  difficulty: Difficulty;
  toggleSprint: boolean;
  showHints: boolean;
}

export interface GameSettings {
  version: number;
  graphics: GraphicsSettings;
  audio: AudioSettings;
  gameplay: GameplaySettings;
  /** action id -> list of binding codes, overriding the defaults. */
  bindings: Record<string, string[]>;
}

export const SETTINGS_VERSION = 1;

export const QUALITY_PRESETS: Record<QualityPreset, Omit<GraphicsSettings, 'preset' | 'fieldOfView' | 'showFps'>> = {
  low: {
    resolutionScale: 0.75,
    shadowQuality: 'low',
    textureQuality: 'low',
    effectsQuality: 'low',
    postProcessing: 'low',
    viewDistance: 'near',
    antiAliasing: 'fxaa',
    ambientOcclusion: false,
    bloom: true,
    volumetrics: false,
  },
  medium: {
    resolutionScale: 1,
    shadowQuality: 'medium',
    textureQuality: 'medium',
    effectsQuality: 'medium',
    postProcessing: 'high',
    viewDistance: 'medium',
    antiAliasing: 'fxaa',
    ambientOcclusion: true,
    bloom: true,
    volumetrics: true,
  },
  high: {
    resolutionScale: 1,
    shadowQuality: 'high',
    textureQuality: 'high',
    effectsQuality: 'high',
    postProcessing: 'high',
    viewDistance: 'far',
    antiAliasing: 'smaa',
    ambientOcclusion: true,
    bloom: true,
    volumetrics: true,
  },
  ultra: {
    resolutionScale: 1.25,
    shadowQuality: 'ultra',
    textureQuality: 'high',
    effectsQuality: 'high',
    postProcessing: 'high',
    viewDistance: 'far',
    antiAliasing: 'smaa',
    ambientOcclusion: true,
    bloom: true,
    volumetrics: true,
  },
};

export function defaultSettings(): GameSettings {
  return {
    version: SETTINGS_VERSION,
    graphics: { preset: 'high', ...QUALITY_PRESETS.high, fieldOfView: 55, showFps: false },
    audio: { master: 0.85, music: 0.7, sfx: 0.85, ambient: 0.8, voice: 1, ui: 0.7 },
    gameplay: {
      cameraSensitivity: 1,
      invertY: false,
      cameraShake: 1,
      subtitles: true,
      textSpeed: 'normal',
      autoAdvance: false,
      autoAdvanceDelay: 1.6,
      difficulty: 'normal',
      toggleSprint: false,
      showHints: true,
    },
    bindings: {},
  };
}

/** Shadow map resolution per quality tier (0 = shadows disabled). */
export const SHADOW_MAP_SIZE: Record<ShadowQuality, number> = {
  off: 0,
  low: 1024,
  medium: 2048,
  high: 2048,
  ultra: 4096,
};

/** Max simultaneous shadow-casting local lights per tier. */
export const SHADOW_LIGHT_BUDGET: Record<ShadowQuality, number> = {
  off: 0,
  low: 1,
  medium: 2,
  high: 4,
  ultra: 6,
};

export const VIEW_DISTANCE: Record<ViewDistance, number> = {
  near: 180,
  medium: 400,
  far: 1400,
};

export const PARTICLE_DENSITY: Record<TierQuality, number> = {
  low: 0.35,
  medium: 0.7,
  high: 1,
};

export const TEXT_SPEED_CPS: Record<TextSpeed, number> = {
  slow: 28,
  normal: 48,
  fast: 90,
  instant: Infinity,
};
