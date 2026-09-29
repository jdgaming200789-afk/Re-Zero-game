import {
  BloomEffect,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  FXAAEffect,
  NoiseEffect,
  BlendFunction,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import {
  HalfFloatType,
  NoToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import { createLogger } from '../core/Log';
import type { GraphicsSettings } from '../settings/Settings';
import { SHADOW_MAP_SIZE, VIEW_DISTANCE } from '../settings/Settings';
import { ColorGradeEffect, lerpGrade, NEUTRAL_GRADE, type ColorGrade } from './effects/ColorGradeEffect';
import { ExposureEffect } from './effects/ExposureEffect';
import { damp } from '../core/math/MathUtil';

const log = createLogger('Render');

export interface RenderStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
}

/**
 * Owns the WebGL renderer and the post-processing chain.
 *
 * Chain: scene → N8AO (ambient occlusion) → bloom → tone mapping (AgX)
 *        → color grade → vignette/grain/chromatic → anti-aliasing.
 * Depth of field is inserted only during cinematics.
 */
export class RenderPipeline {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  scene: Scene;

  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private aoPass: N8AOPostPass | null = null;
  private readonly bloom: BloomEffect;
  private readonly toneMapping: ToneMappingEffect;
  private readonly exposureFx: ExposureEffect;
  readonly grade: ColorGradeEffect;
  private readonly vignette: VignetteEffect;
  private readonly grain: NoiseEffect;
  readonly chromatic: ChromaticAberrationEffect;
  private readonly dof: DepthOfFieldEffect;
  private mainPass: EffectPass;
  private dofPass: EffectPass;
  private aaPass: EffectPass | null = null;

  private settings: GraphicsSettings;
  private readonly size = new Vector2();

  // Grade blending (area moods, story beats)
  private gradeFrom: ColorGrade = { ...NEUTRAL_GRADE };
  private gradeTo: ColorGrade = { ...NEUTRAL_GRADE };
  private gradeCurrent: ColorGrade = { ...NEUTRAL_GRADE };
  private gradeT = 1;
  private gradeDuration = 1;
  /** Exposure target, smoothed to emulate eye adaptation between areas. */
  exposureTarget = 1;
  private exposure = 1;
  private chromaticBase = 0;
  chromaticPulse = 0;
  private frameTimes: number[] = [];

  constructor(canvas: HTMLCanvasElement, settings: GraphicsSettings) {
    this.settings = { ...settings };
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Tone mapping is done in the post chain (HDR until the end).
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.info.autoReset = false;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(settings.fieldOfView, 16 / 9, 0.08, VIEW_DISTANCE[settings.viewDistance]);

    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      intensity: 0.9,
      luminanceThreshold: 0.82,
      luminanceSmoothing: 0.22,
      radius: 0.72,
    });
    this.exposureFx = new ExposureEffect();
    this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    this.grade = new ColorGradeEffect();
    this.vignette = new VignetteEffect({ offset: 0.28, darkness: 0.62 });
    this.grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    this.grain.blendMode.opacity.value = 0.06;
    this.chromatic = new ChromaticAberrationEffect({ offset: new Vector2(0, 0), radialModulation: true, modulationOffset: 0.25 });
    this.dof = new DepthOfFieldEffect(this.camera, { focusDistance: 3, focusRange: 2.5, bokehScale: 2.2, resolutionScale: 0.5 });

    this.dofPass = new EffectPass(this.camera, this.dof);
    this.dofPass.enabled = false;
    this.mainPass = new EffectPass(this.camera, this.exposureFx, this.bloom, this.toneMapping, this.grade, this.vignette, this.chromatic, this.grain);

    this.rebuildChain();
    this.applySettings(settings);
  }

  /** Rebuilds the pass list (needed when AO / AA toggles). */
  private rebuildChain(): void {
    for (const p of [...this.composer.passes]) if (p !== this.renderPass) this.composer.removePass(p);
    const s = this.settings;
    const postOn = s.postProcessing !== 'off';

    if (postOn && s.ambientOcclusion) {
      if (!this.aoPass) {
        this.aoPass = new N8AOPostPass(this.scene, this.camera, 1, 1);
        const cfg = this.aoPass.configuration;
        cfg.aoRadius = 1.6;
        cfg.distanceFalloff = 0.9;
        cfg.intensity = 2.6;
        cfg.gammaCorrection = false;
        cfg.halfRes = true;
      }
      this.aoPass.setQualityMode(s.postProcessing === 'high' ? 'Medium' : 'Low');
      this.composer.addPass(this.aoPass);
    }

    this.composer.addPass(this.dofPass);
    this.composer.addPass(this.mainPass);

    if (s.antiAliasing !== 'off') {
      const aa = s.antiAliasing === 'smaa' ? new SMAAEffect({ preset: SMAAPreset.HIGH }) : new FXAAEffect();
      this.aaPass = new EffectPass(this.camera, aa);
      this.composer.addPass(this.aaPass);
    } else {
      this.aaPass = null;
    }
    this.onResize();
  }

  setScene(scene: Scene): void {
    this.scene = scene;
    this.renderPass.mainScene = scene;
    if (this.aoPass) (this.aoPass as unknown as { scene: Scene }).scene = scene;
  }

  applySettings(s: GraphicsSettings): void {
    const prev = this.settings;
    this.settings = { ...s };
    const chainChanged =
      prev.ambientOcclusion !== s.ambientOcclusion || prev.antiAliasing !== s.antiAliasing || prev.postProcessing !== s.postProcessing;
    if (chainChanged) this.rebuildChain();

    this.bloom.intensity = s.bloom && s.postProcessing !== 'off' ? 0.9 : 0;
    this.grain.blendMode.opacity.value = s.postProcessing === 'high' ? 0.055 : 0;

    const shadowSize = SHADOW_MAP_SIZE[s.shadowQuality];
    this.renderer.shadowMap.enabled = shadowSize > 0;
    this.renderer.shadowMap.needsUpdate = true;

    this.camera.far = VIEW_DISTANCE[s.viewDistance];
    this.camera.fov = s.fieldOfView;
    this.camera.updateProjectionMatrix();
    this.onResize();
    log.debug('Graphics settings applied', s);
  }

  get graphics(): Readonly<GraphicsSettings> {
    return this.settings;
  }

  get maxAnisotropy(): number {
    const cap = this.renderer.capabilities.getMaxAnisotropy();
    return this.settings.textureQuality === 'high' ? Math.min(16, cap) : this.settings.textureQuality === 'medium' ? Math.min(4, cap) : 1;
  }

  onResize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2) * this.settings.resolutionScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.aoPass?.setSize(Math.floor(w * ratio), Math.floor(h * ratio));
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.size.set(w, h);
  }

  // ---------------------------------------------------------------- grading
  /** Blend to a new grade over `seconds` (area mood, story beat). */
  setGrade(grade: ColorGrade, seconds = 1.5): void {
    this.gradeFrom = { ...this.gradeCurrent };
    this.gradeTo = { ...grade };
    this.gradeT = 0;
    this.gradeDuration = Math.max(0.001, seconds);
  }

  setChromaticBase(v: number): void {
    this.chromaticBase = v;
  }

  // ---------------------------------------------------------------- depth of field
  setDepthOfField(enabled: boolean, focusDistance = 3, focusRange = 2, bokeh = 2.2): void {
    this.dofPass.enabled = enabled && this.settings.postProcessing === 'high';
    this.dof.cocMaterial.focusDistance = focusDistance;
    this.dof.cocMaterial.focusRange = focusRange;
    this.dof.bokehScale = bokeh;
  }

  // ---------------------------------------------------------------- frame
  render(unscaledDt: number): void {
    // Grade blend
    if (this.gradeT < 1) {
      this.gradeT = Math.min(1, this.gradeT + unscaledDt / this.gradeDuration);
      const t = this.gradeT * this.gradeT * (3 - 2 * this.gradeT);
      lerpGrade(this.gradeFrom, this.gradeTo, t, this.gradeCurrent);
      this.grade.apply(this.gradeCurrent);
    }
    // Eye adaptation
    this.exposure = damp(this.exposure, this.exposureTarget, 0.6, unscaledDt);
    this.renderer.toneMappingExposure = this.exposure;
    this.exposureFx.exposure = this.exposure;
    // Chromatic aberration (subtle base + pulses from impacts / RbD)
    this.chromaticPulse = damp(this.chromaticPulse, 0, 0.12, unscaledDt);
    const ca = (this.chromaticBase + this.chromaticPulse) * 0.004;
    this.chromatic.offset.set(ca, ca * 0.6);

    this.renderer.info.reset();
    if (this.settings.postProcessing === 'off') {
      this.renderer.toneMapping = 6; // AgX
      this.renderer.render(this.scene, this.camera);
      this.renderer.toneMapping = NoToneMapping;
    } else {
      this.composer.render(unscaledDt);
    }

    this.frameTimes.push(unscaledDt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
  }

  stats(): RenderStats {
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.frameTimes.length);
    return {
      fps: avg > 0 ? 1 / avg : 0,
      frameMs: avg * 1000,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  get viewport(): Vector2 {
    return this.size;
  }
}
