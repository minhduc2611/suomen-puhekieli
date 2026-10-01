import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ModuleList from './components/ModuleList';
import Lesson from './components/Lesson';
import AppStatus from './components/AppStatus';
import * as audio from './lib/audio';
import { LangProvider, LangSwitch, useLang } from './lib/lang';
import './styles.css';

function currentPath() {
  return window.location.hash.replace(/^#/, '') || '/';
}

function App() {
  const { ui } = useLang();
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onHash = () => setPath(currentPath());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function navigate(to) {
    audio.stop();
    window.location.hash = to;
  }

  const lessonMatch = path.match(/^\/lesson\/([\w-]+)$/);

  return (
    <>
      <header className="masthead">
        <div className="masthead-in">
          <a className="brand" href="#/" onClick={() => navigate('/')}>
            Puhu suomee <span>· puhekieli</span>
          </a>
          {lessonMatch && (
            <a className="crumb" href="#/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
              {ui.allModules}
            </a>
          )}
          <LangSwitch />
        </div>
      </header>
      {lessonMatch
        ? <Lesson slug={lessonMatch[1]} navigate={navigate} />
        : <ModuleList navigate={navigate} />}
      <AppStatus />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LangProvider><App /></LangProvider>
  </StrictMode>,
);
