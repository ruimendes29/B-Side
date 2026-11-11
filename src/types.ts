export type LangKey = 'en' | 'pt' | 'br' | 'es' | 'fr' | 'it' | 'de';
export type Mode = 'decades' | 'playlists' | 'artists';
export type Fame = 'any' | 'known' | 'hits';
export type BingoChoice = 'beginner' | 'expert' | 'off';
export type SideKey = Exclude<BingoChoice, 'off'>;
export type StartPoint = 'begin' | 'random';
export type Phase = 'idle' | 'loading' | 'buffering' | 'playing' | 'ready';

export interface ArtistRef { id: number; name: string; picture?: string }

export interface Settings {
  mode: Mode;
  decades: number[];
  /** Percentagens (somam 100); a ordem define a cor na barra. pt = Portugal, br = Brasil. */
  languages: Partial<Record<LangKey, number>>;
  dzPlaylist: string;
  artists: ArtistRef[];
  duration: number;
  start: StartPoint;
  noRepeat: boolean;
  /** Nomes como foram escritos; a comparação ignora maiúsculas e acentos. */
  blockedArtists: string[];
  fame: Fame;
  bingo: BingoChoice;
  ptSplit?: boolean;
}

export interface Chorus { shown: string; hidden: string[] }

/** Dados do modo por artista, para as categorias. */
export interface ArtistFacts {
  source: string;
  albumName: string;
  albumOrder: number;
  studioTitles: string[];
  pivot: number;
  trackNo: number | null;
  chorus: Chorus | null;
}

export interface Track {
  id: string;
  deezerId: number;
  title: string;
  artists: string[];
  album?: string;
  albumId?: number;
  year: number | null;
  /** Ano final (MusicBrainz + Deezer); resolve-se em segundo plano. */
  yearPromise: Promise<number | null>;
  image?: string;
  link?: string;
  preview: string;
  rank?: number;
  lang?: LangKey;
  facts?: ArtistFacts;
}

export interface HistoryEntry {
  id: string;
  title: string;
  artist: string;
  year: number | null;
  image?: string;
  link?: string;
  lang?: LangKey;
  cat?: string;
}
