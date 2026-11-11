import type { Settings } from '../../types';
import type { UpdateSettings } from '../../hooks/useSettings';
import { Segmented } from '../Segmented';

const FAME_OPTIONS = [['any', 'Todas'], ['known', 'Conhecidas'], ['hits', 'Só êxitos']] as const;

export function FamePanel({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  return (
    <section className="panel">
      <h3>Fama</h3>
      <Segmented value={settings.fame} options={FAME_OPTIONS} onChange={(fame) => update({ fame })} />
      <p className="hint">Compara com as outras músicas do mesmo grupo (língua e década, artista ou playlist): "Conhecidas" são as 50% mais ouvidas na Deezer, "Só êxitos" as 20%. Assim, um êxito português conta como conhecido mesmo com menos ouvintes do que um americano.</p>
    </section>
  );
}
