// Lado A (iniciante) e lado B (experiente).
// As cores são inventadas (variáveis --cat-* em style.css); as cinco posições têm a mesma cor nos dois modos.
import type { Mode, SideKey, Track } from '../types';
import {
  AlbumChoiceCategory, AlbumNameCategory, AlbumOrderCategory, ArtistPickCategory, BeforeAfterCategory,
  Before2000Category, Category, type CategoryContext, ChorusCategory, DecadeCategory, ExactYearCategory,
  GroupOrSoloCategory, SingerCategory, TitleCategory, TrackNumberCategory, YearWindowCategory,
} from './Category';

const PINK = 'pink';
const YELLOW = 'yellow';
const BLUE = 'blue';
const ORANGE = 'orange';
const PURPLE = 'purple';

export const group = new GroupOrSoloCategory(PINK);
const title = new TitleCategory(PINK);
const decade = new DecadeCategory(ORANGE);
const near3 = new YearWindowCategory(3, PURPLE);
const exact = new ExactYearCategory(YELLOW);
const artistPick = new ArtistPickCategory(BLUE);
const trackNo = new TrackNumberCategory(BLUE);
const albumName = new AlbumNameCategory(PINK);
const albumOrder = new AlbumOrderCategory(ORANGE);
const near1 = new YearWindowCategory(1, PURPLE);

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
   * Sorteia uma categoria (todas com a mesma probabilidade: as regras não dizem a frequência).
   * Com a música, só entre as que ela permite. Devolve null se nenhuma servir.
   */
  draw(ctx: CategoryContext, track: Track | null = null, rng: () => number = Math.random): Category | null {
    const options = this.categories(ctx).filter((c) => !track || c.isAvailable(track, ctx));
    return options.length ? options[Math.floor(rng() * options.length)] : null;
  }
}

export const SIDES: Record<SideKey, CategorySide> = {
  beginner: new CategorySide('A', 'Iniciante', [group, new Before2000Category(YELLOW), new YearWindowCategory(4, BLUE), decade, new YearWindowCategory(2, PURPLE)]),
  expert: new CategorySide('B', 'Experiente', [title, exact, new SingerCategory(BLUE), decade, near3]),
};

// Modo por artista: as perguntas passam a ser sobre o artista e os seus álbuns.
export const ARTIST_SIDES: Record<SideKey, CategorySide> = {
  beginner: new CategorySide('A', 'Iniciante', [title, new BeforeAfterCategory(YELLOW), near3, new AlbumChoiceCategory(ORANGE), new ChorusCategory(PURPLE)]),
  // 3.ª cor do lado B: "Qual dos artistas?" com 2 ou mais artistas, "Nº da faixa" com um só.
  expert: new CategorySide('B', 'Experiente', (ctx) => [
    albumName, exact, ctx.artistNames.length >= 2 ? artistPick : trackNo, albumOrder, near1,
  ]),
};

/** Lado das categorias para este modo, ou null com "Sem categoria". */
export const sideFor = (mode: Mode, side: string): CategorySide | null => {
  const sides = mode === 'artists' ? ARTIST_SIDES : SIDES;
  return side in sides ? sides[side as SideKey] : null;
};

/** Todas as categorias por chave (para o histórico). */
export function categoryByKey(key: string): Category | undefined {
  const all = [...Object.values(SIDES), ...Object.values(ARTIST_SIDES)]
    .flatMap((s) => [...s.categories({ artistNames: [] }), ...s.categories({ artistNames: ['', ''] })]);
  return all.find((c) => c.key === key);
}
