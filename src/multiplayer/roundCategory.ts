// A categoria como os telemóveis a veem: sem a resposta (sem Firebase, para se poder testar).
import type { CategoryView } from '../hooks/useGame';

/** A opção certa aparece 1,2 s depois de revelar, na TV e nos telemóveis (como a resposta da TV, em style.css). */
export const RESULT_DELAY_MS = 1200;

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

/** Votos de uma resposta: quantos aprovam e quantos rejeitam (sem o voto do próprio). */
export function tally(target: string, votes: Record<string, Record<string, boolean>> = {}) {
  let approve = 0;
  let reject = 0;
  for (const [voter, v] of Object.entries(votes)) {
    if (voter === target || v?.[target] == null) continue;
    if (v[target]) approve++; else reject++;
  }
  return { approve, reject, ok: approve > reject };
}

/**
 * Quem ganha um ponto nesta ronda: nas categorias com opções, quem tocou na certa;
 * nas outras, quem tem mais aprovações do que rejeições. Só depois de revelar.
 */
export function roundWinners(
  round: { revealed: boolean; n: number; answer?: string | null; cat: RoundCategory | null; answered?: Record<string, true> | null } | undefined,
  answers: Record<string, { round: number; choice?: number }> = {},
  votes: Record<string, Record<string, boolean>> = {},
): string[] {
  if (!round?.revealed) return [];
  const options = round.cat?.options?.length && !round.cat.lyric ? round.cat.options : null;
  if (options) {
    const right = round.answer ? options.indexOf(round.answer) : -1;
    return right < 0 ? [] : Object.entries(answers).filter(([, a]) => a.round === round.n && a.choice === right).map(([id]) => id);
  }
  return Object.keys(round.answered ?? {}).filter((id) => tally(id, votes).ok);
}
