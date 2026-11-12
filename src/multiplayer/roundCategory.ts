// A categoria como os telemóveis a veem: sem a resposta (sem Firebase, para se poder testar).
import type { CategoryView } from '../hooks/useGame';

export interface RoundCategory {
  name: string;
  color: string;
  ask: string;
  options?: string[];
  /** A letra só leva o número de palavras escondidas, nunca as palavras. */
  lyric?: { shown: string; blanks: number };
}

export function publicCategory(c: CategoryView): RoundCategory {
  return {
    name: c.name, color: c.color, ask: c.ask,
    ...(c.options ? { options: c.options } : {}),
    ...(c.lyric ? { lyric: { shown: c.lyric.shown, blanks: c.lyric.hidden.length } } : {}),
  };
}
