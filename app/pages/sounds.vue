<script setup lang="ts">
/* The sound board (dev only): every sound in the game, what sets it off, a
   picture of it, and a copy of its recipe to edit and play. Nothing here is
   saved — to keep an edit, copy it over the recipe in app/audio/sounds.ts. */
import { computed, reactive, ref } from 'vue';
import { EXAMPLE_CUES, INTERFACE_SOUNDS, soundsFor } from '~/audio/cues';
import { sfx } from '~/audio/player';
import { SOUND_NAMES, SOUNDS, type SoundName } from '~/audio/sounds';
import { lengthOf, type Recipe } from '~/audio/synth';

useHead({ title: 'Sound board' });

/** What sets each sound off: the cues that play it, and the interface. */
const usedBy = computed(() => {
  const uses = new Map<SoundName, string[]>(SOUND_NAMES.map((name) => [name, []]));
  for (const { label, cue } of EXAMPLE_CUES) {
    for (const call of soundsFor(cue, { impact: 0 })) {
      const list = uses.get(call.name)!;
      if (!list.includes(label)) list.push(label);
    }
  }
  for (const [name, what] of Object.entries(INTERFACE_SOUNDS)) uses.get(name as SoundName)!.push(what);
  return uses;
});

const show = (recipe: Recipe): string => JSON.stringify(recipe, null, 2);
const drafts = reactive(Object.fromEntries(SOUND_NAMES.map((name) => [name, show(SOUNDS[name])])) as Record<SoundName, string>);
const editing = ref<SoundName | null>(null);
const muted = ref(sfx.isMuted);
const copied = ref<SoundName | null>(null);

/** The edited copy, if it is a recipe. */
function draftOf(name: SoundName): Recipe | null {
  try {
    const value = JSON.parse(drafts[name]) as Recipe;
    return Array.isArray(value?.layers) && value.layers.length ? value : null;
  } catch {
    return null;
  }
}

const recipeFor = (name: SoundName): Recipe => (editing.value === name ? draftOf(name) : null) ?? SOUNDS[name];
const changed = (name: SoundName): boolean => drafts[name] !== show(SOUNDS[name]);

async function play(recipe: Recipe): Promise<void> {
  if (await sfx.start()) sfx.playRecipe(recipe);
}

async function playAll(): Promise<void> {
  if (!(await sfx.start())) return;
  let at = 0;
  for (const name of SOUND_NAMES) {
    sfx.playRecipe(SOUNDS[name], { delay: at });
    at += lengthOf(SOUNDS[name]) + 0.35;
  }
}

function unmute(): void {
  sfx.setMuted(false);
  muted.value = false;
}

async function copy(name: SoundName): Promise<void> {
  try {
    await navigator.clipboard.writeText(`${name}: ${drafts[name]},`);
    copied.value = name;
    setTimeout(() => {
      if (copied.value === name) copied.value = null;
    }, 1500);
  } catch {
    // No clipboard permission: the text is there to select by hand.
  }
}
</script>

<template>
  <div class="board">
    <header class="board-bar">
      <strong>Sound board</strong>
      <span class="note">
        Every sound is a recipe in <code>app/audio/sounds.ts</code>, made in the browser. Edit a copy and play it;
        to keep it, copy it over the recipe there.
      </span>
      <span class="actions">
        <button v-if="muted" type="button" class="btn warn" @click="unmute">Muted in the game — unmute</button>
        <button type="button" class="btn" @click="playAll">Play all</button>
        <NuxtLink to="/" class="btn">Play the game</NuxtLink>
      </span>
    </header>

    <main class="sounds">
      <section v-for="name in SOUND_NAMES" :key="name" class="sound">
        <div class="sound-head">
          <button type="button" class="play" :aria-label="`Play ${name}`" @click="play(SOUNDS[name])">▶</button>
          <code class="name">{{ name }}</code>
          <span class="length">{{ lengthOf(recipeFor(name)).toFixed(2) }}s</span>
          <button type="button" class="btn small" @click="editing = editing === name ? null : name">
            {{ editing === name ? 'Close' : 'Edit' }}
          </button>
        </div>
        <p class="uses">{{ usedBy.get(name)!.join(' · ') }}</p>
        <DevSoundScope :recipe="recipeFor(name)" />

        <div v-if="editing === name" class="edit">
          <textarea v-model="drafts[name]" spellcheck="false" rows="12" :aria-label="`Recipe for ${name}`" />
          <p v-if="!draftOf(name)" class="bad">Not a recipe — check the JSON.</p>
          <div class="edit-actions">
            <button type="button" class="btn primary" :disabled="!draftOf(name)" @click="play(draftOf(name)!)">▶ Play the edit</button>
            <button type="button" class="btn" @click="copy(name)">{{ copied === name ? 'Copied' : 'Copy' }}</button>
            <button type="button" class="btn" :disabled="!changed(name)" @click="drafts[name] = show(SOUNDS[name])">Reset</button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* A tool, like the editor: a plain face, normal case, room to scroll. */
.board {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #14161f;
  color: #e6e8ef;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.45;
  text-transform: none;
}
.board-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background: #1c1f2c;
  border-bottom: 1px solid #313750;
}
.note { color: #9098b0; font-size: 13px; flex: 1; }
.note code { color: #e6e8ef; }
.actions { display: flex; gap: 8px; }
.sounds {
  flex: 1;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 14px;
  padding: 16px;
  align-content: start;
}
.sound {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  background: #1c1f2c;
  border: 1px solid #313750;
  border-radius: 8px;
}
.sound-head { display: flex; align-items: center; gap: 10px; }
.name { font-size: 15px; color: #feae34; }
.length { color: #9098b0; font-size: 12px; margin-right: auto; }
.uses { margin: 0; color: #9098b0; font-size: 12px; min-height: 18px; }
.play {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: #feae34;
  color: #1a1c2c;
  font-size: 13px;
  cursor: pointer;
}
.play:hover { filter: brightness(1.1); }
.edit { display: flex; flex-direction: column; gap: 6px; }
.edit textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid #313750;
  border-radius: 6px;
  background: #0b0d14;
  color: #e6e8ef;
  font: 12px/1.4 ui-monospace, monospace;
  resize: vertical;
}
.edit-actions { display: flex; gap: 8px; }
.bad { margin: 0; color: #e5626a; font-size: 12px; }
.btn {
  padding: 6px 12px;
  border: 1px solid #313750;
  border-radius: 6px;
  background: #232738;
  color: #e6e8ef;
  font: inherit;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}
.btn:hover:not(:disabled) { border-color: #9098b0; }
.btn:disabled { opacity: 0.45; cursor: default; }
.btn.small { padding: 3px 10px; font-size: 13px; }
.btn.primary { background: #feae34; border-color: #feae34; color: #1a1c2c; font-weight: 600; }
.btn.warn { border-color: #e0b04a; color: #e0b04a; }
</style>
