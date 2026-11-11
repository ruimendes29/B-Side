import type { Phase } from '../types';

interface Props {
  phase: Phase;
  hasTrack: boolean;
  revealed: boolean;
  onPlay: () => void;
  onReplay: () => void;
  onNext: () => void;
  onReveal: () => void;
}

export function Controls({ phase, hasTrack, revealed, onPlay, onReplay, onNext, onReveal }: Props) {
  const playing = phase === 'playing' || phase === 'buffering';
  const loading = phase === 'loading' || phase === 'buffering';
  return (
    <>
      <div className="controls">
        <button type="button" className="ctrl" title="Ouvir outra vez (R)" aria-label="Ouvir outra vez" disabled={!hasTrack || phase === 'loading'} onClick={onReplay}>
          <svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" /></svg>
        </button>
        <button type="button" className={`play${playing ? ' playing' : ''}${loading ? ' loading' : ''}`} title="Tocar / parar (espaço)"
          aria-label={playing ? 'Parar' : 'Tocar'} disabled={phase === 'loading'} onClick={onPlay}>
          <svg className="i-play" viewBox="0 0 24 24"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z" /></svg>
          <svg className="i-pause" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        </button>
        <button type="button" className="ctrl" title="Próxima música (N)" aria-label="Próxima música" disabled={phase === 'loading'} onClick={onNext}>
          <svg viewBox="0 0 24 24"><path d="M6 5.5v13a1 1 0 0 0 1.53.85L17 13.2V18a1 1 0 0 0 2 0V6a1 1 0 0 0-2 0v4.8L7.53 4.65A1 1 0 0 0 6 5.5z" /></svg>
        </button>
      </div>
      <button type="button" className={`btn btn-outline reveal${revealed ? ' next' : ''}`} disabled={phase === 'loading' || !hasTrack} onClick={onReveal}>
        {revealed ? 'Próxima música' : 'Revelar'}
      </button>
    </>
  );
}
