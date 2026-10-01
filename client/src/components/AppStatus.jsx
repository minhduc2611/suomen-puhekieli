import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLang } from '../lib/lang';

/**
 * Two thin bars at the bottom: "you're offline" and "an update is waiting".
 * The update is never applied automatically — swapping the app out mid-lesson
 * would stop the audio.
 */
export default function AppStatus() {
  const { ui } = useLang();
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline && !needRefresh) return null;

  return (
    <div className="app-status">
      {offline && <div className="bar offline">{ui.offline}</div>}
      {needRefresh && (
        <div className="bar update">
          <span>{ui.updateReady}</span>
          <button onClick={() => updateServiceWorker(true)}>{ui.reload}</button>
        </div>
      )}
    </div>
  );
}
