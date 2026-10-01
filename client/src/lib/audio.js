// Speech, from whichever source this deployment has.
//
// By default the app speaks with the **device's own Finnish voice** — nothing is
// shipped, nothing is fetched, and it works offline. If someone has generated the
// MP3 pack (`npm run audio`) and it is actually being served, the app uses that
// instead: same voice everywhere, and better than most device voices.
//
// Which one is in play is decided at build time (`__AUDIO_PACK__`, set in
// vite.config.js), so a deployment without the pack never requests an audio file.
//
// One <audio> element is shared for the whole app, so starting a clip stops the old one.
import { audioUrl } from './content';

let el = null;
let detach = null;      // removes the current clip's listeners from the shared element
let currentToken = 0;
const listeners = new Set();
const missing = new Set(); // aids whose MP3 404s anyway: go straight to the device voice
let state = { key: null, playing: false, loading: false };

/** Is a generated MP3 pack served alongside this build? Decided at build time. */
export const audioPackAvailable = () => __AUDIO_PACK__;

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

/** What the speech engine looks like from here — shown in the UI when speech fails. */
export function voiceInfo() {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  const fi = voices.find((v) => v.lang?.toLowerCase().startsWith('fi'));
  return { voices: voices.length, finnish: fi?.name ?? null };
}

/**
 * Does this device actually have a Finnish voice? `undefined` while the voice list
 * is still loading — browsers populate it asynchronously, sometimes only after the
 * first utterance. Without one, speech falls back to some other language's voice
 * and Finnish comes out badly mispronounced, so the UI warns about it.
 */
export function hasFinnishVoice() {
  if (!window.speechSynthesis) return false;
  const found = finnishVoice();
  return found === undefined ? undefined : found !== null;
}

/** The last reason speech failed, for the UI to explain rather than just go quiet. */
let speechProblem = null;
export const getSpeechProblem = () => speechProblem;

function setProblem(problem) {
  if (speechProblem === problem) return;
  speechProblem = problem;
  for (const fn of listeners) fn(state); // wake subscribers; they re-read the problem
}

// Ask for the voice list at startup. Browsers populate it asynchronously, and the
// first play must not wait for it: on iOS, speech has to be started inside the tap
// that asked for it, so anything awaited in the handler loses the gesture.
window.speechSynthesis?.getVoices?.();

/**
 * Speak with the device's own voice. Quality varies; availability more so, which is
 * why this is defensive:
 *  · `cancel()` immediately followed by `speak()` is a known way to get silence in
 *    Chrome, so cancelling and starting are separated by a tick.
 *  · Setting `lang = 'fi-FI'` when no Finnish voice exists makes some engines say
 *    nothing at all, so the language is only forced when a voice backs it.
 *  · Chrome can leave the queue paused after the tab has been idle.
 *  · If nothing starts speaking, say so rather than appearing to do nothing.
 *
 * Nothing here awaits before `speak()`: on iOS the call has to happen inside the
 * tap that triggered it, or the utterance is silently dropped.
 */
function speak(text, speed) {
  const synth = window.speechSynthesis;
  if (!synth) {
    setProblem('unsupported');
    return Promise.reject(new Error('No speech synthesis'));
  }

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed === 'slow' ? 0.6 : 0.95;
    const fi = finnishVoice();
    if (fi) {
      utterance.voice = fi;
      utterance.lang = fi.lang || 'fi-FI';
    } else if (synth.getVoices().length === 0) {
      // No voices at all: asking for one by language is the only option left.
      utterance.lang = 'fi-FI';
    }
    // With voices but none Finnish, leave lang alone: the default voice will read it
    // (badly — the UI warns about that) instead of the engine staying silent.

    let started = false;
    const finish = (fn, arg) => {
      clearTimeout(watchdog);
      fn(arg);
    };
    utterance.onstart = () => { started = true; setProblem(null); };
    utterance.onend = () => finish(resolve);
    utterance.onerror = (event) => {
      // 'interrupted'/'canceled' are our own stop(), not a fault.
      const reason = event?.error ?? 'failed';
      if (reason !== 'interrupted' && reason !== 'canceled') setProblem(reason);
      finish(reject, new Error(`Speech ${reason}`));
    };

    const watchdog = setTimeout(() => {
      if (started) return;
      synth.cancel();
      setProblem(fi ? 'silent' : 'no-voice');
      reject(new Error('Speech did not start'));
    }, 2000);

    const start = () => {
      if (synth.paused) synth.resume();
      synth.speak(utterance);
    };
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setTimeout(start, 60); // cancel+speak in the same tick can yield silence
    } else {
      start();
    }
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

  // No pack served, no id, or a clip already known to be missing: the device speaks.
  if (!audioPackAvailable() || !aid || missing.has(aid)) return fallback();

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
