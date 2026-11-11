import type { Settings } from '../../types';
import type { UpdateSettings } from '../../hooks/useSettings';
import { Segmented } from '../Segmented';

const START_OPTIONS = [['begin', 'Do início'], ['random', 'Ponto aleatório']] as const;

export function ClipPanel({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  return (
    <section className="panel">
      <h3>Excerto</h3>
      <label className="field">
        <span className="field-row">Duração <b>{settings.duration} s</b></span>
        <input type="range" min="5" max="30" step="1" value={settings.duration} onChange={(e) => update({ duration: +e.target.value })} />
      </label>
      <Segmented value={settings.start} options={START_OPTIONS} onChange={(start) => update({ start })} />
      <label className="toggle">Evitar músicas repetidas
        <input type="checkbox" checked={settings.noRepeat} onChange={(e) => update({ noRepeat: e.target.checked })} />
      </label>
    </section>
  );
}
