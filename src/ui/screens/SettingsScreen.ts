import type { GameContext } from '../../game/GameContext';
import { BUTTON_ACTIONS, type ButtonAction } from '../../input/Actions';
import { bindingLabel } from '../../input/InputManager';
import type { AntiAliasing, ButtonPromptStyle, SubaruCostume, Difficulty, PostQuality, QualityPreset, ShadowQuality, TextSpeed, TierQuality, ViewDistance } from '../../settings/Settings';
import { el } from '../dom';
import { MenuList, cycle, stepNum, type MenuRow } from './MenuList';
import { Screen } from './Screen';

type Tab = 'graphics' | 'audio' | 'gameplay' | 'controls';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'graphics', label: 'Graphics' },
  { id: 'audio', label: 'Audio' },
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'controls', label: 'Controls' },
];

const PRESETS: QualityPreset[] = ['low', 'medium', 'high', 'ultra'];
const SHADOWS: ShadowQuality[] = ['off', 'low', 'medium', 'high', 'ultra'];
const TIERS: TierQuality[] = ['low', 'medium', 'high'];
const POST: PostQuality[] = ['off', 'low', 'high'];
const VIEW: ViewDistance[] = ['near', 'medium', 'far'];
const AA: AntiAliasing[] = ['off', 'fxaa', 'smaa'];
const TEXT: TextSpeed[] = ['slow', 'normal', 'fast', 'instant'];
const DIFF: Difficulty[] = ['story', 'normal', 'hard'];
const PROMPTS: ButtonPromptStyle[] = ['auto', 'keyboard', 'xbox', 'playstation'];
const PROMPT_NAMES: Record<ButtonPromptStyle, string> = { auto: 'Auto', keyboard: 'Keyboard', xbox: 'Xbox', playstation: 'PlayStation' };
const COSTUMES: SubaruCostume[] = ['arc6', 'tracksuit'];
const COSTUME_NAMES: Record<SubaruCostume, string> = { arc6: 'Travelling clothes', tracksuit: 'Tracksuit' };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const onOff = (v: boolean) => (v ? 'On' : 'Off');

/**
 * Settings, applied live and saved separately from story saves. Graphics
 * presets fill in every graphics option; touching one marks the preset
 * "custom". Controls can be rebound: pick an action, press the new key.
 */
export class SettingsScreen extends Screen {
  readonly id = 'settings';
  private tab: Tab = 'graphics';
  private readonly tabBar: HTMLElement;
  private readonly list = new MenuList('settings');
  private readonly note: HTMLElement;
  private capturing: ButtonAction | null = null;
  private readonly onKey = (e: KeyboardEvent) => this.capture(`Key:${e.code}`, e);
  private readonly onMouse = (e: MouseEvent) => this.capture(`Mouse:${e.button}`, e);

  constructor(game: GameContext) {
    super(game);
    this.root.classList.add('rz-settings');
    this.tabBar = el('div', { class: 'tabs' });
    this.note = el('div', { class: 'hint-line' });
    this.root.append(
      el('div', { class: 'rz-panel rz-sframe' }, [
        el('h2', { class: 'rz-heading', text: 'Settings' }),
        el('div', { class: 'tabs-wrap' }, [game.ui.key('tabPrev'), this.tabBar, game.ui.key('tabNext')]),
        el('div', { class: 'rz-rule' }),
        el('div', { class: 'scroll' }, [this.list.root]),
        this.note,
        el('div', { class: 'foot' }, [game.ui.key('navLeft', 'navRight'), 'Change', el('span', { class: 'gap' }), game.ui.key('cancel'), 'Back']),
      ]),
    );
  }

  protected onOpen(): void {
    this.render(false);
  }

  protected override onClose(): void {
    this.stopCapture();
  }

  private setTab(t: Tab): void {
    this.tab = t;
    this.stopCapture();
    this.render(false);
  }

  private render(keep = true): void {
    this.tabBar.textContent = '';
    for (const t of TABS) {
      const b = el('button', { class: `tab${t.id === this.tab ? ' on' : ''}`, type: 'button', text: t.label });
      b.addEventListener('click', () => this.setTab(t.id));
      this.tabBar.appendChild(b);
    }
    const rows = this.tab === 'graphics' ? this.graphics() : this.tab === 'audio' ? this.audio() : this.tab === 'gameplay' ? this.gameplay() : this.controls();
    this.list.setRows(rows, keep);
    this.note.textContent = this.tab === 'graphics' ? 'Presets set every option below. Higher settings need a stronger GPU.' : '';
  }

