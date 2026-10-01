import { useEffect, useState } from 'react';
import * as audio from '../lib/audio';

/** Subscribe to the shared audio state and report whether `key` is the active clip. */
export function useActive(key) {
  const [state, setState] = useState(audio.getState);
  useEffect(() => audio.subscribe(setState), []);
  return {
    active: state.key === key && (state.playing || state.loading),
    loading: state.key === key && state.loading,
  };
}

/** Round play button for one Finnish string. `slow` renders the 0.7× variant. */
export default function Play({ text, aid, playKey, slow = false, title }) {
  const key = (playKey ?? text) + (slow ? '::slow' : '');
  const { active, loading } = useActive(key);

  return (
    <button
      className={`play${slow ? ' slow' : ''}${active ? ' on' : ''}`}
      title={title ?? (slow ? 'Play slowly' : 'Play')}
      aria-label={`${slow ? 'Play slowly' : 'Play'}: ${text}`}
      onClick={(e) => {
        e.stopPropagation();
        if (active) return audio.stop();
        audio.play(text, { speed: slow ? 'slow' : 'normal', key, aid }).catch(() => {});
      }}
    >
      {loading ? '···' : slow ? '0.7×' : active ? '■' : '▶'}
    </button>
  );
}
