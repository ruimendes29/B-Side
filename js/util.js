export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage indisponível */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* storage indisponível */ }
  },
};

export function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const yearOf = (date) => {
  const y = parseInt(String(date || '').slice(0, 4), 10);
  return y > 1900 ? y : null;
};

export function minYear(years) {
  const valid = years.filter((y) => y > 1900);
  return valid.length ? Math.min(...valid) : null;
}

// "Song - Remastered 2011" / "Song (2015 Remaster)" -> "Song"
const VERSION_WORDS = 'soundtrack|unreleased|remaster|remastered|version|versão|mono|stereo|edit|single|deluxe|anniversary|mix|mixed|bonus';
export function cleanTitle(name) {
  return String(name)
    .replace(new RegExp(`\\s+-\\s+[^-]*\\b(${VERSION_WORDS})\\b.*$`, 'i'), '')
    .replace(new RegExp(`\\s*[\\(\\[][^\\)\\]]*\\b(${VERSION_WORDS})\\b[^\\)\\]]*[\\)\\]]`, 'ig'), '')
    .trim();
}

// Só olha para o sufixo ("- Live", "(Remix)"), para não excluir "Live and Let Die".
const BAD_SUFFIX = /\b(live|ao vivo|en vivo|remix|karaoke|instrumental|cover|acoustic|acústico|sped up|slowed|demo|re-recorded|reprise)\b/i;
export function isBadVersion(name) {
  const parts = [...String(name).matchAll(/\(([^)]*)\)|\[([^\]]*)\]|\s-\s(.*)$/g)].map((m) => m[1] || m[2] || m[3] || '');
  return parts.some((p) => BAD_SUFFIX.test(p));
}
export const BAD_CONTEXT = /karaoke|tribute|made famous|in the style of|originally performed|workout|lullaby|8-bit|kids bop|piano version/i;

export function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\s(feat|ft)\.?\s.*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const escapeQuery = (s) => String(s).replace(/["]/g, '').trim();

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
