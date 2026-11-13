// Modo "Por artista": só músicas dos artistas escolhidos.
// As músicas, os excertos e a popularidade vêm da Deezer. Os álbuns vêm do MusicBrainz, porque a
// Deezer mistura álbuns de estúdio com edições de aniversário, ao vivo e compilações, e dá muitas
// vezes o ano da reedição (ex.: "Contentores" dos Xutos aparecia como 2014 em vez de 1987).
import type { ArtistRef, Chorus, Track } from '../types';
import { cleanTitle, pick } from '../lib/util';
import { isGroupType } from '../categories/Category';
import { deezer, rankThreshold, type DzTrack } from './DeezerService';
import { musicBrainz, type StudioAlbum } from './MusicBrainzService';
import { lyrics } from './LyricsService';
import { BlockList } from './BlockList';

interface ArtistIndex {
  studio: StudioAlbum[];
  byId: Map<string, StudioAlbum>;
  tracks: DzTrack[];
  /** Mediana dos anos dos álbuns: a data de "antes ou depois de…". */
  pivot: number;
  /** Ano de nascimento (ou de fundação) e se é um grupo, para a idade. */
  born: number | null;
  group: boolean | null;
}

const NO_BLOCKS = new BlockList([]);

export class ArtistModeService {
  private readonly indexes = new Map<number, Promise<ArtistIndex>>();
  // Álbum de estúdio de cada música (null = só saiu em singles, ao vivo, compilações…).
  private readonly appearances = new Map<number, Promise<{ albumId: string; trackNo: number | null } | null>>();

  /** Discografia de um artista: álbuns de estúdio por ordem e as músicas mais ouvidas na Deezer. */
  private index(artist: ArtistRef) {
    if (!this.indexes.has(artist.id)) {
      const p = this.buildIndex(artist);
      this.indexes.set(artist.id, p);
      p.catch(() => this.indexes.delete(artist.id)); // falhou (rede): tenta de novo mais tarde
    }
    return this.indexes.get(artist.id)!;
  }

  private async buildIndex(artist: ArtistRef): Promise<ArtistIndex> {
    const [top, mb] = await Promise.all([deezer.artistTop(artist.id), musicBrainz.artist(artist.name)]);
    if (!mb) throw new Error(`Não encontrei a discografia de ${artist.name} no MusicBrainz.`);
    const studio = await musicBrainz.studioAlbums(mb.id);
    if (!studio.length) throw new Error(`O MusicBrainz não tem álbuns de estúdio de ${artist.name}.`);
    const years = studio.map((a) => a.year).sort((a, b) => a - b);
    return {
      studio,
      byId: new Map(studio.map((a) => [a.id, a])),
      tracks: top.filter((t) => deezer.isUsable(t, NO_BLOCKS)),
      pivot: years[Math.floor(years.length / 2)],
      born: mb.born,
      group: isGroupType(mb.type),
    };
  }

  private appearance(idx: ArtistIndex, artist: ArtistRef, t: DzTrack) {
    if (!this.appearances.has(t.id)) {
      this.appearances.set(t.id, musicBrainz.studioAppearance(artist.name, cleanTitle(t.title) || t.title, idx.byId).catch(() => {
        this.appearances.delete(t.id); // erro de rede: não fica guardado
        return null;
      }));
    }
    return this.appearances.get(t.id)!;
  }

  /** Uma música (ao acaso) de um dos artistas, com os dados para as perguntas. */
  async pickTrack({ artists, exclude, blocked, top = 1 }: { artists: ArtistRef[]; exclude: Set<string>; blocked: BlockList; top?: number }): Promise<Track> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      const src = pick(artists);
      let idx: ArtistIndex;
      try { idx = await this.index(src); } catch (e) { lastError = e; continue; }
      // "Só êxitos" / "Conhecidas": compara com as outras músicas deste artista.
      const min = rankThreshold(idx.tracks.map((t) => t.rank || 0), top);
      const ok = idx.tracks.filter((t) => (t.rank || 0) >= min
        && !exclude.has(`dz${t.id}`)
        && !blocked.has(t.artist?.name || src.name, t.title)
        && !blocked.has(src.name));
      if (!ok.length) continue;
      const t = pick(ok);
      const title = cleanTitle(t.title) || t.title;
      const [found, chorus] = await Promise.all([this.appearance(idx, src, t), lyrics.chorusLine(t.artist?.name || src.name, title)]);
      const album = found && idx.byId.get(found.albumId);
      if (!found || !album) { exclude.add(`dz${t.id}`); continue; } // não está em nenhum álbum de estúdio
      return this.toTrack(t, src, idx, album, chorus);
    }
    throw lastError instanceof Error ? lastError
      : new Error('Não encontrei músicas destes artistas em álbuns de estúdio. Experimenta outros artistas ou outro filtro de fama.');
  }

  private toTrack(t: DzTrack, src: ArtistRef, idx: ArtistIndex, album: StudioAlbum, chorus: Chorus | null): Track {
    // Outra música do mesmo artista, para "mais ou menos famosa?" (com popularidade diferente).
    const others = idx.tracks.filter((o) => o.id !== t.id && o.rank && t.rank && o.rank !== t.rank
      && cleanTitle(o.title) !== cleanTitle(t.title));
    const rival = others.length ? pick(others) : null;
    return {
      ...deezer.toTrack(t),
      artists: [t.artist?.name || src.name],
      album: album.title,
      year: album.year, // ano original do álbum de estúdio
      yearPromise: Promise.resolve(album.year),
      facts: {
        source: src.name,
        albumName: album.title,
        albumOrder: album.order,
        studioTitles: idx.studio.map((a) => a.title),
        pivot: idx.pivot,
        born: idx.born,
        group: idx.group,
        rival: rival && { title: cleanTitle(rival.title) || rival.title, rank: rival.rank! },
      },
      chorus,
    };
  }
}

export const artistMode = new ArtistModeService();
