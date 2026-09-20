/* =============================================================
   ISOMETRIC FIELD STUDY — proof of concept
   A braided terrain ribbon, up to 10 tiles wide, scrolling
   diagonally up-right. Built from stacked tiles, and from gaps.
============================================================= */

/* ------------------------------------------------------------------
   1. THE MAP DATA

   Every cell is a STACK of tiles, written bottom-to-top as a string:

       'G'    one grass tile, sitting on the baseline
       'GG'   grass on grass — one layer higher
       'GGD'  two grass with a dirt cap, three layers high
       'GW'   water, its surface one layer up
       '.'    nothing at all — open air, the gap in a fork

   A row can be written two ways. An array gives one string per
   column, so stacks can differ. A plain string is the shorthand for
   a flat row: each character is its own one-tile stack, so 'GGGD.G'
   means exactly ['G','G','G','D','.','G'].

   The ground here is one continuous landmass: it splits around open
   gaps and merges again, and it never drops below four tiles across.
   `auditMap()` at the bottom of this file checks both of those every
   time the page loads, so an edit that breaks the braid says so.
------------------------------------------------------------------ */

const worldMap = {
  width: 10,
  tiles: [
    'WGGGGDGGGG',                                          //  0
    'WGGDDDDGGG',                                          //  1  the trail spreads out
    'GGGD.GDGGG',                                          //  2  a gap opens mid-ribbon
    ['G', 'G', 'D', 'D', '.', '.', 'GD', 'GD', 'GG', 'GG'], //  3  fork — east bank steps up
    ['G', 'G', 'D', 'G', '.', '.', 'GG', 'GD', 'GW', 'GW'], //  4
    ['G', 'D', 'D', 'G', '.', '.', 'GG', 'GD', 'GW', 'GW'], //  5
    ['G', 'D', 'G', 'G', '.', '.', 'GG', 'GD', 'GD', 'GW'], //  6
    ['G', 'D', 'D', 'D', '.', 'GG', 'GD', 'GD', 'GG', 'GW'], //  7  the gap closes
    'GGGDDDDGGG',                                          //  8  merge
    'GGGGGDGGGG',                                          //  9
    '.GGGGDGGGW',                                          // 10  the west edge falls away
    '..GGGDGGGW',                                          // 11
    '...GGDDGGW',                                          // 12
    '....GGDGGG',                                          // 13
    ['.', '.', '.', '.', '.', 'G', 'GD', 'GD', 'GG', 'GG'], // 14
    ['.', '.', '.', '.', '.', '.', 'GD', 'GG', 'GG', 'GG'], // 15  narrowest — four tiles
    ['.', '.', '.', '.', '.', '.', 'GD', 'GGG', 'GGG', 'GG'], // 16  a ridge above the trail
    ['.', '.', '.', '.', '.', 'GG', 'GD', 'GG', 'GG', 'GG'], // 17
    '....GGDGGG',                                          // 18
    '..GGGDDGGG',                                          // 19  the ribbon opens out again
    'GGGDDDDGGG',                                          // 20
    'GGGD..DGGG',                                          // 21  second fork
    'GGGD..DGGW',                                          // 22
    'WGGDDDDGGG',                                          // 23  merge, and back to row 0
  ],
};

/* Terrain palette: three face colours per type, how far the tile's top
   sits above (+) or below (-) its layer, and its surface detail.     */
const tileTypes = {
  G: { name: 'grass', top: '#8fb063', left: '#5f8046', right: '#4b6838', elev: 0,  texture: grassTexture },
  W: { name: 'water', top: '#6ea9ad', left: '#477f85', right: '#39666d', elev: -5, texture: waterTexture },
  D: { name: 'dirt',  top: '#c1945f', left: '#956a42', right: '#7a5533', elev: 0,  texture: dirtTexture  },
};

const VOID = '';   // what an empty cell resolves to

/* ------------------------------------------------------------------
   2. GEOMETRY

   Screen position of the BASE of cell (row, col), camera at `travel`:

       u  = row - travel
       sx = (col - mid - u) * HW + viewW / 2 + panX
       sy = (col - mid + u) * HH + viewH / 2 + panY

   Layer i of that stack is simply drawn i * LAYER_H higher up.
   Increasing `travel` slides the whole world up and to the right,
   and new rows walk in from the lower left.
------------------------------------------------------------------ */

