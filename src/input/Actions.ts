/**
 * Input actions and their default bindings.
 *
 * Gameplay code only ever asks about actions ("interact", "dodge"), never
 * about physical keys, so bindings can be remapped and gamepads work
 * everywhere without special cases.
 *
 * Binding code format:
 *   Key:<KeyboardEvent.code>    e.g. Key:KeyE
 *   Mouse:<button>              0 left, 1 middle, 2 right
 *   Wheel:up | Wheel:down
 *   Pad:<standard button index> e.g. Pad:0 (A / Cross)
 */
export type InputContext = 'gameplay' | 'combat' | 'ui' | 'dialogue' | 'cinematic' | 'global';

export type ButtonAction =
  | 'jump'
  | 'dodge'
  | 'sprint'
  | 'walkToggle'
  | 'interact'
  | 'attackLight'
  | 'attackHeavy'
  | 'block'
  | 'lockOn'
  | 'lockSwitchLeft'
  | 'lockSwitchRight'
  | 'ability1'
  | 'ability2'
  | 'ability3'
  | 'ability4'
  | 'partyCommand'
  | 'callParty'
  | 'useQuickItem'
  | 'pause'
  | 'inventory'
  | 'journal'
  | 'map'
  | 'confirm'
  | 'cancel'
  | 'navUp'
  | 'navDown'
  | 'navLeft'
  | 'navRight'
  | 'tabPrev'
  | 'tabNext'
  | 'advance'
  | 'skip'
  | 'autoAdvance'
  | 'history'
  | 'shoulderSwap'
  | 'zoomIn'
  | 'zoomOut'
  | 'debugConsole';

export interface ButtonActionDef {
  id: ButtonAction;
  label: string;
  contexts: InputContext[];
  bindings: string[];
  /** Whether players may rebind it from the settings menu. */
  rebindable: boolean;
}

const G: InputContext[] = ['gameplay', 'combat'];

