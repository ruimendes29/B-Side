import { useEffect, useState } from 'react';
import { fmtTime } from '../lib/util';
import type { Clip } from '../hooks/useGame';

/** Barra de progresso do excerto; anima só enquanto toca e fica parada onde estava. */
export function Progress({ clip, playing, defaultMs }: { clip: Clip | null; playing: boolean; defaultMs: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!clip) { setElapsed(0); return; }
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const e = Math.min(performance.now() - clip.startedAt, clip.durationMs);
      setElapsed(e);
      if (e < clip.durationMs) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [clip, playing]);

  const total = clip?.durationMs ?? defaultMs;
  return (
    <div className="progress">
      <span>{fmtTime(elapsed)}</span>
      <div className="bar"><div className="fill" style={{ width: `${clip ? (elapsed / total) * 100 : 0}%` }} /></div>
      <span>{fmtTime(total)}</span>
    </div>
  );
}