/* Everything below is measured in DESIGN SPACE — a viewport of a fixed
   size, whatever the screen is actually doing. The canvas is scaled to
   fit the real element on resize, so the same slice of the world is on
   screen at every size: a wider window draws the map bigger, not more
   of it. DESIGN_W is the one dial for how much map that is; the shape
   of the slice comes from --map-ratio in styles.css.                  */
const DESIGN_W = 1092;                 // design-space viewport width

const TILE_W  = 112;                   // width of a tile diamond
const TILE_H  = 56;                    // height of a tile diamond (2:1)
const LAYER_H = 17;                    // height of one stacked layer
const HW = TILE_W / 2;
const HH = TILE_H / 2;
const MID = (worldMap.width - 1) / 2;  // column the camera follows

const viewport = document.querySelector('#mapViewport');
const canvas = document.querySelector('#mapCanvas');
const ctx = canvas.getContext('2d');
const coords = document.querySelector('#coords');
const mapSource = document.querySelector('#mapSource');
const mapDims = document.querySelector('#mapDims');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let viewW = 0;             // viewport size in design units — constant in practice
let viewH = 0;
let scale = 1;             // design units -> CSS pixels
let travel = 0;            // camera position along the ribbon, in rows
let panX = 0;              // manual drag offset
let panY = 0;
let running = !reducedMotion;
let hover = null;          // { row, col } under the pointer

const SPEED = 0.55;        // rows travelled per second

/* ------------------------------ the map ------------------------------- */

/* A row may be an array of stacks or a shorthand string, and a cell may be
   empty; `stackAt` hides all of that from everything else. An empty cell
   comes back as '', which every caller reads as "nothing here".        */
function stackAt(row, col) {
  const rows = worldMap.tiles.length;
  const source = worldMap.tiles[((row % rows) + rows) % rows];   // the map loops
  const cell = source[col];
  if (!cell || cell === '.') return VOID;
  return cell;
}

function typeOf(letter) {
  return tileTypes[letter] || tileTypes.G;
}

/* The tallest stack anywhere, so culling knows how far a column can
   reach up the screen from its base. */
const MAX_STACK = worldMap.tiles.reduce((tallest, row, index) => {
  for (let col = 0; col < worldMap.width; col += 1) {
    tallest = Math.max(tallest, stackAt(index, col).length);
  }
  return tallest;
}, 1);

/* ------------------------------ rendering ------------------------------ */

/* Size the backing store to the real element, then bake the design->screen
   scale straight into the context transform. Every drawing routine gets to
   stay in design units and none of them has to know the screen size.    */
function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;            // laid out but not visible yet

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  scale = rect.width / DESIGN_W;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

  viewW = DESIGN_W;
  viewH = rect.height / scale;   // the CSS ratio holds this steady; derived so
}                                // that a tweak to --map-ratio just works

const screenX = (col, u) => (col - MID - u) * HW + viewW / 2 + panX;
const screenY = (col, u) => (col - MID + u) * HH + viewH / 2 + panY;

function drawFrame(time) {
  ctx.clearRect(0, 0, viewW, viewH);

  const tall = MAX_STACK * LAYER_H;
  const reach = Math.ceil(viewW / TILE_W + viewH / TILE_H) + MAX_STACK * 2 + 6;
  const firstRow = Math.floor(travel) - reach;
  const lastRow = Math.ceil(travel) + reach;

  /* Pass one: the faint lattice, on the ground plane. It runs under the
     gaps inside the ribbon as well as the open country either side, so a
     fork reads as an empty channel rather than a hole in the picture.
     Drawing it all first means solid tiles always paint over it.      */
  ctx.strokeStyle = 'rgba(226, 240, 214, 0.08)';
  ctx.lineWidth = 1;
  for (let row = firstRow; row <= lastRow; row += 1) {
    const u = row - travel;
    for (let col = -5; col < worldMap.width + 5; col += 1) {
      const inside = col >= 0 && col < worldMap.width;
      if (inside && stackAt(row, col) !== VOID) continue;
      const sx = screenX(col, u);
      const sy = screenY(col, u);
      if (sx < -TILE_W || sx > viewW + TILE_W || sy < -TILE_H || sy > viewH + TILE_H) continue;
      diamond(sx, sy);
      ctx.stroke();
    }
  }

  /* Pass two: the stacks. Painter's algorithm — a cell's depth on screen
     is row + col, so walking the diagonals in ascending order draws far
     to near, and a stack is always drawn after everything it can stand
     in front of, however tall either column happens to be.           */
  for (let depth = firstRow; depth <= lastRow + worldMap.width - 1; depth += 1) {
    for (let col = 0; col < worldMap.width; col += 1) {
      const row = depth - col;
      if (row < firstRow || row > lastRow) continue;

      const stack = stackAt(row, col);
      if (stack === VOID) continue;

      const u = row - travel;
      const sx = screenX(col, u);
      const sy = screenY(col, u);
      if (sx < -TILE_W || sx > viewW + TILE_W) continue;
      if (sy < -TILE_H - tall || sy > viewH + TILE_H + LAYER_H) continue;

      drawStack(sx, sy, stack, row, col, time);
    }
  }
}

