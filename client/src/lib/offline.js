// "Save this lesson for offline": fetch every clip the lesson can play, which the
// service worker stores as it goes. After this the lesson works on a plane.
import { audioUrl, ttsUrl } from './content';
import { audioPackAvailable } from './audio';

const KEY = (slug) => `saved-audio:${slug}`;

/** Every (aid, speed) pair the lesson's buttons can ask for, de-duplicated. */
export function lessonClips(lesson) {
  const seen = new Set();
  const clips = [];
  const add = (aid, speed, text) => {
    if (!text) return;
    const id = `${aid ?? text}:${speed}`;
    if (seen.has(id)) return;
    seen.add(id);
    clips.push({ aid, speed, text });
  };

  if (lesson.rescue_fi) {
    add(lesson.rescue_aid, 'normal', lesson.rescue_fi);
    add(lesson.rescue_aid, 'slow', lesson.rescue_fi);
  }
  for (const v of lesson.vocab ?? []) add(v.aid, 'normal', v.fi);
  for (const p of lesson.phrases ?? []) {
    add(p.aid, 'normal', p.fi);
    add(p.aid, 'slow', p.fi);
  }
  for (const d of lesson.dialogues ?? []) {
    for (const l of d.lines ?? []) add(l.aid, d.speed === 'slow' ? 'slow' : 'normal', l.fi);
  }
  for (const r of lesson.roleplays ?? []) {
    for (const t of r.turns ?? []) add(t.aid, 'normal', t.fi);
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
 * Warm the cache for one lesson, from whichever source the build uses — the MP3
 * pack, or the on-demand endpoint, which the service worker then keeps. Resolves
 * with how many clips are available; `ok: false` means none could be fetched.
 */
export async function saveLessonAudio(lesson, onProgress) {
  const clips = lessonClips(lesson);
  let done = 0;
  let failed = 0;

  // Files are static and can be pulled hard; on-demand clips each cost the upstream
  // a synthesis, so ask for fewer at a time.
  const lanes = audioPackAvailable() ? 6 : 3;
  const queue = clips.slice();
  await Promise.all(Array.from({ length: lanes }, async () => {
    while (queue.length) {
      const clip = queue.shift();
      try {
        const url = audioPackAvailable() && clip.aid
          ? audioUrl(clip.aid, clip.speed)
          : ttsUrl(clip.text, clip.speed);
        const res = await fetch(url, { cache: 'force-cache' });
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
