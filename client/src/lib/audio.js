// One <audio> element for the whole app, so starting a new clip stops the old one.
//
// Clips are pre-generated MP3 files (tools/build-audio.mjs) addressed by the `aid`
// stamped into each lesson at build time. If a clip hasn't been generated — a fresh
// clone, or only some modules built — playback falls back to the device's own Finnish
// voice, so the app is never silent, just less consistent.
import { audioUrl } from './content';

let el = null;
let detach = null;      // removes the current clip's listeners from the shared element
let currentToken = 0;
const listeners = new Set();
const missing = new Set(); // aids with no MP3: go straight to the device voice
let state = { key: null, playing: false, loading: false };

function element() {
  if (!el) {
    el = new Audio();
    el.addEventListener('ended', () => set({ key: null, playing: false, loading: false }));
    el.addEventListener('error', () => set({ key: null, playing: false, loading: false }));
  }
  return el;
}

function set(next) {
  state = { ...state, ...next };
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

export function stop() {
  currentToken++;
  detach?.();
  if (el) {
    el.pause();
    el.currentTime = 0;
  }
  window.speechSynthesis?.cancel();
  set({ key: null, playing: false, loading: false });
}

let voice;
function finnishVoice() {
  if (voice !== undefined) return voice;
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  if (voices.length === 0) return undefined; // not loaded yet; try again next time
  voice = voices.find((v) => v.lang?.toLowerCase().startsWith('fi')) ?? null;
  return voice;
}
window.speechSynthesis?.addEventListener?.('voiceschanged', () => { voice = undefined; });

/** Speak with the device's own voice. Quality varies; availability more so. */
function speak(text, speed) {
  return new Promise((resolve, reject) => {
    const synth = window.speechSynthesis;
    if (!synth) return reject(new Error('No speech synthesis'));
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fi-FI';
    utterance.rate = speed === 'slow' ? 0.6 : 0.95;
    const fi = finnishVoice();
    if (fi) utterance.voice = fi;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error('Speech failed'));
    synth.speak(utterance);
  });
}

/**
 * Play one Finnish string. `key` identifies the row in the UI so it can show a
 * playing state; two rows with the same text still highlight independently.
 * Resolves when playback finishes, rejects if superseded or failed.
 */
export function play(text, { speed = 'normal', key = text, aid = null } = {}) {
  const token = ++currentToken;
  set({ key, playing: false, loading: true });

  const finish = () => { if (token === currentToken) set({ key: null, playing: false, loading: false }); };
  const fallback = () => {
    if (token !== currentToken) return Promise.reject(new Error('Superseded'));
    set({ key, playing: true, loading: false });
    return speak(text, speed).then(
      () => { finish(); },
      (err) => { finish(); throw err; },
    );
  };

  if (!aid || missing.has(aid)) return fallback();

  // Drop the previous clip's listeners first: the element is shared, so otherwise
  // this clip's 'ended' would also resolve the last clip's promise, and its 'error'
  // would make the last clip fall back to the device voice on top of this one.
  detach?.();

  const audio = element();
  audio.pause();
  audio.currentTime = 0;
  audio.src = audioUrl(aid, speed);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('error', onErr);
      if (detach === cleanup) detach = null;
    };
    const superseded = () => token !== currentToken;
    const onEnd = () => {
      cleanup();
      if (superseded()) return reject(new Error('Superseded'));
      finish();
      resolve();
    };
    const onErr = () => {
      // No file for this clip: remember it and let the device voice take over.
      cleanup();
      if (superseded()) return reject(new Error('Superseded'));
      missing.add(aid);
      fallback().then(resolve, reject);
    };
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onErr);
    detach = cleanup;

    audio.play().then(
      () => { if (token === currentToken) set({ key, playing: true, loading: false }); },
      () => {
        cleanup();
        if (superseded()) return reject(new Error('Superseded'));
        missing.add(aid);
        fallback().then(resolve, reject);
      },
    );
  });
}

/** Play a list of {text, aid, key} in order, stopping if anything else starts. */
export async function playSequence(items, { speed = 'normal', onItem, gapMs = 350 } = {}) {
  for (const item of items) {
    const tokenBefore = currentToken + 1;
    onItem?.(item);
    try {
      await play(item.text, { speed, key: item.key, aid: item.aid });
    } catch {
      return; // superseded or failed — stop the run
    }
    if (currentToken !== tokenBefore) return; // something else took over
    await new Promise((r) => setTimeout(r, gapMs));
    if (currentToken !== tokenBefore) return;
  }
  onItem?.(null);
}
