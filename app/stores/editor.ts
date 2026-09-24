/* The content editor's working copy.

   A draft of every content file, edited in place by the forms, checked on
   every change by the same validator the game uses, and saved back through
   the dev-only endpoint. It lives in a store rather than the page so a trip
   into the game ("Try it") and back keeps unsaved work.

   "Try it" installs the draft into the running game before starting a run,
   so what you play is what you are looking at — saved or not. A page
   reload goes back to the files on disk. */

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  CONTENT_FILES,
  type Content,
  type ContentFile,
  type ContentIssue,
  installContent,
  validateContent,
} from '~/game/content';
import { trialText, type TrialKind } from '~/game/sandbox';

/** The files that are lists of things, as opposed to run.json. */
export type Collection = Exclude<ContentFile, 'run'>;

interface Item {
  id: string;
  enabled?: boolean;
}

/** What each tab is called, and what kind of trial its items start. */
export const TABS: Array<{ file: ContentFile; label: string; one: string; trial?: TrialKind }> = [
  { file: 'cards', label: 'Cards', one: 'card', trial: 'card' },
  { file: 'enemies', label: 'Enemies', one: 'enemy', trial: 'enemy' },
  { file: 'enemy-cards', label: 'Enemy cards', one: 'enemy card', trial: 'enemy-card' },
  { file: 'gems', label: 'Gems', one: 'gem', trial: 'gem' },
  { file: 'talismans', label: 'Talismans', one: 'talisman', trial: 'talisman' },
  { file: 'zones', label: 'Zones', one: 'zone' },
  { file: 'run', label: 'Starting deck', one: 'starting deck' },
];

/** What a new item starts as: enough to be valid, so it can be tried at once. */
const BLANK: Record<Exclude<Collection, 'zones'>, (id: string) => Record<string, unknown>> = {
  cards: (id) => ({
    id, name: 'New card', enabled: true, rarity: 'normal', art: 'slash', cost: 1,
    targeting: 'enemy', range: 1, text: 'Deal 5 damage to an adjacent enemy.',
    effects: [{ kind: 'damage', amount: 5 }],
  }),
  'enemy-cards': (id) => ({
    id, name: 'New move', enabled: true, range: 1, text: 'Closes up to 2 and bites for 4.',
    effects: [{ kind: 'advance', amount: 2 }, { kind: 'damage', amount: 4 }],
  }),
  enemies: (id) => ({
    id, name: 'New enemy', enabled: true, maxHp: 10,
    sprite: { sheet: 'enemies', col: 0, row: 2, faces: -1, footprint: { width: 64, height: 44 } },
    deck: ['bug_bite', 'bug_skitter'],
  }),
  gems: (id) => ({
    id, name: 'New gem', enabled: true, colour: '#b36bd9', text: 'Gain 2 block when this card is played.',
    effects: [{ kind: 'block', amount: 2 }],
  }),
  talismans: (id) => ({
    id, name: 'New talisman', enabled: true, text: 'Draw one more card each turn.', icon: 'bag',
    modifiers: [{ stat: 'handSize', add: 1 }],
  }),
};

const snapshot = (value: unknown) => JSON.stringify(value);

