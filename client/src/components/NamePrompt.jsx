import { useEffect, useRef, useState } from 'react';
import { useName } from '../lib/name';
import { useLang } from '../lib/lang';

/**
 * Asked once, on first visit, and reachable afterwards from the header. Declining
 * is fine — the dialogues keep the name they were written with.
 */
export default function NamePrompt() {
  const { ui } = useLang();
  const { asking, name, save, dismiss } = useName();
  const [draft, setDraft] = useState(name);
  const input = useRef(null);

  useEffect(() => {
    if (asking) {
      setDraft(name);
      input.current?.focus();
    }
  }, [asking, name]);

  if (!asking) return null;

  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); save(draft); }}
      >
        <h2>{ui.namePromptTitle}</h2>
        <p>{ui.namePromptBody}</p>
        <input
          ref={input}
          type="text"
          value={draft}
          maxLength={24}
          placeholder={ui.you}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={ui.namePromptTitle}
        />
        <div className="modal-buttons">
          <button type="button" className="ghost" onClick={dismiss}>{ui.nameSkip}</button>
          <button type="submit" disabled={!draft.trim()}>{ui.nameSave}</button>
        </div>
      </form>
    </div>
  );
}
