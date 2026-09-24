/* Save content files — dev only.

   The editor sends every file it has changed, whole: `{ files: { cards:
   [...], enemies: [...] } }`. They are checked together with the rest as
   they are on disk — a change can span files, like a new enemy card and
   the deck that uses it — and nothing is written if anything is an error;
   the problems come back instead. Otherwise each file is written
   pretty-printed, so its diff in git reads line by line. Warnings are
   returned but do not stop a save.

   In a production build this answers 404: a deployed game must never
   write to its own content. */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTENT_FILES, type ContentFile, validateContent } from '~/game/content';

const contentDir = join(process.cwd(), 'content');
const pathOf = (file: ContentFile) => join(contentDir, `${file}.json`);

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404 });

  const body = await readBody<{ files?: Partial<Record<ContentFile, unknown>> }>(event);
  const incoming = body?.files ?? {};
  const changed = Object.keys(incoming) as ContentFile[];
  const unknown = changed.filter((file) => !CONTENT_FILES.includes(file));
  if (!changed.length || unknown.length) {
    throw createError({ statusCode: 400, statusMessage: unknown.length ? `no content file "${unknown[0]}"` : 'nothing to save' });
  }

  const raw = Object.fromEntries(
    await Promise.all(
      CONTENT_FILES.map(async (file) => [
        file,
        file in incoming ? incoming[file] : JSON.parse(await readFile(pathOf(file), 'utf8')),
      ]),
    ),
  ) as Record<ContentFile, unknown>;

  const { content, issues } = validateContent(raw);
  if (!content) {
    setResponseStatus(event, 422);
    return { saved: [], issues };
  }

  for (const file of changed) await writeFile(pathOf(file), `${JSON.stringify(content[file], null, 2)}\n`);
  return { saved: changed, issues };
});