function diamond(sx, sy) {
  ctx.beginPath();
  ctx.moveTo(sx, sy - HH);
  ctx.lineTo(sx + HW, sy);
  ctx.lineTo(sx, sy + HH);
  ctx.lineTo(sx - HW, sy);
  ctx.closePath();
}

/* One column of tiles, drawn bottom layer first so each block paints
   over the one beneath it. */
function drawStack(sx, sy, stack, row, col, time) {
  const lit = hover && hover.row === row && hover.col === col;
  for (let layer = 0; layer < stack.length; layer += 1) {
    const isTop = layer === stack.length - 1;
    drawBlock(sx, sy - layer * LAYER_H, typeOf(stack[layer]), isTop, lit, row, col, time);
  }
}

/* A single block: two side walls, and a top face only when nothing is
   stacked on it. A buried block never sinks, so no seam can open up
   between it and the block above. */
function drawBlock(sx, sy, type, isTop, lit, row, col, time) {
  const ty = sy - (isTop ? type.elev : 0);   // top face, lifted or sunken
  const base = sy + LAYER_H;                 // where this block's walls end

  ctx.fillStyle = type.left;                 // left wall
  ctx.beginPath();
  ctx.moveTo(sx - HW, ty);
  ctx.lineTo(sx, ty + HH);
  ctx.lineTo(sx, base + HH);
  ctx.lineTo(sx - HW, base);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(24, 48, 36, 0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = type.right;                // right wall
  ctx.beginPath();
  ctx.moveTo(sx, ty + HH);
  ctx.lineTo(sx + HW, ty);
  ctx.lineTo(sx + HW, base);
  ctx.lineTo(sx, base + HH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (!isTop) return;                        // a covered top face is invisible

  diamond(sx, ty);
  ctx.fillStyle = lit ? '#f1e4a8' : type.top;
  ctx.fill();

  ctx.save();
  ctx.clip();
  type.texture(sx, ty, row, col, time);
  ctx.restore();

  ctx.strokeStyle = 'rgba(24, 48, 36, 0.18)';
  diamond(sx, ty);
  ctx.stroke();
}

/* ------------------------------ surface detail ------------------------- */

/* Deterministic per-tile noise, so detail never flickers as you travel. */
function hash(row, col, salt) {
  let h = Math.imul(row + 1013, 374761393) ^ Math.imul(col + 619, 668265263) ^ Math.imul(salt + 7, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function grassTexture(sx, sy, row, col) {
  ctx.strokeStyle = 'rgba(46, 82, 44, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = hash(row, col, i) * 2 - 1;
    const b = hash(row, col, i + 40) * 2 - 1;
    const x = sx + (a - b) * HW * 0.42;
    const y = sy + (a + b) * HH * 0.42;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1, y - 5);
  }
  ctx.stroke();
}

function dirtTexture(sx, sy, row, col) {
  ctx.fillStyle = 'rgba(104, 66, 38, 0.42)';
  for (let i = 0; i < 10; i += 1) {
    const a = hash(row, col, i) * 2 - 1;
    const b = hash(row, col, i + 70) * 2 - 1;
    ctx.fillRect(sx + (a - b) * HW * 0.44, sy + (a + b) * HH * 0.44, 2, 2);
  }
}

function waterTexture(sx, sy, row, col, time) {
  ctx.strokeStyle = 'rgba(224, 248, 244, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 3; i += 1) {
    const phase = time * 0.0014 + (row + col) * 0.7 + i * 2.1;
    const y = sy + Math.sin(phase) * HH * 0.28 + (i - 1) * 7;
    ctx.moveTo(sx - HW * 0.3, y);
    ctx.lineTo(sx + HW * 0.3, y);
  }
  ctx.stroke();
}

/* ------------------------------ the loop ------------------------------- */

let previous = performance.now();

function frame(now) {
  const delta = Math.min((now - previous) / 1000, 0.1);
  previous = now;
  if (running) travel += SPEED * delta;
  updateReadout();
  drawFrame(now);
  requestAnimationFrame(frame);
}

function updateReadout() {
  if (hover) {
    const stack = stackAt(hover.row, hover.col);
    const name = typeOf(stack[stack.length - 1]).name.toUpperCase();
    coords.textContent = `${name} / ${stack} / ${stack.length} HIGH @ R${hover.row} C${hover.col}`;
    return;
  }
  coords.textContent = `TRAVEL ${travel.toFixed(2)} ROWS${running ? '' : ' / PAUSED'}`;
}

/* ------------------------------ interaction ---------------------------- */

/* Picking has to respect height: a tall stack covers the ground behind it.
   So test the top face of every candidate column and keep the nearest hit
   — nearest being the largest row + col. Empty cells are never hit.    */
function pick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const px = (clientX - rect.left) / scale;      // screen pixels -> design units
  const py = (clientY - rect.top) / scale;

  // The cell the point would land on if the world were flat, as a centre
  // for the search; a stack can only pull a hit forward by its height.
  const a = (px - viewW / 2 - panX) / HW;
  const b = (py - viewH / 2 - panY) / HH;
  const flatRow = Math.round(travel + (b - a) / 2);
  const span = MAX_STACK + 1;

  let best = null;
  for (let row = flatRow - span; row <= flatRow + span; row += 1) {
    for (let col = 0; col < worldMap.width; col += 1) {
      const stack = stackAt(row, col);
      if (stack === VOID) continue;
      const top = typeOf(stack[stack.length - 1]);
      const u = row - travel;
      const sx = screenX(col, u);
      const sy = screenY(col, u) - (stack.length - 1) * LAYER_H - top.elev;
      if (Math.abs(px - sx) / HW + Math.abs(py - sy) / HH > 1) continue;   // inside the top diamond?
      if (!best || row + col > best.row + best.col) best = { row, col };
    }
  }
  return best;
}

