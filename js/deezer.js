// Deezer: pesquisa de músicas e excertos de 30 s. A API não tem CORS, por isso usamos JSONP.
import {
  pick, randInt, yearOf, minYear, cleanTitle, isBadVersion, BAD_CONTEXT, normalize, escapeQuery,
} from './util.js';
import { LANGUAGES, detectLanguage } from './languages.js';

const API = 'https://api.deezer.com';
let seq = 0;

function dz(path, params = {}) {
  return new Promise((resolve, reject) => {
    const cb = `__dz_${Date.now()}_${seq++}`;
    const script = document.createElement('script');
    const finish = (err, data) => {
      clearTimeout(timer);
      window[cb] = () => {}; // uma resposta tardia não deve rebentar
      script.remove();
      err ? reject(err) : resolve(data);
    };
    const timer = setTimeout(() => finish(new Error('A Deezer não respondeu. Tenta de novo.')), 12000);
    window[cb] = (data) => (data?.error
      ? finish(new Error(`Deezer: ${data.error.message || 'erro'}`))
      : finish(null, data));
    script.onerror = () => finish(new Error('Não foi possível contactar a Deezer.'));
    script.src = `${API}${path}?${new URLSearchParams({ ...params, output: 'jsonp', callback: cb })}`;
    document.head.appendChild(script);
  });
}

function toTrack(t) {
  return {
    source: 'deezer',
    id: `dz${t.id}`,
    deezerId: t.id,
    title: cleanTitle(t.title) || t.title,
    artists: [t.artist?.name],
    album: t.album?.title,
    albumId: t.album?.id,
    year: null,
    image: t.album?.cover_xl || t.album?.cover_big,
    link: t.link,
    preview: t.preview,
    durationMs: 30000,
  };
}

const acceptable = (t, exclude) => t.readable !== false && t.preview && !exclude.has(`dz${t.id}`)
  && !isBadVersion(t.title) && !BAD_CONTEXT.test(`${t.album?.title} ${t.artist?.name}`);

async function randomTrackFrom(playlistId, total, exclude, extra = () => true) {
  const index = total > 25 ? randInt(0, total - 25) : 0;
  const r = await dz(`/playlist/${playlistId}/tracks`, { index, limit: 25 });
  const ok = (r.data || []).filter((t) => acceptable(t, exclude) && extra(t));
  return ok.length ? toTrack(pick(ok)) : null;
}

const playlistCache = new Map();

async function playlistsFor(query, lang) {
  const key = `${lang.code}|${query}`;
  if (!playlistCache.has(key)) {
    const r = await dz('/search/playlist', { q: query, limit: 40 });
    playlistCache.set(key, (r.data || []).filter((p) => p.nb_tracks >= 20
      && (!lang.must || lang.must.test(p.title))
      && (!lang.avoid || !lang.avoid.test(p.title))));
  }
  return playlistCache.get(key);
}

/** Uma música ao acaso de uma das décadas, numa língua (chave de LANGUAGES). */
export async function randomByLanguage({ lang, decades, exclude }) {
  const L = LANGUAGES[lang];
  // Títulos claramente noutra língua são rejeitados (as playlists nem sempre são "puras").
  const sameLanguage = (t) => { const det = detectLanguage(t.title); return !det || det === lang; };
  for (let attempt = 0; attempt < 8; attempt++) {
    const lists = await playlistsFor(pick(L.queries(pick(decades))), L);
    if (!lists.length) continue;
    const p = pick(lists);
    const t = await randomTrackFrom(p.id, p.nb_tracks, exclude, sameLanguage);
    if (t) return { ...t, lang };
  }
  throw new Error(`Não encontrei músicas em ${L.name.toLowerCase()} para estas décadas. Experimenta outras décadas.`);
}

export function parsePlaylistId(input) {
  const s = String(input || '').trim();
  const m = s.match(/playlist\/(\d+)/) || s.match(/^(\d+)$/);
  return m ? m[1] : null;
}

const totals = new Map();
export async function randomFromPlaylist(id, exclude) {
  if (!totals.has(id)) totals.set(id, (await dz(`/playlist/${id}`)).nb_tracks || 0);
  for (let attempt = 0; attempt < 5; attempt++) {
    const t = await randomTrackFrom(id, totals.get(id), exclude);
    if (t) return t;
  }
  throw new Error('Não encontrei músicas novas nessa playlist da Deezer.');
}

const albumCache = new Map();
const getAlbum = (id) => {
  if (!albumCache.has(id)) albumCache.set(id, dz(`/album/${id}`).catch(() => null));
  return albumCache.get(id);
};

/** Ano do álbum desta faixa na Deezer (1 pedido). Nunca é anterior ao ano original. */
export async function albumYear(track) {
  return yearOf((await getAlbum(track.albumId))?.release_date);
}

/** Ano mais antigo entre o álbum desta faixa e outras edições da mesma música. */
export async function originalYear(track) {
  try {
    const artist = track.artists[0];
    const [album, search] = await Promise.all([
      getAlbum(track.albumId),
      // A pesquisa avançada (artist:"…") falha com apóstrofos; a simples funciona melhor.
      dz('/search', { q: `${escapeQuery(artist)} ${escapeQuery(track.title)}`, limit: 25 }),
    ]);
    const na = normalize(artist);
    const nt = normalize(track.title);
    const otherAlbums = [...new Set((search.data || [])
      .filter((x) => normalize(x.artist?.name) === na && normalize(cleanTitle(x.title)) === nt
        && !isBadVersion(x.title) && !/\blive\b/i.test(x.album?.title || ''))
      .map((x) => x.album?.id))]
      .filter((id) => id && id !== track.albumId)
      .slice(0, 6);
    const albums = await Promise.all(otherAlbums.map(getAlbum));
    return minYear([album, ...albums].map((a) => yearOf(a?.release_date)));
  } catch {
    return null;
  }
}

/** Os links de preview expiram; vai buscar um novo. */
export async function freshPreview(track) {
  const t = await dz(`/track/${track.deezerId}`);
  return t.preview;
}

// ---------- Áudio ----------

const audio = new Audio();
audio.preload = 'auto';
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let unlocked = false;

/** Chamado dentro de um clique para o iOS deixar tocar som depois. */
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  audio.src = SILENT;
  audio.play().catch(() => {});
}

export async function play(url, startSeconds) {
  if (audio.src !== url) {
    audio.src = url;
    await new Promise((resolve, reject) => {
      const ok = () => { off(); resolve(); };
      const fail = () => { off(); reject(new Error('Não foi possível carregar o excerto.')); };
      const off = () => { audio.removeEventListener('loadedmetadata', ok); audio.removeEventListener('error', fail); };
      audio.addEventListener('loadedmetadata', ok);
      audio.addEventListener('error', fail);
      audio.load();
    });
  }
  audio.currentTime = startSeconds;
  await audio.play();
}

export function stop() {
  audio.pause();
}
