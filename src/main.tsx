import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ModalHost } from './modals/ModalHost';
import './style.css';

// /tv = TV com telemóveis, /j/CODIGO = telemóvel de um jogador. Só estas páginas carregam o Firebase.
const TvApp = lazy(() => import('./multiplayer/TvApp'));
const PlayerApp = lazy(() => import('./multiplayer/PlayerApp'));

const path = location.pathname;
const join = path.match(/^\/j(?:\/([A-Za-z0-9]{0,4}))?\/?$/);
const page = path.replace(/\/$/, '') === '/tv' ? <TvApp />
  : join ? <PlayerApp initialCode={(join[1] ?? '').toUpperCase()} />
  : <App />;

createRoot(document.getElementById('root')!).render(
  <StrictMode><Suspense fallback={null}>{page}</Suspense><ModalHost /></StrictMode>,
);
