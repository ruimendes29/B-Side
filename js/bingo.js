// Categorias do Hitster Bingo: antes de cada música sorteia-se uma, como a bola de espelhos do jogo.
// Lado A (iniciante) e lado B (experiente), segundo as regras oficiais (hitstergame.com).
import { pick } from './util.js';

const C = {
  group: { name: 'Grupo ou solo', ask: 'É um grupo ou um artista a solo? Duetos e "feat." contam como grupo.', color: '#ff4fa3' },
  before2000: { name: 'Antes de 2000?', ask: 'Saiu antes de 2000? Sim ou não.', color: '#ffd23f' },
  near4: { name: '4 anos para cima ou para baixo', ask: 'Escreve o ano. Vale se errares por 4 anos ou menos.', color: '#3ec6ff' },
  decade: { name: 'Década', ask: 'Em que década saiu?', color: '#ff8a3d' },
  near2: { name: '2 anos para cima ou para baixo', ask: 'Escreve o ano. Vale se errares por 2 anos ou menos.', color: '#a77bff' },
  title: { name: 'Título da música', ask: 'Como se chama a música?', color: '#ff4fa3' },
  exact: { name: 'Ano exato', ask: 'Escreve o ano. Só vale o ano certo.', color: '#ffd23f' },
  artist: { name: 'Grupo ou cantor', ask: 'Quem canta? Num dueto basta o artista principal.', color: '#3ec6ff' },
  near3: { name: '3 anos para cima ou para baixo', ask: 'Escreve o ano. Vale se errares por 3 anos ou menos.', color: '#a77bff' },
};

export const SIDES = {
  beginner: { name: 'Iniciante', letter: 'A', categories: ['group', 'before2000', 'near4', 'decade', 'near2'] },
  expert: { name: 'Experiente', letter: 'B', categories: ['title', 'exact', 'artist', 'decade', 'near3'] },
};

export const category = (key) => ({ key, ...C[key] });

/** Sorteia uma categoria do lado escolhido (todas com a mesma probabilidade). */
export const drawCategory = (side) => category(pick(SIDES[side].categories));

const RANGE = { near4: 4, near3: 3, near2: 2 };
const decadeName = (y) => {
  const d = Math.floor(y / 10) * 10;
  return `Anos ${d < 2000 ? String(d).slice(2) : d}`;
};

/**
 * Resposta certa da categoria, para mostrar na carta revelada.
 * `group` é true/false/null (desconhecido).
 */
export function answer(key, { year, title, artist, group }) {
  if (key === 'title') return title;
  if (key === 'artist') return artist;
  if (key === 'group') return group == null ? 'Não sei — decidam vocês' : group ? '👥 Grupo' : '👤 Solo';
  if (!year) return 'Ano desconhecido';
  if (key === 'before2000') return year < 2000 ? 'Sim, antes de 2000' : 'Não, 2000 ou depois';
  if (key === 'decade') return decadeName(year);
  if (key === 'exact') return String(year);
  const r = RANGE[key];
  return `Vale de ${year - r} a ${year + r}`;
}

// "Rita Guerra & Beto", "Earth, Wind & Fire", "Xutos e Pontapés", "Song (feat. X)"
const SEVERAL = /\s(&|and|e|y|et|und|x|with|com|con|vs\.?)\s|,|\bfeat\.?\s|\bft\.?\s|\bfeaturing\b/i;
export const looksLikeSeveral = (artist, title) => SEVERAL.test(artist) || /\b(feat|ft)\.?\s|\bfeaturing\b/i.test(title);

/** Tipo do artista no MusicBrainz -> grupo (true), solo (false) ou desconhecido (null). */
export function isGroupType(type) {
  if (!type) return null;
  if (type === 'Person' || type === 'Character') return false;
  return true; // Group, Orchestra, Choir
}
