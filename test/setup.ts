/* Every test runs against the real content files, installed the same way
   the game installs them. A content file that fails validation fails the
   whole suite here, with the problems listed. */

import { readFileSync } from 'node:fs';
import { CONTENT_FILES, loadContent } from '~/game/content';

export function readContentFiles(): Record<string, unknown> {
  return Object.fromEntries(
    CONTENT_FILES.map((file) => [
      file,
      JSON.parse(readFileSync(new URL(`../content/${file}.json`, import.meta.url), 'utf8')),
    ]),
  );
}

loadContent(readContentFiles());
