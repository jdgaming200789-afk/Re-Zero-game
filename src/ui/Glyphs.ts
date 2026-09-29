import { bindingLabel } from '../input/InputManager';

/** How button prompts are drawn. */
export type GlyphStyle = 'keyboard' | 'xbox' | 'playstation';

interface PadGlyph {
  text: string;
  /** Extra classes: shape and colour. */
  cls: string;
}

// Standard-mapping gamepad buttons (the order of the Gamepad API).
const XBOX: PadGlyph[] = [
  { text: 'A', cls: 'face a' },
  { text: 'B', cls: 'face b' },
  { text: 'X', cls: 'face x' },
  { text: 'Y', cls: 'face y' },
  { text: 'LB', cls: 'shoulder' },
  { text: 'RB', cls: 'shoulder' },
  { text: 'LT', cls: 'trigger' },
  { text: 'RT', cls: 'trigger' },
  { text: '⧉', cls: 'small' },
  { text: '≡', cls: 'small' },
  { text: 'L3', cls: 'stick' },
  { text: 'R3', cls: 'stick' },
  { text: '▲', cls: 'dpad' },
  { text: '▼', cls: 'dpad' },
  { text: '◀', cls: 'dpad' },
  { text: '▶', cls: 'dpad' },
];

const PLAYSTATION: PadGlyph[] = [
  { text: '✕', cls: 'face cross' },
  { text: '○', cls: 'face circle' },
  { text: '□', cls: 'face square' },
  { text: '△', cls: 'face triangle' },
  { text: 'L1', cls: 'shoulder' },
  { text: 'R1', cls: 'shoulder' },
  { text: 'L2', cls: 'trigger' },
  { text: 'R2', cls: 'trigger' },
  { text: 'Create', cls: 'small wide' },
  { text: 'Options', cls: 'small wide' },
  { text: 'L3', cls: 'stick' },
  { text: 'R3', cls: 'stick' },
  { text: '▲', cls: 'dpad' },
  { text: '▼', cls: 'dpad' },
  { text: '◀', cls: 'dpad' },
  { text: '▶', cls: 'dpad' },
];

/** The binding to show for an action in a given style (pad codes for pads). */
export function pickBinding(codes: readonly string[], style: GlyphStyle): string | undefined {
  const pad = style !== 'keyboard';
  return codes.find((c) => c.startsWith('Pad:') === pad) ?? codes[0];
}

/** Text and classes for one binding code in a style. */
export function glyphFor(code: string | undefined, style: GlyphStyle): PadGlyph & { pad: boolean } {
  if (!code) return { text: '?', cls: 'key', pad: false };
  if (code.startsWith('Pad:')) {
    const i = Number(code.slice(4));
    const set = style === 'playstation' ? PLAYSTATION : XBOX;
    const g = set[i] ?? { text: bindingLabel(code), cls: 'small' };
    return { ...g, pad: true };
  }
  const text = bindingLabel(code);
  return { text, cls: text.length > 2 ? 'key wide' : 'key', pad: false };
}

/**
 * Draw the glyph(s) for one or more actions into a `.rz-key` element:
 * a keycap on keyboard, a coloured round face button or shoulder pill on a
 * pad. Several actions are joined with a slash (navUp/navDown).
 */
export function renderGlyph(target: HTMLElement, codeLists: ReadonlyArray<readonly string[]>, style: GlyphStyle): void {
  const parts = codeLists.map((codes) => glyphFor(pickBinding(codes, style), style));
  const key = parts.map((p) => `${p.cls}|${p.text}`).join(',') + style;
  if (target.dataset.glyph === key) return;
  target.dataset.glyph = key;
  const pad = parts.some((p) => p.pad);
  target.className = `rz-key ${pad ? `pad ${style}` : 'kbm'}${parts.length > 1 ? ' multi' : ''}`;
  target.textContent = '';
  parts.forEach((p, i) => {
    if (i > 0) target.appendChild(Object.assign(document.createElement('i'), { className: 'sep', textContent: '/' }));
    const s = document.createElement('b');
    s.className = `g ${p.cls}`;
    s.textContent = p.text;
    target.appendChild(s);
  });
}
