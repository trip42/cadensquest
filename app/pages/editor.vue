<script setup lang="ts">
/* The content editor. Dev only — the route is dropped from production
   builds, and the endpoint it saves through answers 404 there.

   Tabs across the top, one per content file. Down the left, the things in
   that file; in the middle, a form for the one selected; on the right, how
   it looks in the game, redrawn on every change. "Try it" plays the draft
   straight away, saved or not. */

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ContentFile } from '~/game/content';
import { ZONES } from '~/game/map/tiles';
import { TABS, useEditorStore } from '~/stores/editor';
import { problemsAt } from '~/utils/editorProblems';

const editor = useEditorStore();

onMounted(() => {
  if (!editor.draft) void editor.load();
  window.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onLeave);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('beforeunload', onLeave);
});

/** Cmd/Ctrl+S saves, as anywhere else. */
function onKey(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void editor.save();
  }
}
function onLeave(event: BeforeUnloadEvent): void {
  if (editor.dirtyFiles.length) event.preventDefault();
}

/* ------------------------------ the list ------------------------------- */

const search = ref('');
const tabInfo = computed(() => TABS.find((tab) => tab.file === editor.tab)!);
const isCollection = computed(() => editor.tab !== 'run');

type Listed = { id: string; name?: string; enabled?: boolean };
const nameOf = (item: Listed) =>
  editor.tab === 'zones' ? ZONES.find((zone) => zone.id === item.id)?.name ?? item.id : item.name ?? item.id;

const listed = computed(() => {
  const query = search.value.trim().toLowerCase();
  return (editor.items as Listed[]).filter(
    (item) => !query || item.id.includes(query) || nameOf(item).toLowerCase().includes(query),
  );
});

const countOf = (file: ContentFile) => (file === 'run' ? editor.draft?.run.startingDeck.length ?? 0 : editor.itemsOf(file).length);
const levelOf = (file: ContentFile, id?: string) => {
  const found = editor.issuesFor(file, id);
  return found.some((issue) => issue.level === 'error') ? 'error' : found.length ? 'warning' : null;
};

/* ------------------------------ the selected item ---------------------- */

const item = computed(() => editor.selected as (Listed & Record<string, unknown>) | null);
const itemIssues = computed(() =>
  editor.tab === 'run' ? editor.issuesFor('run') : item.value ? editor.issuesFor(editor.tab, item.value.id) : [],
);
/** Problems with the file as a whole — "no enabled rare cards". */
const fileIssues = computed(() => editor.issuesFor(editor.tab).filter((issue) => !issue.id));

/* Errors in other files. A change here can break something there —
   disabling a card the starting deck uses — so they are shown wherever
   you are, with a way to jump to them. */
