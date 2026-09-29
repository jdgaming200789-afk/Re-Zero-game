import { el } from '../ui/dom';
import type { GameContext } from '../game/GameContext';
import './devconsole.css';

export interface DevCommand {
  name: string;
  usage: string;
  help: string;
  run(args: string[], game: GameContext): string | void | Promise<string | void>;
}

/**
 * Developer console (` or F1). Systems register their own commands so
 * testing hooks live next to the code they exercise. Never shipped to
 * players: it only exists when dev mode is on.
 */
export class DevConsole {
  private readonly commands = new Map<string, DevCommand>();
  private readonly panel: HTMLElement;
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly history: string[] = [];
  private historyIndex = -1;
  open = false;

  constructor(private readonly game: GameContext) {
    this.log = el('div', { class: 'dev-log' });
    this.input = el('input', { class: 'dev-input', type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: 'help' });
    this.panel = el('div', { class: 'dev-console interactive' }, [this.log, this.input]);
    game.ui.layers.debug.appendChild(this.panel);
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.register({
      name: 'help',
      usage: 'help [command]',
      help: 'List commands',
      run: (args) => {
        if (args[0]) {
          const c = this.commands.get(args[0]);
          return c ? `${c.usage}\n  ${c.help}` : `No command "${args[0]}"`;
        }
        return Array.from(this.commands.values())
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => `${c.usage.padEnd(34)} ${c.help}`)
          .join('\n');
      },
    });
    this.register({ name: 'clear', usage: 'clear', help: 'Clear console', run: () => void (this.log.innerHTML = '') });
  }

  register(cmd: DevCommand): void {
    this.commands.set(cmd.name, cmd);
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.panel.classList.toggle('open', this.open);
    if (this.open) {
      this.game.input.setPointerLockWanted(false);
      window.setTimeout(() => this.input.focus(), 0);
    } else {
      this.input.blur();
    }
  }

  print(text: string, cls = ''): void {
    this.log.appendChild(el('div', { class: `dev-line ${cls}`, text }));
    this.log.scrollTop = this.log.scrollHeight;
  }

  async exec(line: string): Promise<string> {
    const parts = line.trim().match(/"[^"]*"|\S+/g)?.map((p) => p.replace(/^"|"$/g, '')) ?? [];
    if (parts.length === 0) return '';
    const [name, ...args] = parts;
    const cmd = this.commands.get(name!);
    if (!cmd) return `Unknown command "${name}". Try "help".`;
    try {
      const out = await cmd.run(args, this.game);
      return out ?? 'ok';
    } catch (err) {
      return `Error: ${(err as Error).message}`;
    }
  }

  private async onKey(e: KeyboardEvent): Promise<void> {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const line = this.input.value;
      this.input.value = '';
      if (!line.trim()) return;
      this.history.unshift(line);
      this.historyIndex = -1;
      this.print(`> ${line}`, 'cmd');
      const out = await this.exec(line);
      if (out) this.print(out);
    } else if (e.key === 'ArrowUp') {
      this.historyIndex = Math.min(this.history.length - 1, this.historyIndex + 1);
      this.input.value = this.history[this.historyIndex] ?? '';
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      this.historyIndex = Math.max(-1, this.historyIndex - 1);
      this.input.value = this.historyIndex >= 0 ? this.history[this.historyIndex]! : '';
      e.preventDefault();
    } else if (e.key === '`' || e.key === 'F1' || e.key === 'Escape') {
      e.preventDefault();
      this.toggle(false);
    }
  }
}