  // ------------------------------------------------------------------ rows
  private graphics(): MenuRow[] {
    const s = this.game.settings;
    const gfx = () => s.graphics;
    const opt = <K extends keyof typeof s.graphics>(id: K, label: string, list: readonly (typeof s.graphics)[K][], fmt: (v: (typeof s.graphics)[K]) => string = (v) => cap(String(v))): MenuRow => ({
      id: String(id),
      label,
      kind: 'option',
      value: () => fmt(gfx()[id]),
      adjust: (d) => s.set('graphics', id, cycle(list, gfx()[id], d)),
    });
    const tog = (id: 'ambientOcclusion' | 'bloom' | 'volumetrics' | 'showFps', label: string): MenuRow => ({
      id,
      label,
      kind: 'toggle',
      value: () => onOff(gfx()[id]),
      adjust: () => s.set('graphics', id, !gfx()[id]),
    });
    return [
      {
        id: 'preset',
        label: 'Quality preset',
        kind: 'option',
        value: () => cap(gfx().preset),
        adjust: (d) => s.applyPreset(cycle(PRESETS, gfx().preset === 'custom' ? 'high' : (gfx().preset as QualityPreset), d)),
      },
      { id: 'h1', label: 'Image', kind: 'header' },
      {
        id: 'res',
        label: 'Resolution scale',
        kind: 'slider',
        value: () => pct(gfx().resolutionScale),
        fraction: () => (gfx().resolutionScale - 0.5) / 1,
        adjust: (d) => s.set('graphics', 'resolutionScale', stepNum(gfx().resolutionScale, d, 0.05, 0.5, 1.5)),
      },
      {
        id: 'dynres',
        label: 'Dynamic resolution',
        hint: 'Lowers the resolution a little when the frame rate dips',
        kind: 'toggle',
        value: () => onOff(gfx().dynamicResolution),
        adjust: () => s.set('graphics', 'dynamicResolution', !gfx().dynamicResolution),
      },
      opt('antiAliasing', 'Anti-aliasing', AA, (v) => (v === 'off' ? 'Off' : v.toUpperCase())),
      { id: 'fov', label: 'Field of view', kind: 'slider', value: () => `${gfx().fieldOfView}°`, fraction: () => (gfx().fieldOfView - 45) / 40, adjust: (d) => s.set('graphics', 'fieldOfView', stepNum(gfx().fieldOfView, d, 1, 45, 85)) },
      { id: 'h2', label: 'Detail', kind: 'header' },
      opt('shadowQuality', 'Shadows', SHADOWS),
      opt('textureQuality', 'Textures', TIERS),
      opt('effectsQuality', 'Effects', TIERS),
      opt('viewDistance', 'View distance', VIEW),
      opt('postProcessing', 'Post-processing', POST),
      tog('ambientOcclusion', 'Ambient occlusion'),
      tog('bloom', 'Bloom'),
      tog('volumetrics', 'Light shafts'),
      { id: 'h3', label: 'Other', kind: 'header' },
      tog('showFps', 'Performance overlay'),
    ];
  }

  private audio(): MenuRow[] {
    const s = this.game.settings;
    const vol = (id: 'master' | 'music' | 'sfx' | 'ambient' | 'voice' | 'ui', label: string): MenuRow => ({
      id,
      label,
      kind: 'slider',
      value: () => pct(s.audio[id]),
      fraction: () => s.audio[id],
      adjust: (d) => s.set('audio', id, stepNum(s.audio[id], d, 0.05, 0, 1)),
    });
    return [vol('master', 'Master'), vol('music', 'Music'), vol('sfx', 'Effects'), vol('ambient', 'Ambience'), vol('voice', 'Voices'), vol('ui', 'Interface')];
  }