const elsewhere = computed(() => {
  const seen = new Set<string>();
  return editor.errors.filter((issue) => {
    // Four Guards in the deck is one problem, not four.
    const key = `${issue.file}|${issue.id}|${issue.message}`;
    if (issue.file === editor.tab || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});
const tabLabel = (file: ContentFile) => TABS.find((tab) => tab.file === file)?.label ?? file;
function jump(issue: { file: ContentFile; id?: string }): void {
  editor.openTab(issue.file);
  if (issue.id) editor.selectedId = issue.id;
}

const idLocked = computed(() => !item.value || editor.isSaved(editor.tab, item.value.id));
const uses = computed(() => (item.value ? editor.usesOf(editor.tab, item.value.id) : []));
const canCreate = computed(() => editor.tab !== 'run' && editor.tab !== 'zones');

function tryIt(): void {
  const url = editor.tryUrl();
  if (url) void navigateTo(url);
}

const saveLabel = computed(() => {
  if (editor.status === 'saving') return 'Saving…';
  const count = editor.dirtyFiles.length;
  return count ? `Save ${count} file${count === 1 ? '' : 's'}` : 'Saved';
});
</script>

<template>
  <div class="editor">
    <header class="bar">
      <strong class="title">Content editor</strong>
      <nav class="tabs" aria-label="Content">
        <button
          v-for="tab in TABS"
          :key="tab.file"
          type="button"
          class="tab"
          :class="{ 'is-on': editor.tab === tab.file }"
          @click="editor.openTab(tab.file)"
        >
          {{ tab.label }}
          <span class="tab-count">{{ countOf(tab.file) }}</span>
          <i v-if="editor.dirtyFiles.includes(tab.file)" class="dot is-dirty" title="Unsaved changes" />
          <i v-if="levelOf(tab.file)" class="dot" :class="`is-${levelOf(tab.file)}`" :title="levelOf(tab.file) === 'error' ? 'Has errors' : 'Has warnings'" />
        </button>
      </nav>
      <div class="actions">
        <span class="status" :class="{ 'is-bad': editor.status === 'error' }">{{ editor.message }}</span>
        <button v-if="editor.dirtyFiles.length" type="button" class="btn" @click="editor.revert()">Discard changes</button>
        <button
          type="button"
          class="btn primary"
          :disabled="!editor.dirtyFiles.length || editor.errors.length > 0 || editor.status === 'saving'"
          :title="editor.errors.length ? 'Fix the errors first' : 'Cmd/Ctrl+S'"
          @click="editor.save()"
        >
          {{ saveLabel }}
        </button>
        <NuxtLink to="/" class="btn">Play</NuxtLink>
      </div>
    </header>

    <p v-if="!editor.draft" class="loading">Loading content…</p>

    <template v-else>
      <aside v-if="isCollection" class="list">
        <input v-model="search" type="search" class="search" :placeholder="`Find a ${tabInfo.one}…`" :aria-label="`Find a ${tabInfo.one}`">
        <ul>
          <li v-for="entry in listed" :key="entry.id">
            <button
              type="button"
              class="entry"
              :class="{ 'is-on': editor.selectedId === entry.id, 'is-off': entry.enabled === false }"
              @click="editor.selectedId = entry.id"
            >
              <span class="entry-name">{{ nameOf(entry) }}</span>
              <span class="entry-id">{{ entry.id }}</span>
              <i v-if="levelOf(editor.tab, entry.id)" class="dot" :class="`is-${levelOf(editor.tab, entry.id)}`" />
              <span v-if="entry.enabled === false" class="entry-off">off</span>
            </button>
          </li>
        </ul>
        <button v-if="canCreate" type="button" class="btn new" @click="editor.add()">+ New {{ tabInfo.one }}</button>
      </aside>

      <main class="form" :class="{ 'is-wide': !isCollection }">
        <div v-for="issue in fileIssues" :key="issue.message" class="notice" :class="`is-${issue.level}`">
          {{ issue.message }}
        </div>
        <button
          v-for="(issue, i) in elsewhere"
          :key="`elsewhere-${i}`"
          type="button"
          class="notice is-error jump"
          @click="jump(issue)"
        >
          <b>{{ tabLabel(issue.file) }}{{ issue.id ? ` › ${issue.id}` : '' }}:</b> {{ issue.message }} →
        </button>

        <template v-if="item || editor.tab === 'run'">
          <div v-if="item" class="head">
            <div class="head-fields">
              <EditorField v-if="editor.tab !== 'zones'" label="Name" :problems="problemsAt(itemIssues, 'name')">
                <input v-model="(item as { name: string }).name" type="text" class="big">
              </EditorField>
              <p v-else class="zone-title">{{ nameOf(item) }}</p>
              <EditorField
                label="Id"
                :hint="idLocked ? 'Fixed once saved — other content and analytics refer to it.' : 'How everything refers to it. Can be changed until it is saved.'"
                :problems="problemsAt(itemIssues, 'id')"
              >
                <input :value="item.id" type="text" :disabled="idLocked" @change="editor.rename(($event.target as HTMLInputElement).value.trim())">
              </EditorField>
              <label v-if="item.enabled !== undefined" class="toggle">
                <input v-model="(item as { enabled: boolean }).enabled" type="checkbox">
                <span>{{ item.enabled ? 'Enabled' : 'Disabled — defined, but never offered or spawned' }}</span>
              </label>
            </div>
            <div class="head-actions">
              <button v-if="canCreate" type="button" class="btn" @click="editor.duplicate()">Duplicate</button>
              <button
                v-if="canCreate"
                type="button"
                class="btn danger"
                :disabled="uses.length > 0"
                :title="uses.length ? `Used by ${uses.join(', ')} — disable it instead, or remove those first` : 'Delete it'"
                @click="editor.remove()"
              >
                Delete
              </button>
            </div>
          </div>

          <ul v-if="itemIssues.length" class="issues">
            <li v-for="(issue, i) in itemIssues" :key="i" :class="`is-${issue.level}`">
              <b>{{ issue.level === 'error' ? 'Error' : 'Check' }}</b>
              <span v-if="issue.field" class="issue-field">{{ issue.field }}</span>
              {{ issue.message }}
            </li>
          </ul>

          <EditorFormCard v-if="editor.tab === 'cards'" :item="item as never" :issues="itemIssues" />
          <EditorFormEnemyCard v-else-if="editor.tab === 'enemy-cards'" :item="item as never" :issues="itemIssues" />
          <EditorFormEnemy v-else-if="editor.tab === 'enemies'" :item="item as never" :issues="itemIssues" :content="editor.draft" />
          <EditorFormGem v-else-if="editor.tab === 'gems'" :item="item as never" :issues="itemIssues" />
          <EditorFormTalisman v-else-if="editor.tab === 'talismans'" :item="item as never" :issues="itemIssues" />
          <EditorFormZone v-else-if="editor.tab === 'zones'" :item="item as never" :issues="itemIssues" :content="editor.draft" />
          <EditorFormRun v-else :content="editor.draft" :issues="itemIssues" />
        </template>
        <p v-else class="empty">Nothing selected.</p>
      </main>

      <section class="side" aria-label="Preview">
        <div class="side-head">
          <span>Preview</span>
          <button
            type="button"
            class="btn primary"
            :disabled="editor.errors.length > 0"
            :title="editor.errors.length ? 'Fix the errors first' : 'Start a run with this, using your unsaved changes'"
            @click="tryIt"
          >
            ▶ Try it
          </button>
        </div>
        <EditorPreview
          v-if="item || editor.tab === 'run'"
          :file="editor.tab"
          :item="item"
          :content="editor.draft"
        />
      </section>
    </template>
  </div>
</template>

<style>
/* The editor is a tool, not the game: a plain readable face, normal case,
   and room to scroll. Only the preview pane uses the game's own look.
   Unscoped, under .editor, so the form components share one set of
   control styles. */
.editor {
  --ed-bg: #14161f;
  --ed-panel: #1c1f2c;
  --ed-well: #232738;
  --ed-line: #313750;
  --ed-text: #e6e8ef;
  --ed-muted: #9098b0;
  --ed-accent: #feae34;
  --ed-bad: #e5626a;
  --ed-warn: #e0b04a;
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr) 400px;
  grid-template-rows: auto minmax(0, 1fr);
  background: var(--ed-bg);
  color: var(--ed-text);
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.45;
  text-transform: none;
}
.editor .bar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 16px;
  background: var(--ed-panel);
  border-bottom: 1px solid var(--ed-line);
}
.editor .title { white-space: nowrap; }
.editor .tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.editor .tab {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; border: 0; border-radius: 6px;
  background: transparent; color: var(--ed-muted); font: inherit; cursor: pointer;
}
.editor .tab:hover { color: var(--ed-text); background: var(--ed-well); }
.editor .tab.is-on { color: var(--ed-text); background: var(--ed-well); box-shadow: inset 0 -2px 0 var(--ed-accent); }
.editor .tab-count { color: var(--ed-muted); font-size: 12px; }
.editor .actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.editor .status { color: var(--ed-muted); font-size: 13px; }
.editor .status.is-bad { color: var(--ed-bad); }

.editor .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.editor .dot.is-dirty { background: var(--ed-accent); }
.editor .dot.is-error { background: var(--ed-bad); }
.editor .dot.is-warning { background: var(--ed-warn); }

.editor .loading, .editor .empty { padding: 24px; color: var(--ed-muted); }

/* ------------------------------ list ---------------------------------- */
.editor .list { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-right: 1px solid var(--ed-line); overflow-y: auto; }
.editor .list ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.editor .entry {
  width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; column-gap: 8px;
  padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--ed-text); font: inherit; text-align: left; cursor: pointer;
}
.editor .entry:hover { background: var(--ed-well); }
.editor .entry.is-on { background: var(--ed-well); box-shadow: inset 3px 0 0 var(--ed-accent); }
.editor .entry.is-off .entry-name { color: var(--ed-muted); text-decoration: line-through; }
.editor .entry-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor .entry-id { grid-column: 1; color: var(--ed-muted); font-size: 12px; font-family: ui-monospace, monospace; }
.editor .entry-off { grid-row: 1; grid-column: 3; color: var(--ed-muted); font-size: 11px; }
.editor .new { margin-top: 4px; }

