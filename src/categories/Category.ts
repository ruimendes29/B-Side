// Categorias: antes de cada música sorteia-se uma.
// Cada categoria sabe a pergunta, a cor, se a música tem dados para ela e a resposta certa.
import type { ArtistFacts, Track } from '../types';
import { shuffle } from '../lib/util';
import { musicBrainz } from '../services/MusicBrainzService';
import { type CategoryTone, toneVar } from '../theme/colors';

export interface CategoryContext {
  /** Nomes dos artistas escolhidos (modo por artista). */
  artistNames: string[];
}

export abstract class Category {
  constructor(
    readonly key: string,
    readonly name: string,
    readonly ask: string,
    readonly tone: CategoryTone,
  ) {}

  /** Cor para CSS (variável --cat-*). */
  get color() { return toneVar(this.tone); }

  /** A música tem os dados de que esta categoria precisa? */
  isAvailable(_track: Track, _ctx: CategoryContext): boolean {
    return true;
  }

  /** Texto da pergunta na frente da carta (pode depender da música, ex.: opções de álbuns). */
  prompt(_track: Track | null, _ctx: CategoryContext, _rng: () => number = Math.random): string {
    return this.ask;
  }

  /** Resposta certa, para a carta revelada. */
  abstract answer(track: Track, ctx: CategoryContext): string | Promise<string>;
}

// ---------- Categorias com o ano ----------

abstract class YearCategory extends Category {
  answer(t: Track) {
    return t.year ? this.answerFor(t.year, t) : 'Ano desconhecido';
  }
  protected abstract answerFor(year: number, t: Track): string;
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

export class Before2000Category extends YearCategory {
  constructor(color: CategoryTone) { super('before2000', 'Antes de 2000?', 'Saiu antes de 2000? Sim ou não.', color); }
  protected answerFor(y: number) { return y < 2000 ? 'Sim, antes de 2000' : 'Não, 2000 ou depois'; }
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

// ---------- Título e artista ----------

export class TitleCategory extends Category {
  constructor(color: CategoryTone) { super('title', 'Título da música', 'Como se chama a música?', color); }
  answer(t: Track) { return t.title; }
}

export class SingerCategory extends Category {
  constructor(color: CategoryTone) { super('artist', 'Grupo ou cantor', 'Quem canta? Num dueto basta o artista principal.', color); }
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
  prompt(t: Track | null) { return t?.facts ? `Foi lançada antes ou depois de ${t.facts.pivot}?` : this.ask; }
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
  prompt(t: Track | null, _ctx: CategoryContext, rng: () => number = Math.random) {
    if (!t?.facts) return this.ask;
    const { albumName, studioTitles } = t.facts;
    const wrong = shuffle(studioTitles.filter((x) => x !== albumName), rng).slice(0, 2);
    return shuffle([albumName, ...wrong], rng).map((o, i) => `${'ABC'[i]} · ${o}`).join('   ');
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
  prompt(_t: Track | null, ctx: CategoryContext) {
    return ctx.artistNames.length ? ctx.artistNames.map((o, i) => `${i + 1} · ${o}`).join('   ') : this.ask;
  }
  answer(t: Track) { return this.facts(t).source; }
}

export class TrackNumberCategory extends ArtistCategory {
  constructor(color: CategoryTone) { super('track_no', 'Nº da faixa no álbum', 'Em que posição está no álbum? Vale ±1.', color); }
  isAvailable(t: Track) { return t.facts?.trackNo != null; }
  prompt(t: Track | null) { return t ? 'Qual é o número da faixa no álbum? (vale ±1)' : this.ask; }
  answer(t: Track) { return `Faixa ${this.facts(t).trackNo}`; }
}

export class ChorusCategory extends ArtistCategory {
  constructor(color: CategoryTone) { super('chorus', 'Completar o refrão', 'Escreve as palavras que faltam no verso do refrão.', color); }
  isAvailable(t: Track) { return Boolean(t.facts?.chorus); }
  prompt(t: Track | null) {
    const c = t?.facts?.chorus;
    return c ? `${c.shown} ${c.hidden.map(() => '____').join(' ')}` : this.ask;
  }
  answer(t: Track) { return this.facts(t).chorus!.hidden.join(' '); }
}