let dragging = false;
let lastX = 0;
let lastY = 0;

viewport.addEventListener('pointerdown', (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  viewport.setPointerCapture(event.pointerId);
});

viewport.addEventListener('pointermove', (event) => {
  if (dragging) {
    panX += (event.clientX - lastX) / scale;     // drag a screen pixel, move a
    panY += (event.clientY - lastY) / scale;     // screen pixel, at any scale
    lastX = event.clientX;
    lastY = event.clientY;
    hover = null;
    return;
  }
  hover = pick(event.clientX, event.clientY);
});

const endDrag = () => { dragging = false; };
viewport.addEventListener('pointerup', endDrag);
viewport.addEventListener('pointercancel', endDrag);
viewport.addEventListener('pointerleave', () => { hover = null; });

viewport.addEventListener('wheel', (event) => {
  event.preventDefault();          // the wheel drives the camera, not the page
  travel += event.deltaY * 0.01;
}, { passive: false });

viewport.addEventListener('keydown', (event) => {
  if (event.key === ' ') running = !running;
  else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') travel += 0.5;
  else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') travel -= 0.5;
  else if (event.key.toLowerCase() === 'r') { travel = 0; panX = 0; panY = 0; }
  else return;
  event.preventDefault();
});

/* The frame's height follows its own aspect-ratio, so it can change size
   without the window doing anything. Watch the element itself. */
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
else window.addEventListener('resize', resize);

/* ------------------------------ the audit ------------------------------ */

/* The braid has rules: the walkable ground is one connected landmass that
   forks and rejoins, and the ribbon never gets narrower than four tiles.
   Flood-fill the map (wrapping top to bottom, since it loops) and say so
   out loud when an edit breaks either one.                             */
