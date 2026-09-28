/* Backdrops: a painting behind each floor.

   Everything that is not a tile is open water, a flat fill. A floor may
   instead have a picture behind it, drawn still — it does not pan, zoom or
   shake with the map — scaled to cover the screen from the centre,
   cropping whatever does not fit, and dimmed a little under the map.

   A floor's picture is the file in assets/backgrounds named after it:
   "North Basin" is north-basin.jpeg (or .jpg, .png, .webp). Dropping a
   file in is all it takes; a floor without one keeps the water. As with
   sprite sheets, the game layer never sees a path, and pictures load
   asynchronously: `backdropFor` returns null until one is in, and the
   water shows meanwhile. */

/** Every picture in the folder, by file name without its extension. */
export const BACKDROP_FILES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../assets/backgrounds/*.{jpeg,jpg,png,webp}', { eager: true, import: 'default' }),
  ).map(([path, src]) => [path.replace(/^.*\//, '').replace(/\.[^.]+$/, ''), src]),
);

/** The file name a floor's picture goes by: "North Basin" → "north-basin". */
export const backdropName = (floorName: string): string =>
  floorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** How much the picture is darkened under the map, 0..1, so the tiles and
 *  the creatures on them stay the brightest things on screen. */
export const BACKDROP_DIM = 0.35;

const loaded = new Map<string, HTMLImageElement>();
const pending = new Set<string>();
const failed = new Set<string>();

/** The picture behind the floor of this name, once it has loaded; null
 *  while it loads, if it failed, or if the floor has none. */
export function backdropFor(floorName: string): HTMLImageElement | null {
  const src = BACKDROP_FILES[backdropName(floorName)];
  if (!src || failed.has(src)) return null;
  const ready = loaded.get(src);
  if (ready) return ready;
  if (pending.has(src)) return null;

  pending.add(src);
  const image = new Image();
  image.onload = () => {
    pending.delete(src);
    loaded.set(src, image);
  };
  image.onerror = () => {
    pending.delete(src);
    failed.add(src);
    console.warn(`[backdrops] could not load ${src}`);
  };
  image.src = src;
  return null;
}
