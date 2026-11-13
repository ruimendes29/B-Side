// MusicBrainz: ano da primeira edição de uma gravação, país/tipo do artista e discografia.
// O Spotify e a Deezer dão muitas vezes o ano de uma remasterização ou compilação.
import { normalize, store } from '../lib/util';
import { RequestQueue } from '../lib/RequestQueue';

const API = 'https://musicbrainz.org/ws/2';
const esc = (s: string) => String(s).replace(/[\\+\-&|!(){}[\]^"~*?:/]/g, '\\$&');
const BAD_DISAMBIGUATION = /live|demo|remix|instrumental|session|rehearsal|acoustic|karaoke/i;

export interface ArtistInfo { country: string | null; type: string | null }
export interface StudioAlbum { id: string; title: string; date: string; year: number; order: number }

interface MbRelease {
  status?: string;
  date?: string;
  'release-group'?: { id?: string; 'primary-type'?: string; 'secondary-types'?: string[] };
  media?: { 'track-offset'?: number; track?: { number?: string }[] }[];
}
interface MbRecording {
  score: number;
  title: string;
  disambiguation?: string;
  'first-release-date'?: string;
  'artist-credit'?: { name: string; joinphrase?: string }[];
  releases?: MbRelease[];
}
interface MbArtist { id: string; name: string; score: number; country?: string; type?: string; aliases?: { name: string }[]; 'life-span'?: { begin?: string } }

export class MusicBrainzService {
  // O MusicBrainz aceita no máximo ~1 pedido por segundo.
  private readonly http = new RequestQueue({ name: 'MusicBrainz', gapMs: 1100, retryStatus: 503, retries: 2, retryDelayMs: (a) => 2000 * (a + 1) });
  // País e tipo de cada artista, guardados no browser para não repetir pedidos.
  // Entradas antigas são só o país em texto ('' = desconhecido) e não têm o tipo.
  private readonly artistCache = store.get<Record<string, ArtistInfo | string>>('mb_artists', {});

  private get<T>(url: string) {
    return this.http.fetchJson<T>(url, { headers: { Accept: 'application/json' } });
  }

  private searchRecordings(artist: string, title: string) {
    const query = `recording:"${esc(title)}" AND artist:"${esc(artist)}" AND video:false`;
    return this.get<{ recordings?: MbRecording[] }>(`${API}/recording?fmt=json&limit=100&query=${encodeURIComponent(query)}`);
  }

  /** Gravações desta música deste artista (aceita duetos: "Beto" corresponde a "Rita Guerra & Beto"). */
  private matching(recs: MbRecording[], artist: string, title: string) {
    const na = normalize(artist);
    const nt = normalize(title);
    return recs.filter((rec) => {
      if (rec.score < 80 || normalize(rec.title) !== nt) return false;
      const credit = normalize((rec['artist-credit'] || []).map((c) => `${c.name} ${c.joinphrase || ''}`).join(' '));
      return ` ${credit} `.includes(` ${na} `);
    });
  }

  private async findArtist(name: string) {
    const key = normalize(name);
    const json = await this.get<{ artists?: MbArtist[] }>(`${API}/artist?fmt=json&limit=5&query=${encodeURIComponent(`artist:"${esc(name)}"`)}`);
    return (json.artists || []).find((a) => a.score >= 90
      && (normalize(a.name) === key || (a.aliases || []).some((al) => normalize(al.name) === key))) ?? null;
  }

  /**
   * Ano mais antigo de um álbum/single/EP oficial (sem compilações nem ao vivo).
   * Se não houver nenhum com data, usa a primeira edição conhecida de qualquer tipo.
   * Devolve null se o MusicBrainz não conhecer a música.
   */
  async firstReleaseYear(artist: string, title: string): Promise<number | null> {
    try {
      const json = await this.searchRecordings(artist, title);
      let best: number | null = null;
      let fallback: number | null = null;
      for (const rec of this.matching(json.recordings || [], artist, title)) {
        if (BAD_DISAMBIGUATION.test(rec.disambiguation || '')) continue;
        const first = parseInt(String(rec['first-release-date'] || '').slice(0, 4), 10);
        if (first > 1900 && (fallback == null || first < fallback)) fallback = first;
        for (const rel of rec.releases || []) {
          const rg = rel['release-group'] || {};
          if (rel.status && rel.status !== 'Official') continue;
          if (!['Album', 'Single', 'EP'].includes(rg['primary-type'] || '')) continue;
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

  private async artistInfo(name: string, { needType = false } = {}): Promise<ArtistInfo> {
    const key = normalize(name);
    const cached = this.artistCache[key];
    if (cached && typeof cached === 'object') return cached;
    if (typeof cached === 'string' && !needType) return { country: cached || null, type: null };
    try {
      const match = await this.findArtist(name);
      const info = { country: match?.country || null, type: match?.type || null };
      this.artistCache[key] = info;
      const keys = Object.keys(this.artistCache);
      if (keys.length > 3000) delete this.artistCache[keys[0]];
      store.set('mb_artists', this.artistCache);
      return info;
    } catch {
      return { country: null, type: null }; // sem rede/limite: não bloqueia
    }
  }

  /** País (código ISO, ex.: "PT") do artista, ou null se o MusicBrainz não o conhecer. */
  async artistCountry(name: string) { return (await this.artistInfo(name)).country; }

  /** Tipo do artista no MusicBrainz ("Person", "Group", "Orchestra"…), ou null. */
  async artistType(name: string) { return (await this.artistInfo(name, { needType: true })).type; }

  // ---------- Discografia (modo por artista) ----------
  // A Deezer mistura álbuns de estúdio com edições de aniversário, ao vivo e compilações, e muitas
  // vezes dá o ano da reedição. O MusicBrainz separa-os (tipos secundários) e tem a data original.

  /** Artista no MusicBrainz: identificador, ano de nascimento (ou de fundação, num grupo) e tipo. Null se não o conhecer. */
  async artist(name: string) {
    const a = await this.findArtist(name);
    return a && { id: a.id, born: parseInt(a['life-span']?.begin?.slice(0, 4) || '', 10) || null, type: a.type || null };
  }

  /** Álbuns de estúdio por ordem (sem ao vivo nem compilações). */
  async studioAlbums(mbid: string): Promise<StudioAlbum[]> {
    type Rg = { id: string; title: string; 'first-release-date'?: string; 'secondary-types'?: string[] };
    const json = await this.get<{ 'release-groups'?: Rg[] }>(`${API}/release-group?artist=${mbid}&type=album&fmt=json&limit=100`);
    return (json['release-groups'] || [])
      .filter((g) => !(g['secondary-types'] || []).length && g['first-release-date'])
      .map((g) => ({ id: g.id, title: g.title, date: g['first-release-date']!, year: parseInt(g['first-release-date']!.slice(0, 4), 10) }))
      .filter((g) => g.year > 1900)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((g, i) => ({ ...g, order: i + 1 }));
  }

  /**
   * Em que álbum de estúdio saiu primeiro esta música, e com que número de faixa.
   * Devolve null se só saiu em singles, ao vivo, compilações…
   */
  async studioAppearance(artist: string, title: string, studio: Map<string, StudioAlbum>) {
    const json = await this.searchRecordings(artist, title);
    let best: { album: StudioAlbum; date: string; trackNo: number | null } | null = null;
    for (const rec of this.matching(json.recordings || [], artist, title)) {
      for (const rel of rec.releases || []) {
        const album = studio.get(rel['release-group']?.id || '');
        if (!album) continue;
        const medium = rel.media?.[0];
        const offset = medium?.['track-offset'];
        const trackNo = Number.isInteger(offset) ? offset! + 1 : (parseInt(medium?.track?.[0]?.number || '', 10) || null);
        const date = rel.date || album.date;
        // O álbum mais antigo; dentro dele, a edição mais antiga (a lista de faixas original).
        if (!best || album.order < best.album.order || (album.order === best.album.order && date < best.date)) {
          best = { album, date, trackNo };
        }
      }
    }
    return best && { albumId: best.album.id, trackNo: best.trackNo };
  }
}

export const musicBrainz = new MusicBrainzService();
