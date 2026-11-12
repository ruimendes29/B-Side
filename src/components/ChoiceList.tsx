// Opções A, B, C… por baixo da carta, em vidro (álbuns, letra, artistas).
interface Props {
  options: string[];
  /** Cor da categoria (variável --cat-*). */
  color: string;
  /** Índice da opção certa depois de revelar; -1 enquanto se joga. */
  correct?: number;
}

export function ChoiceList({ options, color, correct = -1 }: Props) {
  return (
    <ol className="choices" style={{ '--cat': color } as React.CSSProperties}>
      {options.map((o, i) => (
        <li key={i} className={correct < 0 ? undefined : i === correct ? 'correct' : 'wrong'}>
          <span className="choice-letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
          <span className="choice-text">{o}</span>
        </li>
      ))}
    </ol>
  );
}
