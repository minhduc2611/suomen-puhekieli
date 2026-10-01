import { useEffect, useState } from 'react';
import {
  audioPackAvailable, ttsApiAvailable, hasFinnishVoice, getSpeechProblem, subscribe,
  voiceInfo, finnishVoices, setVoiceByName, play,
} from '../lib/audio';
import { isSaved, saveLessonAudio, lessonClips } from '../lib/offline';
import { useLang } from '../lib/lang';

/**
 * Says something only when there is something to say:
 *   · an MP3 pack is served → offer to download this lesson's clips for offline use
 *   · speech failed, or there is no Finnish voice → say so, and say what to do
 *   · otherwise nothing, because it just works
 *
 * The point is that "I pressed play and nothing happened" should never be the
 * whole story the app tells.
 */
export default function AudioSource({ lesson }) {
  const { ui } = useLang();
  // Both real-audio sources can be saved for offline use; only the device voice can't.
  const pack = audioPackAvailable() || ttsApiAvailable();
  const [voice, setVoice] = useState(hasFinnishVoice);
  const [problem, setProblem] = useState(getSpeechProblem);
  const [help, setHelp] = useState(false);
  const [saved, setSaved] = useState(() => isSaved(lesson.slug));
  const [progress, setProgress] = useState(null);
  const [failed, setFailed] = useState(false);
  const [voices, setVoices] = useState(finnishVoices);
  const [chosen, setChosen] = useState(() => voiceInfo().finnish);

  // Speech problems are reported through the shared audio state.
  useEffect(() => subscribe(() => setProblem(getSpeechProblem())), []);

  // Browsers fill the voice list asynchronously, sometimes well after load.
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const update = () => {
      setVoice(hasFinnishVoice());
      setVoices(finnishVoices());
      setChosen(voiceInfo().finnish);
    };
    synth.addEventListener?.('voiceschanged', update);
    const timer = setTimeout(update, 1000);
    return () => {
      synth.removeEventListener?.('voiceschanged', update);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    setSaved(isSaved(lesson.slug));
    setProgress(null);
    setFailed(false);
  }, [lesson.slug]);

  async function save() {
    if (progress !== null) return;
    setProgress(0);
    const result = await saveLessonAudio(lesson, (done, total) => setProgress(Math.round((done / total) * 100)));
    setProgress(null);
    setSaved(result.ok);
    setFailed(!result.ok);
  }

  if (pack) {
    if (saved) return <div className="save-audio done">{ui.audioSaved}</div>;
    if (failed) return <div className="save-audio warn">{ui.audioMissing}</div>;
    return (
      <button className="save-audio" onClick={save} disabled={progress !== null}>
        {progress === null ? `${ui.saveAudio} · ${lessonClips(lesson).length}` : `${ui.savingAudio} ${progress}%`}
      </button>
    );
  }

  // More than one Finnish voice, or one that failed: let the learner switch. macOS
  // in particular lists novelty voices that accept a line and then play nothing.
  const picker = voices.length > 1 || (problem && voices.length > 0) ? (
    <label className="voice-pick">
      {ui.voiceLabel}
      <select
        value={chosen ?? ''}
        onChange={(e) => {
          setVoiceByName(e.target.value);
          setChosen(e.target.value);
          play('Moi! Mitä kuuluu?', { key: 'voice-test' }).catch(() => {});
        }}
      >
        {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
      </select>
    </label>
  ) : null;

  const noVoice = voice === false || problem === 'no-voice';
  if (!noVoice && !problem) return picker;

  const info = voiceInfo();
  const explanation = problem === 'unsupported' ? ui.speechUnsupported
    : noVoice ? ui.installVoice
    : ui.speechSilent;

  return (
    <div className="voice-note">
      <button className="save-audio warn" onClick={() => setHelp((h) => !h)}>
        {noVoice ? ui.noFinnishVoice : ui.speechFailed}
      </button>
      {picker}
      {help && (
        <p>
          {explanation}
          {' '}
          <span className="diag">{ui.voicesSeen(info.voices, info.finnish)}</span>
        </p>
      )}
    </div>
  );
}
