// Escolhe a próxima música conforme as definições (por língua e década, uma playlist ou por artista).
import type { Settings, Track } from '../types';
import { cleanTitle, minYear } from '../lib/util';
import { languages } from '../languages/LanguageService';
import { deezer, DeezerService } from './DeezerService';
import { musicBrainz } from './MusicBrainzService';
import { wikidata } from './WikidataService';
import { artistMode } from './ArtistModeService';
import { BlockList } from './BlockList';
import { lyrics } from './LyricsService';

// Fama: só aceita músicas entre as X% mais ouvidas na Deezer do mesmo grupo.
export const FAME = { any: 1, known: 0.5, hits: 0.2 } as const;

/** As definições mudaram durante a procura: o resultado já não interessa. */
export class StaleError extends Error {}

const inDecades = (year: number, decades: number[]) => decades.some((d) => year >= d && year < d + 10);

export class TrackPicker {
  /** Ano final: o mais antigo entre o MusicBrainz e os álbuns da Deezer. */
  private resolveYear(track: Track) {
    return Promise.all([deezer.originalYear(track), musicBrainz.firstReleaseYear(track.artists[0], track.title)])
      .then((years) => minYear(years));
  }

  /** Refrão para a categoria da letra (o modo por artista já o procura sozinho). */
  private chorus(track: Track) {
    return lyrics.chorusLine(track.artists[0], cleanTitle(track.title) || track.title);
  }

  /**
   * Confirma a língua: as playlists por língua às vezes trazem êxitos internacionais
   * (ex.: Rosalía numa playlist de música portuguesa). Usa o título e o país do artista.
   */
  private async fitsLanguage(track: Track) {
    if (!track.lang) return true;
    if (languages.titleConfirms(track.lang, track.title)) return true;
    const artist = track.artists[0];
    // Se o MusicBrainz não souber o país, pergunta à Wikidata.
    const country = (await musicBrainz.artistCountry(artist)) || (await wikidata.artistCountry(artist));
    return languages.artistFits(track.lang, country);
  }

  private async byLanguage(s: Settings, exclude: Set<string>, blocked: BlockList, decades: number[]) {
    const top = FAME[s.fame];
    const lang = languages.pick(s.languages);
    if (!lang) throw new Error('Põe pelo menos uma língua acima de 0%.');
    try {
      return await deezer.randomByLanguage({ lang, decades, exclude, blocked, top });
    } catch (e) {
      // Se uma língua não tiver nada nestas décadas, tenta as outras em vez de bloquear o jogo.
      const others = Object.fromEntries(Object.entries(s.languages).filter(([k]) => k !== lang));
      const fallback = languages.pick(others);
      if (!fallback) throw e;
      return deezer.randomByLanguage({ lang: fallback, decades, exclude, blocked, top });
    }
  }

  /**
   * Escolhe uma música. No modo por década, confirma o ano antes de aceitar:
   * as playlists misturam muitas vezes décadas ("anos 70/80/90").
   * `isStale` diz se as definições mudaram entretanto.
   */
  async pick(s: Settings, played: Set<string>, skipIds: (string | undefined)[], isStale: () => boolean): Promise<Track> {
    const exclude = new Set(s.noRepeat ? played : []);
    skipIds.forEach((id) => id && exclude.add(id));
    const blocked = new BlockList(s.blockedArtists);
    const top = FAME[s.fame];

    if (s.mode === 'artists') {
      if (!s.artists.length) throw new Error('Escolhe pelo menos um artista nas definições.');
      return artistMode.pickTrack({ artists: s.artists, exclude, blocked, top });
    }

    if (s.mode === 'playlists') {
      const id = DeezerService.parsePlaylistId(s.dzPlaylist);
      if (!id) throw new Error('Cola o link de uma playlist da Deezer nas definições.');
      // Sem filtro de fama: a playlist já é a escolha de quem joga.
      const track = await deezer.randomFromPlaylist(id, exclude, blocked);
      return { ...track, yearPromise: this.resolveYear(track), chorus: await this.chorus(track) };
    }

    const decades = [...s.decades];
    const earliest = Math.min(...decades);
    for (let attempt = 0; attempt < 15; attempt++) {
      if (isStale()) throw new StaleError('As definições mudaram.');
      const track = await this.byLanguage(s, exclude, blocked, decades);
      exclude.add(track.id);
      // Atalho barato: o ano do álbum na Deezer nunca é anterior ao original,
      // por isso se já for mais antigo do que a década mais antiga, a música não serve.
      const quick = await deezer.albumYear(track);
      if (quick && quick < earliest) continue;
      if (!(await this.fitsLanguage(track))) continue;
      const [year, chorus] = await Promise.all([this.resolveYear(track), this.chorus(track)]);
      if (year && !inDecades(year, decades)) continue;
      return { ...track, year, yearPromise: Promise.resolve(year), chorus };
    }
    throw new Error('Não encontrei músicas destas décadas e línguas. Experimenta juntar mais décadas.');
  }
}

export const trackPicker = new TrackPicker();
