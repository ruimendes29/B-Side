// Categorias: antes de cada música sorteia-se uma.
// Cada categoria sabe a pergunta, a cor, se a música tem dados para ela e a resposta certa.
import type { ArtistFacts, Chorus, LangKey, Track } from '../types';
import { normalize, shuffle } from '../lib/util';
import { musicBrainz } from '../services/MusicBrainzService';
import { type CategoryTone, toneVar } from '../theme/colors';

export interface CategoryContext {
  /** Nomes dos artistas escolhidos (modo por artista). */
  artistNames: string[];
  /** Décadas escolhidas (modo por década); vazio nos outros modos. */
  decades: number[];
  /** Artistas das músicas já tocadas (as mais recentes primeiro), para opções erradas. */
  pastArtists?: { artist: string; lang?: LangKey }[];
}

/** Pergunta na frente da carta; `options` e `lyric` aparecem por baixo da carta, no cartão de vidro. */
export interface Question { ask: string; options?: string[]; lyric?: Chorus }

export abstract class Category {
  constructor(
    readonly key: string,
    readonly name: string,
    readonly ask: string,
    readonly tone: CategoryTone,
  ) {}

  /** Peso no sorteio: 2 sai duas vezes mais do que as outras. */
  readonly weight: number = 1;

  /** Cor para CSS (variável --cat-*). */
  get color() { return toneVar(this.tone); }

  /** A música tem os dados de que esta categoria precisa? */
  isAvailable(_track: Track, _ctx: CategoryContext): boolean {
    return true;
  }

  /** Pergunta para esta música (pode ter opções, ex.: álbuns). */
  question(_track: Track, _ctx: CategoryContext, _rng: () => number = Math.random): Question {
    return { ask: this.ask };
  }

  /** Resposta certa, para a carta revelada. */
  abstract answer(track: Track, ctx: CategoryContext): string | Promise<string>;
}

// ---------- Categorias com o ano ----------

abstract class YearCategory extends Category {
  answer(t: Track, ctx?: CategoryContext) {
    return t.year ? this.answerFor(t.year, ctx) : 'Ano desconhecido';
  }
  protected abstract answerFor(year: number, ctx?: CategoryContext): string;
}

export class YearWindowCategory extends YearCategory {
  constructor(readonly range: number, color: CategoryTone) {
    super(
      `near${range}`,
      `${range} ano${range > 1 ? 's' : ''} para cima ou para baixo`,
      range > 1 ? `Escreve o ano. Vale se errares por ${range} anos ou menos.` : 'Escreve o ano. Vale se errares por 1 ano.',
      color,
    );
  }
  protected answerFor(y: number) { return `Vale de ${y - this.range} a ${y + this.range}`; }
}

/** Ano que divide as décadas escolhidas ao meio (ex.: 80+90 -> 1990; só os 80 -> 1985). Sem décadas: 2000. */
export function pivotYear(decades: number[]) {
  const ds = [...decades].sort((a, b) => a - b);
  if (!ds.length) return 2000;
  return ds.length === 1 ? ds[0] + 5 : ds[Math.ceil(ds.length / 2)];
}

// A chave continua 'before2000' por causa do histórico guardado.
export class BeforeYearCategory extends YearCategory {
  constructor(color: CategoryTone) { super('before2000', 'Antes de…?', 'Saiu antes do ano da carta? Sim ou não.', color); }
  question(_t: Track, ctx: CategoryContext) { return { ask: `Saiu antes de ${pivotYear(ctx.decades)}? Sim ou não.` }; }
  protected answerFor(y: number, ctx?: CategoryContext) {
    const p = pivotYear(ctx?.decades ?? []);
    return y < p ? `Sim, antes de ${p}` : `Não, ${p} ou depois`;
  }
}

export class DecadeCategory extends YearCategory {
  constructor(color: CategoryTone) { super('decade', 'Década', 'Em que década saiu?', color); }
  protected answerFor(y: number) {
    const d = Math.floor(y / 10) * 10;
    return `Anos ${d < 2000 ? String(d).slice(2) : d}`;
  }
}

