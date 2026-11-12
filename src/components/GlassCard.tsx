// Cartão de vidro por baixo da carta: o verso do refrão e/ou as opções A, B, C… (álbuns, artistas).
import type { Chorus } from '../types';

interface Props {
  /** Cor da categoria (variável --cat-*). */
  color: string;
  options?: string[];
  /** Índice da opção certa depois de revelar; -1 enquanto se joga. */
  correct?: number;
  /** Verso com as últimas palavras escondidas; aparecem ao revelar. */
  lyric?: Chorus;
  revealed?: boolean;
}

export function GlassCard({ color, options, correct = -1, lyric, revealed = false }: Props) {
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
          {options.map((o, i) => (
            <li key={i} className={correct < 0 ? undefined : i === correct ? 'correct' : 'wrong'}>
              <span className="choice-letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
              <span className="choice-text">{o}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
