// Categorias: antes de cada música sorteia-se uma.
// Cada categoria sabe a pergunta, a cor, se a música tem dados para ela e a resposta certa.
import type { ArtistFacts, Chorus, LangKey, Track } from '../types';
import { normalize, shuffle } from '../lib/util';
import { type CategoryTone, toneVar } from '../theme/colors';
import { titleDecoys } from '../services/TitleDecoyService';

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

  /** Pergunta para esta música (pode ter opções, ex.: álbuns; as da IA chegam mais tarde). */
  question(_track: Track, _ctx: CategoryContext, _rng: () => number = Math.random): Question | Promise<Question> {
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

/** Década e metade (ex.: "fim dos anos 80"): a versão mais apertada de "Antes de…?". */
export class HalfDecadeCategory extends YearCategory {
  constructor(color: CategoryTone) { super('half_decade', 'Início ou fim da década', 'Em que década saiu, e foi no início (0–4) ou no fim (5–9)?', color); }
  protected answerFor(y: number) {
    const d = Math.floor(y / 10) * 10;
    return `${y % 10 < 5 ? 'Início' : 'Fim'} dos anos ${d < 2000 ? String(d).slice(2) : d} (${y})`;
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
  constructor(color: CategoryTone) { super('title', 'Título da música', 'Como se chama a música? Título completo.', color); }
  answer(t: Track) { return t.title; }
}

/** Título entre quatro: o certo e três falsos parecidos, inventados pela IA. Sem IA, passa a escrever o título. */
export class TitleChoiceCategory extends Category {
  constructor(color: CategoryTone) { super('title_choice', 'Qual é o título?', 'Escolhe o título certo.', color); }
  async question(t: Track, _ctx: CategoryContext, rng: () => number = Math.random) {
    const wrong = await titleDecoys.decoys(t);
    return wrong.length === 3 ? { ask: this.ask, options: shuffle([t.title, ...wrong], rng) } : { ask: 'Como se chama a música?' };
  }
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

/** Tipo do artista no MusicBrainz -> grupo (true), solo (false) ou desconhecido (null). */
export function isGroupType(type: string | null): boolean | null {
  if (!type) return null;
  return type !== 'Person' && type !== 'Character'; // Group, Orchestra, Choir
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

/** Idade do artista (ou anos do grupo) quando saiu o álbum. Vale ±range. */
export class AgeCategory extends ArtistCategory {
  constructor(readonly range: number, color: CategoryTone) {
    super(`age${range}`, 'Idade do artista', `Que idade tinha o artista quando saiu? Vale ±${range}.`, color);
  }
  isAvailable(t: Track) { return Boolean(t.facts?.born && t.year && t.year > t.facts.born); }
  question(t: Track) {
    const f = t.facts;
    if (!f) return { ask: this.ask };
    return { ask: f.group
      ? `Há quantos anos existiam os ${f.source} quando saiu? Vale ±${this.range}.`
      : `Que idade tinha ${f.source} quando saiu? Vale ±${this.range}.` };
  }
  answer(t: Track) {
    const { born, group } = this.facts(t);
    return `${t.year! - born!} anos (${group ? 'desde' : 'nasceu em'} ${born})`;
  }
}

/** Mais ou menos famosa do que outra música do artista (popularidade da Deezer). */
export class PopularityCategory extends ArtistCategory {
  constructor(color: CategoryTone) { super('popularity', 'Mais ou menos famosa?', 'É mais ou menos famosa do que outra música do artista?', color); }
  isAvailable(t: Track) { return Boolean(t.facts?.rival && t.rank); }
  question(t: Track) { return { ask: t.facts?.rival ? `É mais ou menos famosa do que «${t.facts.rival.title}»?` : this.ask }; }
  answer(t: Track) {
    const { rival } = this.facts(t);
    return `${t.rank! > rival!.rank ? 'Mais' : 'Menos'} famosa do que «${rival!.title}»`;
  }
}
