import { Vector3, type PerspectiveCamera } from 'three';
import type { EventBus } from '../core/events/EventBus';
import type { GameEvents } from '../core/events/GameEvents';
import type { Scheduler } from '../core/Scheduler';
import { bindingLabel, type InputManager } from '../input/InputManager';
import type { ButtonAction } from '../input/Actions';
import type { Interactable } from '../interaction/Interactable';
import { el, ICONS } from './dom';
import './styles/base.css';

type ToastKind = 'info' | 'item' | 'quest' | 'knowledge' | 'warning';

const TOAST_TITLES: Record<ToastKind, string> = {
  info: 'Notice',
  item: 'Obtained',
  quest: 'Journal',
  knowledge: 'Subaru remembers',
  warning: 'Cannot',
};

/**
 * Root of the DOM UI. Owns the layer stack and the always-present widgets
 * (prompt, toasts, fader, loading screen, barks). Screens such as the
 * inventory and journal register themselves as layers on top.
 */
export class UIManager {
  readonly root: HTMLElement;
  readonly layers: {
    world: HTMLElement;
    hud: HTMLElement;
    dialogue: HTMLElement;
    screens: HTMLElement;
    overlay: HTMLElement;
    debug: HTMLElement;
  };
  private readonly prompt: HTMLElement;
  private readonly promptKey: HTMLElement;
  private readonly promptVerb: HTMLElement;
  private readonly promptLabel: HTMLElement;
  private readonly promptIcon: HTMLElement;
  private readonly promptHold: SVGCircleElement;
  private readonly toasts: HTMLElement;
  private readonly fader: HTMLElement;
  private readonly loading: HTMLElement;
  private readonly loadingBar: HTMLElement;
  private readonly loadingTitle: HTMLElement;
  private readonly loadingSub: HTMLElement;
  private readonly barks: HTMLElement;
  private readonly inspect: HTMLElement;
  private readonly fps: HTMLElement;
  private fadeToken = 0;
  private readonly screenPos = new Vector3();

  constructor(
    events: EventBus<GameEvents>,
    private readonly input: InputManager,
    private readonly scheduler: Scheduler,
  ) {
    this.root = document.getElementById('ui-root') ?? document.body.appendChild(el('div', { id: 'ui-root' }));
    const layer = (name: string) => this.root.appendChild(el('div', { class: `ui-layer ui-${name}` }));
    this.layers = {
      world: layer('world'),
      hud: layer('hud'),
      dialogue: layer('dialogue'),
      screens: layer('screens'),
      overlay: layer('overlay'),
      debug: layer('debug'),
    };

    // Interaction prompt
    const ns = 'http://www.w3.org/2000/svg';
    const holdSvg = document.createElementNS(ns, 'svg');
    holdSvg.setAttribute('class', 'hold');
    holdSvg.setAttribute('viewBox', '0 0 40 40');
    this.promptHold = document.createElementNS(ns, 'circle');
    this.promptHold.setAttribute('cx', '20');
    this.promptHold.setAttribute('cy', '20');
    this.promptHold.setAttribute('r', '18');
    this.promptHold.setAttribute('pathLength', '100');
    this.promptHold.setAttribute('stroke-dasharray', '0 100');
    holdSvg.appendChild(this.promptHold);
    this.promptKey = el('span', { class: 'key', text: 'E' });
    const glyph = el('div', { class: 'glyph' }, [el('div', { class: 'diamond' }), holdSvg, this.promptKey]);
    this.promptIcon = el('span', { class: 'icon' });
    this.promptVerb = el('span', { class: 'verb' });
    this.promptLabel = el('span', { class: 'label' });
    this.prompt = el('div', { class: 'rz-prompt' }, [glyph, el('div', { class: 'text' }, [el('div', { style: { display: 'flex', gap: '0.45em', alignItems: 'center' } }, [this.promptIcon, this.promptVerb]), this.promptLabel])]);
    this.layers.world.appendChild(this.prompt);

    this.barks = this.layers.hud.appendChild(el('div', { class: 'rz-barks' }));
    this.toasts = this.layers.hud.appendChild(el('div', { class: 'rz-toasts' }));
    this.inspect = this.layers.dialogue.appendChild(el('div', { class: 'rz-inspect rz-panel' }));

    this.fader = this.layers.overlay.appendChild(el('div', { class: 'rz-fader' }));
    this.loadingTitle = el('div', { class: 'area' });
    this.loadingSub = el('div', { class: 'sub' });
    this.loadingBar = el('i');
    this.loading = this.layers.overlay.appendChild(
      el('div', { class: 'rz-loading' }, [this.loadingTitle, this.loadingSub, el('div', { class: 'bar' }, [this.loadingBar])]),
    );
    this.fps = this.layers.debug.appendChild(el('div', { class: 'rz-fps' }));

    events.on('ui:notify', ({ text, kind }) => this.notify(text, kind ?? 'info'));
    events.on('bark:play', ({ speakerId, text, duration }) => this.bark(speakerId, text, duration));
  }

