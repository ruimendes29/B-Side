import { useState } from 'react';

interface Props {
  blocked: string[];
  onBlock: (name: string) => boolean;
  onUnblock: (name: string) => void;
}

export function BlockedPanel({ blocked, onBlock, onUnblock }: Props) {
  const [name, setName] = useState('');
  return (
    <section className="panel">
      <h3>Artistas bloqueados</h3>
      <form className="block-add" onSubmit={(e) => { e.preventDefault(); if (onBlock(name)) setName(''); }}>
        <input type="text" placeholder="Nome do artista" autoComplete="off" aria-label="Artista a bloquear" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit">Bloquear</button>
      </form>
      <ul className="blocked">
        {blocked.map((b) => (
          <li key={b}><span>{b}</span>
            <button type="button" aria-label={`Desbloquear ${b}`} title="Desbloquear" onClick={() => onUnblock(b)}>×</button>
          </li>
        ))}
        {!blocked.length && <li className="empty">Nenhum artista bloqueado.</li>}
      </ul>
      <p className="hint">As músicas destes artistas deixam de aparecer, incluindo duetos e participações ("feat."). Também podes bloquear um artista na carta revelada ou no histórico.</p>
    </section>
  );
}