export const useEditorStore = defineStore('editor', () => {
  const draft = ref<Content | null>(null);
  /** Each file as last loaded or saved, to tell what has changed. */
  const saved = ref<Partial<Record<ContentFile, string>>>({});
  const tab = ref<ContentFile>('cards');
  const selectedId = ref<string | null>(null);
  const status = ref<'idle' | 'loading' | 'saving' | 'error'>('idle');
  const message = ref('');

  /* ------------------------------ loading and saving ------------------- */

  async function load(): Promise<void> {
    status.value = 'loading';
    const entries = await Promise.all(
      CONTENT_FILES.map(async (file) => {
        const response = await fetch(`/content/${file}.json`, { cache: 'no-store' });
        return [file, await response.json()] as const;
      }),
    );
    draft.value = Object.fromEntries(entries) as unknown as Content;
    saved.value = Object.fromEntries(entries.map(([file, data]) => [file, snapshot(data)]));
    status.value = 'idle';
    message.value = '';
    if (!selectedId.value) selectFirst();
  }

  const dirtyFiles = computed(() =>
    draft.value ? CONTENT_FILES.filter((file) => snapshot(draft.value![file]) !== saved.value[file]) : [],
  );

  async function save(): Promise<void> {
    if (!draft.value || !dirtyFiles.value.length || status.value === 'saving') return;
    if (errors.value.length) {
      message.value = 'Fix the errors first — nothing was saved.';
      return;
    }
    status.value = 'saving';
    const files = Object.fromEntries(dirtyFiles.value.map((file) => [file, draft.value![file]]));
    const response = await fetch('/api/content', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files }),
    });
    const result = (await response.json().catch(() => null)) as { saved?: ContentFile[]; issues?: ContentIssue[] } | null;
    if (!response.ok || !result?.saved) {
      status.value = 'error';
      message.value = result?.issues?.length
        ? `Not saved: ${result.issues.find((issue) => issue.level === 'error')?.message}`
        : `Not saved (${response.status}).`;
      return;
    }
    for (const file of result.saved) saved.value[file] = snapshot(draft.value[file]);
    status.value = 'idle';
    message.value = `Saved ${result.saved.map((file) => `${file}.json`).join(', ')}.`;
  }

  /** Throw away unsaved changes to every file. */
  function revert(): void {
    if (!draft.value) return;
    for (const file of CONTENT_FILES) {
      const text = saved.value[file];
      if (text) (draft.value as unknown as Record<string, unknown>)[file] = JSON.parse(text);
    }
    if (selectedId.value && !itemsOf(tab.value).some((item) => item.id === selectedId.value)) selectFirst();
    message.value = 'Changes discarded.';
  }

  /* ------------------------------ validation --------------------------- */

  const validation = computed(() =>
    draft.value ? validateContent(draft.value as unknown as Record<ContentFile, unknown>) : null,
  );
  const issues = computed(() => validation.value?.issues ?? []);
  const errors = computed(() => issues.value.filter((issue) => issue.level === 'error'));

  const issuesFor = (file: ContentFile, id?: string | null) =>
    issues.value.filter((issue) => issue.file === file && (id === undefined || issue.id === (id ?? undefined)));

  /* ------------------------------ items -------------------------------- */

  function itemsOf(file: ContentFile): Item[] {
    if (!draft.value || file === 'run') return [];
    return draft.value[file] as Item[];
  }

  const items = computed(() => itemsOf(tab.value));
  const selected = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null);

  /** Whether an id has been saved yet. Only unsaved items may change id —
   *  once saved, other things (and analytics) may be using it. */
  function isSaved(file: ContentFile, id: string): boolean {
    const text = saved.value[file];
    if (!text || file === 'run') return false;
    return (JSON.parse(text) as Item[]).some((item) => item.id === id);
  }

  function selectFirst(): void {
    selectedId.value = itemsOf(tab.value)[0]?.id ?? null;
  }

  function openTab(file: ContentFile): void {
    tab.value = file;
    selectFirst();
  }

  function freshId(file: ContentFile, base: string): string {
    const taken = new Set(itemsOf(file).map((item) => item.id));
    for (let n = 1; ; n += 1) {
      const id = n === 1 ? base : `${base}_${n}`;
      if (!taken.has(id)) return id;
    }
  }

  function add(): void {
    const file = tab.value;
    if (file === 'run' || file === 'zones') return;
    const id = freshId(file, `new_${TABS.find((t) => t.file === file)!.one.replace(/ /g, '_')}`);
    (itemsOf(file) as unknown as Record<string, unknown>[]).push(BLANK[file](id));
    selectedId.value = id;
  }

  function duplicate(): void {
    const file = tab.value;
    const source = selected.value;
    if (!source || file === 'run' || file === 'zones') return;
    const copy = structuredClone(JSON.parse(JSON.stringify(source))) as Item & { name?: string };
    copy.id = freshId(file, `${source.id}_copy`);
    if (copy.name) copy.name = `${copy.name} copy`;
    const list = itemsOf(file);
    list.splice(list.indexOf(source) + 1, 0, copy);
    selectedId.value = copy.id;
  }

  /** Everything that refers to an item — what deleting it would break. */
  function usesOf(file: ContentFile, id: string): string[] {
    const content = draft.value;
    if (!content) return [];
    const uses: string[] = [];
    if (file === 'cards') {
      const count = content.run.startingDeck.filter((cardId) => cardId === id).length;
      if (count) uses.push(`the starting deck (×${count})`);
    }
    if (file === 'enemy-cards') {
      for (const enemy of content.enemies) {
        const count = enemy.deck.filter((cardId) => cardId === id).length;
        if (count) uses.push(`${enemy.name}'s deck (×${count})`);
      }
    }
    if (file === 'enemies') {
      for (const zone of content.zones) {
        if (zone.enemies.includes(id)) uses.push(`the ${zone.id} spawn list`);
        if (zone.guardian === id) uses.push(`the ${zone.id} gate`);
      }
    }
    if (file === 'gems' || file === 'talismans') {
      for (const enemy of content.enemies) {
        if (enemy.reward?.gemWeights?.[id] !== undefined || enemy.reward?.talismanPool?.includes(id)) {
          uses.push(`${enemy.name}'s rewards`);
        }
      }
    }
    return uses;
  }

  function remove(): void {
    const file = tab.value;
    const item = selected.value;
    if (!item || file === 'run' || file === 'zones' || usesOf(file, item.id).length) return;
    const list = itemsOf(file);
    const at = list.indexOf(item);
    list.splice(at, 1);
    selectedId.value = list[Math.min(at, list.length - 1)]?.id ?? null;
  }

  /** Rename an unsaved item. Nothing refers to it yet, so nothing to chase. */
  function rename(id: string): void {
    const item = selected.value;
    if (!item || isSaved(tab.value, item.id)) return;
    item.id = id;
    selectedId.value = id;
  }

  /* ------------------------------ trying ------------------------------- */

  /** Install the draft into the game and return the URL that starts a run
   *  trying the selected item, or null if the draft cannot be played. */
  function tryUrl(): string | null {
    const trial = TABS.find((t) => t.file === tab.value)?.trial;
    if (!draft.value || errors.value.length) return null;
    installContent(structuredClone(JSON.parse(JSON.stringify(draft.value))) as Content);
    if (!trial || !selected.value) return '/';
    return `/?try=${encodeURIComponent(trialText({ kind: trial, id: selected.value.id }))}`;
  }

  return {
    draft, tab, selectedId, status, message,
    load, save, revert, dirtyFiles,
    issues, errors, issuesFor,
    items, selected, itemsOf, isSaved, openTab, add, duplicate, remove, rename, usesOf,
    tryUrl,
  };
});
