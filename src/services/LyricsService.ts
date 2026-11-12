// Categoria "Completar o refrão" (todos os modos): um verso do refrão com as últimas palavras
// escondidas, para escrever (sem opções, o Rui não as quer).
// A letra vem do LRCLIB no momento em que a música é escolhida e nunca é guardada.
// O refrão é o verso que mais se repete; se nenhum se repetir, a música não tem esta categoria.
import type { Chorus } from '../types';
import { normalize } from '../lib/util';

const API = 'https://lrclib.net/api';
const MIN_WORDS = 4;

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

interface LrcResult { artistName: string; instrumental?: boolean; plainLyrics?: string | null; syncedLyrics?: string | null }

/** O verso que mais se repete, com as 2-3 últimas palavras escondidas; null sem refrão claro. */
export function chorusFromLyrics(text: string): Chorus | null {
  // Sem pontuação no fim: não faz parte da resposta.
  const lines = text.split('\n').map((l) => l.trim().replace(/[\s,.;:!?…]+$/, '')).filter((l) => wordsOf(l).length >= MIN_WORDS);
  if (!lines.length) return null;
  const count = new Map<string, number>();
  for (const l of lines) count.set(normalize(l), (count.get(normalize(l)) || 0) + 1);
  const best = lines.reduce((a, b) => (count.get(normalize(b))! > count.get(normalize(a))! ? b : a));
  if (count.get(normalize(best))! < 2) return null; // nenhum verso se repete: sem refrão claro
  const words = wordsOf(best);
  const hide = words.length >= 7 ? 3 : 2;
  return { shown: words.slice(0, -hide).join(' '), hidden: words.slice(-hide) };
}

export class LyricsService {
  async chorusLine(artist: string, title: string): Promise<Chorus | null> {
    try {
      const res = await fetch(`${API}/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`);
      if (!res.ok) return null;
      const na = normalize(artist);
      // Só a letra do próprio artista (não de versões de outros).
      const hit = ((await res.json()) as LrcResult[]).find((r) => !r.instrumental && (r.plainLyrics || r.syncedLyrics)
        && (normalize(r.artistName).includes(na) || na.includes(normalize(r.artistName))));
      if (!hit) return null;
      return chorusFromLyrics(hit.plainLyrics || hit.syncedLyrics!.replace(/\[[^\]]*\]/g, ''));
    } catch {
      return null; // sem rede ou sem letra: a música fica sem esta categoria
    }
  }
}

export const lyrics = new LyricsService();
