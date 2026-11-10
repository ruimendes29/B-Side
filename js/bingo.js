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

// ---------- Modo artistas ----------
// Mesmas cores e posições que no jogo normal; as perguntas passam a ser sobre o artista e os seus álbuns.
Object.assign(C, {
  before_after: { name: 'Antes ou depois de…', ask: 'Foi lançada antes ou depois de uma data?', color: '#ffd23f' },
  album_name: { name: 'Nome do álbum', ask: 'Em que álbum de estúdio está?', color: '#ff4fa3' },
  album_choice: { name: 'Qual é o álbum?', ask: 'Escolhe entre três álbuns de estúdio.', color: '#ff8a3d' },
  album_order: { name: 'Que álbum é?', ask: 'Qual é a ordem do álbum na discografia? (1.º é o primeiro)', color: '#ff8a3d' },
  artist_pick: { name: 'Qual dos artistas?', ask: 'Quem canta esta música?', color: '#3ec6ff' },
  track_no: { name: 'Nº da faixa no álbum', ask: 'Em que posição está no álbum? Vale ±1.', color: '#3ec6ff' },
  near1: { name: '1 ano para cima ou para baixo', ask: 'Escreve o ano. Vale se errares por 1 ano.', color: '#a77bff' },
  chorus: { name: 'Completar o refrão', ask: 'Escreve as palavras que faltam no verso do refrão.', color: '#a77bff' },
});

export const ARTIST_SIDES = {
  beginner: { name: 'Iniciante', letter: 'A', categories: ['title', 'before_after', 'near3', 'album_choice', 'chorus'] },
  expert: { name: 'Experiente', letter: 'B', categories: ['album_name', 'exact', 'slot3', 'album_order', 'near1'] },
};

// 'slot3' é a 3.ª cor do lado B: "Qual dos artistas?" com 2 ou mais artistas, "Nº da faixa" com um só.
export const artistKeys = (side, nArtists) => ARTIST_SIDES[side].categories
  .map((k) => (k === 'slot3' ? (nArtists >= 2 ? 'artist_pick' : 'track_no') : k));

// Só se sorteia uma categoria para a qual a música tem dados.
const available = (key, f, nArtists) => {
  switch (key) {
    case 'before_after':
    case 'album_order': return f.studioTitles.length >= 2;
    case 'album_choice': return f.studioTitles.length >= 3;
    case 'artist_pick': return nArtists >= 2;
    case 'track_no': return f.trackNo != null;
    case 'chorus': return Boolean(f.chorus);
    default: return true;
  }
};

const shuffle = (xs, rng) => [...xs].sort(() => rng() - 0.5);

/** Sorteia uma categoria do lado escolhido entre as que esta música permite. */
export function drawArtistCategory(side, facts, artistNames, rng = Math.random) {
  const keys = artistKeys(side, artistNames.length).filter((k) => available(k, facts, artistNames.length));
  return artistCategory(keys[Math.floor(rng() * keys.length)], facts, artistNames, rng);
}

/** Categoria pronta para a carta: as opções (álbuns, artistas) e a pergunta com a data concreta. */
export function artistCategory(key, facts, artistNames, rng = Math.random) {
  const base = category(key);
  switch (key) {
    case 'before_after': return { ...base, ask: `Foi lançada antes ou depois de ${facts.pivot}?` };
    case 'album_choice': {
      const wrong = shuffle(facts.studioTitles.filter((t) => t !== facts.albumName), rng).slice(0, 2);
      const options = shuffle([facts.albumName, ...wrong], rng);
      return { ...base, ask: options.map((o, i) => `${'ABC'[i]} · ${o}`).join('   ') };
    }
    case 'artist_pick':
      return { ...base, ask: artistNames.map((o, i) => `${i + 1} · ${o}`).join('   ') };
    case 'track_no': return { ...base, ask: `Qual é o número da faixa no álbum? (vale ±1)` };
    case 'chorus': return { ...base, ask: `${facts.chorus.shown} ${facts.chorus.hidden.map(() => '____').join(' ')}` };
    default: return base;
  }
}

const WINDOW = { near1: 1, near2: 2, near3: 3 };

/** Resposta da categoria, para a carta revelada. t = música (com title, year e facts). */
export function artistAnswer(key, t) {
  const f = t.facts;
  if (key in WINDOW) return `Vale de ${t.year - WINDOW[key]} a ${t.year + WINDOW[key]}`;
  switch (key) {
    case 'title': return t.title;
    case 'exact': return String(t.year);
    case 'before_after':
      if (t.year === f.pivot) return `No mesmo ano (${t.year})`;
      return t.year < f.pivot ? `Antes (${t.year})` : `Depois (${t.year})`;
    case 'album_name':
    case 'album_choice': return f.albumName;
    case 'album_order': return `${f.albumOrder}.º álbum de estúdio`;
    case 'artist_pick': return f.source;
    case 'track_no': return `Faixa ${f.trackNo}`;
    case 'chorus': return f.chorus.hidden.join(' ');
    default: return '—';
  }
}
