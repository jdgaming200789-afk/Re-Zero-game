import { KNOWLEDGE, type KnowledgeDef } from '../../data/knowledge';
import type { GameContext } from '../../game/GameContext';
import type { QuestDef } from '../../story/quests/Quest';
import { el } from '../dom';
import { Screen } from './Screen';

type Tab = 'quests' | 'knowledge' | 'log';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'quests', label: 'Quests' },
  { id: 'knowledge', label: 'Subaru Remembers' },
  { id: 'log', label: 'Conversations' },
];

const CATEGORY: Record<KnowledgeDef['category'], string> = { danger: 'Dangers', lore: 'The Tower', people: 'People' };

/**
 * The journal: quests (active and finished) with their objectives, what
 * Subaru has learned (the knowledge he carries through Return by Death),
 * and the conversation log.
 */
export class JournalScreen extends Screen {
  readonly id = 'journal';
  override readonly hotkey = 'journal' as const;
  private tab: Tab = 'quests';
  private readonly tabBar: HTMLElement;
  private readonly body: HTMLElement;
  private questIds: string[] = [];
  private selectedQuest = 0;

  constructor(game: GameContext) {
    super(game);
    this.root.classList.add('rz-journal');
    this.tabBar = el('div', { class: 'tabs' });
    this.body = el('div', { class: 'body' });
    const glyph = (a: 'tabPrev' | 'tabNext' | 'cancel' | 'navUp' | 'navDown') => game.ui.actionGlyph(a);
    this.root.append(
      el('div', { class: 'rz-panel frame' }, [
        el('div', { class: 'head' }, [el('span', { class: 'rz-key', text: glyph('tabPrev') }), this.tabBar, el('span', { class: 'rz-key', text: glyph('tabNext') })]),
        el('div', { class: 'rz-rule' }),
        this.body,
        el('div', { class: 'foot' }, [el('span', { class: 'rz-key', text: `${glyph('navUp')}/${glyph('navDown')}` }), 'Select', el('span', { class: 'rz-key', text: glyph('cancel') }), 'Close']),
      ]),
    );
  }

  protected onOpen(): void {
    this.render();
  }

  handleInput(): boolean {
    const i = this.game.input;
    const idx = TABS.findIndex((t) => t.id === this.tab);
    if (i.pressed('tabNext')) this.setTab(TABS[(idx + 1) % TABS.length]!.id);
    else if (i.pressed('tabPrev')) this.setTab(TABS[(idx + TABS.length - 1) % TABS.length]!.id);
    if (this.tab === 'quests' && this.questIds.length) {
      if (i.pressed('navDown')) this.selectQuest((this.selectedQuest + 1) % this.questIds.length);
      if (i.pressed('navUp')) this.selectQuest((this.selectedQuest + this.questIds.length - 1) % this.questIds.length);
      if (i.pressed('confirm')) this.game.quests.track(this.questIds[this.selectedQuest]!);
    } else if (this.tab === 'log') {
      const list = this.body.querySelector('.log');
      if (list && i.pressed('navDown')) list.scrollTop += 80;
      if (list && i.pressed('navUp')) list.scrollTop -= 80;
    }
    return false;
  }

  private setTab(t: Tab): void {
    this.tab = t;
    this.render();
  }

  private selectQuest(i: number): void {
    this.selectedQuest = i;
    this.render();
  }

  private render(): void {
    this.tabBar.textContent = '';
    for (const t of TABS) {
      const b = el('button', { class: `tab${t.id === this.tab ? ' on' : ''}`, type: 'button', text: t.label });
      b.addEventListener('click', () => this.setTab(t.id));
      this.tabBar.appendChild(b);
    }
    this.body.textContent = '';
    if (this.tab === 'quests') this.renderQuests();
    else if (this.tab === 'knowledge') this.renderKnowledge();
    else this.renderLog();
  }

