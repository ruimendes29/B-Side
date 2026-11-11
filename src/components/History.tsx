import type { HistoryEntry } from '../types';
import { languages } from '../languages/LanguageService';
import { categoryByKey } from '../categories/sides';
import { BlockIcon } from './icons';

interface Props {
  history: HistoryEntry[];
  onBlock: (artist: string) => void;
  onClear: () => void;
}

function CategoryDot({ catKey }: { catKey: string }) {
  const c = categoryByKey(catKey);
  return c ? <i className="cat-dot" style={{ background: c.color }} title={c.name} /> : null;
}

export function History({ history, onBlock, onClear }: Props) {
  return (
    <section className="history">
      <div className="history-head">
        <h2>Já tocadas</h2>
        <button type="button" className="btn-link" onClick={() => { if (confirm('Limpar o histórico e voltar a permitir todas as músicas?')) onClear(); }}>Limpar histórico</button>
      </div>
      <ol className="tracks">
        {!history.length && <li className="empty">As músicas reveladas aparecem aqui.</li>}
        {history.map((h, i) => (
          <li key={`${h.id}-${i}`}>
            <span className="n">{history.length - i}</span>
            {h.image ? <img src={h.image} alt="" loading="lazy" /> : <span className="noimg" />}
            <span className="info">
              {h.link
                ? <a className="t" href={h.link} target="_blank" rel="noopener">{h.title}</a>
                : <span className="t">{h.title}</span>}
              <span className="a">
                {h.cat && <CategoryDot catKey={h.cat} />}
                {h.lang && languages.has(h.lang) && <span className="tag">{languages.get(h.lang).code}</span>}
                {h.artist}
              </span>
            </span>
            <span className="y">{h.year ?? '—'}</span>
            <button type="button" className="block" title={`Bloquear ${h.artist}`} aria-label={`Bloquear ${h.artist}`} onClick={() => onBlock(h.artist)}><BlockIcon /></button>
          </li>
        ))}
      </ol>
      <p className="hint keys">Atalhos: <kbd>Espaço</kbd> tocar/parar · <kbd>R</kbd> ouvir outra vez · <kbd>Enter</kbd> revelar · <kbd>N</kbd> próxima</p>
    </section>
  );
}
