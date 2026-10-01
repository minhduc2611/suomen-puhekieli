import { useEffect, useState } from 'react';
import { isSaved, saveLessonAudio, lessonClips } from '../lib/offline';
import { useLang } from '../lib/lang';

/**
 * Downloads every clip this lesson can play, so it works with no network.
 * Shows what it costs before you tap it, since this is usually a phone.
 */
export default function SaveAudio({ lesson }) {
  const { ui } = useLang();
  const [saved, setSaved] = useState(() => isSaved(lesson.slug));
  const [progress, setProgress] = useState(null);
  const [noAudio, setNoAudio] = useState(false);

  useEffect(() => {
    setSaved(isSaved(lesson.slug));
    setProgress(null);
    setNoAudio(false);
  }, [lesson.slug]);

  const clipCount = lessonClips(lesson).length;

  async function save() {
    if (progress !== null) return;
    setProgress(0);
    const result = await saveLessonAudio(lesson, (done, total) => setProgress(Math.round((done / total) * 100)));
    setProgress(null);
    setSaved(result.ok);
    setNoAudio(!result.ok);
  }

  if (saved) return <div className="save-audio done">{ui.audioSaved}</div>;
  if (noAudio) return <div className="save-audio warn">{ui.audioMissing}</div>;

  return (
    <button className="save-audio" onClick={save} disabled={progress !== null}>
      {progress === null ? `${ui.saveAudio} · ${clipCount}` : `${ui.savingAudio} ${progress}%`}
    </button>
  );
}
