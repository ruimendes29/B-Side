// MusicBrainz: ano da primeira edição de uma gravação.
// O Spotify e a Deezer dão muitas vezes o ano de uma remasterização ou compilação.
import { normalize, sleep, store } from './util.js';

const API = 'https://musicbrainz.org/ws/2/recording';
const ARTIST_API = 'https://musicbrainz.org/ws/2/artist';
const esc = (s) => String(s).replace(/[\\+\-&|!(){}[\]^"~*?:/]/g, '\\$&');
const BAD_DISAMBIGUATION = /live|demo|remix|instrumental|session|rehearsal|acoustic|karaoke/i;

// O MusicBrainz aceita no máximo ~1 pedido por segundo.
let queue = Promise.resolve();
function throttled(url) {
  const run = queue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) return res.json();
      if (res.status !== 503 || attempt === 2) throw new Error(`MusicBrainz ${res.status}`);
      await sleep(2000 * (attempt + 1)); // limite de pedidos: esperar e tentar de novo
    }
  });
  queue = run.catch(() => {}).then(() => sleep(1100));
  return run;
}

/**
 * Ano mais antigo de um álbum/single/EP oficial (sem compilações nem ao vivo).
 * Se não houver nenhum com data, usa a primeira edição conhecida de qualquer tipo.
 * Devolve null se o MusicBrainz não conhecer a música.
 */
export async function firstReleaseYear(artist, title) {
  try {
    const query = `recording:"${esc(title)}" AND artist:"${esc(artist)}" AND video:false`;
    const json = await throttled(`${API}?fmt=json&limit=100&query=${encodeURIComponent(query)}`);
    const na = normalize(artist);
    const nt = normalize(title);
    let best = null;
    let fallback = null;
    for (const rec of json.recordings || []) {
      if (rec.score < 80 || normalize(rec.title) !== nt) continue;
      // Aceita duetos: "Beto" corresponde a "Rita Guerra & Beto".
      const credit = normalize((rec['artist-credit'] || []).map((c) => `${c.name} ${c.joinphrase || ''}`).join(' '));
      if (!` ${credit} `.includes(` ${na} `)) continue;
      if (BAD_DISAMBIGUATION.test(rec.disambiguation || '')) continue;
      const first = parseInt(String(rec['first-release-date'] || '').slice(0, 4), 10);
      if (first > 1900 && (fallback == null || first < fallback)) fallback = first;
      for (const rel of rec.releases || []) {
        const rg = rel['release-group'] || {};
        if (rel.status && rel.status !== 'Official') continue;
        if (!['Album', 'Single', 'EP'].includes(rg['primary-type'])) continue;
        if (rg['secondary-types']?.length) continue;
        const y = parseInt(String(rel.date || '').slice(0, 4), 10);
        if (y > 1900 && (best == null || y < best)) best = y;
      }
    }
    return best ?? fallback;
  } catch {
    return null;
  }
}

// País e tipo de cada artista, guardados no browser para não repetir pedidos.
// Entradas antigas são só o país em texto ('' = desconhecido) e não têm o tipo.
const artistCache = store.get('mb_artists', {});

/** { country: "PT" | null, type: "Person" | "Group" | … | null } */
async function artistInfo(name, { needType = false } = {}) {
  const key = normalize(name);
  const cached = artistCache[key];
  if (cached && typeof cached === 'object') return cached;
  if (typeof cached === 'string' && !needType) return { country: cached || null, type: null };
  try {
    const json = await throttled(`${ARTIST_API}?fmt=json&limit=5&query=${encodeURIComponent(`artist:"${esc(name)}"`)}`);
    const match = (json.artists || []).find((a) => a.score >= 90
      && (normalize(a.name) === key || (a.aliases || []).some((al) => normalize(al.name) === key)));
    artistCache[key] = { country: match?.country || null, type: match?.type || null };
    const keys = Object.keys(artistCache);
    if (keys.length > 3000) delete artistCache[keys[0]];
    store.set('mb_artists', artistCache);
    return artistCache[key];
  } catch {
    return { country: null, type: null }; // sem rede/limite: não bloqueia
  }
}

/** País (código ISO, ex.: "PT") do artista, ou null se o MusicBrainz não o conhecer. */
export const artistCountry = async (name) => (await artistInfo(name)).country;

/** Tipo do artista no MusicBrainz ("Person", "Group", "Orchestra"…), ou null. */
export const artistType = async (name) => (await artistInfo(name, { needType: true })).type;

// ---------- Discografia (modo por artista) ----------
// A Deezer mistura álbuns de estúdio com edições de aniversário, ao vivo e compilações, e muitas
// vezes dá o ano da reedição. O MusicBrainz separa-os (tipos secundários) e tem a data original.

/** Identificador do artista no MusicBrainz, ou null. */
export async function artistId(name) {
  const key = normalize(name);
  const json = await throttled(`${ARTIST_API}?fmt=json&limit=5&query=${encodeURIComponent(`artist:"${esc(name)}"`)}`);
  const match = (json.artists || []).find((a) => a.score >= 90
    && (normalize(a.name) === key || (a.aliases || []).some((al) => normalize(al.name) === key)));
  return match?.id || null;
}

/** Álbuns de estúdio por ordem: [{ id, title, year, order }] (sem ao vivo nem compilações). */
export async function studioAlbums(mbid) {
  const json = await throttled(`https://musicbrainz.org/ws/2/release-group?artist=${mbid}&type=album&fmt=json&limit=100`);
  return (json['release-groups'] || [])
    .filter((g) => !(g['secondary-types'] || []).length && g['first-release-date'])
    .map((g) => ({ id: g.id, title: g.title, date: g['first-release-date'], year: parseInt(g['first-release-date'].slice(0, 4), 10) }))
    .filter((g) => g.year > 1900)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g, i) => ({ ...g, order: i + 1 }));
}

/**
 * Em que álbum de estúdio saiu primeiro esta música, e com que número de faixa.
 * studio = Map(id do álbum -> álbum). Devolve { albumId, trackNo } ou null (só saiu em singles, ao vivo…).
 */
export async function studioAppearance(artist, title, studio) {
  const query = `recording:"${esc(title)}" AND artist:"${esc(artist)}" AND video:false`;
  const json = await throttled(`${API}?fmt=json&limit=100&query=${encodeURIComponent(query)}`);
  const na = normalize(artist);
  const nt = normalize(title);
  let best = null;
  for (const rec of json.recordings || []) {
    if (rec.score < 80 || normalize(rec.title) !== nt) continue;
    const credit = normalize((rec['artist-credit'] || []).map((c) => `${c.name} ${c.joinphrase || ''}`).join(' '));
    if (!` ${credit} `.includes(` ${na} `)) continue;
    for (const rel of rec.releases || []) {
      const album = studio.get(rel['release-group']?.id);
      if (!album) continue;
      const medium = rel.media?.[0];
      const offset = medium?.['track-offset'];
      const trackNo = Number.isInteger(offset) ? offset + 1 : (parseInt(medium?.track?.[0]?.number, 10) || null);
      const date = rel.date || album.date;
      // O álbum mais antigo; dentro dele, a edição mais antiga (a lista de faixas original).
      if (!best || album.order < best.album.order || (album.order === best.album.order && date < best.date)) {
        best = { album, date, trackNo };
      }
    }
  }
  return best && { albumId: best.album.id, trackNo: best.trackNo };
}
