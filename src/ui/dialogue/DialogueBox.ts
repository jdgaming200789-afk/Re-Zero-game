import { el } from '../dom';
import '../styles/dialogue.css';

export interface BoxLine {
  name: string | null;
  color?: string;
  text: string;
  thought?: boolean;
}

export interface BoxChoice {
  text: string;
  enabled: boolean;
  insight?: boolean;
  chosen?: boolean;
  hint?: string;
}

export interface HistoryEntry {
  name: string | null;
  color?: string;
  text: string;
  thought?: boolean;
  /** A choice Subaru made. */
  choice?: boolean;
}

/** Characters per second for each text-speed setting. */
export const TEXT_CPS = { slow: 28, normal: 52, fast: 110, instant: Number.POSITIVE_INFINITY } as const;

/**
 * The conversation window: name plate in the speaker's colour, text revealed
 * letter by letter (with natural pauses at punctuation), a breathing
 * "continue" mark, the choice list, and Auto / Skip / Log controls.
 *
 * `*emphasis*` in a line renders as an accented word.
 */
export class DialogueBox {
  readonly root: HTMLElement;
  private readonly box: HTMLElement;
  private readonly plate: HTMLElement;
  private readonly plateName: HTMLElement;
  private readonly text: HTMLElement;
  private readonly next: HTMLElement;
  private readonly choicesEl: HTMLElement;
  private readonly controls: Record<'auto' | 'skip' | 'log', HTMLElement>;
  private chars: HTMLElement[] = [];
  private pauses: number[] = [];
  private revealed = 0;
  private carry = 0;
  private hold = 0;
  cps: number = TEXT_CPS.normal;
  /** Called for each revealed letter (voice blips). */
  onLetter?: (ch: string) => void;
  onChoose?: (index: number) => void;
  onControl?: (which: 'auto' | 'skip' | 'log') => void;
  private options: BoxChoice[] = [];
  private selected = 0;

