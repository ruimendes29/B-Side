// Cartão de vidro por baixo da carta: o verso do refrão e/ou as opções A, B, C… (álbuns, artistas, títulos).
// No telemóvel as opções são botões; na TV, ao revelar, cada opção mostra quem a escolheu.
import { useEffect, useState } from 'react';
import type { Chorus } from '../types';

interface Props {
  /** Cor da categoria (variável --cat-*). */
  color: string;
  options?: string[];
  /** Índice da opção certa depois de revelar; -1 enquanto se joga. */
  correct?: number;
  /** Espera antes de mostrar a certa (suspense nos resultados). */
  delayMs?: number;
  /** Verso com as últimas palavras escondidas; aparecem ao revelar. */
  lyric?: Chorus;
  revealed?: boolean;
  /** Telemóvel: a opção escolhida e o que fazer ao tocar numa (sem onPick, não se pode escolher). */
  picked?: number;
  onPick?: (i: number) => void;
  /** Nomes de quem escolheu cada opção (pílulas à direita). */
  votes?: string[][];
}

/** Vibração curta ao mostrar a certa: uma se acertaste, três se não (só onde o browser deixa). */
const buzz = (right: boolean) => navigator.vibrate?.(right ? 40 : [30, 60, 30, 60, 30]);

export function GlassCard({ color, options, correct = -1, delayMs = 0, lyric, revealed = false, picked, onPick, votes }: Props) {
  const [shown, setShown] = useState(-1);
  useEffect(() => {
    if (correct < 0) { setShown(-1); return; }
    const timer = window.setTimeout(() => {
      setShown(correct);
      if (picked != null && picked >= 0) buzz(picked === correct);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [correct, delayMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="glass" style={{ '--cat': color } as React.CSSProperties}>
      {lyric && (
        <p className="glass-lyric">
          «{lyric.shown}{' '}
          {revealed
            ? <mark>{lyric.hidden.join(' ')}</mark>
            : <span className="blank" aria-label="palavras escondidas">{lyric.hidden.map(() => '____').join(' ')}</span>}
          »
        </p>
      )}
      {options && options.length > 0 && (
        <ol>
          {options.map((o, i) => {
            const state = shown < 0 ? '' : i === shown ? 'correct' : 'wrong';
            const content = (
              <>
                <span className="choice-letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
                <span className="choice-text">{o}</span>
                {votes?.[i]?.length ? <span className="choice-votes">{votes[i].map((n, k) => <span key={k} className="vote-pill">{n}</span>)}</span> : null}
              </>
            );
            return (
              <li key={i} className={[state, i === picked ? 'picked' : ''].filter(Boolean).join(' ') || undefined}>
                {onPick
                  ? <button type="button" className="choice-btn" aria-pressed={i === picked} onClick={() => onPick(i)}>{content}</button>
                  : content}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
