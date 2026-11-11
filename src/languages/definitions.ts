// Línguas disponíveis. Para adicionar outra, junta uma entrada aqui (ver LanguageDefinition).
import type { LangKey } from '../types';
import type { LanguageDefinition } from './Language';
import { randInt } from '../lib/util';

const short = (d: number) => (d < 2000 ? String(d).slice(2) : String(d)); // 1980 -> "80", 2010 -> "2010"
const yearIn = (d: number) => Math.min(d + randInt(0, 9), new Date().getFullYear());

export const LANGUAGE_DEFINITIONS: Record<LangKey, LanguageDefinition> = {
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
