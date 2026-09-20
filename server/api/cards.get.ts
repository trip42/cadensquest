/* Card data over HTTP.

   The client works from the local definitions today; this is here to show
   the seam. Cards are plain data — effects are tagged objects, not code —
   so the same shape can come from a file, this endpoint, or a CMS later
   without the rules engine noticing. */

import { CARDS } from '~/game/cards/definitions';

export default defineEventHandler(() => ({
  version: 1,
  cards: Object.values(CARDS),
}));
