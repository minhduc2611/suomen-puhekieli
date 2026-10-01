import { useEffect, useState } from 'react';
import { audioPackAvailable, hasFinnishVoice } from '../lib/audio';
import { isSaved, saveLessonAudio, lessonClips } from '../lib/offline';
import { useLang } from '../lib/lang';

/**
 * Says something only when there is something to say:
 *   · an MP3 pack is served → offer to download this lesson's clips for offline use
 *   · the device speaks, but has no Finnish voice → warn, and explain how to add one
 *   · the device speaks and has a Finnish voice → nothing, it just works
 */
export default function AudioSource({ lesson }) {
  const { ui } = useLang();
  const pack = audioPackAvailable();
  const [voice, setVoice] = useState(hasFinnishVoice);
  const [help, setHelp] = useState(false);
  const [saved, setSaved] = useState(() => isSaved(lesson.slug));
  const [progress, setProgress] = useState(null);
  const [failed, setFailed] = useState(false);

  // Browsers fill the voice list asynchronously, sometimes well after load.
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const update = () => setVoice(hasFinnishVoice());
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

  if (voice === false) {
    return (
      <div className="voice-note">
        <button className="save-audio warn" onClick={() => setHelp((h) => !h)}>{ui.noFinnishVoice}</button>
        {help && <p>{ui.installVoice}</p>}
      </div>
    );
  }

  return null;
}
