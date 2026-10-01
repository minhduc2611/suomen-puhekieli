import { useEffect, useState } from 'react';
import Play from './Play';
import Dialogue from './Dialogue';
import Roleplay from './Roleplay';
import * as audio from '../lib/audio';
import { loadLesson } from '../lib/content';
import { useLang } from '../lib/lang';
import AudioSource from './AudioSource';

function Block({ title, count, children }) {
  return (
    <section className="block">
      <div className="block-head">
        <h2>{title}</h2>
        {count != null && <span className="count">{count}</span>}
      </div>
      {children}
    </section>
  );
}

export default function Lesson({ slug, navigate }) {
  const { t, ui } = useLang();
  const [lesson, setLesson] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    audio.stop();
    setLesson(null);
    setError(null);
    window.scrollTo(0, 0);
    loadLesson(slug).then(setLesson).catch(() => setError(true));
  }, [slug]);

  if (error) return <div className="state">{ui.notFound}</div>;
  if (!lesson) return <div className="state">{ui.loading}</div>;

  return (
    <div className="wrap">
      <div className="lesson-head">
        <div className="kicker">
          {lesson.module.emoji} {lesson.module.number} · {t(lesson.module, 'title')} — {lesson.number}
        </div>
        <h1>{t(lesson, 'title')}</h1>
        {t(lesson, 'subtitle') && <div className="sub">{t(lesson, 'subtitle')}</div>}
        <AudioSource lesson={lesson} />
      </div>

      {(t(lesson, 'warmup_situation') || t(lesson, 'warmup_question')) && (
        <Block title={`1 · ${ui.warmup}`}>
          <div className="callout">
            <div className="label">{ui.whatWouldYouSay}</div>
            {t(lesson, 'warmup_situation') && <p>{t(lesson, 'warmup_situation')}</p>}
            {t(lesson, 'warmup_question') && <p className="q">{t(lesson, 'warmup_question')}</p>}
          </div>
        </Block>
      )}

      {lesson.vocab.length > 0 && (
        <Block title={`2 · ${ui.vocabulary}`} count={lesson.vocab.length}>
          <div className="vocab-grid">
            {lesson.vocab.map((v) => (
              <div className="row" key={v.id}>
                <Play text={v.fi} aid={v.aid} playKey={`v${v.id}`} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="fi">{v.fi}</div>
                  <div className="en">{t(v, 'en')}</div>
                  {t(v, 'literal') && <div className="gloss">{ui.literally} {t(v, 'literal')}</div>}
                  {v.fi_book && v.fi_book !== v.fi && (
                    <div className="book">{ui.bookForm} <b>{v.fi_book}</b></div>
                  )}
                  {t(v, 'note') && <div className="note">{t(v, 'note')}</div>}
                </div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {lesson.phrases.length > 0 && (
        <Block title={`3 · ${ui.keyPhrases}`} count={lesson.phrases.length}>
          {lesson.phrases.map((p) => (
            <div className="row" key={p.id}>
              <Play text={p.fi} aid={p.aid} playKey={`p${p.id}`} />
              <Play text={p.fi} aid={p.aid} playKey={`p${p.id}`} slow />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="fi">{p.fi}</span>
                  {p.register && <span className={`tag ${p.register}`}>{p.register}</span>}
                </div>
                <div className="en">{t(p, 'en')}</div>
                {t(p, 'literal') && <div className="gloss">{ui.literally} {t(p, 'literal')}</div>}
                {p.fi_book && p.fi_book !== p.fi && (
                  <div className="book">{ui.bookForm} <b>{p.fi_book}</b></div>
                )}
                {t(p, 'when_to_use') && <div className="note">{t(p, 'when_to_use')}</div>}
              </div>
            </div>
          ))}
        </Block>
      )}

      {lesson.dialogues.length > 0 && (
        <Block title={`4 · ${ui.listen}`} count={ui.dialoguesCount(lesson.dialogues.length)}>
          {lesson.dialogues.map((d) => <Dialogue key={d.id} dialogue={d} />)}
        </Block>
      )}

      {lesson.roleplays.length > 0 && (
        <Block title={`5 · ${ui.rolePlay}`}>
          {lesson.roleplays.map((r) => <Roleplay key={r.id} roleplay={r} />)}
        </Block>
      )}

      {lesson.rescue_fi && (
        <Block title={`6 · ${ui.rescueMove}`}>
          <div className="callout">
            <div className="label">{ui.ifItGoesWrong}</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Play text={lesson.rescue_fi} aid={lesson.rescue_aid} playKey={`rescue${lesson.id}`} />
              <Play text={lesson.rescue_fi} aid={lesson.rescue_aid} playKey={`rescue${lesson.id}`} slow />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="fi" style={{ fontSize: 17 }}>{lesson.rescue_fi}</div>
                <div className="en">{t(lesson, 'rescue_en')}</div>
              </div>
            </div>
            {t(lesson, 'rescue_note') && <p style={{ marginTop: 12, fontSize: 14 }}>{t(lesson, 'rescue_note')}</p>}
          </div>
        </Block>
      )}

      <div className="lesson-nav">
        {lesson.prev ? (
          <a className="nav-btn" href={`#/lesson/${lesson.prev.slug}`}
             onClick={(e) => { e.preventDefault(); navigate(`/lesson/${lesson.prev.slug}`); }}>
            <div className="dir">{ui.prev}</div>
            <div className="name">{lesson.prev.number} {t(lesson.prev, 'title')}</div>
          </a>
        ) : <div className="nav-btn" style={{ visibility: 'hidden' }} />}
        {lesson.next ? (
          <a className="nav-btn next" href={`#/lesson/${lesson.next.slug}`}
             onClick={(e) => { e.preventDefault(); navigate(`/lesson/${lesson.next.slug}`); }}>
            <div className="dir">{ui.next}</div>
            <div className="name">{lesson.next.number} {t(lesson.next, 'title')}</div>
          </a>
        ) : <div className="nav-btn" style={{ visibility: 'hidden' }} />}
      </div>
    </div>
  );
}
