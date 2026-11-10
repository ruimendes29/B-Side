// Modo "Por artista": só músicas dos artistas escolhidos.
// As músicas, os excertos e a popularidade vêm da Deezer. Os álbuns vêm do MusicBrainz, porque a
// Deezer mistura álbuns de estúdio com edições de aniversário, ao vivo e compilações, e dá muitas
// vezes o ano da reedição (ex.: "Contentores" dos Xutos aparecia como 2014 em vez de 1987).
import { dzGet, isBlocked, usable } from './deezer.js';
import * as MB from './musicbrainz.js';
import { chorusLine } from './chorus.js';
import { cleanTitle, pick } from './util.js';

const indexes = new Map();

/** Discografia de um artista: álbuns de estúdio por ordem e as músicas mais ouvidas na Deezer. */
export function artistIndex(artist) {
  if (!indexes.has(artist.id)) {
    const p = buildIndex(artist);
    indexes.set(artist.id, p);
    p.catch(() => indexes.delete(artist.id)); // falhou (rede): tenta de novo mais tarde
  }
  return indexes.get(artist.id);
}

async function buildIndex(artist) {
  const [top, mbid] = await Promise.all([
    dzGet(`/artist/${artist.id}/top`, { limit: 100 }),
    MB.artistId(artist.name),
  ]);
  if (!mbid) throw new Error(`Não encontrei a discografia de ${artist.name} no MusicBrainz.`);
  const studio = await MB.studioAlbums(mbid);
  if (!studio.length) throw new Error(`O MusicBrainz não tem álbuns de estúdio de ${artist.name}.`);
  const years = studio.map((a) => a.year).sort((a, b) => a - b);
  return {
    studio,
    byId: new Map(studio.map((a) => [a.id, a])),
    tracks: (top.data || []).filter((t) => usable(t)),
    pivot: years[Math.floor(years.length / 2)], // mediana: a data de "antes ou depois de…"
  };
}

// Álbum de estúdio de cada música (null = só saiu em singles, ao vivo, compilações…).
const appearances = new Map();
function appearance(idx, artist, t) {
  if (!appearances.has(t.id)) {
    appearances.set(t.id, MB.studioAppearance(artist.name, cleanTitle(t.title) || t.title, idx.byId).catch(() => {
      appearances.delete(t.id); // erro de rede: não fica guardado
      return null;
    }));
  }
  return appearances.get(t.id);
}

/** Uma música (ao acaso) de um dos artistas, com os dados para as perguntas. */
export async function pickArtistTrack({ artists, exclude, top = 1 }) {
  let lastError = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    const src = pick(artists);
    let idx;
    try { idx = await artistIndex(src); } catch (e) { lastError = e; continue; }
    // "Só êxitos" / "Conhecidas": compara com as outras músicas deste artista.
    const ranks = idx.tracks.map((t) => t.rank || 0).sort((a, b) => a - b);
    const min = top >= 1 || !ranks.length ? 0 : ranks[Math.floor(ranks.length * (1 - top))];
    const ok = idx.tracks.filter((t) => (t.rank || 0) >= min
      && !exclude.has(`dz${t.id}`)
      && !isBlocked(t.artist?.name || src.name, t.title)
      && !isBlocked(src.name));
    if (!ok.length) continue;
    const t = pick(ok);
    const title = cleanTitle(t.title) || t.title;
    const [found, chorus] = await Promise.all([appearance(idx, src, t), chorusLine(t.artist?.name || src.name, title)]);
    if (!found) { exclude.add(`dz${t.id}`); continue; } // não está em nenhum álbum de estúdio
    return toTrack(t, src, idx, idx.byId.get(found.albumId), found.trackNo, chorus);
  }
  throw lastError || new Error('Não encontrei músicas destes artistas em álbuns de estúdio. Experimenta outros artistas ou outro filtro de fama.');
}

function toTrack(t, src, idx, album, trackNo, chorus) {
  return {
    source: 'deezer',
    id: `dz${t.id}`,
    deezerId: t.id,
    title: cleanTitle(t.title) || t.title,
    artists: [t.artist?.name || src.name],
    album: album.title,
    albumId: t.album?.id,
    year: album.year, // ano original do álbum de estúdio
    yearPromise: Promise.resolve(album.year),
    image: t.album?.cover_xl || t.album?.cover_big,
    link: t.link,
    preview: t.preview,
    durationMs: 30000,
    facts: {
      source: src.name,
      albumName: album.title,
      albumOrder: album.order,
      studioTitles: idx.studio.map((a) => a.title),
      pivot: idx.pivot,
      trackNo,
      chorus, // { shown, hidden } ou null
    },
  };
}

/** Artistas que correspondem à pesquisa: [{ id, name, picture }]. */
export async function searchArtists(q) {
  const r = await dzGet('/search/artist', { q, limit: 6 });
  return (r.data || []).map((a) => ({ id: a.id, name: a.name, picture: a.picture_small }));
}
