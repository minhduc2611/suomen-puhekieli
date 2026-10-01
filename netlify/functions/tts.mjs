// Finnish text-to-speech, generated on demand instead of shipped.
//
// The browser can't call Google's TTS endpoint itself (it sends no CORS headers),
// so this function does it server-side and streams the MP3 back. Nothing is stored:
// each clip is generated once and then cached by the CDN for a year, keyed by the
// text and speed in the URL.
//
// It is the middle path between the two bad options — 280 MB of MP3s in every
// deploy, or depending on whatever voice the learner's device happens to have.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const MAX_CHUNK = 190;
const SPEEDS = { slow: 0.24, normal: 1 };

/** Google rejects anything much over 200 characters, so split on punctuation. */
function chunk(text) {
  if (text.length <= MAX_CHUNK) return [text];
  const parts = [];
  let current = '';
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
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export default async (request) => {
  const params = new URL(request.url).searchParams;
  const text = (params.get('text') ?? '').trim();
  const speed = params.get('speed') === 'slow' ? 'slow' : 'normal';

  if (!text) return new Response('No text', { status: 400 });
  if (text.length > 1000) return new Response('Text too long', { status: 413 });

  try {
    const chunks = chunk(text);
    const buffers = [];
    for (const part of chunks) buffers.push(await fetchChunk(part, speed));

    // MP3 frames concatenate cleanly at this bitrate.
    const total = buffers.reduce((n, b) => n + b.length, 0);
    const audio = new Uint8Array(total);
    let at = 0;
    for (const b of buffers) { audio.set(b, at); at += b.length; }

    return new Response(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        // A given text always produces the same audio, so cache hard: in the
        // browser, and on Netlify's CDN so the next learner never waits.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Netlify-CDN-Cache-Control': 'public, durable, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    // The client falls back to the device voice when this fails.
    return new Response(JSON.stringify({ error: String(err.message ?? err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};

export const config = { path: '/api/tts' };
