import type { Settings } from '../../types';
import type { UpdateSettings } from '../../hooks/useSettings';
import { sideFor } from '../../categories/sides';
import { BINGO_OPTIONS, Segmented } from '../Segmented';

export function BingoPanel({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const side = sideFor(settings.mode, settings.bingo);
  const categories = side?.categories({ artistNames: settings.artists.map((a) => a.name) }) ?? [];
  return (
    <section className="panel">
      <h3>Categorias do Bingo</h3>
      <Segmented value={settings.bingo} options={BINGO_OPTIONS} onChange={(bingo) => update({ bingo })} />
      {side && (
        <ul className="cat-list">
          {categories.map((c) => (
            <li key={c.key}><i style={{ background: c.color }} /><span><b>{c.name}</b>{c.ask}</span></li>
          ))}
        </ul>
      )}
      <p className="hint">Antes de cada música é sorteada uma destas categorias, como a bola de espelhos do Hitster Bingo.</p>
    </section>
  );
}
