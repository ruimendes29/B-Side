import type { Settings } from '../../types';
import { DECADES, type UpdateSettings } from '../../hooks/useSettings';
import type { SetStatus } from '../../hooks/useStatus';
import { Segmented } from '../Segmented';

export const decadeLabel = (d: number) => (d < 2000 ? `${String(d).slice(2)}s` : `${d}s`);

const MODES = [['decades', 'Por língua e década'], ['playlists', 'Uma playlist'], ['artists', 'Por artista']] as const;

export function SongsPanel({ settings, update, setStatus }: { settings: Settings; update: UpdateSettings; setStatus: SetStatus }) {
  const toggleDecade = (d: number) => {
    const has = settings.decades.includes(d);
    if (has && settings.decades.length === 1) return setStatus('Escolhe pelo menos uma década.');
    update({ decades: has ? settings.decades.filter((x) => x !== d) : [...settings.decades, d] });
  };

  return (
    <section className="panel">
      <h3>Músicas</h3>
      <Segmented value={settings.mode} options={MODES} onChange={(mode) => update({ mode })} />
      {settings.mode === 'decades' && (
        <div className="stack">
          <div className="chips" role="group" aria-label="Décadas">
            {DECADES.map((d) => (
              <button key={d} type="button" className="chip" aria-pressed={settings.decades.includes(d)} onClick={() => toggleDecade(d)}>{decadeLabel(d)}</button>
            ))}
          </div>
        </div>
      )}
      {settings.mode === 'playlists' && (
        <label className="field">Link de uma playlist Deezer
          <input
            type="text"
            placeholder="https://www.deezer.com/playlist/…"
            autoComplete="off"
            defaultValue={settings.dzPlaylist}
            onBlur={(e) => update({ dzPlaylist: e.target.value.trim() })}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        </label>
      )}
    </section>
  );
}
