import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { sameName, useSettings } from './hooks/useSettings';
import { useStatus } from './hooks/useStatus';
import { useGame } from './hooks/useGame';
import { languages } from './languages/LanguageService';
import { languageShares } from './lib/shares';
import { normalize } from './lib/util';
import { BlockList } from './services/BlockList';
import { DECADES } from './hooks/useSettings';
import { SIDES } from './categories/sides';
import type { Settings } from './types';
import { Sidebar } from './components/Sidebar';
import { Card } from './components/Card';
import { Controls } from './components/Controls';
import { Progress } from './components/Progress';
import { History } from './components/History';
import { SIDE_OPTIONS, Segmented } from './components/Segmented';
import { decadeLabel } from './components/settings/SongsPanel';
import { BlockIcon } from './components/icons';

/** Resumo das definições na barra do topo. */
function sourceLabel(s: Settings) {
  let pill = 'Playlist da Deezer';
  if (s.mode === 'artists') pill = s.artists.length ? s.artists.map((a) => a.name).join(', ') : 'Sem artistas';
  if (s.mode === 'decades') {
    const langs = languageShares(s.languages).filter((l) => l.pct > 0).map((l) => `${languages.get(l.key).code} ${l.pct}%`).join(' · ');
    const ds = [...s.decades].sort();
    pill = `${langs} · ${ds.length === DECADES.length ? 'todas as décadas' : ds.map(decadeLabel).join(' ')}`;
  }
  const side = SIDES[s.side];
  return `${side.letter} · ${side.name} · ${pill}`;
}

/** O que a página da TV junta ao jogo: o ecrã de espera (em vez do palco) e as respostas por baixo da carta. */
export interface GameExtras { overlay?: ReactNode; belowCard?: ReactNode }
const noExtras = (): GameExtras => ({});

export default function App({ useExtras = noExtras }: { useExtras?: (game: ReturnType<typeof useGame>) => GameExtras }) {
  const [settings, update] = useSettings();
  const [status, setStatus] = useStatus();
  const game = useGame(settings, setStatus);
  const extras = useExtras(game); // o mesmo hook durante toda a vida da página
  const { phase, track, revealed, round, actions } = game;
  const [menuOpen, setMenuOpen] = useState(false);
  const blocked = useMemo(() => new BlockList(settings.blockedArtists), [settings.blockedArtists]);

  const blockArtist = (raw: string) => {
    const name = String(raw || '').trim();
    if (!normalize(name)) return false;
    if (settings.blockedArtists.some((b) => sameName(b, name))) {
      setStatus(`${name} já está na lista de bloqueados.`);
      return false;
    }
    update({ blockedArtists: [...settings.blockedArtists, name] }); // a próxima música já escolhida pode ser deste artista
    setStatus(`${name} está na lista de bloqueados: estas músicas não voltam a aparecer. Podes desfazer nas definições.`);
    return true;
  };
  const unblockArtist = (name: string) => update({ blockedArtists: settings.blockedArtists.filter((b) => !sameName(b, name)) });

  // Atalhos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      const onButton = target.closest('button, a, [role="button"]');
      if (e.code === 'Space' && !onButton) { e.preventDefault(); actions.play(); }
      else if (e.key === 'Enter' && (!onButton || target.classList.contains('card'))) { e.preventDefault(); actions.reveal(); }
      else if (e.key === 'r' || e.key === 'R' || e.key === 'ArrowLeft') actions.replay();
      else if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight' || e.key === 'MediaTrackNext') actions.next();
      // Comandos de TV: play/pausa e ⏭ chegam como teclas de media.
      else if (e.key === 'MediaPlayPause' || e.key === 'MediaPlay' || e.key === 'MediaPause') { e.preventDefault(); actions.play(); }
      else if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const artist = track?.artists[0];

  return (
    <div className={menuOpen ? 'menu-open' : undefined}>
      <div className="app">
        <Sidebar settings={settings} update={update} setStatus={setStatus} onBlock={blockArtist} onUnblock={unblockArtist} />

        <main className="main">
          <header className="topbar">
            <button type="button" className="icon-btn menu-btn" aria-label="Definições" onClick={() => setMenuOpen(true)}>
              <svg viewBox="0 0 24 24"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" /></svg>
            </button>
            <div className="round">Ronda <span>{round}</span></div>
            <div className="pill">{sourceLabel(settings)}</div>
            {!extras.overlay && useExtras === noExtras && <a className="pill tv-link" href="/tv">📺 Jogar na TV</a>}
          </header>

          {extras.overlay ?? (
            <section className={`stage${phase === 'playing' ? ' is-playing' : ''}`}>
              {round === 0 && phase === 'idle' && (
                <div className="side-pick">
                  <span>Categorias</span>
                  <Segmented value={settings.side} options={SIDE_OPTIONS} onChange={(side) => update({ side })} />
                </div>
          )}
            <Card {...game} onReveal={actions.reveal} />
            <Progress clip={game.clip} playing={phase === 'playing'} defaultMs={settings.duration * 1000} />
            <Controls phase={phase} hasTrack={!!track} revealed={revealed}
              onPlay={actions.play} onReplay={actions.replay} onNext={actions.next} onReveal={actions.reveal} />
            {extras.belowCard}
            {revealed && game.year !== undefined && track?.link && (
              <a className="open-link" href={track.link} target="_blank" rel="noopener">Abrir na Deezer ↗</a>
            )}
            {revealed && game.year !== undefined && artist && (
              <button type="button" className="block-artist" disabled={blocked.has(artist)} onClick={() => blockArtist(artist)}>
                <BlockIcon /><span>{blocked.has(artist) ? 'Na lista de bloqueados' : `Bloquear ${artist}`}</span>
              </button>
            )}
            <p className={`status${status.kind === 'error' ? ' error' : ''}`} role="status" aria-live="polite">{status.text}</p>
          </section>
          )}

          <History history={game.history} onBlock={blockArtist} onClear={actions.clearHistory} />
        </main>
      </div>
      <div className="scrim" onClick={() => setMenuOpen(false)} />
    </div>
  );
}
