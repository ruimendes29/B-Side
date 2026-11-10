// Línguas disponíveis. Para adicionar outra, junta uma entrada aqui:
//   name     nome mostrado na interface
//   code     sigla curta (histórico)
//   queries  pesquisas de playlists na Deezer para uma década (ex.: 1980)
//   must     (opcional) o título da playlist tem de corresponder a isto
//   avoid    (opcional) playlists com este título são ignoradas
//   words    palavras frequentes, para detetar títulos de músicas noutra língua
//   family   (opcional) usa as palavras de outra entrada (ex.: Brasil usa as do português);
//            entre estas o título não chega para distinguir, decide o país do artista
//   countries países (ISO) cujos artistas cantam normalmente nesta língua
import { randInt } from './util.js';

const short = (d) => (d < 2000 ? String(d).slice(2) : String(d)); // 1980 -> "80", 2010 -> "2010"
const yearIn = (d) => Math.min(d + randInt(0, 9), new Date().getFullYear());

export const LANGUAGES = {
  en: {
    name: 'Inglês',
    code: 'EN',
    queries: (d) => [`${short(d)}s hits`, `${short(d)}s greatest hits`, `best of ${short(d)}s`],
    avoid: /portug|brasil|brazil|mpb|nacional|españ|espan|castellano|latin|fran[cç]|variét|chanson|années|deutsch|schlager|ital|canzoni|anni|años|anos|k-?pop|bollywood|en mode|\d0er\b|🇵🇹|🇧🇷|🇪🇸|🇫🇷|🇨🇵|🇩🇪|🇮🇹/i,
    words: "the you me my i i'm your love baby it it's is on of and to be all what don't can't we girl boy heart night never time like just oh yeah",
    countries: 'GB US IE AU NZ CA JM',
  },
  // Portugal e Brasil são grupos à parte: cada um tem a sua percentagem e a sua fama relativa.
  pt: {
    name: 'Português (Portugal)',
    code: 'PT',
    queries: (d) => (d >= 2010
      ? [`musica portuguesa ${yearIn(d)}`, `portugal hits ${yearIn(d)}`, `musicas portuguesas mais tocadas ${yearIn(d)}`]
      : [`portugal anos ${short(d)}`, `musica portuguesa anos ${short(d)}`, `musicas portuguesas anos ${short(d)}`]),
    must: /portug|tuga|pimba|fado|lusa|🇵🇹/i,
    // "Clássicos da MPB" aparece nas pesquisas de "música portuguesa"; as "club hits" da Topsify Portugal são internacionais.
    avoid: /brasil|brazil|mpb|sertanej|pagode|forr[oó]|ax[eé]|samba|bossa|club|topsify|🇧🇷/i,
    words: 'o os as um uma do da dos das que não nao eu tu meu minha teu tua amor coração é em no na com para sem vida mais quando ser está vou',
    countries: 'PT AO MZ CV GW ST TL',
  },
  br: {
    name: 'Português (Brasil)',
    code: 'BR',
    family: 'pt',
    queries: (d) => (d >= 2010
      ? [`mais tocadas brasil ${yearIn(d)}`, `hits brasil ${yearIn(d)}`, `sertanejo ${yearIn(d)}`]
      : [`mpb anos ${short(d)}`, `rock nacional anos ${short(d)}`, `musicas brasileiras anos ${short(d)}`, `brasil anos ${short(d)}`]),
    must: /brasil|brazil|mpb|nacional|sertanej|pagode|samba|🇧🇷/i,
    avoid: /portug|tuga|pimba|fado|internacional|🇵🇹/i,
    countries: 'BR',
  },
  es: {
    name: 'Espanhol',
    code: 'ES',
    queries: (d) => [`exitos en español años ${short(d)}`, `pop en español ${short(d)}s`, `musica latina años ${short(d)}`, `pop español años ${short(d)}`],
    must: /españ|espan|castellano|latin|🇪🇸|🇲🇽/i,
    words: 'el la los las un una del que no yo tu mi te amor corazón es y en con para sin vida más cuando quiero eres',
    countries: 'ES MX AR CO CL PE VE CU PR DO UY PY BO EC GT HN SV NI CR PA',
  },
  fr: {
    name: 'Francês',
    code: 'FR',
    queries: (d) => [`chansons françaises années ${short(d)}`, `variété française années ${short(d)}`],
    must: /fran[cç]|variét|chanson|🇫🇷|🇨🇵/i,
    words: "le la les un une des du que je tu mon ma ton ta amour coeur cœur est et avec pour sans vie plus quand pas c'est suis",
    countries: 'FR BE MC',
  },
  it: {
    name: 'Italiano',
    code: 'IT',
    queries: (d) => [`canzoni italiane anni ${short(d)}`, `musica italiana anni ${short(d)}`],
    must: /itali|canzoni|🇮🇹/i,
    words: 'il lo la gli le un una di del che non io tu mio mia amore cuore è e in con per senza vita più quando sei sono',
    countries: 'IT SM',
  },
  de: {
    name: 'Alemão',
    code: 'DE',
    queries: (d) => [`deutsche hits ${short(d)}er`, `deutschpop ${short(d)}er`, `schlager ${short(d)}er`],
    must: /deutsch|schlager|german|🇩🇪/i,
    words: 'der die das ein eine und ich du mein dein liebe herz ist mit für ohne leben nicht wenn wir bin auf uns lass mich dich nur noch auch wie was bist kein zu im',
    countries: 'DE AT',
  },
};

