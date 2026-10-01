// Finnish text-to-speech via Google Translate's TTS endpoint, cached on disk.
// The endpoint rejects anything much over 200 characters, so long lines are split
// on punctuation and the resulting MP3 frames concatenated — fine at this bitrate.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const MAX_CHUNK = 190;

// Google's only two speeds. 0.24 is the documented "slow" value, not a free-form rate.
const SPEEDS = { slow: 0.24, normal: 1 };

function chunk(text) {
  if (text.length <= MAX_CHUNK) return [text];
  const parts = [];
  let current = '';
  // Split after sentence-ish punctuation first, then fall back to spaces.
  for (const piece of text.split(/(?<=[.!?,;:—])\s+/)) {
    for (const word of piece.length > MAX_CHUNK ? piece.split(/\s+/) : [piece]) {
      if ((current + ' ' + word).trim().length > MAX_CHUNK) {
        if (current) parts.push(current.trim());
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    }
  }
  if (current) parts.push(current.trim());
  return parts;
}

async function fetchChunk(text, speed) {
  const url = new URL('https://translate.google.com/translate_tts');
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('q', text);
  url.searchParams.set('tl', 'fi');
  url.searchParams.set('client', 'tw-ob');
  url.searchParams.set('ttsspeed', String(SPEEDS[speed] ?? 1));
  url.searchParams.set('total', '1');
  url.searchParams.set('idx', '0');
  url.searchParams.set('textlen', String(text.length));

  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://translate.google.com/' } });
  if (!res.ok) throw new Error(`TTS upstream returned ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export function createTts(cacheDir) {
  const inflight = new Map(); // de-dupe concurrent requests for the same clip

  async function synth(rawText, rawSpeed) {
    const text = String(rawText ?? '').trim();
    if (!text) throw new Error('No text given');
    if (text.length > 1000) throw new Error('Text too long');
    const speed = rawSpeed === 'slow' ? 'slow' : 'normal';

    const key = createHash('sha1').update(`${speed}:${text}`).digest('hex');
    const file = join(cacheDir, `${key}.mp3`);

    try {
      return { buffer: await readFile(file), cached: true };
    } catch {
      // not cached yet
    }

    if (inflight.has(key)) return { buffer: await inflight.get(key), cached: false };

    const job = (async () => {
      const chunks = chunk(text);
      const buffers = [];
      for (const c of chunks) buffers.push(await fetchChunk(c, speed));
      const audio = Buffer.concat(buffers);
      await mkdir(cacheDir, { recursive: true });
      await writeFile(file, audio);
      return audio;
    })();

    inflight.set(key, job);
    try {
      return { buffer: await job, cached: false };
    } finally {
      inflight.delete(key);
    }
  }

  return { synth };
}
