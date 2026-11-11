import type { Settings } from '../../types';
import type { UpdateSettings } from '../../hooks/useSettings';
import { sideFor } from '../../categories/sides';
import { SIDE_OPTIONS, Segmented } from '../Segmented';

export function CategoriesPanel({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const side = sideFor(settings.mode, settings.side);
  const categories = side?.categories({ artistNames: settings.artists.map((a) => a.name) }) ?? [];
  return (
    <section className="panel">
      <h3>Categorias</h3>
      <Segmented value={settings.side} options={SIDE_OPTIONS} onChange={(side) => update({ side })} />
      {side && (
        <ul className="cat-list">
          {categories.map((c) => (
            <li key={c.key}><i style={{ background: c.color }} /><span><b>{c.name}</b>{c.ask}</span></li>
          ))}
        </ul>
      )}
      <p className="hint">Antes de cada música é sorteada uma destas categorias.</p>
    </section>
  );
}
