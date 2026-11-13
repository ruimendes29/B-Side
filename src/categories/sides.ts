// Lado A (iniciante) e lado B (experiente).
// As cores são inventadas (variáveis --cat-* em style.css). Cada cor é a mesma pergunta nos dois lados,
// e o lado B é a versão mais apertada (ex.: amarelo = ±4 anos no A, ano exato no B).
// A letra (roxo) está em todos, com peso 2 no sorteio.
import type { Mode, Settings, SideKey, Track } from '../types';
import {
  AgeCategory, AlbumChoiceCategory, AlbumNameCategory, ArtistChoiceCategory, BeforeAfterCategory, BeforeYearCategory,
  Category, type CategoryContext, ChorusCategory, ExactYearCategory, HalfDecadeCategory, PopularityCategory,
  SingerCategory, TitleCategory, TitleChoiceCategory, YearWindowCategory,
} from './Category';

const PINK = 'pink';
const YELLOW = 'yellow';
const BLUE = 'blue';
const ORANGE = 'orange';
const PURPLE = 'purple';

// Instâncias fixas: o sorteio procura a categoria sorteada na lista do lado (indexOf).
const chorus = new ChorusCategory(PURPLE);
const exact = new ExactYearCategory(YELLOW);

export class CategorySide {
  constructor(
    readonly letter: string,
    readonly name: string,
    private readonly list: Category[] | ((ctx: CategoryContext) => Category[]),
  ) {}

  categories(ctx: CategoryContext): Category[] {
    return typeof this.list === 'function' ? this.list(ctx) : this.list;
  }

  /**
   * Sorteia uma categoria pelo peso de cada uma (a letra sai mais vezes).
   * Com a música, só entre as que ela permite. Devolve null se nenhuma servir.
   */
  draw(ctx: CategoryContext, track: Track | null = null, rng: () => number = Math.random): Category | null {
    const options = this.categories(ctx).filter((c) => !track || c.isAvailable(track, ctx));
    let x = rng() * options.reduce((sum, c) => sum + c.weight, 0);
    return options.find((c) => (x -= c.weight) < 0) ?? options.at(-1) ?? null;
  }
}

//            rosa: quem canta              amarelo: ano              azul: época                   laranja: título
export const SIDES: Record<SideKey, CategorySide> = {
  beginner: new CategorySide('A', 'Iniciante', [new ArtistChoiceCategory(PINK), new YearWindowCategory(4, YELLOW), new BeforeYearCategory(BLUE), new TitleChoiceCategory(ORANGE), chorus]),
  expert: new CategorySide('B', 'Experiente', [new SingerCategory(PINK), exact, new HalfDecadeCategory(BLUE), new TitleCategory(ORANGE), chorus]),
};

// Modo por artista: as perguntas passam a ser sobre o artista e os seus álbuns.
//            rosa: álbum                   amarelo: ano              azul: comparar                laranja: idade
export const ARTIST_SIDES: Record<SideKey, CategorySide> = {
  beginner: new CategorySide('A', 'Iniciante', [new AlbumChoiceCategory(PINK), new YearWindowCategory(3, YELLOW), new BeforeAfterCategory(BLUE), new AgeCategory(5, ORANGE), chorus]),
  expert: new CategorySide('B', 'Experiente', [new AlbumNameCategory(PINK), exact, new PopularityCategory(BLUE), new AgeCategory(2, ORANGE), chorus]),
};

/** Lado das categorias para este modo. */
export const sideFor = (mode: Mode, side: SideKey): CategorySide => (mode === 'artists' ? ARTIST_SIDES : SIDES)[side];

/** Contexto das categorias a partir das definições. */
export const contextFor = (s: Settings, pastArtists: CategoryContext['pastArtists'] = []): CategoryContext => ({
  artistNames: s.artists.map((a) => a.name),
  decades: s.mode === 'decades' ? s.decades : [],
  pastArtists,
});

/** Todas as categorias por chave (para o histórico). */
export function categoryByKey(key: string): Category | undefined {
  const all = [...Object.values(SIDES), ...Object.values(ARTIST_SIDES)]
    .flatMap((s) => s.categories({ artistNames: [], decades: [] }));
  return all.find((c) => c.key === key);
}
