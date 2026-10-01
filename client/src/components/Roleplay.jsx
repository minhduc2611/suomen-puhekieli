import { useState } from 'react';
import Play from './Play';
import { useLang } from '../lib/lang';

export default function Roleplay({ roleplay }) {
  const { t, ui } = useLang();
  // Learner turns start hidden — you should attempt the line before seeing it.
  const [revealed, setRevealed] = useState(() => new Set());
  const yourTurns = roleplay.turns.filter((turn) => turn.is_your_turn);
  const allRevealed = yourTurns.every((turn) => revealed.has(turn.id));

  function toggle(id) {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="roleplay">
      <div className="roleplay-head">
        <h3>{t(roleplay, 'title')}</h3>
        {t(roleplay, 'scenario') && <div className="scenario">{t(roleplay, 'scenario')}</div>}
        <div className="roles">
          <span className="tag">{ui.you} · {t(roleplay, 'your_role')}</span>
          <span className="tag">{ui.them} · {t(roleplay, 'partner_role')}</span>
          <button
            className="reveal"
            style={{ marginLeft: 'auto' }}
            onClick={() => setRevealed(allRevealed ? new Set() : new Set(yourTurns.map((turn) => turn.id)))}
          >
            {allRevealed ? ui.hideAll : ui.showAll}
          </button>
        </div>
      </div>

      {roleplay.turns.map((turn) => {
        const yours = !!turn.is_your_turn;
        const show = !yours || revealed.has(turn.id);
        return (
          <div key={turn.id} className={`turn${yours ? ' yours' : ''}`}>
            <div className="speaker">{yours ? ui.you : turn.speaker}</div>
            {show
              ? <Play text={turn.fi} aid={turn.aid} playKey={`r${roleplay.id}-${turn.id}`} />
              : <div style={{ width: 30, flex: 'none' }} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              {show ? (
                <>
                  <div className="fi">{turn.fi}</div>
                  <div className="en">{t(turn, 'en')}</div>
                </>
              ) : (
                <div className="hint">{t(turn, 'hint') ?? t(turn, 'en')}</div>
              )}
              {yours && (
                <button className="reveal" style={{ marginTop: 6 }} onClick={() => toggle(turn.id)}>
                  {show ? ui.hide : ui.show}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