  private renderQuests(): void {
    const q = this.game.quests;
    const groups: Array<[string, QuestDef[]]> = [
      ['In Progress', q.list('active')],
      ['Completed', q.list('done')],
      ['Failed', q.list('failed')],
    ];
    this.questIds = groups.flatMap(([, list]) => list.map((d) => d.id));
    if (!this.questIds.length) {
      this.body.appendChild(el('div', { class: 'empty', text: 'Nothing written here yet.' }));
      return;
    }
    this.selectedQuest = Math.min(this.selectedQuest, this.questIds.length - 1);
    const list = el('div', { class: 'qlist' });
    for (const [label, defs] of groups) {
      if (!defs.length) continue;
      list.appendChild(el('div', { class: 'group', text: label }));
      for (const d of defs) {
        const i = this.questIds.indexOf(d.id);
        const row = el('div', { class: `quest ${d.kind}${i === this.selectedQuest ? ' selected' : ''}${q.tracked === d.id ? ' tracked' : ''}` }, [
          el('i', { class: 'mark' }),
          el('span', { text: d.title }),
        ]);
        row.addEventListener('click', () => this.selectQuest(i));
        list.appendChild(row);
      }
    }
    const def = q.get(this.questIds[this.selectedQuest]!)!;
    const status = q.status(def.id);
    const detail = el('div', { class: 'qdetail' }, [
      el('div', { class: 'kind', text: def.kind === 'main' ? 'Main Story' : 'Side Story' }),
      el('h2', { text: def.title }),
      el('p', { class: 'summary', text: status === 'done' && def.epilogue ? def.epilogue : def.summary }),
    ]);
    const objs = el('div', { class: 'objectives' });
    for (const o of q.objectives(def.id)) {
      if (!o.visible) continue;
      objs.appendChild(
        el('div', { class: `obj${o.done ? ' done' : ''}${o.def.optional ? ' optional' : ''}` }, [
          el('i', { class: 'box' }),
          el('div', {}, [el('div', { class: 'txt', text: o.def.text }), o.def.hint && !o.done ? el('div', { class: 'hint', text: o.def.hint }) : null]),
        ]),
      );
    }
    detail.appendChild(objs);
    if (status === 'active' && q.tracked !== def.id) detail.appendChild(el('div', { class: 'track', text: `${this.game.ui.actionGlyph('confirm')} — Track this quest` }));
    this.body.append(el('div', { class: 'quests' }, [list, detail]));
  }

  private renderKnowledge(): void {
    const known = Object.entries(KNOWLEDGE).filter(([id]) => this.game.state.bool(`know.${id}`));
    const wrap = el('div', { class: 'knowledge' }, [
      el('p', { class: 'intro', text: 'What I know. What I brought back. Whatever happens, this stays with me.' }),
    ]);
    if (!known.length) wrap.appendChild(el('div', { class: 'empty', text: 'Nothing yet. Let’s keep it that way.' }));
    for (const cat of Object.keys(CATEGORY) as Array<KnowledgeDef['category']>) {
      const items = known.filter(([, k]) => k.category === cat);
      if (!items.length) continue;
      wrap.appendChild(el('div', { class: 'group', text: CATEGORY[cat] }));
      for (const [, k] of items) wrap.appendChild(el('div', { class: `card ${cat}` }, [el('h3', { text: k.title }), el('p', { text: k.text })]));
    }
    this.body.appendChild(wrap);
  }

  private renderLog(): void {
    const log = el('div', { class: 'log' });
    const entries = this.game.dialogue.history;
    if (!entries.length) log.appendChild(el('div', { class: 'empty', text: 'No conversations yet.' }));
    for (const e of entries) {
      const who = e.choice ? el('span', { class: 'who choice', text: '▸' }) : e.name ? el('span', { class: 'who', text: e.name }) : el('span', { class: 'who' });
      if (e.color && !e.choice) who.style.color = e.color;
      log.appendChild(el('div', { class: `entry${e.thought ? ' thought' : ''}${e.choice ? ' choice' : ''}` }, [who, el('span', { class: 'say', text: e.text.replace(/\*/g, '') })]));
    }
    this.body.appendChild(log);
    log.scrollTop = log.scrollHeight;
  }
}
