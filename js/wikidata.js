// Wikidata: país de um artista quando o MusicBrainz não o conhece.
// A API aceita pedidos do browser (origin=*), por isso não é preciso servidor.
import { normalize, sleep, store } from './util.js';

const API = 'https://www.wikidata.org/w/api.php';

// Item da Wikidata -> código ISO. Os mais comuns ficam aqui; os outros vão buscar-se (P297).
const ISO = {
  Q45: 'PT', Q155: 'BR', Q30: 'US', Q145: 'GB', Q183: 'DE', Q142: 'FR', Q29: 'ES', Q38: 'IT',
  Q16: 'CA', Q408: 'AU', Q27: 'IE', Q664: 'NZ', Q96: 'MX', Q414: 'AR', Q34: 'SE', Q20: 'NO',
  Q55: 'NL', Q31: 'BE', Q40: 'AT', Q39: 'CH', Q35: 'DK', Q33: 'FI', Q766: 'JM', Q739: 'CO',
  Q298: 'CL', Q916: 'AO', Q1029: 'MZ', Q1011: 'CV', Q1007: 'GW', Q574: 'TL', Q1039: 'ST',
};

// Ocupações (P106) e tipos (P31) que indicam um artista de música.
const MUSIC_JOBS = new Set(['Q177220', 'Q639669', 'Q36834', 'Q488205', 'Q753110', 'Q2252262', 'Q130857', 'Q183945', 'Q855091', 'Q2643890', 'Q1259917']);
const MUSIC_TYPES = new Set(['Q215380', 'Q5741069', 'Q2088357', 'Q9212979', 'Q641066', 'Q216337', 'Q281643']);
const MUSIC_DESC = /\b(singer|band|musician|rapper|group|duo|trio|composer|songwriter|dj|producer|orchestra|cantor|cantora|banda|músic[oa]|grupo|compositor|fadista|sambista|sertanejo)\b/i;

// A Wikidata recusa pedidos muito seguidos (429): um de cada vez, com uma pausa.
let queue = Promise.resolve();
function get(params) {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`;
  const run = queue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url);
      if (res.ok) return res.json();
      if (res.status !== 429 || attempt === 1) throw new Error(`Wikidata ${res.status}`);
      await sleep(2000);
    }
  });
  queue = run.catch(() => {}).then(() => sleep(300));
  return run;
}

const ids = (claims, prop) => (claims?.[prop] || []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);

function isMusician(entity) {
  const c = entity.claims || {};
  if (ids(c, 'P106').some((q) => MUSIC_JOBS.has(q)) || ids(c, 'P31').some((q) => MUSIC_TYPES.has(q))) return true;
  return Object.values(entity.descriptions || {}).some((d) => MUSIC_DESC.test(d.value));
}

// Nacionalidade escrita na descrição (inglês ou português) -> ISO.
const DEMONYMS = [
  [/s[aã]o[- ]tom[ée]an|s[aã]o[- ]tomense/i, 'ST'], [/cape verdean|cabo[- ]verdian/i, 'CV'],
  [/brazilian|brasileir/i, 'BR'], [/portuguese|portugu[eê]s|portuguesa/i, 'PT'], [/angolan|angolan[oa]/i, 'AO'],
  [/mozambican|mo[cç]ambican[oa]/i, 'MZ'], [/guinea-bissau|guineense/i, 'GW'], [/timorese|timorense/i, 'TL'],
  [/spanish|espanhol/i, 'ES'], [/mexican|mexican[oa]/i, 'MX'], [/argentin/i, 'AR'], [/colombian/i, 'CO'],
  [/french|franc[eê]s/i, 'FR'], [/italian|italian[oa]/i, 'IT'], [/german|alem[aã]/i, 'DE'], [/austrian/i, 'AT'],
  [/british|english|scottish|welsh|ingl[eê]s/i, 'GB'], [/irish/i, 'IE'], [/canadian/i, 'CA'],
  [/australian/i, 'AU'], [/jamaican/i, 'JM'], [/swedish|sueco/i, 'SE'], [/norwegian/i, 'NO'],
  [/dutch|holand[eê]s/i, 'NL'], [/belgian|belga/i, 'BE'], [/american|norte-american/i, 'US'],
];
function fromDescription(entity) {
  for (const d of Object.values(entity.descriptions || {})) {
    const hit = DEMONYMS.find(([re]) => re.test(d.value));
    if (hit) return hit[1];
  }
  return null;
}

async function isoOf(qid) {
  if (!(qid in ISO)) {
    const json = await get({ action: 'wbgetentities', ids: qid, props: 'claims' });
    const code = json.entities?.[qid]?.claims?.P297?.[0]?.mainsnak?.datavalue?.value;
    ISO[qid] = code ? code.toUpperCase() : null;
  }
  return ISO[qid];
}

// Guardado no browser: nome -> ISO ('' = a Wikidata não sabe). Falhas de rede não são guardadas.
const cache = store.get('wd_artists', {});

/** País (ISO, ex.: "BR") do artista segundo a Wikidata, ou null. */
export async function artistCountry(name) {
  const key = normalize(name);
  if (key in cache) return cache[key] || null;
  try {
    const found = await get({ action: 'wbsearchentities', search: name, language: 'en', uselang: 'en', type: 'item', limit: 7 });
    const qids = (found.search || []).map((s) => s.id);
    let country = '';
    if (qids.length) {
      const json = await get({ action: 'wbgetentities', ids: qids.join('|'), props: 'claims|descriptions', languages: 'en|pt' });
      // O primeiro resultado que é músico ou banda (e não um álbum com o mesmo nome).
      const artist = qids.map((q) => json.entities?.[q]).find((e) => e && isMusician(e));
      const c = artist?.claims;
      // Bandas: país de origem (P495); pessoas: nacionalidade (P27); por fim, país (P17).
      const qid = [...ids(c, 'P495'), ...ids(c, 'P27'), ...ids(c, 'P17')][0];
      if (qid) country = (await isoOf(qid)) || '';
      // Sem país nos dados, a descrição às vezes diz-o (ex.: Calema: "São-Toméan musical duo").
      if (!country && artist) country = fromDescription(artist) || '';
    }
    cache[key] = country;
    const keys = Object.keys(cache);
    if (keys.length > 3000) delete cache[keys[0]];
    store.set('wd_artists', cache);
    return country || null;
  } catch {
    return null; // sem rede ou limite de pedidos: conta como desconhecido, sem guardar
  }
}
