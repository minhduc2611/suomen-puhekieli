// Speech, from the best source this deployment has, in order:
//
//   1. the generated MP3 pack, when a build includes it (`__AUDIO_PACK__`)
//   2. /api/tts, which generates the clip on demand and lets the CDN keep it
//   3. the device's own Finnish voice
//
// 1 and 2 are the same Google voice and sound identical; 3 depends entirely on
// what the learner's device has installed, which on macOS and iOS is a lottery —
// hence the order. Each step falls through to the next when it fails, so the app
// is never silent for a reason it could have worked around.
//
// One <audio> element is shared for the whole app, so starting a clip stops the old one.
import { audioUrl, ttsUrl } from './content';
import { log, warn } from './debug';

let el = null;
let detach = null;      // removes the current clip's listeners from the shared element
let currentToken = 0;
const listeners = new Set();
const missing = new Set(); // aids whose MP3 404s anyway: go straight to the device voice
let state = { key: null, playing: false, loading: false };

/** Is a generated MP3 pack served alongside this build? Decided at build time. */
export const audioPackAvailable = () => __AUDIO_PACK__;

// The on-demand endpoint, until it proves unavailable (no function deployed, or
// the upstream refused). One failure is enough: the device voice takes over for
// the rest of the session rather than making every line wait for a timeout.
let apiBroken = false;
export const ttsApiAvailable = () => __TTS_API__ && !apiBroken;

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

const VOICE_KEY = 'puhu-suomee:voice';

// macOS ships a pile of novelty voices (Eddy, Flo, Rocko, Grandma…) in every
// language. They are listed like any other voice but are often not downloaded, and
// then they accept an utterance and play nothing. Rank them last; prefer the plain
// system voice (Satu on macOS/iOS) or a Google one.
const PREFERRED = /satu|google|microsoft/i;
const NOVELTY = /eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|bubbles|bells|boing|jester|organ|superstar|trinoids|whisper|wobble|zarvox|cellos|bad news|good news/i;

export function finnishVoices() {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  return voices
    .filter((v) => v.lang?.toLowerCase().startsWith('fi'))
    .sort((a, b) => rank(a) - rank(b));
}

function rank(v) {
  if (PREFERRED.test(v.name)) return 0;
  if (NOVELTY.test(v.name)) return 3;
  return v.localService ? 1 : 2;
}

/** The voice the learner picked, if it is still installed. */
function chosenVoice() {
  try {
    const name = localStorage.getItem(VOICE_KEY);
    return name ? finnishVoices().find((v) => v.name === name) ?? null : null;
  } catch {
    return null;
  }
}

export function setVoiceByName(name) {
  try {
    if (name) localStorage.setItem(VOICE_KEY, name);
    else localStorage.removeItem(VOICE_KEY);
  } catch { /* storage blocked — the choice just won't persist */ }
  voice = undefined;
}

let voice;
function finnishVoice() {
  if (voice !== undefined) return voice;
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  if (voices.length === 0) return undefined; // not loaded yet; try again next time
  voice = chosenVoice() ?? finnishVoices()[0] ?? null;
  return voice;
}
window.speechSynthesis?.addEventListener?.('voiceschanged', () => { voice = undefined; });

/** What the speech engine looks like from here — shown in the UI when speech fails. */
export function voiceInfo() {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  return { voices: voices.length, finnish: finnishVoice()?.name ?? null };
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

// How often to ask the engine what it is doing, for the voices that report nothing.
// Short enough that the gap between lines in "play all" stays natural.
const POLL_MS = 400;

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
    let sawBusy = false; // the engine said it was speaking, even if no event arrived
    let waited = 0;
    const finish = (fn, arg) => {
      clearInterval(watchdog);
      fn(arg);
    };
    utterance.onstart = () => { started = true; setProblem(null); log('speech started'); };
    utterance.onend = () => { log('speech ended'); finish(resolve); };
    utterance.onerror = (event) => {
      // 'interrupted'/'canceled' are our own stop(), not a fault.
      const reason = event?.error ?? 'failed';
      if (reason !== 'interrupted' && reason !== 'canceled') { setProblem(reason); warn('speech error:', reason); }
      finish(reject, new Error(`Speech ${reason}`));
    };

    // Some engines are slow to spin a voice up, and some never fire `onstart` at
    // all. So this waits while the engine says it is busy and only gives up once it
    // claims to be idle with nothing having happened. It must never cancel speech in
    // progress — doing that was itself silencing real playback.
    const watchdog = setInterval(() => {
      waited += POLL_MS;
      if (started) return;

      if (synth.speaking || synth.pending) {
        // Chrome on macOS often fires no events at all for local system voices.
        // The engine is the only witness that anything is happening, so believe it.
        if (!sawBusy) log('no onstart event, but the engine reports it is busy — tracking it directly');
        sawBusy = true;
        if (waited < 60000) return;
        warn('engine has claimed to be speaking for a minute with no end event — giving up');
        setProblem('silent');
        return finish(reject, new Error('Speech stuck'));
      }

      if (sawBusy) {
        // It spoke and is now done; the events simply never arrived.
        log('speech finished (no events from this voice)');
        setProblem(null);
        return finish(resolve);
      }

      // Engines can take a moment to pick a voice up before they report anything,
      // so don't call it dead on the first poll.
      if (waited < 2000) return;

      warn('speech never started —', fi ? `voice ${fi.name}` : 'no Finnish voice',
        '· speaking:', synth.speaking, 'pending:', synth.pending, 'paused:', synth.paused);
      setProblem(fi ? 'silent' : 'no-voice');
      finish(reject, new Error('Speech did not start'));
    }, POLL_MS);

    const start = () => {
      if (synth.paused) synth.resume();
      synth.speak(utterance);
      log('speak() called ·', `"${text.slice(0, 40)}"`, '· voice:', utterance.voice?.name ?? '(engine default)',
        '· lang:', utterance.lang || '(unset)', '· rate:', utterance.rate);
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

  const usePack = audioPackAvailable() && aid && !missing.has(aid);
  const src = usePack ? audioUrl(aid, speed)
    : ttsApiAvailable() ? ttsUrl(text, speed)
    : null;

  if (!src) {
    log('play → device voice');
    return fallback();
  }
  log(`play → ${usePack ? 'file' : 'on-demand'}`, src);

  // Drop the previous clip's listeners first: the element is shared, so otherwise
  // this clip's 'ended' would also resolve the last clip's promise, and its 'error'
  // would make the last clip fall back to the device voice on top of this one.
  detach?.();

  const audio = element();
  audio.pause();
  audio.currentTime = 0;
  audio.src = src;

  // Whichever source just failed, step down to the next one.
  const noteFailure = () => {
    warn(`${usePack ? 'audio file' : 'on-demand audio'} failed, falling back:`, src);
    if (usePack) missing.add(aid);
    else apiBroken = true;
  };

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
      cleanup();
      if (superseded()) return reject(new Error('Superseded'));
      noteFailure();
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
        noteFailure();
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
