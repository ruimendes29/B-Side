// Depois de revelar: cada jogador aprova ou rejeita as respostas dos outros (que vê na TV).
// Cartão de vidro como o das opções: nome em pílula e ✓/✗ em cada linha, "Aprovar todos"/"Rejeitar todos" no topo.
import { useEffect, useState } from 'react';
import { castVotes, watchMyVotes } from './session';

interface Props {
  code: string;
  me: string;
  /** Jogadores cujas respostas se votam (sem o próprio), pela ordem de entrada. */
  targets: { id: string; name: string }[];
  color: string;
  onError: (e: unknown) => void;
}

const tick = () => navigator.vibrate?.(12);

export function VotePanel({ code, me, targets, color, onError }: Props) {
  const [mine, setMine] = useState<Record<string, boolean>>({});
  useEffect(() => watchMyVotes(code, me, setMine), [code, me]);

  const vote = (patch: Record<string, boolean>) => {
    tick();
    setMine((m) => ({ ...m, ...patch })); // já, sem esperar pela rede
    castVotes(code, patch).catch(onError);
  };
  const all = (v: boolean) => vote(Object.fromEntries(targets.map((t) => [t.id, v])));
  const done = targets.filter((t) => mine[t.id] != null).length;

  return (
    <div className="glass vote-glass" style={{ '--cat': color } as React.CSSProperties}>
      <div className="vote-head">
        <span>Respostas certas? <small>{done}/{targets.length}</small></span>
        <div className="vote-all">
          <button type="button" className="vote-btn yes" onClick={() => all(true)}>Aprovar todos</button>
          <button type="button" className="vote-btn no" onClick={() => all(false)}>Rejeitar todos</button>
        </div>
      </div>
      <ol>
        {targets.map((t) => (
          <li key={t.id} className={mine[t.id] == null ? undefined : mine[t.id] ? 'voted-yes' : 'voted-no'}>
            <span className="vote-pill vote-name">{t.name}</span>
            <span className="vote-actions">
              <button type="button" className="vote-icon yes" aria-pressed={mine[t.id] === true}
                aria-label={`Aprovar a resposta de ${t.name}`} onClick={() => vote({ [t.id]: true })}>✓</button>
              <button type="button" className="vote-icon no" aria-pressed={mine[t.id] === false}
                aria-label={`Rejeitar a resposta de ${t.name}`} onClick={() => vote({ [t.id]: false })}>✕</button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