export const BUTTON_ACTIONS: ButtonActionDef[] = [
  { id: 'jump', label: 'Jump', contexts: ['gameplay'], bindings: ['Key:Space', 'Pad:0'], rebindable: true },
  // Space is contextual: the player controller treats `jump` as a dodge while in combat.
  { id: 'dodge', label: 'Dodge', contexts: ['combat', 'gameplay'], bindings: ['Key:AltLeft', 'Pad:1'], rebindable: true },
  { id: 'sprint', label: 'Sprint', contexts: G, bindings: ['Key:ShiftLeft', 'Pad:10'], rebindable: true },
  { id: 'walkToggle', label: 'Walk', contexts: G, bindings: ['Key:KeyC'], rebindable: true },
  { id: 'interact', label: 'Interact', contexts: ['gameplay'], bindings: ['Key:KeyE', 'Pad:0'], rebindable: true },
  { id: 'attackLight', label: 'Light Attack', contexts: G, bindings: ['Mouse:0', 'Pad:2'], rebindable: true },
  { id: 'attackHeavy', label: 'Heavy Attack', contexts: G, bindings: ['Mouse:2', 'Pad:3'], rebindable: true },
  { id: 'block', label: 'Guard', contexts: G, bindings: ['Key:ControlLeft', 'Pad:6'], rebindable: true },
  { id: 'lockOn', label: 'Lock On', contexts: G, bindings: ['Key:KeyQ', 'Mouse:1', 'Pad:11'], rebindable: true },
  { id: 'lockSwitchLeft', label: 'Switch Target Left', contexts: ['combat'], bindings: ['Key:KeyZ', 'Pad:14'], rebindable: true },
  { id: 'lockSwitchRight', label: 'Switch Target Right', contexts: ['combat'], bindings: ['Key:KeyX', 'Pad:15'], rebindable: true },
  { id: 'ability1', label: 'Ability 1', contexts: G, bindings: ['Key:Digit1', 'Pad:4'], rebindable: true },
  { id: 'ability2', label: 'Ability 2', contexts: G, bindings: ['Key:Digit2', 'Pad:5'], rebindable: true },
  { id: 'ability3', label: 'Ability 3', contexts: G, bindings: ['Key:Digit3', 'Pad:7'], rebindable: true },
  { id: 'ability4', label: 'Ability 4', contexts: G, bindings: ['Key:Digit4'], rebindable: true },
  { id: 'partyCommand', label: 'Party Commands', contexts: G, bindings: ['Key:KeyF', 'Pad:13'], rebindable: true },
  { id: 'callParty', label: 'Call Party', contexts: G, bindings: ['Key:KeyT', 'Pad:12'], rebindable: true },
  { id: 'useQuickItem', label: 'Quick Item', contexts: G, bindings: ['Key:KeyR'], rebindable: true },
  { id: 'pause', label: 'Pause', contexts: ['gameplay', 'combat', 'ui', 'dialogue', 'cinematic'], bindings: ['Key:Escape', 'Pad:9'], rebindable: false },
  { id: 'inventory', label: 'Inventory', contexts: ['gameplay', 'ui'], bindings: ['Key:KeyI', 'Key:Tab'], rebindable: true },
  { id: 'journal', label: 'Journal', contexts: ['gameplay', 'ui'], bindings: ['Key:KeyJ', 'Pad:8'], rebindable: true },
  { id: 'map', label: 'Map', contexts: ['gameplay', 'ui'], bindings: ['Key:KeyM'], rebindable: true },
  { id: 'confirm', label: 'Confirm', contexts: ['ui', 'dialogue'], bindings: ['Key:Enter', 'Key:NumpadEnter', 'Key:Space', 'Pad:0'], rebindable: false },
  { id: 'cancel', label: 'Back', contexts: ['ui', 'dialogue'], bindings: ['Key:Escape', 'Key:Backspace', 'Pad:1'], rebindable: false },
  { id: 'navUp', label: 'Up', contexts: ['ui', 'dialogue'], bindings: ['Key:ArrowUp', 'Key:KeyW', 'Pad:12'], rebindable: false },
  { id: 'navDown', label: 'Down', contexts: ['ui', 'dialogue'], bindings: ['Key:ArrowDown', 'Key:KeyS', 'Pad:13'], rebindable: false },
  { id: 'navLeft', label: 'Left', contexts: ['ui'], bindings: ['Key:ArrowLeft', 'Key:KeyA', 'Pad:14'], rebindable: false },
  { id: 'navRight', label: 'Right', contexts: ['ui'], bindings: ['Key:ArrowRight', 'Key:KeyD', 'Pad:15'], rebindable: false },
  { id: 'tabPrev', label: 'Previous Tab', contexts: ['ui'], bindings: ['Key:KeyQ', 'Pad:4'], rebindable: false },
  { id: 'tabNext', label: 'Next Tab', contexts: ['ui'], bindings: ['Key:KeyE', 'Pad:5'], rebindable: false },
  { id: 'advance', label: 'Advance', contexts: ['dialogue', 'cinematic'], bindings: ['Key:Space', 'Key:Enter', 'Key:KeyE', 'Mouse:0', 'Pad:0'], rebindable: false },
  { id: 'skip', label: 'Skip', contexts: ['dialogue', 'cinematic'], bindings: ['Key:KeyK', 'Pad:3'], rebindable: false },
  { id: 'autoAdvance', label: 'Auto', contexts: ['dialogue'], bindings: ['Key:KeyA', 'Pad:2'], rebindable: false },
  { id: 'history', label: 'Log', contexts: ['dialogue'], bindings: ['Key:KeyL', 'Pad:8'], rebindable: false },
  { id: 'shoulderSwap', label: 'Swap Shoulder', contexts: G, bindings: ['Key:KeyV'], rebindable: true },
  { id: 'zoomIn', label: 'Zoom In', contexts: G, bindings: ['Wheel:up'], rebindable: false },
  { id: 'zoomOut', label: 'Zoom Out', contexts: G, bindings: ['Wheel:down'], rebindable: false },
  { id: 'debugConsole', label: 'Developer Console', contexts: ['global'], bindings: ['Key:Backquote', 'Key:F1'], rebindable: false },
];

/** Keys that, when bound, should not trigger browser defaults (scrolling, focus change). */
export const PREVENT_DEFAULT_CODES = new Set([
  'Space',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'AltLeft',
  'AltRight',
  'Backquote',
  'F1',
  'Backspace',
]);