  constructor(parent: HTMLElement, glyph: (action: 'advance' | 'autoAdvance' | 'skip' | 'history') => string) {
    this.plateName = el('span', { class: 'nm' });
    this.plate = el('div', { class: 'plate' }, [el('i', { class: 'gem' }), this.plateName]);
    this.text = el('div', { class: 'text' });
    this.next = el('div', { class: 'next' }, [el('i')]);
    this.box = el('div', { class: 'rz-dlg-box' }, [this.plate, this.text, this.next]);
    this.choicesEl = el('div', { class: 'rz-dlg-choices' });
    const ctl = (id: 'auto' | 'skip' | 'log', label: string, action: 'autoAdvance' | 'skip' | 'history') => {
      const node = el('button', { class: `ctl ${id}`, type: 'button' }, [el('span', { class: 'rz-key', text: glyph(action) }), label]);
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onControl?.(id);
      });
      return node;
    };
    this.controls = { auto: ctl('auto', 'Auto', 'autoAdvance'), skip: ctl('skip', 'Skip', 'skip'), log: ctl('log', 'Log', 'history') };
    const bar = el('div', { class: 'rz-dlg-controls interactive' }, [this.controls.auto, this.controls.skip, this.controls.log]);
    this.root = parent.appendChild(el('div', { class: 'rz-dialogue' }, [this.choicesEl, this.box, bar]));
  }

  get visible(): boolean {
    return this.root.classList.contains('visible');
  }

  show(): void {
    this.root.classList.add('visible');
  }

  hide(): void {
    this.root.classList.remove('visible');
    this.hideChoices();
  }

  /** Start revealing a line. */
  showLine(line: BoxLine): void {
    this.hideChoices();
    const narration = line.name === null;
    this.box.classList.toggle('narration', narration);
    this.box.classList.toggle('thought', !!line.thought);
    this.plateName.textContent = line.name ?? '';
    this.plate.style.setProperty('--speaker', line.color ?? 'var(--gold-bright)');
    this.box.style.setProperty('--speaker', line.color ?? 'var(--gold-bright)');
    this.text.textContent = '';
    this.chars = [];
    this.pauses = [];
    const src = line.text;
    let target: HTMLElement = this.text;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i]!;
      if (ch === '*') {
        if (target === this.text) target = this.text.appendChild(el('em'));
        else target = this.text;
        continue;
      }
      const span = el('span', { class: 'c', text: ch });
      target.appendChild(span);
      this.chars.push(span);
      const after = src[i + 1];
      const endsClause = after === undefined || after === ' ' || after === '*' || after === '"' || after === '”';
      this.pauses.push(endsClause && '.!?…'.includes(ch) ? 0.22 : endsClause && ',;:—'.includes(ch) ? 0.09 : 0);
    }
    this.revealed = 0;
    this.carry = 0;
    this.hold = 0.05;
    this.next.classList.remove('ready');
    this.box.classList.remove('pop');
    void this.box.offsetWidth; // restart the entry animation
    this.box.classList.add('pop');
    if (!Number.isFinite(this.cps)) this.revealAll();
  }

  get revealing(): boolean {
    return this.revealed < this.chars.length;
  }

  revealAll(): void {
    for (let i = this.revealed; i < this.chars.length; i++) this.chars[i]!.classList.add('on');
    this.revealed = this.chars.length;
    this.next.classList.add('ready');
  }

  update(dt: number): void {
    if (!this.revealing) return;
    if (this.hold > 0) {
      this.hold -= dt;
      return;
    }
    this.carry += dt * this.cps;
    while (this.carry >= 1 && this.revealing) {
      this.carry -= 1;
      const i = this.revealed++;
      this.chars[i]!.classList.add('on');
      const ch = this.chars[i]!.textContent ?? '';
      if (ch.trim()) this.onLetter?.(ch);
      const pause = this.pauses[i] ?? 0;
      if (pause > 0) {
        this.hold = pause * Math.min(1.4, 52 / this.cps);
        this.carry = 0;
        break;
      }
    }
    if (!this.revealing) this.next.classList.add('ready');
  }

  // ---------------------------------------------------------------- choices
  showChoices(options: BoxChoice[], selected = 0): void {
    this.options = options;
    this.choicesEl.textContent = '';
    options.forEach((o, i) => {
      const row = el('div', { class: `opt interactive${o.enabled ? '' : ' disabled'}${o.insight ? ' insight' : ''}${o.chosen ? ' chosen' : ''}` }, [
        el('span', { class: 'mark' }),
        el('span', { class: 'txt', text: o.text }),
        o.insight ? el('span', { class: 'badge', text: 'Insight' }) : null,
        !o.enabled && o.hint ? el('span', { class: 'hint', text: o.hint }) : null,
      ]);
      row.style.setProperty('--i', String(i));
      row.addEventListener('mouseenter', () => o.enabled && this.select(i));
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (o.enabled) this.onChoose?.(i);
      });
      this.choicesEl.appendChild(row);
    });
    this.choicesEl.classList.add('visible');
    this.next.classList.remove('ready');
    this.select(this.firstEnabled(selected, 1));
  }

  hideChoices(): void {
    this.choicesEl.classList.remove('visible');
    this.options = [];
  }

  get choosing(): boolean {
    return this.options.length > 0;
  }

  get selection(): number {
    return this.selected;
  }

  select(i: number): void {
    this.selected = i;
    Array.from(this.choicesEl.children).forEach((c, k) => c.classList.toggle('selected', k === i));
  }

  /** Move the highlight, skipping disabled options. */
  move(dir: 1 | -1): void {
    const n = this.options.length;
    if (!n) return;
    this.select(this.firstEnabled((this.selected + dir + n) % n, dir));
  }

  private firstEnabled(from: number, dir: 1 | -1): number {
    const n = this.options.length;
    for (let k = 0; k < n; k++) {
      const i = (from + k * dir + n * n) % n;
      if (this.options[i]!.enabled) return i;
    }
    return from;
  }

  setControl(which: 'auto' | 'skip', on: boolean): void {
    this.controls[which].classList.toggle('on', on);
  }
}

/** Scrollable backlog of everything said (and chosen) so far. */
export class DialogueLog {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;

  constructor(parent: HTMLElement, glyph: (action: 'history' | 'cancel') => string) {
    this.list = el('div', { class: 'list interactive' });
    this.root = parent.appendChild(
      el('div', { class: 'rz-dlg-log' }, [
        el('div', { class: 'rz-panel frame' }, [
          el('h2', { class: 'rz-heading', text: 'Conversation Log' }),
          el('div', { class: 'rz-rule' }),
          this.list,
          el('div', { class: 'foot' }, [el('span', { class: 'rz-key', text: glyph('history') }), 'Close']),
        ]),
      ]),
    );
  }

  get open(): boolean {
    return this.root.classList.contains('visible');
  }

  show(entries: readonly HistoryEntry[]): void {
    this.list.textContent = '';
    for (const e of entries) {
      const who = e.choice ? el('span', { class: 'who choice', text: '▸' }) : e.name ? el('span', { class: 'who', text: e.name }) : null;
      if (who && e.color && !e.choice) who.style.color = e.color;
      this.list.appendChild(el('div', { class: `entry${e.thought ? ' thought' : ''}${e.choice ? ' choice' : ''}${e.name === null && !e.choice ? ' narration' : ''}` }, [who, el('span', { class: 'say', text: e.text.replace(/\*/g, '') })]));
    }
    this.root.classList.add('visible');
    this.list.scrollTop = this.list.scrollHeight;
  }

  hide(): void {
    this.root.classList.remove('visible');
  }

  scroll(dir: number): void {
    this.list.scrollTop += dir * 80;
  }
}
