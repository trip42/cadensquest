<script setup lang="ts">
/* A zone's floor, seen from above: the ground the generator makes for it,
   in its colours, chunk by chunk — and where its enemies, guardians, shop
   and way down land. Built by the game's own code on the draft (installed
   while this is shown), so what it shows is what a run would get.

   For the first floor it is exactly what `?seed=N` plays. Deeper floors are
   one roll of the dice: in a run, the floors before have used some of them. */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ensureSpawns, enterFloor } from '~/game/actions';
import { entityDef } from '~/game/entities/definitions';
import { CHUNK_ROWS } from '~/game/map/generate';
import { floorRows, KIND_OF, type TileLetter, ZONES } from '~/game/map/tiles';
import { createGame, player } from '~/game/state';
import { useEditorStore } from '~/stores/editor';

const props = defineProps<{ zoneId: string }>();
const editor = useEditorStore();

const seed = ref(90210);
const canvas = ref<HTMLCanvasElement | null>(null);

/** Cell size on the map, in CSS pixels, and the gutter for chunk numbers. */
const CELL_W = 15;
const CELL_H = 6;
const GUTTER = 22;

interface Survey {
  name: string;
  first: number;
  rows: string[][];
  arrival: { row: number; col: number };
  enemies: Array<{ row: number; col: number; id: string; guardian: boolean }>;
  shop: { row: number; col: number } | null;
  portal: { row: number; col: number } | null;
  chunks: Array<{ drawn: Map<string, number>; guardian: string | null; final: boolean }>;
}

/* Walk the floor as a run would: arrive, then let each chunk spawn as the
   player comes within reach of it (two chunks ahead), in order. */
function survey(zoneId: string, at: number): Survey | null {
  const floor = ZONES.findIndex((zone) => zone.id === zoneId);
  if (floor < 0) return null;
  const game = createGame(at);
  enterFloor(game, floor);
  const self = player(game.state);
  const arrival = { row: self.row, col: self.col };
  const { first, last } = floorRows(floor);
  ensureSpawns(game);
  for (let row = first + CHUNK_ROWS; row <= last; row += CHUNK_ROWS) {
    self.row = row;
    ensureSpawns(game);
  }

  const rows: string[][] = [];
  for (let row = first; row <= last; row += 1) {
    rows.push(Array.from({ length: game.world.width }, (_, col) => game.world.stackAt(row, col)));
  }
  const guardians = new Set(game.state.gates.map((gate) => gate.guardianId));
  const enemies = game.state.entities
    .filter((entity) => entity.faction === 'enemy')
    .map((entity) => ({ row: entity.row, col: entity.col, id: entity.defId, guardian: guardians.has(entity.id) }));
  let portal: Survey['portal'] = null;
  for (const [key, layers] of Object.entries(game.state.terrain)) {
    if (layers.some((layer) => layer.portal)) {
      const [row, col] = key.split(',').map(Number);
      portal = { row: row!, col: col! };
    }
  }
  const zone = ZONES[floor]!;
  const chunks = zone.chunks.map((_, k) => {
    const top = first + k * CHUNK_ROWS;
    const drawn = new Map<string, number>();
    let guardian: string | null = null;
    for (const enemy of enemies) {
      if (enemy.row < top || enemy.row >= top + CHUNK_ROWS) continue;
      if (enemy.guardian) guardian = enemy.id;
      else drawn.set(enemy.id, (drawn.get(enemy.id) ?? 0) + 1);
    }
    return { drawn, guardian, final: k === zone.chunks.length - 1 };
  });
  return {
    name: zone.name, first, rows, arrival, enemies, chunks, portal,
    shop: game.state.shop ? { row: game.state.shop.row, col: game.state.shop.col } : null,
  };
}

const result = ref<Survey | null>(null);
const failed = ref(false);

function refresh(): void {
  failed.value = !editor.installDraft();
  if (failed.value) return;
  result.value = survey(props.zoneId, seed.value);
  draw();
}

