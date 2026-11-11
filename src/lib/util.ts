export const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
export const pick = <T,>(arr: readonly T[], rng: () => number = Math.random): T => arr[Math.floor(rng() * arr.length)];
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const shuffle = <T,>(xs: readonly T[], rng: () => number = Math.random): T[] => [...xs].sort(() => rng() - 0.5);

/** localStorage com JSON; nunca rebenta (modo privado, storage cheio…). */
export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage indisponível */ }
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* storage indisponível */ }
  },
};

export function fmtTime(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const yearOf = (date: unknown): number | null => {
  const y = parseInt(String(date || '').slice(0, 4), 10);
  return y > 1900 ? y : null;
};

export function minYear(years: (number | null | undefined)[]): number | null {
  const valid = years.filter((y): y is number => !!y && y > 1900);
  return valid.length ? Math.min(...valid) : null;
}

// "Song - Remastered 2011" / "Song (2015 Remaster)" -> "Song"
const VERSION_WORDS = 'soundtrack|unreleased|remaster|remastered|version|versão|mono|stereo|edit|single|deluxe|anniversary|mix|mixed|bonus';
export function cleanTitle(name: string) {
  return String(name)
    .replace(new RegExp(`\\s+-\\s+[^-]*\\b(${VERSION_WORDS})\\b.*$`, 'i'), '')
    .replace(new RegExp(`\\s*[\\(\\[][^\\)\\]]*\\b(${VERSION_WORDS})\\b[^\\)\\]]*[\\)\\]]`, 'ig'), '')
    .trim();
}

// Só olha para o sufixo ("- Live", "(Remix)"), para não excluir "Live and Let Die".
const BAD_SUFFIX = /\b(live|ao vivo|en vivo|remix|karaoke|instrumental|cover|acoustic|acústico|sped up|slowed|demo|re-recorded|reprise)\b/i;
export function isBadVersion(name: string) {
  const parts = [...String(name).matchAll(/\(([^)]*)\)|\[([^\]]*)\]|\s-\s(.*)$/g)].map((m) => m[1] || m[2] || m[3] || '');
  return parts.some((p) => BAD_SUFFIX.test(p));
}
export const BAD_CONTEXT = /karaoke|tribute|made famous|in the style of|originally performed|workout|lullaby|8-bit|kids bop|piano version/i;

export function normalize(s: unknown) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\s(feat|ft)\.?\s.*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const escapeQuery = (s: string) => String(s).replace(/["]/g, '').trim();
