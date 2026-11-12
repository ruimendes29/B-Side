// Deezer: pesquisa de músicas e excertos de 30 s. A API não tem CORS, por isso usamos JSONP.
import type { ArtistRef, LangKey, Track } from '../types';
import {
  pick, randInt, yearOf, minYear, cleanTitle, isBadVersion, BAD_CONTEXT, normalize, escapeQuery, store,
} from '../lib/util';
import { languages } from '../languages/LanguageService';
import type { BlockList } from './BlockList';

const API = 'https://api.deezer.com';

/** Faixa tal como a Deezer a devolve (só os campos usados). */
export interface DzTrack {
  id: number;
  title: string;
  readable?: boolean;
  preview: string;
  rank?: number;
  link?: string;
  artist?: { name: string };
  album?: { id: number; title: string; cover_xl?: string; cover_big?: string };
}
interface DzPlaylist { id: number; title: string; nb_tracks: number }
interface DzAlbum { release_date?: string }
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------- Fama relativa ----------
// A Deezer dá a cada faixa um "rank" (0 a 1 000 000) conforme é ouvida. Uma música portuguesa
// conhecida tem um rank muito mais baixo do que um êxito americano, por isso o rank não se compara
// com um valor fixo: compara-se com as outras músicas do mesmo grupo (língua + década, ou a playlist).
// Cada grupo guarda os ranks das faixas já vistas (id -> rank) no browser.
const RANK_KEEP = 400;

class RankStats {
  private readonly stats: Record<string, Record<string, number>>;
  private saveTimer = 0;

  constructor(private readonly key: string) {
    this.stats = store.get(key, {});
  }

  remember(group: string, tracks: DzTrack[]) {
    const seen = (this.stats[group] ||= {});
    for (const t of tracks) if ((t.rank ?? 0) > 0) { delete seen[t.id]; seen[t.id] = t.rank!; }
    const ids = Object.keys(seen);
    for (let i = 0; i < ids.length - RANK_KEEP; i++) delete seen[ids[i]]; // esquece os mais antigos
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => store.set(this.key, this.stats), 1000);
  }

  /** Rank mínimo para ficar entre as `top` (0–1) mais ouvidas do grupo. */
  threshold(group: string, top: number) {
    if (top >= 1) return 0;
    return rankThreshold(Object.values(this.stats[group] || {}), top);
  }
}

/** Rank mínimo para ficar entre as `top` (0–1) mais altas da lista. */
export function rankThreshold(ranks: number[], top: number) {
  if (top >= 1 || !ranks.length) return 0;
  const sorted = [...ranks].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * (1 - top))];
}

interface PickOptions { extra?: (t: DzTrack) => boolean; group?: string; top?: number }

export class DeezerService {
  private seq = 0;
  private readonly ranks: RankStats;
  private readonly playlists = new Map<string, Promise<DzPlaylist[]>>();
  private readonly totals = new Map<string, number>();
  private readonly albums = new Map<number, Promise<DzAlbum | null>>();

  constructor() {
    // 'dz_ranks2': os dados antigos ('dz_ranks') misturavam Portugal e Brasil no mesmo grupo.
    store.remove('dz_ranks');
    this.ranks = new RankStats('dz_ranks2');
  }

