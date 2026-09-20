/* Placeholder line art, shared by the hand, the reward screens and the
   talisman rail. One stroked path each, keyed by the `art` or `icon` name a
   definition carries — so real images later replace this map and nothing
   else. */

export const GLYPHS: Record<string, string> = {
  // Cards
  slash: 'M4 20 L20 4 M14 4 H20 V10',
  bolt: 'M13 3 L6 13 H11 L10 21 L18 10 H13 Z',
  shield: 'M12 3 L19 6 V12 C19 16.5 15.5 20 12 21 C8.5 20 5 16.5 5 12 V6 Z',
  eye: 'M2 12 C5 7 8.5 5 12 5 C15.5 5 19 7 22 12 C19 17 15.5 19 12 19 C8.5 19 5 17 2 12 Z M12 9.2 A2.8 2.8 0 1 0 12 14.8 A2.8 2.8 0 1 0 12 9.2',
  arc: 'M4 19 C8 6 16 6 20 19 M3 19 H21',
  heart: 'M12 20 C6 16 3 12.5 3 9 A4 4 0 0 1 12 7 A4 4 0 0 1 21 9 C21 12.5 18 16 12 20 Z',
  // Talismans
  bag: 'M6 9 H18 L19 20 H5 Z M9 9 V6.5 A3 3 0 0 1 15 6.5 V9',
  compass: 'M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 M15 9 L13 13 L9 15 L11 11 Z',
  flame: 'M12 21 C8 21 5.5 18.5 5.5 15 C5.5 11 9 9 10 3 C14 6 18.5 9 18.5 15 C18.5 18.5 16 21 12 21 Z',
  blade: 'M5 19 L15 9 L19 5 L18 10 L9 19 Z M5 19 H9',
  wave: 'M2 9 C5 6 7 12 10 9 C13 6 15 12 18 9 C20 7.5 21 8 22 9 M2 15 C5 12 7 18 10 15 C13 12 15 18 18 15 C20 13.5 21 14 22 15',
  default: 'M12 4 L19 12 L12 20 L5 12 Z',
};

export const glyph = (key?: string): string => GLYPHS[key ?? 'default'] ?? GLYPHS.default!;
