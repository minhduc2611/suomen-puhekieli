import { useEffect, useState } from 'react';
import { loadIndex } from '../lib/content';
import { useLang } from '../lib/lang';

export default function ModuleList({ navigate }) {
  const { t, ui } = useLang();
  const [modules, setModules] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const [error, setError] = useState(null);

  useEffect(() => {
    loadIndex().then(setModules).catch(() => setError(true));
  }, []);

  if (error) return <div className="state">{ui.loadError}</div>;
  if (!modules) return <div className="state">{ui.loading}</div>;

  const lessonTotal = modules.reduce((n, m) => n + m.lesson_count, 0);

  function toggle(slug) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  }

  return (
    <div className="wrap">
      <div className="intro">
        <h1>Puhu suomee</h1>
        <p>{ui.tagline} <span className="book">mä · sä · onks · mennään</span></p>
        <p style={{ fontSize: 13.5, color: 'var(--faint)' }}>
          {modules.length} {ui.modules} · {lessonTotal} {ui.lessons} · {ui.audioNote}
        </p>
      </div>

      {modules.map((m) => {
        const isOpen = open.has(m.slug);
        return (
          <div className="module" key={m.slug}>
            <button className="module-head" onClick={() => toggle(m.slug)} aria-expanded={isOpen}>
              <span className="module-emoji">{m.emoji}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="module-num">{m.number}</span>
                <div className="module-title">{t(m, 'title')}</div>
                {t(m, 'subtitle') && <div className="module-sub">{t(m, 'subtitle')}</div>}
              </span>
              <span className="module-meta">
                {m.lesson_count} {m.lesson_count === 1 ? ui.lesson : ui.lessons}
                {m.level && <div>{m.level}</div>}
                <div className={`chev${isOpen ? ' open' : ''}`}>›</div>
              </span>
            </button>

            {isOpen && (
              <div className="lesson-list">
                {t(m, 'description') && (
                  <div className="module-desc">{t(m, 'description')}</div>
                )}
                {m.lessons.map((l) => (
                  <a
                    key={l.slug}
                    className="lesson-row"
                    href={`#/lesson/${l.slug}`}
                    onClick={(e) => { e.preventDefault(); navigate(`/lesson/${l.slug}`); }}
                  >
                    <span className="n">{l.number}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="t">{t(l, 'title')}</span>
                      {t(l, 'subtitle') && <div className="s">{t(l, 'subtitle')}</div>}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
