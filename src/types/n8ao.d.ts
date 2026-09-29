declare module 'n8ao' {
  import type { Camera, Scene } from 'three';
  import type { Pass } from 'postprocessing';

  export interface N8AOConfiguration {
    aoRadius: number;
    distanceFalloff: number;
    intensity: number;
    gammaCorrection: boolean;
    halfRes: boolean;
    depthAwareUpsampling: boolean;
    screenSpaceRadius: boolean;
    aoSamples: number;
    denoiseSamples: number;
    denoiseRadius: number;
    color: { set(c: number | string): void };
  }

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: N8AOConfiguration;
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
    setSize(width: number, height: number): void;
  }
}