// Cores dos segmentos da barra de proporções (tons de verde, por ordem de adição).
export const LANG_COLORS = ['#1ed760', '#0f7a36', '#9ef0bb', '#159a47', '#5fe391', '#0a5226'];

const WORD_SETS = Object.fromEntries(Object.entries(LANGUAGES).filter(([, l]) => l.words).map(([k, l]) => [k, new Set(l.words.split(' '))]));

/** Língua "base" de uma entrada: 'br' -> 'pt'. É o que detectLanguage devolve. */
export const familyOf = (lang) => LANGUAGES[lang]?.family || lang;
const hasSibling = (lang) => Object.keys(LANGUAGES).some((k) => k !== lang && familyOf(k) === familyOf(lang));

/** O título confirma a língua sozinho? Entre Portugal e Brasil nunca: decide o país do artista. */
export const titleConfirms = (lang, title) => !hasSibling(lang) && detectLanguage(title) === lang;
const LETTERS = [[/[ãõ]/, 'pt'], [/ñ/, 'es'], [/[ßäöü]/, 'de'], [/[èêë]/, 'fr'], [/[ìò]/, 'it']];

/** Tenta adivinhar a língua de um título (devolve a família: 'pt' serve para Portugal e Brasil). Só responde quando tem bastante certeza. */
export function detectLanguage(title) {
  const text = String(title).toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '');
  const words = text.split(/[^a-zà-ÿœ']+/).filter(Boolean);
  const scores = Object.fromEntries(Object.keys(WORD_SETS).map((k) => [k, 0]));
  for (const w of words) for (const k in WORD_SETS) if (WORD_SETS[k].has(w)) scores[k]++;
  for (const [re, k] of LETTERS) if (re.test(text)) scores[k] += 2;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [[best, top], [, second]] = ranked;
  return top >= 2 && top - second >= 2 ? best : null;
}

const COUNTRY_LANG = {};
for (const [k, l] of Object.entries(LANGUAGES)) for (const cc of (l.countries || '').split(' ')) if (cc) COUNTRY_LANG[cc] = k;

/**
 * O artista deste país costuma cantar na língua pedida?
 * - país desconhecido: aceita (a playlist já foi escolhida por língua), exceto entre Portugal e Brasil,
 *   onde só o país os distingue;
 * - inglês: aceita países "neutros" (ex.: ABBA, Kygo), rejeita os de outra língua da lista;
 * - outras línguas: o país tem de ser dessa língua.
 */
export function artistFits(lang, country) {
  if (!country) return !hasSibling(lang);
  const artistLang = COUNTRY_LANG[country] || null;
  if (lang === 'en') return !artistLang || artistLang === 'en';
  return artistLang === lang;
}

/** Sorteia uma língua de acordo com os pesos, ex.: { en: 90, pt: 10 }. */
export function pickLanguage(weights) {
  const entries = Object.entries(weights).filter(([k, w]) => LANGUAGES[k] && w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (!total) return null;
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r < 0) return k;
  }
  return entries.at(-1)[0];
}
