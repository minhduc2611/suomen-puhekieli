import { useState } from 'react';
import Play from './Play';
import * as audio from '../lib/audio';
import { useLang } from '../lib/lang';

export default function Dialogue({ dialogue }) {
  const { t, ui } = useLang();
  const [running, setRunning] = useState(false);
  const [activeLine, setActiveLine] = useState(null);
  // 'slow' dialogues are authored to be played slowly; natural ones at full speed.
  const speed = dialogue.speed === 'slow' ? 'slow' : 'normal';

  function playAll() {
    if (running) { audio.stop(); setRunning(false); setActiveLine(null); return; }
    setRunning(true);
    audio.playSequence(
      dialogue.lines.map((l) => ({
        text: l.fi,
        aid: l.aid,
        key: `d${dialogue.id}-${l.id}` + (speed === 'slow' ? '::slow' : ''),
        id: l.id,
      })),
      { speed, onItem: (item) => setActiveLine(item?.id ?? null) },
    ).finally(() => { setRunning(false); setActiveLine(null); });
  }

  return (
    <div className="dialogue">
      <div className="dialogue-head">
        <h3>{t(dialogue, 'title')}</h3>
        <span className={`speed-badge ${dialogue.speed}`}>
          {dialogue.speed === 'slow' ? ui.slowClear : ui.realSpeed}
        </span>
        <button className="playall" onClick={playAll}>
          {running ? ui.stop : ui.playAll}
        </button>
        {t(dialogue, 'setting') && <div className="setting">{t(dialogue, 'setting')}</div>}
      </div>

      {t(dialogue, 'note') && <div className="note" style={{ margin: '12px 16px' }}>{t(dialogue, 'note')}</div>}

      {dialogue.lines.map((line) => (
        <div key={line.id} className={`line${activeLine === line.id ? ' active' : ''}`}>
          <div className="speaker">{line.speaker}</div>
          <Play text={line.fi} aid={line.aid} playKey={`d${dialogue.id}-${line.id}`} slow={speed === 'slow'} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="fi">{line.fi}</div>
            <div className="en">{t(line, 'en')}</div>
            {t(line, 'note') && <div className="note">{t(line, 'note')}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