/** A colour lightened toward white by `amount`, 0..1. */
function lighten(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

function draw(): void {
  const map = result.value;
  const el = canvas.value;
  const zone = ZONES.find((item) => item.id === props.zoneId);
  if (!map || !el || !zone) return;
  const width = GUTTER + map.rows[0]!.length * CELL_W;
  const height = map.rows.length * CELL_H;
  const dpr = window.devicePixelRatio || 1;
  el.width = width * dpr;
  el.height = height * dpr;
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  const ctx = el.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // The ground: each tile its surface colour, lighter the higher it stands.
  map.rows.forEach((row, r) => row.forEach((stack, c) => {
    if (!stack) return;
    const kind = KIND_OF[stack[stack.length - 1] as TileLetter] ?? 'ground';
    ctx.fillStyle = lighten(zone.palette[kind].top, Math.min(0.45, (stack.length - 1) * 0.07));
    ctx.fillRect(GUTTER + c * CELL_W, r * CELL_H, CELL_W, CELL_H);
  }));

  // Chunk lines, numbered down the side.
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  map.chunks.forEach((_, k) => {
    const y = k * CHUNK_ROWS * CELL_H;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    if (k) ctx.fillRect(0, y, width, 1);
    ctx.fillText(String(k + 1), 6, y + 4);
  });

  const at = (cell: { row: number; col: number }) => ({
    x: GUTTER + cell.col * CELL_W + CELL_W / 2,
    y: (cell.row - map.first) * CELL_H + CELL_H / 2,
  });
  const dot = (cell: { row: number; col: number }, radius: number, fill: string, ring = '#1b1b2b') => {
    const { x, y } = at(cell);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ring;
    ctx.stroke();
  };
  for (const enemy of map.enemies) {
    if (enemy.guardian) dot(enemy, 6, '#e43b44', '#feae34');
    else dot(enemy, 3, '#e43b44');
  }
  if (map.shop) {
    const { x, y } = at(map.shop);
    ctx.fillStyle = '#feae34';
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.strokeStyle = '#1b1b2b';
    ctx.strokeRect(x - 4, y - 4, 8, 8);
  }
  if (map.portal) dot(map.portal, 5, '#ffffff');
  dot(map.arrival, 4, '#2ce8f5');
}

const nameOf = (id: string) => {
  try {
    return entityDef(id).name;
  } catch {
    return id;
  }
};
const summaries = computed(() => (result.value?.chunks ?? []).map((chunk, k) => ({
  k,
  drawn: [...chunk.drawn].map(([id, n]) => `${nameOf(id)}${n > 1 ? ` ×${n}` : ''}`).join(', ') || 'nobody',
  guardian: chunk.guardian ? nameOf(chunk.guardian) : null,
  final: chunk.final,
})));

function reroll(): void {
  seed.value = Math.floor(Math.random() * 1_000_000);
}

/* Redrawn as the draft changes — after a pause, since every edit would
   otherwise rebuild the floor — and at once for a new seed or zone. */
let timer: ReturnType<typeof setTimeout> | undefined;
onMounted(refresh);
onBeforeUnmount(() => clearTimeout(timer));
watch(() => [seed.value, props.zoneId], (now, before) => {
  if (before && now[0] === before[0] && now[1] === before[1]) return;
  refresh();
});
watch(() => editor.draft, () => {
  clearTimeout(timer);
  timer = setTimeout(refresh, 350);
}, { deep: true });
</script>

<template>
  <div class="zone-map">
    <div class="map-tools">
      <label>Seed <input v-model.number="seed" type="number" min="0" class="seed"></label>
      <button type="button" class="btn small" @click="reroll">Re-roll</button>
    </div>
    <p v-if="failed" class="muted">Fix the errors to see the map.</p>
    <template v-else>
      <canvas ref="canvas" class="map" />
      <p class="legend">
        <span><i class="key arrival" /> you arrive</span>
        <span><i class="key foe" /> enemy</span>
        <span><i class="key boss" /> guardian</span>
        <span><i class="key shop" /> shop</span>
        <span v-if="result?.portal"><i class="key portal" /> way down, open</span>
      </p>
      <ul class="chunks">
        <li v-for="chunk in summaries" :key="chunk.k">
          <b>{{ chunk.k + 1 }}</b> {{ chunk.drawn }}<template v-if="chunk.guardian"> — then {{ chunk.guardian }}{{ chunk.final ? ', holding the way down' : '' }}</template>
        </li>
      </ul>
      <p class="muted">The first floor is exactly what <code>?seed={{ seed }}</code> plays; a deeper floor is one roll of its dice.</p>
    </template>
  </div>
</template>

<style scoped>
.zone-map { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.map-tools { display: flex; gap: 8px; align-items: center; font-size: 12px; }
.seed { width: 90px; }
.map { border: 1px solid var(--ed-line, #444); background: #1b1b2b; image-rendering: pixelated; }
.legend { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; font-size: 11px; }
.key { display: inline-block; width: 9px; height: 9px; border-radius: 50%; border: 1px solid #1b1b2b; vertical-align: -1px; }
.key.arrival { background: #2ce8f5; }
.key.foe { background: #e43b44; width: 7px; height: 7px; }
.key.boss { background: #e43b44; outline: 2px solid #feae34; }
.key.shop { background: #feae34; border-radius: 0; }
.key.portal { background: #fff; }
.chunks { margin: 0; padding: 0; list-style: none; font-size: 12px; display: grid; gap: 3px; }
.chunks b { display: inline-block; width: 16px; }
.muted { margin: 0; font-size: 11px; opacity: 0.7; }
</style>