/* ------------------------------ form ---------------------------------- */
.editor .form { display: flex; flex-direction: column; gap: 16px; padding: 18px 24px 40px; overflow-y: auto; }
.editor .form.is-wide { grid-column: 1 / 3; }
.editor .head { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--ed-line); }
.editor .head-fields { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 10px 14px; flex: 1; }
.editor .head-actions { display: flex; gap: 8px; align-items: flex-start; }
.editor .zone-title { margin: 0; font-size: 20px; font-weight: 600; }
.editor .toggle { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; cursor: pointer; }
.editor .toggle input { width: 18px; height: 18px; }

.editor .form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px 14px; }
.editor .field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.editor .field-label { font-size: 12px; font-weight: 600; color: var(--ed-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.editor .field-hint { color: var(--ed-muted); font-size: 12px; }
.editor .field-problem { color: var(--ed-bad); font-size: 12px; }
.editor .field.has-problem input, .editor .field.has-problem select { border-color: var(--ed-bad); }
.editor .group { margin: 0; padding: 12px 14px 14px; border: 1px solid var(--ed-line); border-radius: 8px; display: flex; flex-direction: column; gap: 10px; }
.editor .group legend { padding: 0 6px; color: var(--ed-muted); font-size: 12px; font-weight: 600; text-transform: uppercase; }
.editor .sub { margin: 0; color: var(--ed-muted); font-size: 12px; }
.editor .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.editor .inline { display: inline-flex; align-items: center; gap: 8px; }

.editor input[type='text'], .editor input[type='number'], .editor input[type='search'], .editor select, .editor textarea {
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid var(--ed-line);
  border-radius: 6px;
  background: var(--ed-well);
  color: var(--ed-text);
  font: inherit;
}
.editor input:focus, .editor select:focus, .editor textarea:focus { outline: 2px solid var(--ed-accent); outline-offset: -1px; }
.editor input:disabled { color: var(--ed-muted); }
.editor input.big { font-size: 18px; font-weight: 600; }
.editor input.num { width: 70px; }
.editor input.short { width: 110px; }
.editor input[type='color'] { width: 44px; height: 34px; padding: 2px; border: 1px solid var(--ed-line); border-radius: 6px; background: var(--ed-well); }
.editor textarea { resize: vertical; font-family: inherit; }
.editor .search { width: 100%; }

.editor .btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 7px 12px; border: 1px solid var(--ed-line); border-radius: 6px;
  background: var(--ed-well); color: var(--ed-text); font: inherit; text-decoration: none; white-space: nowrap; cursor: pointer;
}
.editor .btn:hover:not(:disabled) { border-color: var(--ed-muted); }
.editor .btn:disabled { opacity: 0.45; cursor: default; }
.editor .btn.small { align-self: flex-start; padding: 4px 10px; font-size: 13px; }
.editor .btn.primary { background: var(--ed-accent); border-color: var(--ed-accent); color: #1a1c2c; font-weight: 600; }
.editor .btn.danger { color: var(--ed-bad); }
.editor .icon-btn {
  width: 26px; height: 26px; padding: 0; border: 1px solid var(--ed-line); border-radius: 5px;
  background: transparent; color: var(--ed-muted); font: inherit; cursor: pointer;
}
.editor .icon-btn:hover:not(:disabled) { color: var(--ed-text); }
.editor .icon-btn:disabled { opacity: 0.3; cursor: default; }

.editor .issues { margin: 0; padding: 10px 12px; list-style: none; border-radius: 8px; background: var(--ed-well); display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.editor .issues .is-error b { color: var(--ed-bad); }
.editor .issues .is-warning b { color: var(--ed-warn); }
.editor .issue-field { margin: 0 4px; padding: 0 5px; border-radius: 4px; background: var(--ed-panel); color: var(--ed-muted); font-family: ui-monospace, monospace; font-size: 12px; }
.editor .notice { padding: 8px 12px; border-radius: 8px; font-size: 13px; }
.editor .notice.is-error { background: rgba(229, 98, 106, 0.14); color: var(--ed-bad); }
.editor .notice.jump { border: 0; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.editor .notice.jump:hover { background: rgba(229, 98, 106, 0.22); }
.editor .notice.is-warning { background: rgba(224, 176, 74, 0.12); color: var(--ed-warn); }

/* ------------------------------ preview ------------------------------- */
.editor .side { display: flex; flex-direction: column; border-left: 1px solid var(--ed-line); background: #1a1c2c; overflow-y: auto; }
.editor .side-head { position: sticky; top: 0; z-index: 2; display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--ed-panel); border-bottom: 1px solid var(--ed-line); }
.editor .side-head span { color: var(--ed-muted); font-size: 12px; font-weight: 600; text-transform: uppercase; }
</style>
