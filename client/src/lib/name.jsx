import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// The dialogues were written around one learner, "Duc". Rather than bake that in,
// the name is substituted at render time, so the conversations are about whoever
// is using the app. The content files stay canonical.

const KEY = 'puhu-suomee:name';
export const AUTHORED_NAME = 'Duc';

/**
 * Finnish genitive, which is all the inflection the content needs ("Ducin isä").
 * A name ending in a vowel takes -n, otherwise -in. Good enough for a first name,
 * and far better than leaving the authored name in one stray line.
 */
export function genitive(name) {
  return /[aeiouyäöå]$/i.test(name) ? `${name}n` : `${name}in`;
}

export function personaliseText(text, name) {
  if (!text || !name || name === AUTHORED_NAME) return text;
  return text
    .replace(/\bDucin\b/g, genitive(name))
    .replace(/\bDuc\b/g, name);
}

/**
 * Walk a lesson and rename the learner throughout — speaker labels, Finnish,
 * English and Vietnamese alike. A Finnish line that changed no longer matches its
 * pre-generated clip, so its audio id is dropped and that line is spoken from the
 * on-demand endpoint (or the device) instead of playing the wrong name.
 */
export function personaliseLesson(lesson, name) {
  if (!lesson || !name || name === AUTHORED_NAME) return lesson;
  const rename = (text) => personaliseText(text, name);

  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out = {};
      for (const [key, value] of Object.entries(node)) {
        out[key] = typeof value === 'string' ? rename(value) : walk(value);
      }
      if (typeof node.fi === 'string' && out.fi !== node.fi) out.aid = null;
      if (typeof node.rescue_fi === 'string' && out.rescue_fi !== node.rescue_fi) out.rescue_aid = null;
      return out;
    }
    return node;
  };

  return walk(lesson);
}

const NameContext = createContext(null);

export function NameProvider({ children }) {
  // `null` means never asked; '' means asked and declined, so keep the authored name.
  const [stored, setStored] = useState(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return '';
    }
  });
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (stored === null) setAsking(true);
  }, [stored]);

  const value = useMemo(() => ({
    name: stored || AUTHORED_NAME,
    isSet: !!stored,
    asking,
    ask: () => setAsking(true),
    dismiss: () => {
      setAsking(false);
      if (stored === null) save(''); // asked once; don't nag
    },
    save,
  }), [stored, asking]);

  function save(name) {
    const clean = (name ?? '').trim().slice(0, 24);
    try {
      localStorage.setItem(KEY, clean);
    } catch { /* storage blocked — the name just won't persist */ }
    setStored(clean);
    setAsking(false);
  }

  return <NameContext.Provider value={value}>{children}</NameContext.Provider>;
}

export function useName() {
  const ctx = useContext(NameContext);
  if (!ctx) throw new Error('useName must be used inside <NameProvider>');
  return ctx;
}
