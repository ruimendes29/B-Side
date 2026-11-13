// Títulos falsos para "Qual é o título?": o Gemini (Firebase AI Logic, Gemini Developer API, projeto b-side-c1322)
// inventa três títulos parecidos com o verdadeiro, para criar dúvida. Sem resposta a tempo, escreve-se o título.
// O Firebase só se carrega quando esta categoria sai, para não pesar no resto do site.
import type { Track } from '../types';
import { normalize } from '../lib/util';

const TIMEOUT_MS = 6000;
const MODEL = 'gemini-flash-lite-latest'; // rápido: a pergunta espera por ele no fim da roleta

const LANG_NAMES: Record<string, string> = {
  en: 'English', pt: 'European Portuguese', br: 'Brazilian Portuguese', es: 'Spanish', fr: 'French', it: 'Italian', de: 'German',
};

/** Pedido ao Gemini (separado para se poder testar sem rede). */
export function decoyPrompt(t: Pick<Track, 'title' | 'artists' | 'year' | 'lang'>) {
  const lang = t.lang ? LANG_NAMES[t.lang] : 'the same language as the title';
  return [
    `Real song: "${t.title}" by ${t.artists.join(', ')}${t.year ? ` (${t.year})` : ''}.`,
    'This is a party music quiz: players hear the song and must pick its real title among 4 options.',
    `Write 3 FAKE titles in ${lang} that make players doubt: close to the real one (shared or similar-sounding words,`,
    'a lyric-like phrase, same style and length). Make one of them a playful near-miss.',
    'They must not be the real title, and avoid titles of other famous songs by this artist.',
    'Answer only with a JSON array of 3 strings.',
  ].join(' ');
}

/** Fica só com títulos válidos, diferentes entre si e do verdadeiro. */
export function cleanDecoys(real: string, raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([normalize(real)]);
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const s = x.trim().replace(/^["«“]|["»”]$/g, '').trim();
    const k = normalize(s);
    if (!k || s.length > 80 || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, 3);
}

export class TitleDecoyService {
  private readonly cache = new Map<string, Promise<string[]>>();
  private model: Promise<{ generateContent: (p: string) => Promise<{ response: { text: () => string } }> }> | null = null;

  private getModel() {
    return (this.model ??= Promise.all([import('firebase/ai'), import('../multiplayer/firebaseApp')]).then(([ai, { app }]) =>
      ai.getGenerativeModel(ai.getAI(app, { backend: new ai.GoogleAIBackend() }), {
        model: MODEL,
        generationConfig: {
          temperature: 1,
          responseMimeType: 'application/json',
          responseSchema: ai.Schema.array({ items: ai.Schema.string() }),
        },
      })));
  }

  /** Três títulos falsos (ou menos, se a IA falhar ou demorar). Não lança erros. */
  decoys(t: Track): Promise<string[]> {
    if (!this.cache.has(t.id)) {
      const timeout = new Promise<string[]>((resolve) => setTimeout(() => resolve([]), TIMEOUT_MS));
      const ask = this.getModel()
        .then((m) => m.generateContent(decoyPrompt(t)))
        .then((r) => cleanDecoys(t.title, JSON.parse(r.response.text())))
        .catch((e) => { console.warn('Títulos falsos (Gemini):', e); return []; });
      const p = Promise.race([ask, timeout]);
      p.then((d) => { if (d.length < 3) this.cache.delete(t.id); }); // falhou: tenta de novo noutra vez
      this.cache.set(t.id, p);
    }
    return this.cache.get(t.id)!;
  }
}

export const titleDecoys = new TitleDecoyService();
