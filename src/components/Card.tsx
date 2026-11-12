import type { Phase, Track } from '../types';
import type { CategoryView } from '../hooks/useGame';
import { GlassCard } from './GlassCard';

interface Props {
  phase: Phase;
  track: Track | null;
  revealed: boolean;
  year: number | null | undefined;
  front: { cat: CategoryView; rolling: boolean } | null;
  answer: (CategoryView & { answer: string }) | null;
  spinning: boolean;
  onReveal: () => void;
}

const MESSAGES: Record<Phase, string> = {
  idle: 'Carrega em ▶ para começar',
  loading: 'A escolher uma música…',
  buffering: 'A preparar…',
  playing: 'Que ano é este?',
  ready: 'Já sabem? Carrega em Revelar.',
};

const catStyle = (color: string) => ({ '--cat': color }) as React.CSSProperties;

/** A carta: frente com a categoria sorteada, verso com artista, ano, título e a resposta da categoria. */
export function Card({ phase, track, revealed, year, front, answer, spinning, onReveal }: Props) {
  let msg = MESSAGES[phase];
  if (phase === 'playing' && front) msg = 'Escrevam a resposta!';
  if (spinning) msg = 'A sortear a categoria…';
  const showAnswer = revealed && year !== undefined && answer;
  const q = front && !front.rolling ? front.cat : null;
  const options = q?.options;

  return (
    <>
      <div className="card-wrap">
        <div
          className={`card${revealed ? ' flipped' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={revealed ? 'Carta revelada' : 'Carta — clica para revelar'}
          onClick={() => { if (track && !revealed) onReveal(); }}
        >
          <div className="face front">
            {front && (
              <div className={`cat${front.rolling ? ' rolling' : ''}`} style={catStyle(front.cat.color)}>
                <span className="cat-name">{front.cat.name}</span>
                <span className="cat-ask">{front.rolling ? '' : front.cat.ask}</span>
              </div>
            )}
            <div className="q" aria-hidden="true">?</div>
            <div className="eq" aria-hidden="true"><span /><span /><span /><span /><span /></div>
            <p>{msg}</p>
          </div>
          <div className={`face back${answer ? ' has-cat' : ''}`}>
            <div className="back-bg" style={{ backgroundImage: revealed && track?.image ? `url("${track.image}")` : 'none' }} />
            {revealed && track && (
              <div className="back-content">
                <div className="b-artist">{track.artists.join(', ')}</div>
                <div className="b-year">{year === undefined ? '…' : year ?? '????'}</div>
                <div className="b-title">{track.title}</div>
                {showAnswer && (
                  <div className="b-cat" style={catStyle(answer.color)}>
                    <span className="b-cat-name">{answer.name}</span>
                    <b className="b-cat-answer">{answer.answer}</b>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {q && (options?.length || q.lyric) && (
        <GlassCard color={q.color} options={options} lyric={q.lyric} revealed={Boolean(showAnswer)}
          correct={showAnswer && options ? options.indexOf(answer.answer) : -1} />
      )}
    </>
  );
}
