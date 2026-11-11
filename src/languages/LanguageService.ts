import type { LangKey } from '../types';
import { Language, type LanguageDefinition } from './Language';
import { LANGUAGE_DEFINITIONS } from './definitions';

const LETTERS: [RegExp, LangKey][] = [[/[ãõ]/, 'pt'], [/ñ/, 'es'], [/[ßäöü]/, 'de'], [/[èêë]/, 'fr'], [/[ìò]/, 'it']];

/** Registo das línguas: deteção pelo título, país do artista e sorteio por percentagens. */
export class LanguageService {
  private readonly byKey: Map<LangKey, Language>;
  private readonly countryLang = new Map<string, LangKey>();

  constructor(defs: Record<LangKey, LanguageDefinition>) {
    this.byKey = new Map(Object.entries(defs).map(([k, d]) => [k as LangKey, new Language(k as LangKey, d)]));
    for (const l of this.byKey.values()) for (const cc of l.countries) this.countryLang.set(cc, l.key);
  }

  get all(): Language[] { return [...this.byKey.values()]; }
  has(key: string): key is LangKey { return this.byKey.has(key as LangKey); }
  get(key: LangKey): Language {
    const l = this.byKey.get(key);
    if (!l) throw new Error(`Língua desconhecida: ${key}`);
    return l;
  }

  /** Há outra língua da mesma família (Portugal/Brasil)? Então só o país do artista as distingue. */
  private hasSibling(key: LangKey) {
    const fam = this.get(key).family;
    return this.all.some((l) => l.key !== key && l.family === fam);
  }

  /** Tenta adivinhar a língua de um título (devolve a família: 'pt' serve para Portugal e Brasil). Só responde quando tem bastante certeza. */
  detect(title: string): LangKey | null {
    const text = String(title).toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '');
    const words = text.split(/[^a-zà-ÿœ']+/).filter(Boolean);
    const scored = this.all.filter((l) => l.words);
    const scores = new Map<LangKey, number>(scored.map((l) => [l.key, 0]));
    for (const w of words) for (const l of scored) if (l.words!.has(w)) scores.set(l.key, scores.get(l.key)! + 1);
    for (const [re, k] of LETTERS) if (re.test(text)) scores.set(k, (scores.get(k) ?? 0) + 2);
    const [[best, top], [, second]] = [...scores].sort((a, b) => b[1] - a[1]);
    return top >= 2 && top - second >= 2 ? best : null;
  }

  /** O título confirma a língua sozinho? Entre Portugal e Brasil nunca: decide o país do artista. */
  titleConfirms(key: LangKey, title: string) {
    return !this.hasSibling(key) && this.detect(title) === key;
  }

  /** O título não está claramente noutra língua (as playlists nem sempre são "puras"). */
  titleCompatible(key: LangKey, title: string) {
    const det = this.detect(title);
    return !det || det === this.get(key).family;
  }

  /**
   * O artista deste país costuma cantar nesta língua?
   * - país desconhecido: aceita (a playlist já foi escolhida por língua), exceto entre Portugal e Brasil,
   *   onde só o país os distingue;
   * - inglês: aceita países "neutros" (ex.: ABBA, Kygo), rejeita os de outra língua da lista;
   * - outras línguas: o país tem de ser dessa língua.
   */
  artistFits(key: LangKey, country: string | null) {
    if (!country) return !this.hasSibling(key);
    const artistLang = this.countryLang.get(country) ?? null;
    if (key === 'en') return !artistLang || artistLang === 'en';
    return artistLang === key;
  }

  /** Sorteia uma língua de acordo com os pesos, ex.: { en: 90, pt: 10 }. */
  pick(weights: Partial<Record<LangKey, number>>): LangKey | null {
    const entries = Object.entries(weights).filter(([k, w]) => this.has(k) && (w ?? 0) > 0) as [LangKey, number][];
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (!total) return null;
    let r = Math.random() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r < 0) return k;
    }
    return entries.at(-1)![0];
  }
}

export const languages = new LanguageService(LANGUAGE_DEFINITIONS);

// Cores dos segmentos da barra de proporções (tons de verde, por ordem de adição).
export const LANG_COLORS = ['#1ed760', '#0f7a36', '#9ef0bb', '#159a47', '#5fe391', '#0a5226'];