  // ---------------------------------------------------------------- prompt
  /** Position the interaction prompt over the focused object (called every frame). */
  updatePrompt(focused: Interactable | null, camera: PerspectiveCamera, holdFraction: number, lockedText: string | null): void {
    if (!focused) {
      this.prompt.classList.remove('visible');
      return;
    }
    const p = focused.worldAnchor(this.screenPos).project(camera);
    if (p.z > 1) {
      this.prompt.classList.remove('visible');
      return;
    }
    const x = (p.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-p.y * 0.5 + 0.5) * window.innerHeight;
    this.prompt.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-1.2em, -50%)`;
    this.promptKey.textContent = this.actionGlyph('interact');
    this.promptVerb.textContent = lockedText ? 'Locked' : focused.hold > 0 ? `Hold · ${focused.verb}` : focused.verb;
    this.promptLabel.textContent = focused.label;
    this.promptIcon.innerHTML = ICONS[focused.kind] ?? ICONS.use!;
    this.promptHold.setAttribute('stroke-dasharray', `${(holdFraction * 100).toFixed(1)} 100`);
    this.prompt.classList.toggle('locked', !!lockedText);
    this.prompt.classList.add('visible');
  }

  /** Short label for the first binding of an action on the active device. */
  actionGlyph(action: ButtonAction): string {
    const codes = this.input.bindingsFor(action);
    const wantPad = this.input.device === 'gamepad';
    const code = codes.find((c) => c.startsWith('Pad:') === wantPad) ?? codes[0];
    return code ? bindingLabel(code) : '?';
  }

  // ---------------------------------------------------------------- notifications
  notify(text: string, kind: ToastKind = 'info', seconds = 4): void {
    const toast = el('div', { class: `rz-toast ${kind}` }, [el('span', { class: 'kind', text: TOAST_TITLES[kind] }), text]);
    this.toasts.appendChild(toast);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => {
      toast.classList.add('out');
      window.setTimeout(() => toast.remove(), 520);
    }, seconds * 1000);
  }

  private readonly speakerNames: Record<string, string> = {};
  private readonly speakerColors: Record<string, string> = {};
  registerSpeakerName(id: string, name: string, color?: string): void {
    this.speakerNames[id] = name;
    if (color) this.speakerColors[id] = color;
  }

  /** Ambient line of speech during gameplay (party chatter, Subaru's asides). */
  bark(speakerId: string, text: string, seconds = 3): void {
    const name = this.speakerNames[speakerId] ?? speakerId;
    const who = el('span', { class: 'who', text: name });
    const color = this.speakerColors[speakerId];
    if (color) who.style.color = color;
    const node = el('div', { class: 'rz-bark' }, [who, text]);
    node.dataset.speaker = speakerId;
    this.barks.appendChild(node);
    while (this.barks.children.length > 3) this.barks.firstElementChild?.remove();
    window.setTimeout(() => {
      node.classList.add('out');
      window.setTimeout(() => node.remove(), 420);
    }, seconds * 1000);
  }

  /** Examine card with Subaru's observation. Resolves when dismissed. */
  showInspect(title: string, body: string): Promise<void> {
    this.inspect.innerHTML = '';
    this.inspect.append(
      el('h3', { class: 'rz-heading', text: title }),
      el('p', { text: body }),
      el('div', { class: 'continue' }, [el('span', { class: 'rz-key', text: this.actionGlyph('interact') }), 'Continue']),
    );
    this.inspect.classList.add('visible');
    return new Promise((resolve) => {
      this.modal = {
        age: 0,
        resolve: () => {
          this.inspect.classList.remove('visible');
          resolve();
        },
      };
    });
  }

  private modal: { age: number; resolve: () => void } | null = null;

  /** Per-frame UI logic that needs resolved input (call after input.beginFrame). */
  update(dt: number): void {
    const m = this.modal;
    if (!m) return;
    m.age += dt;
    if (m.age < 0.3) return;
    const i = this.input;
    for (const a of ['interact', 'confirm', 'advance', 'cancel'] as const) {
      if (i.pressed(a)) {
        i.consume(a);
        this.modal = null;
        m.resolve();
        return;
      }
    }
  }

  // ---------------------------------------------------------------- fades
  get fadeLevel(): number {
    return Number(this.fader.style.opacity || 0);
  }

  /** Fade the screen to `to` (0 clear .. 1 opaque). Runs on unscaled game time. */
  fade(to: number, seconds: number, color = '#000'): Promise<void> {
    const token = ++this.fadeToken;
    this.fader.style.background = color;
    const from = this.fadeLevel;
    if (seconds <= 0) {
      this.fader.style.opacity = String(to);
      return Promise.resolve();
    }
    return this.scheduler.tween(
      seconds,
      (t) => {
        if (token === this.fadeToken) this.fader.style.opacity = String(from + (to - from) * t);
      },
      { scaled: false, ease: 'inOutSine' },
    );
  }

  // ---------------------------------------------------------------- loading
  showLoading(title: string, subtitle: string): void {
    this.loadingTitle.textContent = title;
    this.loadingSub.textContent = subtitle;
    this.loadingBar.style.width = '0%';
    this.loading.classList.add('visible');
  }
  setLoadingProgress(p: number): void {
    this.loadingBar.style.width = `${Math.round(p * 100)}%`;
  }
  hideLoading(): void {
    this.loading.classList.remove('visible');
  }

  setFpsText(text: string | null): void {
    this.fps.textContent = text ?? '';
  }
}