  /** Pedido JSONP à API da Deezer. */
  get<T = Json>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const cb = `__dz_${Date.now()}_${this.seq++}`;
      const w = window as unknown as Record<string, (data: Json) => void>;
      const script = document.createElement('script');
      const finish = (err: Error | null, data?: Json) => {
        clearTimeout(timer);
        w[cb] = () => {}; // uma resposta tardia não deve rebentar
        script.remove();
        if (err) reject(err); else resolve(data as T);
      };
      const timer = setTimeout(() => finish(new Error('A Deezer não respondeu. Tenta de novo.')), 12000);
      w[cb] = (data) => (data?.error
        ? finish(new Error(`Deezer: ${data.error.message || 'erro'}`))
        : finish(null, data));
      script.onerror = () => finish(new Error('Não foi possível contactar a Deezer.'));
      const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), output: 'jsonp', callback: cb });
      script.src = `${API}${path}?${qs}`;
      document.head.appendChild(script);
    });
  }

  /** Faixa utilizável: com excerto, legível, sem versões ao vivo/karaoke, nem excluída ou bloqueada. */
  isUsable(t: DzTrack, blocked: BlockList, exclude: Set<string> = new Set()) {
    return t.readable !== false && Boolean(t.preview) && !exclude.has(`dz${t.id}`)
      && !isBadVersion(t.title) && !BAD_CONTEXT.test(`${t.album?.title} ${t.artist?.name}`)
      && !blocked.has(t.artist?.name || '', t.title);
  }

  toTrack(t: DzTrack): Track {
    return {
      id: `dz${t.id}`,
      deezerId: t.id,
      title: cleanTitle(t.title) || t.title,
      artists: [t.artist?.name ?? ''],
      album: t.album?.title,
      albumId: t.album?.id,
      year: null,
      yearPromise: Promise.resolve(null),
      image: t.album?.cover_xl || t.album?.cover_big,
      link: t.link,
      preview: t.preview,
      rank: t.rank,
    };
  }

  private async randomTrackFrom(playlistId: number | string, total: number, exclude: Set<string>, blocked: BlockList, { extra = () => true, group, top = 1 }: PickOptions = {}) {
    const index = total > 25 ? randInt(0, total - 25) : 0;
    const r = await this.get<{ data?: DzTrack[] }>(`/playlist/${playlistId}/tracks`, { index, limit: 25 });
    const tracks = r.data || [];
    if (group) this.ranks.remember(group, tracks);
    const min = group ? this.ranks.threshold(group, top) : 0;
    const ok = tracks.filter((t) => this.isUsable(t, blocked, exclude) && extra(t) && (t.rank || 0) >= min);
    return ok.length ? this.toTrack(pick(ok)) : null;
  }

  private playlistsFor(query: string, lang: LangKey) {
    const L = languages.get(lang);
    const key = `${L.code}|${query}`;
    if (!this.playlists.has(key)) {
      const p = this.get<{ data?: DzPlaylist[] }>('/search/playlist', { q: query, limit: 40 })
        .then((r) => (r.data || []).filter((pl) => pl.nb_tracks >= 20 && L.acceptsPlaylist(pl.title)));
      p.catch(() => this.playlists.delete(key));
      this.playlists.set(key, p);
    }
    return this.playlists.get(key)!;
  }

  /** Uma música ao acaso de uma das décadas, numa língua. */
  async randomByLanguage({ lang, decades, exclude, blocked, top = 1 }: { lang: LangKey; decades: number[]; exclude: Set<string>; blocked: BlockList; top?: number }): Promise<Track> {
    const L = languages.get(lang);
    for (let attempt = 0; attempt < 8; attempt++) {
      const decade = pick(decades);
      const lists = await this.playlistsFor(pick(L.queries(decade)), lang);
      if (!lists.length) continue;
      const p = pick(lists);
      const t = await this.randomTrackFrom(p.id, p.nb_tracks, exclude, blocked, {
        extra: (x) => languages.titleCompatible(lang, x.title), group: `${lang}:${decade}`, top,
      });
      if (t) return { ...t, lang };
    }
    throw new Error(`Não encontrei músicas em ${L.name.toLowerCase()} para estas décadas. Experimenta outras décadas.`);
  }

  static parsePlaylistId(input: string) {
    const s = String(input || '').trim();
    const m = s.match(/playlist\/(\d+)/) || s.match(/^(\d+)$/);
    return m ? m[1] : null;
  }

  async randomFromPlaylist(id: string, exclude: Set<string>, blocked: BlockList): Promise<Track> {
    if (!this.totals.has(id)) this.totals.set(id, (await this.get<{ nb_tracks?: number }>(`/playlist/${id}`)).nb_tracks || 0);
    for (let attempt = 0; attempt < 8; attempt++) {
      const t = await this.randomTrackFrom(id, this.totals.get(id)!, exclude, blocked, { group: `playlist:${id}` });
      if (t) return t;
    }
    throw new Error('Não encontrei músicas novas nessa playlist da Deezer.');
  }

  private album(id: number | undefined) {
    if (!id) return Promise.resolve(null);
    if (!this.albums.has(id)) this.albums.set(id, this.get<DzAlbum>(`/album/${id}`).catch(() => null));
    return this.albums.get(id)!;
  }

  /** Ano do álbum desta faixa na Deezer (1 pedido). Nunca é anterior ao ano original. */
  async albumYear(track: Track) {
    return yearOf((await this.album(track.albumId))?.release_date);
  }

  /** Ano mais antigo entre o álbum desta faixa e outras edições da mesma música. */
  async originalYear(track: Track) {
    try {
      const artist = track.artists[0];
      const [album, search] = await Promise.all([
        this.album(track.albumId),
        // A pesquisa avançada (artist:"…") falha com apóstrofos; a simples funciona melhor.
        this.get<{ data?: DzTrack[] }>('/search', { q: `${escapeQuery(artist)} ${escapeQuery(track.title)}`, limit: 25 }),
      ]);
      const na = normalize(artist);
      const nt = normalize(track.title);
      const otherAlbums = [...new Set((search.data || [])
        .filter((x) => normalize(x.artist?.name) === na && normalize(cleanTitle(x.title)) === nt
          && !isBadVersion(x.title) && !/\blive\b/i.test(x.album?.title || ''))
        .map((x) => x.album?.id))]
        .filter((id): id is number => !!id && id !== track.albumId)
        .slice(0, 6);
      const albums = await Promise.all(otherAlbums.map((id) => this.album(id)));
      return minYear([album, ...albums].map((a) => yearOf(a?.release_date)));
    } catch {
      return null;
    }
  }

  /** Os links de preview expiram; vai buscar um novo. */
  async freshPreview(track: Track) {
    return (await this.get<DzTrack>(`/track/${track.deezerId}`)).preview;
  }

  /** As músicas mais ouvidas de um artista. */
  async artistTop(artistId: number) {
    return (await this.get<{ data?: DzTrack[] }>(`/artist/${artistId}/top`, { limit: 100 })).data || [];
  }

  /** Artistas que correspondem à pesquisa. */
  async searchArtists(q: string): Promise<ArtistRef[]> {
    const r = await this.get<{ data?: { id: number; name: string; picture_small?: string }[] }>('/search/artist', { q, limit: 6 });
    return (r.data || []).map((a) => ({ id: a.id, name: a.name, picture: a.picture_small }));
  }
}

export const deezer = new DeezerService();
