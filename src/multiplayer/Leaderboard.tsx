// Classificação na TV (à esquerda): coroa no primeiro lugar e, quando alguém sobe ou desce,
// a linha desliza para o lugar novo (FLIP) com um "solavanco" e uma cor rápida (verde a subir, vermelho a descer).
import { useLayoutEffect, useRef } from 'react';

export interface BoardRow { id: string; name: string; score: number }

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Leaderboard({ rows }: { rows: BoardRow[] }) {
  const els = useRef(new Map<string, HTMLLIElement>());
  const before = useRef(new Map<string, { y: number; rank: number; score: number }>());
  // Num empate ninguém perde o lugar que já tinha; quem é novo fica por ordem de entrada (sort é estável).
  const was = (id: string) => before.current.get(id)?.rank ?? Infinity;
  const sorted = [...rows].sort((a, b) => b.score - a.score || was(a.id) - was(b.id));
  const top = sorted[0]?.score ?? 0;

  useLayoutEffect(() => {
    const next = new Map<string, { y: number; rank: number; score: number }>();
    sorted.forEach((r, rank) => {
      const el = els.current.get(r.id);
      if (!el) return;
      const y = el.offsetTop; // sem transformações, ao contrário de getBoundingClientRect
      next.set(r.id, { y, rank, score: r.score });
      const old = before.current.get(r.id);
      if (!old || reduced()) return;
      if (old.y !== y) {
        el.animate([{ transform: `translateY(${old.y - y}px)` }, { transform: 'none' }],
          { duration: 600, easing: 'cubic-bezier(.3, 1.35, .5, 1)' });
      }
      if (old.rank !== rank) {
        const color = rank < old.rank ? 'rgba(30, 215, 96, .45)' : 'rgba(255, 80, 80, .4)';
        el.animate([
          { background: color, scale: 1 }, { scale: 1.06, offset: .25 }, { scale: .98, offset: .5 }, { background: 'transparent', scale: 1 },
        ], { duration: 900, easing: 'ease-out' });
      } else if (old.score !== r.score) {
        el.querySelector('.lb-score')?.animate([{ scale: 1 }, { scale: 1.5 }, { scale: 1 }], { duration: 450, easing: 'ease-out' });
      }
    });
    before.current = next;
  });

  return (
    <section className="tv-board" aria-label="Classificação">
      <h2>Classificação</h2>
      <ol>
        {sorted.map((r, i) => (
          <li key={r.id} ref={(el) => { if (el) els.current.set(r.id, el); else els.current.delete(r.id); }}>
            <span className="lb-pos">{i + 1}</span>
            <span className="lb-name">{r.name}</span>
            {top > 0 && r.score === top && <span className="lb-crown" role="img" aria-label="Primeiro lugar">👑</span>}
            <b className="lb-score">{r.score}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}
