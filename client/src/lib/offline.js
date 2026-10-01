// "Save this lesson for offline": fetch every clip the lesson can play, which the
// service worker stores as it goes. After this the lesson works on a plane.
import { audioUrl } from './content';

const KEY = (slug) => `saved-audio:${slug}`;

/** Every (aid, speed) pair the lesson's buttons can ask for, de-duplicated. */
export function lessonClips(lesson) {
  const seen = new Set();
  const clips = [];
  const add = (aid, speed) => {
    if (!aid) return;
    const id = `${aid}:${speed}`;
    if (seen.has(id)) return;
    seen.add(id);
    clips.push({ aid, speed });
  };

  if (lesson.rescue_aid) {
    add(lesson.rescue_aid, 'normal');
    add(lesson.rescue_aid, 'slow');
  }
  for (const v of lesson.vocab ?? []) add(v.aid, 'normal');
  for (const p of lesson.phrases ?? []) {
    add(p.aid, 'normal');
    add(p.aid, 'slow');
  }
  for (const d of lesson.dialogues ?? []) {
    for (const l of d.lines ?? []) add(l.aid, d.speed === 'slow' ? 'slow' : 'normal');
  }
  for (const r of lesson.roleplays ?? []) {
    for (const t of r.turns ?? []) add(t.aid, 'normal');
  }
  return clips;
}

export function isSaved(slug) {
  try {
    return localStorage.getItem(KEY(slug)) !== null;
  } catch {
    return false;
  }
}

function markSaved(slug, count) {
  try {
    localStorage.setItem(KEY(slug), String(count));
  } catch {
    // private mode, or storage disabled — the cache still holds the clips
  }
}

/**
 * Warm the cache for one lesson. Resolves with how many clips are available;
 * `ok: false` means nothing could be fetched, which usually means the audio was
 * never generated (`npm run audio`) rather than a network problem.
 */
export async function saveLessonAudio(lesson, onProgress) {
  const clips = lessonClips(lesson);
  let done = 0;
  let failed = 0;

  const queue = clips.slice();
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const clip = queue.shift();
      try {
        const res = await fetch(audioUrl(clip.aid, clip.speed), { cache: 'force-cache' });
        if (!res.ok) throw new Error(String(res.status));
        await res.blob();
      } catch {
        failed++;
      }
      onProgress?.(++done, clips.length);
    }
  }));

  const stored = clips.length - failed;
  if (stored > 0) markSaved(lesson.slug, stored);
  return { ok: stored > 0, stored, total: clips.length };
}
