import type { LangKey } from '../types';

export interface LanguageDefinition {
  /** Nome mostrado na interface. */
  name: string;
  /** Sigla curta (histórico, barra do topo). */
  code: string;
  /** Pesquisas de playlists na Deezer para uma década (ex.: 1980). */
  queries: (decade: number) => string[];
  /** O título da playlist tem de corresponder a isto. */
  must?: RegExp;
  /** Playlists com este título são ignoradas. */
  avoid?: RegExp;
  /** Palavras frequentes, para detetar títulos de músicas noutra língua. */
  words?: string;
  /**
   * Usa as palavras de outra língua (ex.: Brasil usa as do português).
   * Entre estas o título não chega para distinguir: decide o país do artista.
   */
  family?: LangKey;
  /** Países (ISO) cujos artistas cantam normalmente nesta língua. */
  countries: string;
}

/** Uma língua do jogo: onde procurar playlists e como reconhecer as suas músicas. */
export class Language {
  readonly name: string;
  readonly code: string;
  readonly must?: RegExp;
  readonly avoid?: RegExp;
  readonly family: LangKey;
  readonly words: Set<string> | null;
  readonly countries: string[];
  private readonly queriesFor: (decade: number) => string[];

  constructor(readonly key: LangKey, def: LanguageDefinition) {
    this.name = def.name;
    this.code = def.code;
    this.must = def.must;
    this.avoid = def.avoid;
    this.family = def.family ?? key;
    this.words = def.words ? new Set(def.words.split(' ')) : null;
    this.countries = def.countries.split(' ').filter(Boolean);
    this.queriesFor = def.queries;
  }

  queries(decade: number) {
    return this.queriesFor(decade);
  }

  /** A playlist com este título serve para esta língua? */
  acceptsPlaylist(title: string) {
    return (!this.must || this.must.test(title)) && (!this.avoid || !this.avoid.test(title));
  }
}