export class ExactYearCategory extends YearCategory {
  constructor(color: CategoryTone) { super('exact', 'Ano exato', 'Escreve o ano. Só vale o ano certo.', color); }
  protected answerFor(y: number) { return String(y); }
}

// ---------- Letra ----------

export class ChorusCategory extends Category {
  override readonly weight = 2; // o Rui quer a letra mais vezes
  constructor(color: CategoryTone) { super('chorus', 'Completar o refrão', 'Escreve as palavras que faltam no verso do refrão.', color); }
  isAvailable(t: Track) { return Boolean(t.chorus); }
  question(t: Track) { return { ask: this.ask, lyric: t.chorus ?? undefined }; }
  answer(t: Track) { return t.chorus?.hidden.join(' ') ?? '—'; }
}

// ---------- Título e artista ----------

export class TitleCategory extends Category {
  constructor(color: CategoryTone) { super('title', 'Título da música', 'Como se chama a música?', color); }
  answer(t: Track) { return t.title; }
}

export class SingerCategory extends Category {
  constructor(color: CategoryTone) { super('artist', 'Grupo ou cantor', 'Quem canta? Num dueto basta o artista principal.', color); }
  answer(t: Track) { return t.artists.join(', '); }
}

/** Quem canta, entre três artistas: o certo e dois de músicas já tocadas na mesma língua. */
export class ArtistChoiceCategory extends Category {
  constructor(color: CategoryTone) { super('artist_choice', 'Quem canta?', 'Escolhe entre três artistas.', color); }

