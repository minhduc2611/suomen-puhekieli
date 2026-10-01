// The audio id for one Finnish string: short, stable, filename-safe.
// Shared by build-content.mjs (which stamps ids into the lesson JSON) and
// build-audio.mjs (which names the files), so the two can never disagree.
import { createHash } from 'node:crypto';

export function audioId(text) {
  return createHash('sha1').update(String(text).trim()).digest('hex').slice(0, 16);
}
