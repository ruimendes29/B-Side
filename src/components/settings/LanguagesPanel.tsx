import type { LangKey, Settings } from '../../types';
import type { UpdateSettings } from '../../hooks/useSettings';
import { languages } from '../../languages/LanguageService';
import { addShare, languageShares, removeShare, setShare } from '../../lib/shares';

export function LanguagesPanel({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const shares = languageShares(settings.languages);
  const missing = languages.all.filter((l) => !(l.key in settings.languages));
  const single = shares.length === 1;

  return (
    <section className="panel">
      <h3>Línguas</h3>
      <div className="ratio-bar" aria-hidden="true">
        {shares.filter((l) => l.pct > 0).map((l) => <span key={l.key} style={{ flex: l.weight, background: l.color }} />)}
      </div>
      <div className="langs">
        {shares.map((l) => {
          const { name } = languages.get(l.key);
          return (
            <div key={l.key} className={`lang-row${l.pct === 0 ? ' off' : ''}`}>
              <span className="lang-name"><i style={{ background: l.color }} />{name}</span>
              <b className="lang-pct">{l.pct}%</b>
              <button type="button" className="lang-remove" hidden={single} aria-label={`Remover ${name}`} title="Remover"
                onClick={() => update((s) => ({ languages: removeShare(s.languages, l.key) }))}>×</button>
              <input type="range" min="0" max="100" step="any" value={l.weight} disabled={single} aria-label={`Percentagem de ${name}`}
                onChange={(e) => update((s) => ({ languages: setShare(s.languages, l.key, +e.target.value) }))} />
            </div>
          );
        })}
      </div>
      {missing.length > 0 && (
        <label className="field add-lang">
          <select aria-label="Adicionar língua" value="" onChange={(e) => e.target.value && update((s) => ({ languages: addShare(s.languages, e.target.value as LangKey) }))}>
            <option value="">+ Adicionar língua</option>
            {missing.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
          </select>
        </label>
      )}
      <p className="hint">A percentagem é a probabilidade de cada música ser dessa língua. Portugal e Brasil são línguas separadas, cada uma com a sua percentagem.</p>
    </section>
  );
}