function auditMap() {
  const rows = worldMap.tiles.length;
  const { width } = worldMap;

  const surfaceOf = (row, col) => {
    const stack = stackAt(row, col);
    return stack === VOID ? null : stack[stack.length - 1];
  };
  const isGround = (row, col) => {
    const surface = surfaceOf(row, col);
    return surface === 'G' || surface === 'D';
  };
  const isTrail = (row, col) => surfaceOf(row, col) === 'D';

  // How many separate pieces does this predicate carve the map into?
  const components = (matches) => {
    const seen = new Set();
    let found = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const key = `${row},${col}`;
        if (seen.has(key) || !matches(row, col)) continue;
        found += 1;
        const queue = [[row, col]];
        seen.add(key);
        while (queue.length) {
          const [r, c] = queue.pop();
          const neighbours = [[(r + 1) % rows, c], [(r - 1 + rows) % rows, c], [r, c - 1], [r, c + 1]];
          for (const [nr, nc] of neighbours) {
            if (nc < 0 || nc >= width) continue;
            const nk = `${nr},${nc}`;
            if (seen.has(nk) || !matches(nr, nc)) continue;
            seen.add(nk);
            queue.push([nr, nc]);
          }
        }
      }
    }
    return found;
  };

  // Ribbon width per row, and how many separate strands each row is in.
  let narrowest = Infinity;
  let widest = 0;
  let forkedRows = 0;
  for (let row = 0; row < rows; row += 1) {
    let filled = 0;
    let strands = 0;
    let smallest = Infinity;
    let run = 0;
    for (let col = 0; col <= width; col += 1) {
      const solid = col < width && stackAt(row, col) !== VOID;
      if (solid) { filled += 1; run += 1; continue; }
      if (run) { strands += 1; smallest = Math.min(smallest, run); run = 0; }
    }
    narrowest = Math.min(narrowest, smallest);
    widest = Math.max(widest, filled);
    if (strands > 1) forkedRows += 1;
  }

  const ground = components(isGround);
  const trail = components(isTrail);
  const report = {
    rows,
    width,
    layers: MAX_STACK,
    groundPieces: ground,
    trailPieces: trail,
    narrowestStrand: narrowest,
    widestRow: widest,
    forkedRows,
    ok: ground === 1 && trail === 1 && narrowest >= 4,
  };

  const log = report.ok ? console.log : console.warn;
  log(
    `map audit — ${report.ok ? 'PASS' : 'FAIL'}: ` +
    `ground in ${ground} piece${ground === 1 ? '' : 's'}, ` +
    `trail in ${trail} piece${trail === 1 ? '' : 's'}, ` +
    `strands ${narrowest}–${widest} tiles wide, ` +
    `${forkedRows} forked row${forkedRows === 1 ? '' : 's'}`,
    report,
  );
  return report;
}

/* ------------------------------ the listing ---------------------------- */

/* The code panel is printed from the same object the renderer reads, so
   the page can never show a map that isn't the one on screen.          */
function printSource(report) {
  if (!mapSource) return;
  const swatch = { G: 'grass-t', W: 'water-t', D: 'dirt-t', '.': 'void-t' };
  const paint = (text) => [...text].map((ch) => `<span class="${swatch[ch] || ''}">${ch}</span>`).join('');

  // Column widths, so the stacks line up the way they do in the file.
  const widths = [];
  for (const row of worldMap.tiles) {
    if (typeof row === 'string') continue;
    row.forEach((cell, col) => { widths[col] = Math.max(widths[col] || 1, cell.length); });
  }

  const rows = worldMap.tiles.map((row, index) => {
    const label = `<span class="code-comment"> // ${String(index).padStart(2, '0')}</span>`;
    if (typeof row === 'string') return `    <span class="str">'${paint(row)}'</span>,${label}`;
    const cells = row.map((cell, col) => {
      const pad = ' '.repeat(Math.max(0, (widths[col] || 1) - cell.length));
      return `<span class="str">'${paint(cell)}'</span>,${pad}`;
    }).join(' ');
    return `    [${cells.replace(/,\s*$/, '')}],${label}`;
  }).join('\n');

  mapSource.innerHTML =
    `<span class="code-comment">// G = grass · W = water · D = dirt · . = open air</span>\n` +
    `<span class="code-comment">// each string is one stack, bottom → top</span>\n` +
    `<span class="code-key">const</span> <span class="code-name">worldMap</span> = {\n` +
    `  width: ${worldMap.width},\n  tiles: [\n${rows}\n  ],\n};`;

  if (mapDims && report) {
    mapDims.textContent =
      `${report.width} × ${report.rows} / ${report.layers} LAYERS / ` +
      `${report.narrowestStrand}–${report.widestRow} WIDE / ` +
      `${report.ok ? 'BRAID LINKED' : 'BRAID BROKEN'}`;
  }
}

resize();
printSource(auditMap());
requestAnimationFrame(frame);
