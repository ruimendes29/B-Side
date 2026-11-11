import { Tooltip } from '../../tooltips/Tooltip';
import { useEffect, useState } from 'react';
import type { ArtistRef, Settings } from '../../types';
import { MAX_ARTISTS, type UpdateSettings } from '../../hooks/useSettings';
import type { SetStatus } from '../../hooks/useStatus';
import { deezer } from '../../services/DeezerService';

export function ArtistsPanel({ settings, update, setStatus }: { settings: Settings; update: UpdateSettings; setStatus: SetStatus }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ArtistRef[] | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    let current = true; // a pesquisa pode mudar antes de a resposta chegar
    const timer = setTimeout(() => {
      deezer.searchArtists(q)
        .then((list) => current && setResults(list))
        .catch(() => current && (setResults([]), setStatus('Não foi possível pesquisar artistas na Deezer.', 'error')));
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [query, setStatus]);

  const add = (a: ArtistRef) => {
    if (settings.artists.some((x) => x.id === a.id)) return setStatus(`${a.name} já está escolhido.`);
    if (settings.artists.length >= MAX_ARTISTS) return setStatus(`Podes escolher até ${MAX_ARTISTS} artistas.`);
    update({ artists: [...settings.artists, { id: a.id, name: a.name }] });
    setQuery('');
  };

  return (
    <section className="panel">
      <h3>Artistas</h3>
      <label className="field">Pesquisar artista
        <input type="text" placeholder="Ex.: Xutos & Pontapés" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ul className="artist-results">
        {results?.map((a) => (
          <li key={a.id}><button type="button" onClick={() => add(a)}>
            {a.picture && <img src={a.picture} alt="" />}<span>{a.name}</span>
          </button></li>
        ))}
        {results?.length === 0 && <li className="empty">Nenhum artista encontrado.</li>}
      </ul>
      <ul className="blocked">
        {settings.artists.map((a) => (
          <li key={a.id}><span>{a.name}</span>
            <Tooltip content="Remover">
              <button type="button" aria-label={`Remover ${a.name}`} onClick={() => update({ artists: settings.artists.filter((x) => x.id !== a.id) })}>×</button>
            </Tooltip>
          </li>
        ))}
        {!settings.artists.length && <li className="empty">Ainda nenhum artista.</li>}
      </ul>
      <p className="hint">Escolhe um ou mais artistas (até 10). Só tocam músicas deles, e as perguntas são sobre os álbuns de estúdio e a carreira de cada um.</p>
    </section>
  );
}