  /** Artistas diferentes das últimas músicas tocadas, sem o desta (nem duetos com ele). */
  private others(t: Track, ctx: CategoryContext) {
    const own = normalize(t.artists[0] || '');
    const seen = new Set<string>();
    return (ctx.pastArtists ?? []).slice(0, 100)
      .filter((h) => !t.lang || h.lang === t.lang) // outra língua denunciava a resposta
      .map((h) => h.artist)
      .filter((a) => {
        const k = normalize(a);
        if (!own || !k || k.includes(own) || own.includes(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }

  isAvailable(t: Track, ctx: CategoryContext) { return this.others(t, ctx).length >= 2; }
  question(t: Track, ctx: CategoryContext, rng: () => number = Math.random) {
    const wrong = shuffle(this.others(t, ctx), rng).slice(0, 2);
    return { ask: this.ask, options: shuffle([this.answer(t), ...wrong], rng) };
  }
  answer(t: Track) { return t.artists.join(', '); }
}

// "Rita Guerra & Beto", "Earth, Wind & Fire", "Xutos e Pontapés", "Song (feat. X)"
const SEVERAL = /\s(&|and|e|y|et|und|x|with|com|con|vs\.?)\s|,|\bfeat\.?\s|\bft\.?\s|\bfeaturing\b/i;
export const looksLikeSeveral = (artist: string, title: string) => SEVERAL.test(artist) || /\b(feat|ft)\.?\s|\bfeaturing\b/i.test(title);

/** Tipo do artista no MusicBrainz -> grupo (true), solo (false) ou desconhecido (null). */
export function isGroupType(type: string | null): boolean | null {
  if (!type) return null;
  return type !== 'Person' && type !== 'Character'; // Group, Orchestra, Choir
}

export class GroupOrSoloCategory extends Category {
  private readonly cache = new Map<string, Promise<boolean | null>>();

  constructor(color: CategoryTone) { super('group', 'Grupo ou solo', 'É um grupo ou um artista a solo? Duetos e "feat." contam como grupo.', color); }

  /** Grupo (true), solo (false) ou desconhecido (null). Duetos e "feat." contam como grupo. */
  isGroup(t: Track) {
    if (!this.cache.has(t.id)) {
      const artist = t.artists[0] || '';
      this.cache.set(t.id, looksLikeSeveral(artist, t.title)
        ? Promise.resolve(true)
        : musicBrainz.artistType(artist).then(isGroupType));
    }
    return this.cache.get(t.id)!;
  }

  async answer(t: Track) {
    const group = await this.isGroup(t);
    return group == null ? 'Não sei — decidam vocês' : group ? '👥 Grupo' : '👤 Solo';
  }
}

// ---------- Modo por artista ----------
// Perguntas sobre o artista e os seus álbuns de estúdio. Precisam de track.facts.

abstract class ArtistCategory extends Category {
  protected facts(t: Track): ArtistFacts {
    if (!t.facts) throw new Error(`A categoria "${this.name}" só existe no modo por artista.`);
    return t.facts;
  }
  isAvailable(t: Track, _ctx: CategoryContext) { return Boolean(t.facts); }
}

export class BeforeAfterCategory extends ArtistCategory {
  constructor(color: CategoryTone) { super('before_after', 'Antes ou depois de…', 'Foi lançada antes ou depois de uma data?', color); }
  isAvailable(t: Track) { return Boolean(t.facts && t.facts.studioTitles.length >= 2); }
  question(t: Track) { return { ask: t.facts ? `Foi lançada antes ou depois de ${t.facts.pivot}?` : this.ask }; }
  answer(t: Track) {
    const { pivot } = this.facts(t);
    if (t.year === pivot) return `No mesmo ano (${t.year})`;
    return t.year! < pivot ? `Antes (${t.year})` : `Depois (${t.year})`;
  }
}

export class AlbumNameCategory extends ArtistCategory {
  constructor(color: CategoryTone) { super('album_name', 'Nome do álbum', 'Em que álbum de estúdio está?', color); }
  answer(t: Track) { return this.facts(t).albumName; }
}

export class AlbumChoiceCategory extends ArtistCategory {
  constructor(color: CategoryTone) { super('album_choice', 'Qual é o álbum?', 'Escolhe entre três álbuns de estúdio.', color); }
  isAvailable(t: Track) { return Boolean(t.facts && t.facts.studioTitles.length >= 3); }
  question(t: Track, _ctx: CategoryContext, rng: () => number = Math.random) {
    if (!t.facts) return { ask: this.ask };
    const { albumName, studioTitles } = t.facts;
    const wrong = shuffle(studioTitles.filter((x) => x !== albumName), rng).slice(0, 2);
    return { ask: 'Em que álbum de estúdio está?', options: shuffle([albumName, ...wrong], rng) };
  }
  answer(t: Track) { return this.facts(t).albumName; }
}

export class AlbumOrderCategory extends ArtistCategory {
  constructor(color: CategoryTone) { super('album_order', 'Que álbum é?', 'Qual é a ordem do álbum na discografia? (1.º é o primeiro)', color); }
  isAvailable(t: Track) { return Boolean(t.facts && t.facts.studioTitles.length >= 2); }
  answer(t: Track) { return `${this.facts(t).albumOrder}.º álbum de estúdio`; }
}

export class ArtistPickCategory extends ArtistCategory {
  constructor(color: CategoryTone) { super('artist_pick', 'Qual dos artistas?', 'Quem canta esta música?', color); }
  isAvailable(t: Track, ctx: CategoryContext) { return Boolean(t.facts) && ctx.artistNames.length >= 2; }
  question(_t: Track, ctx: CategoryContext) { return { ask: this.ask, options: ctx.artistNames }; }
  answer(t: Track) { return this.facts(t).source; }
}

export class TrackNumberCategory extends ArtistCategory {
  constructor(color: CategoryTone) { super('track_no', 'Nº da faixa no álbum', 'Em que posição está no álbum? Vale ±1.', color); }
  isAvailable(t: Track) { return t.facts?.trackNo != null; }
  question() { return { ask: 'Qual é o número da faixa no álbum? (vale ±1)' }; }
  answer(t: Track) { return `Faixa ${this.facts(t).trackNo}`; }
}