  private gameplay(): MenuRow[] {
    const s = this.game.settings;
    const gp = () => s.gameplay;
    const tog = (id: 'invertY' | 'autoAdvance' | 'subtitles' | 'toggleSprint' | 'showHints', label: string, hint?: string): MenuRow => ({
      id,
      label,
      hint,
      kind: 'toggle',
      value: () => onOff(gp()[id]),
      adjust: () => s.set('gameplay', id, !gp()[id]),
    });
    return [
      { id: 'h1', label: 'Story', kind: 'header' },
      { id: 'text', label: 'Text speed', kind: 'option', value: () => cap(gp().textSpeed), adjust: (d) => s.set('gameplay', 'textSpeed', cycle(TEXT, gp().textSpeed, d)) },
      tog('autoAdvance', 'Auto-advance dialogue'),
      { id: 'autodelay', label: 'Auto-advance pause', kind: 'slider', value: () => `${gp().autoAdvanceDelay.toFixed(1)} s`, fraction: () => (gp().autoAdvanceDelay - 0.5) / 3.5, adjust: (d) => s.set('gameplay', 'autoAdvanceDelay', stepNum(gp().autoAdvanceDelay, d, 0.1, 0.5, 4)) },
      tog('subtitles', 'Subtitles for party chatter'),
      {
        id: 'costume',
        label: "Subaru's outfit",
        hint: 'The cloak and boots of the road to the tower, or the tracksuit he arrived in',
        kind: 'option',
        value: () => COSTUME_NAMES[gp().subaruCostume],
        adjust: (d) => s.set('gameplay', 'subaruCostume', cycle(COSTUMES, gp().subaruCostume, d)),
      },
      { id: 'diff', label: 'Difficulty', hint: 'Story: gentler fights. The rules of the tower never change.', kind: 'option', value: () => cap(gp().difficulty), adjust: (d) => s.set('gameplay', 'difficulty', cycle(DIFF, gp().difficulty, d)) },
      { id: 'h2', label: 'Camera', kind: 'header' },
      { id: 'sens', label: 'Camera sensitivity', kind: 'slider', value: () => gp().cameraSensitivity.toFixed(1), fraction: () => (gp().cameraSensitivity - 0.2) / 2.8, adjust: (d) => s.set('gameplay', 'cameraSensitivity', stepNum(gp().cameraSensitivity, d, 0.1, 0.2, 3)) },
      tog('invertY', 'Invert vertical look'),
      { id: 'shake', label: 'Camera shake', kind: 'slider', value: () => pct(gp().cameraShake), fraction: () => gp().cameraShake, adjust: (d) => s.set('gameplay', 'cameraShake', stepNum(gp().cameraShake, d, 0.1, 0, 1)) },
      { id: 'h3', label: 'Controls', kind: 'header' },
      tog('toggleSprint', 'Toggle sprint', 'Press once instead of holding'),
      tog('showHints', 'Button hints'),
      {
        id: 'prompts',
        label: 'Button prompts',
        hint: 'Auto follows whatever you last touched',
        kind: 'option',
        value: () => PROMPT_NAMES[gp().buttonPrompts],
        adjust: (d) => s.set('gameplay', 'buttonPrompts', cycle(PROMPTS, gp().buttonPrompts, d)),
      },
    ];
  }

  private controls(): MenuRow[] {
    const input = this.game.input;
    const rows: MenuRow[] = [{ id: 'h', label: 'Keyboard & mouse — select an action, then press the new key', kind: 'header' }];
    for (const a of BUTTON_ACTIONS) {
      if (!a.rebindable) continue;
      rows.push({
        id: `bind.${a.id}`,
        label: a.label,
        kind: 'option',
        value: () =>
          this.capturing === a.id
            ? 'Press a key…'
            : input
                .bindingsFor(a.id)
                .filter((c) => !c.startsWith('Pad:'))
                .map(bindingLabel)
                .join(' / ') || '—',
        activate: () => this.startCapture(a.id),
      });
    }
    rows.push({ id: 'reset', label: 'Reset all controls to defaults', activate: () => this.game.settings.resetBindings() });
    return rows;
  }

  // ------------------------------------------------------------------ rebinding
  private startCapture(action: ButtonAction): void {
    this.capturing = action;
    // Listen after this key press has finished.
    window.setTimeout(() => {
      window.addEventListener('keydown', this.onKey, { capture: true });
      window.addEventListener('mousedown', this.onMouse, { capture: true });
    }, 120);
    this.list.refresh();
  }

  private stopCapture(): void {
    this.capturing = null;
    window.removeEventListener('keydown', this.onKey, { capture: true });
    window.removeEventListener('mousedown', this.onMouse, { capture: true });
  }

  private capture(code: string, e: Event): void {
    const action = this.capturing;
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (code !== 'Key:Escape') {
      const pads = this.game.input.bindingsFor(action).filter((c) => c.startsWith('Pad:'));
      this.game.settings.setBinding(action, [code, ...pads]);
    }
    this.stopCapture();
    this.list.refresh();
  }

  handleInput(): boolean {
    if (this.capturing) return false;
    const i = this.game.input;
    const idx = TABS.findIndex((t) => t.id === this.tab);
    if (i.pressed('tabNext')) this.setTab(TABS[(idx + 1) % TABS.length]!.id);
    else if (i.pressed('tabPrev')) this.setTab(TABS[(idx + TABS.length - 1) % TABS.length]!.id);
    this.list.handleInput(i);
    return false;
  }
}
