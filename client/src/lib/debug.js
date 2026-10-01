// Console diagnostics for the one thing that can fail invisibly: audio.
//
// Everything is logged under an [audio] prefix, and `puhuDebug()` in the console
// dumps a snapshot worth pasting into a bug report. The build stamp is the useful
// part when something "isn't fixed": a stale service worker will report an old one.

export const log = (...args) => console.log('%c[audio]', 'color:#1d5c8f;font-weight:bold', ...args);
export const warn = (...args) => console.warn('[audio]', ...args);

export function snapshot() {
  const synth = window.speechSynthesis;
  const voices = synth?.getVoices?.() ?? [];
  return {
    build: __BUILD_ID__,
    audioPack: __AUDIO_PACK__,
    url: location.href,
    speechSynthesis: !!synth,
    speaking: synth?.speaking ?? null,
    pending: synth?.pending ?? null,
    paused: synth?.paused ?? null,
    voiceCount: voices.length,
    finnishVoices: voices.filter((v) => v.lang?.toLowerCase().startsWith('fi')).map((v) => `${v.name} (${v.lang})`),
    allVoices: voices.map((v) => `${v.name} (${v.lang})`),
    serviceWorker: navigator.serviceWorker?.controller ? 'controlling' : 'none',
    online: navigator.onLine,
  };
}

/**
 * Speak a fixed line with no app logic involved, to isolate the engine itself.
 * Pass a voice name to try one specific voice: puhuTestSpeak('Moi', 'Satu')
 */
export function testSpeak(text = 'Moi, mitä kuuluu?', voiceName = null) {
  const synth = window.speechSynthesis;
  if (!synth) return warn('no speechSynthesis in this browser');
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voiceName) {
    const v = synth.getVoices().find((x) => x.name === voiceName);
    if (!v) return warn(`no voice called "${voiceName}"`);
    u.voice = v;
    u.lang = v.lang;
    log('test: using', v.name, v.lang, v.localService ? '(local)' : '(network)');
  }
  u.onstart = () => log('test: started');
  u.onend = () => log('test: ended');
  u.onerror = (e) => warn('test: error', e.error);
  setTimeout(() => {
    synth.speak(u);
    log('test: speak() called, queued =', synth.pending, 'speaking =', synth.speaking);
  }, 50);
}

if (typeof window !== 'undefined') {
  window.puhuDebug = () => {
    const snap = snapshot();
    console.table?.({ ...snap, finnishVoices: snap.finnishVoices.join(', ') || '(none)', allVoices: undefined });
    log('snapshot', snap);
    return snap;
  };
  window.puhuTestSpeak = testSpeak;
  log(`build ${__BUILD_ID__} · audio pack: ${__AUDIO_PACK__ ? 'yes' : 'no (device voice)'}`);
  log('run puhuDebug() for a full snapshot, puhuTestSpeak() to test the engine directly');
  const fi = snapshot().finnishVoices;
  log('Finnish voices installed:', fi.length ? fi.join(', ') : '(none)');
}
