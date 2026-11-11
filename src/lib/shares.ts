// Percentagens das línguas: somam sempre 100.
import type { LangKey } from '../types';
import { LANG_COLORS } from '../languages/LanguageService';

export type Shares = Partial<Record<LangKey, number>>;

const keysOf = (s: Shares) => Object.keys(s) as LangKey[];

/** Garante que as percentagens somam 100 (se estiverem todas a 0, divide por igual). */
export function normalizeShares(s: Shares): Shares {
  const keys = keysOf(s);
  const total = keys.reduce((sum, k) => sum + s[k]!, 0);
  return Object.fromEntries(keys.map((k) => [k, total > 0 ? (s[k]! / total) * 100 : 100 / keys.length]));
}

/**
 * Muda a percentagem de uma língua e reparte o resto pelas outras,
 * mantendo a proporção entre elas (ou por igual, se estiverem todas a 0).
 */
export function setShare(s: Shares, lang: LangKey, value: number): Shares {
  const others = keysOf(s).filter((k) => k !== lang);
  if (!others.length) return { [lang]: 100 };
  const v = Math.min(100, Math.max(0, value));
  const rest = 100 - v;
  const othersTotal = others.reduce((sum, k) => sum + s[k]!, 0);
  const out: Shares = {};
  for (const k of keysOf(s)) out[k] = k === lang ? v : othersTotal > 0 ? (s[k]! / othersTotal) * rest : rest / others.length;
  return out;
}

/** A nova língua entra com uma parte igual (ex.: 3 línguas -> 33%); as outras encolhem na mesma proporção. */
export const addShare = (s: Shares, lang: LangKey) => setShare({ ...s, [lang]: 0 }, lang, 100 / (keysOf(s).length + 1));

/** A parte da língua removida é repartida pelas restantes. */
export function removeShare(s: Shares, lang: LangKey) {
  const { [lang]: _, ...rest } = s;
  return normalizeShares(rest);
}

export interface ShareView { key: LangKey; weight: number; color: string; pct: number }

/** Percentagens para mostrar, arredondadas de forma a somarem sempre 100. */
export function languageShares(s: Shares): ShareView[] {
  const shares = keysOf(s).map((k, i) => ({ key: k, weight: s[k]!, color: LANG_COLORS[i % LANG_COLORS.length], pct: Math.floor(s[k]!) }));
  let missing = 100 - shares.reduce((sum, l) => sum + l.pct, 0);
  [...shares].sort((a, b) => (b.weight % 1) - (a.weight % 1)).forEach((l) => { if (missing > 0) { l.pct++; missing--; } });
  return shares;
}
