import { $, $$, store, randInt, fmtTime, escapeHtml, minYear, sleep, normalize } from './util.js';
import * as DZ from './deezer.js';
import * as MB from './musicbrainz.js';
import * as WD from './wikidata.js';
import { LANGUAGES, LANG_COLORS, pickLanguage, titleConfirms, artistFits } from './languages.js';
import * as Bingo from './bingo.js';
import * as AR from './artists.js';

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
// Fama: só aceita músicas entre as X% mais ouvidas na Deezer da mesma língua e década.
const FAME = { any: 1, known: 0.5, hits: 0.2 };
const DEFAULTS = {
  mode: 'decades',
  decades: [1970, 1980, 1990, 2000, 2010],
  languages: { en: 50, pt: 50 }, // pt = Portugal, br = Brasil; percentagens (somam 100); a ordem define a cor na barra
  dzPlaylist: '',
  artists: [], // modo "Por artista": [{ id, name }]
  duration: 10,
  start: 'random',
  noRepeat: true,
  blockedArtists: [], // nomes como foram escritos; a comparação ignora maiúsculas e acentos
  fame: 'known', // any | known | hits
  bingo: 'beginner', // beginner (lado A) | expert (lado B) | off
};
const saved = store.get('settings', {});
// Antes, "Português" incluía Portugal e Brasil: nas definições guardadas, a percentagem é repartida pelos dois.
if (saved.languages?.pt > 0 && !saved.ptSplit && !('br' in saved.languages)) {
  saved.languages = { ...saved.languages, pt: saved.languages.pt / 2, br: saved.languages.pt / 2 };
}
const settings = { ...DEFAULTS, ...saved, ptSplit: true };
if (!['decades', 'playlists', 'artists'].includes(settings.mode)) settings.mode = 'decades';
if (!Array.isArray(settings.artists)) settings.artists = [];
settings.artists = settings.artists.filter((a) => a && a.id && a.name);
if (!(settings.fame in FAME)) settings.fame = DEFAULTS.fame;
if (!(settings.bingo in Bingo.SIDES) && settings.bingo !== 'off') settings.bingo = DEFAULTS.bingo;
settings.languages = Object.fromEntries(Object.entries(settings.languages || {}).filter(([k]) => LANGUAGES[k]));
if (!Object.keys(settings.languages).length) settings.languages = { ...DEFAULTS.languages };
normalizeShares();

if (!Array.isArray(settings.blockedArtists)) settings.blockedArtists = [];
DZ.setBlockedArtists(settings.blockedArtists);

let history = store.get('history', []);
let played = new Set(store.get('played', []));

const S = {
  track: null,
  phase: 'idle', // idle | loading | buffering | playing | ready
  revealed: false,
  round: 0,
  playId: 0,
  raf: 0,
  stopTimer: 0,
  next: null, // música pré-carregada: Promise
  category: null, // categoria do Bingo sorteada nesta ronda
  spinning: false,
  spinId: 0,
};

// ---------- Definições ----------

// Sobe sempre que muda algo que afeta a escolha das músicas (décadas, línguas…).
let settingsGen = 0;

function saveSettings({ keepPrefetch = false } = {}) {
  store.set('settings', settings);
  if (!keepPrefetch) invalidateNext();
  renderSettings();
}

/** Descarta a próxima música já escolhida e escolhe outra com as definições novas. */
let prefetchTimer = 0;
function invalidateNext() {
  settingsGen++;
  S.next = null;
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(prefetch, 400); // espera que acabes de clicar
}

const decadeLabel = (d) => (d < 2000 ? `${String(d).slice(2)}s` : `${d}s`);

function languageShares() {
  const shares = Object.entries(settings.languages).map(([k, w], i) => ({
    key: k, weight: w, color: LANG_COLORS[i % LANG_COLORS.length], pct: Math.floor(w),
  }));
  // Arredonda de forma a que as percentagens mostradas somem sempre 100.
  let missing = 100 - shares.reduce((s, l) => s + l.pct, 0);
  [...shares].sort((a, b) => (b.weight % 1) - (a.weight % 1)).forEach((l) => { if (missing > 0) { l.pct++; missing--; } });
  return shares;
}

/** Garante que as percentagens somam 100 (se estiverem todas a 0, divide por igual). */
function normalizeShares() {
  const keys = Object.keys(settings.languages);
  const total = keys.reduce((s, k) => s + settings.languages[k], 0);
  for (const k of keys) settings.languages[k] = total > 0 ? (settings.languages[k] / total) * 100 : 100 / keys.length;
}

/**
 * Muda a percentagem de uma língua e reparte o resto pelas outras,
 * mantendo a proporção entre elas (ou por igual, se estiverem todas a 0).
 */
function setShare(lang, value) {
  const langs = settings.languages;
  const others = Object.keys(langs).filter((k) => k !== lang);
  if (!others.length) { langs[lang] = 100; return; }
  const v = Math.min(100, Math.max(0, value));
  const rest = 100 - v;
  const othersTotal = others.reduce((s, k) => s + langs[k], 0);
  for (const k of others) langs[k] = othersTotal > 0 ? (langs[k] / othersTotal) * rest : rest / others.length;
  langs[lang] = v;
}

function renderSettings() {
  $$('.segmented').forEach((seg) => {
    $$('button', seg).forEach((b) => b.setAttribute('aria-pressed', String(settings[seg.dataset.setting] === b.dataset.value)));
  });
  $$('[data-show]').forEach((node) => {
    const [key, value] = node.dataset.show.split(':');
    node.hidden = settings[key] !== value;
  });
  $$('#decadeChips .chip').forEach((c) => c.setAttribute('aria-pressed', String(settings.decades.includes(+c.dataset.decade))));
  $('#durationLabel').textContent = `${settings.duration} s`;
  if (S.phase !== 'playing') $('#tTot').textContent = fmtTime(settings.duration * 1000);
  renderShares();

  let pill = 'Playlist da Deezer';
  if (settings.mode === 'artists') pill = settings.artists.length ? settings.artists.map((a) => a.name).join(', ') : 'Sem artistas';
  if (settings.mode === 'decades') {
    const langs = languageShares().filter((l) => l.pct > 0).map((l) => `${LANGUAGES[l.key].code} ${l.pct}%`).join(' · ');
    const ds = [...settings.decades].sort();
    const decades = ds.length === DECADES.length ? 'todas as décadas' : ds.map(decadeLabel).join(' ');
    pill = `${langs} · ${decades}`;
  }
  const side = Bingo.SIDES[settings.bingo];
  $('#sourcePill').textContent = side ? `Bingo ${side.letter} · ${pill}` : pill;
  renderCategoryList();
}

/** Categorias do lado escolhido, nas definições. */
function renderCategoryList() {
  const artistMode = settings.mode === 'artists';
  const side = artistMode ? Bingo.ARTIST_SIDES[settings.bingo] : Bingo.SIDES[settings.bingo];
  const list = $('#catList');
  list.hidden = !side;
  $('#sidePick').hidden = S.round > 0;
  if (!side) return;
  const keys = artistMode ? Bingo.artistKeys(settings.bingo, settings.artists.length) : side.categories;
  list.innerHTML = keys.map((k) => {
    const c = Bingo.category(k);
    return `<li><i style="background:${c.color}"></i><span><b>${c.name}</b>${c.ask}</span></li>`;
  }).join('');
}

/** Lista de línguas: só é reconstruída quando se adiciona/remove uma (para não interromper o slider). */
function renderLanguageList() {
  $('#langList').innerHTML = languageShares().map((l) => {
    const name = LANGUAGES[l.key].name;
    return `
      <div class="lang-row" data-lang="${l.key}">
        <span class="lang-name"><i style="background:${l.color}"></i>${name}</span>
        <b class="lang-pct"></b>
        <button type="button" class="lang-remove" aria-label="Remover ${name}" title="Remover">×</button>
        <input type="range" min="0" max="100" step="any" value="${l.weight}" aria-label="Percentagem de ${name}">
      </div>`;
  }).join('');

  const missing = Object.keys(LANGUAGES).filter((k) => !(k in settings.languages));
  const add = $('#addLang');
  add.innerHTML = `<option value="">+ Adicionar língua</option>${missing.map((k) => `<option value="${k}">${LANGUAGES[k].name}</option>`).join('')}`;
  add.closest('.field').hidden = !missing.length;
  renderShares();
}

function renderShares() {
  const shares = languageShares();
  $('#ratioBar').innerHTML = shares.filter((l) => l.pct > 0)
    .map((l) => `<span style="flex:${l.weight};background:${l.color}"></span>`).join('');
  for (const l of shares) {
    const row = $(`.lang-row[data-lang="${l.key}"]`);
    if (!row) continue;
    $('.lang-pct', row).textContent = `${l.pct}%`;
    $('.lang-remove', row).hidden = shares.length === 1;
    const slider = $('input[type="range"]', row);
    slider.disabled = shares.length === 1;
    slider.value = l.weight;
    row.classList.toggle('off', l.pct === 0);
  }
}

function bindSettings() {
  $('#decadeChips').innerHTML = DECADES
    .map((d) => `<button type="button" class="chip" data-decade="${d}">${decadeLabel(d)}</button>`)
    .join('');

  $$('.segmented').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    const key = seg.dataset.setting;
    if (settings[key] === b.dataset.value) return;
    settings[key] = b.dataset.value;
    // Mudar o ponto de início ou o lado do Bingo não invalida a próxima música.
    saveSettings({ keepPrefetch: key === 'start' || key === 'bingo' });
  }));

  $('#decadeChips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const d = +c.dataset.decade;
    const has = settings.decades.includes(d);
    if (has && settings.decades.length === 1) return setStatus('Escolhe pelo menos uma década.');
    settings.decades = has ? settings.decades.filter((x) => x !== d) : [...settings.decades, d];
    saveSettings();
  });

  const langList = $('#langList');
  langList.addEventListener('input', (e) => {
    if (!e.target.matches('input[type="range"]')) return;
    setShare(e.target.closest('.lang-row').dataset.lang, +e.target.value);
    saveSettings({ keepPrefetch: true });
  });
  langList.addEventListener('change', (e) => {
    if (e.target.matches('input[type="range"]')) invalidateNext(); // a próxima música pode ser da língua errada
  });
  langList.addEventListener('click', (e) => {
    const btn = e.target.closest('.lang-remove');
    if (!btn) return;
    delete settings.languages[btn.closest('.lang-row').dataset.lang];
    normalizeShares(); // a parte da língua removida é repartida pelas restantes
    saveSettings();
    renderLanguageList();
  });
  $('#addLang').addEventListener('change', (e) => {
    const k = e.target.value;
    if (!k) return;
    // A nova língua entra com uma parte igual (ex.: 3 línguas -> 33%); as outras encolhem na mesma proporção.
    settings.languages[k] = 0;
    setShare(k, 100 / Object.keys(settings.languages).length);
    saveSettings();
    renderLanguageList();
  });

  const dzPlaylist = $('#dzPlaylist');
  dzPlaylist.value = settings.dzPlaylist;
  dzPlaylist.addEventListener('change', () => { settings.dzPlaylist = dzPlaylist.value.trim(); saveSettings(); });

  const duration = $('#duration');
  duration.value = settings.duration;
  duration.addEventListener('input', () => { settings.duration = +duration.value; saveSettings({ keepPrefetch: true }); });

  const noRepeat = $('#noRepeat');
  noRepeat.checked = settings.noRepeat;
  noRepeat.addEventListener('change', () => { settings.noRepeat = noRepeat.checked; saveSettings(); });

  $('#blockForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#blockInput');
    if (blockArtist(input.value)) input.value = '';
  });
  $('#blockedList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-unblock]');
    if (btn) unblockArtist(btn.dataset.unblock);
  });

  // Modo artistas: pesquisar, adicionar e remover.
  let artistTimer = 0;
  $('#artistSearch').addEventListener('input', (e) => {
    clearTimeout(artistTimer);
    const q = e.target.value.trim();
    if (q.length < 2) { $('#artistResults').innerHTML = ''; return; }
    artistTimer = setTimeout(() => searchArtistsUI(q), 300);
  });
  $('#artistResults').addEventListener('click', (e) => {
    const b = e.target.closest('[data-artist-id]');
    if (b) addArtist({ id: +b.dataset.artistId, name: b.dataset.artistName });
  });
  $('#artistTags').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove-artist]');
    if (b) removeArtist(+b.dataset.removeArtist);
  });

  $('#clearHistory').addEventListener('click', () => {
    if (!confirm('Limpar o histórico e voltar a permitir todas as músicas?')) return;
    history = [];
    played = new Set(S.track ? [S.track.id] : []);
    store.set('history', history);
    store.set('played', [...played]);
    renderHistory();
  });

  $('#menuBtn').addEventListener('click', () => document.body.classList.add('menu-open'));
  $('#scrim').addEventListener('click', () => document.body.classList.remove('menu-open'));
}

// ---------- Escolher músicas ----------

function clipStartMs() {
  if (settings.start === 'begin') return 0;
  return randInt(0, Math.max(0, 30 - settings.duration)) * 1000;
}

async function fetchByLanguage(exclude, decades) {
  const lang = pickLanguage(settings.languages);
  if (!lang) throw new Error('Põe pelo menos uma língua acima de 0%.');
  try {
    return await DZ.randomByLanguage({ lang, decades, exclude, top: FAME[settings.fame] });
  } catch (e) {
    // Se uma língua não tiver nada nestas décadas, tenta as outras em vez de bloquear o jogo.
    const others = Object.fromEntries(Object.entries(settings.languages).filter(([k]) => k !== lang));
    const fallback = pickLanguage(others);
    if (!fallback) throw e;
    return DZ.randomByLanguage({ lang: fallback, decades, exclude, top: FAME[settings.fame] });
  }
}

/** Ano final: o mais antigo entre o MusicBrainz e os álbuns da Deezer. */
const resolveYear = (track) => Promise.all([DZ.originalYear(track), MB.firstReleaseYear(track.artists[0], track.title)])
  .then((years) => minYear(years));

const inDecades = (year, decades) => decades.some((d) => year >= d && year < d + 10);

/**
 * Confirma a língua: as playlists por língua às vezes trazem êxitos internacionais
 * (ex.: Rosalía numa playlist de música portuguesa). Usa o título e o país do artista.
 */
async function fitsLanguage(track) {
  if (titleConfirms(track.lang, track.title)) return true;
  const artist = track.artists[0];
  // Se o MusicBrainz não souber o país, pergunta à Wikidata.
  const country = (await MB.artistCountry(artist)) || (await WD.artistCountry(artist));
  return artistFits(track.lang, country);
}

class StaleError extends Error {}

/**
 * Escolhe a próxima música. No modo por década, confirma o ano antes de aceitar:
 * as playlists misturam muitas vezes décadas ("anos 70/80/90").
 */
async function fetchTrack(skipIds = []) {
  const gen = settingsGen;
  const exclude = new Set(settings.noRepeat ? played : []);
  skipIds.forEach((id) => id && exclude.add(id));

  if (settings.mode === 'artists') {
    if (!settings.artists.length) throw new Error('Escolhe pelo menos um artista nas definições.');
    return AR.pickArtistTrack({ artists: settings.artists, exclude, top: FAME[settings.fame] });
  }

  if (settings.mode !== 'decades') {
    const id = DZ.parsePlaylistId(settings.dzPlaylist);
    if (!id) throw new Error('Cola o link de uma playlist da Deezer nas definições.');
    const track = await DZ.randomFromPlaylist(id, exclude, FAME[settings.fame]);
    track.yearPromise = resolveYear(track);
    return track;
  }

  const decades = [...settings.decades];
  const earliest = Math.min(...decades);
  for (let attempt = 0; attempt < 15; attempt++) {
    if (gen !== settingsGen) throw new StaleError('As definições mudaram.');
    const track = await fetchByLanguage(exclude, decades);
    exclude.add(track.id);
    // Atalho barato: o ano do álbum na Deezer nunca é anterior ao original,
    // por isso se já for mais antigo do que a década mais antiga, a música não serve.
    const quick = await DZ.albumYear(track);
    if (quick && quick < earliest) continue;
    if (!(await fitsLanguage(track))) continue;
    const year = await resolveYear(track);
    if (year && !inDecades(year, decades)) continue;
    track.year = year;
    track.yearPromise = Promise.resolve(year);
    return track;
  }
  throw new Error('Não encontrei músicas destas décadas e línguas. Experimenta juntar mais décadas.');
}

function prefetch() {
  if (S.next?.gen === settingsGen) return;
  const next = { gen: settingsGen, promise: fetchTrack([S.track?.id]) };
  next.promise.catch(() => {});
  S.next = next;
}

// ---------- Reprodução ----------

async function playClip() {
  const t = S.track;
  if (!t) return;
  stopClip();
  const id = ++S.playId;
  t.clipStart ??= clipStartMs();
  const dur = Math.min(settings.duration * 1000, 30000 - t.clipStart);

  setPhase('buffering');
  setStatus('');
  try {
    try {
      await DZ.play(t.preview, t.clipStart / 1000);
    } catch {
      t.preview = await DZ.freshPreview(t); // o link pode ter expirado
      await DZ.play(t.preview, t.clipStart / 1000);
    }
  } catch (e) {
    if (id !== S.playId) return;
    setPhase('ready');
    setStatus(e.message, 'error');
    return;
  }
  if (id !== S.playId) return;

  setPhase('playing');
  const t0 = performance.now();
  const tick = () => {
    const elapsed = Math.min(performance.now() - t0, dur);
    $('#fill').style.width = `${(elapsed / dur) * 100}%`;
    $('#tCur').textContent = fmtTime(elapsed);
    if (elapsed < dur) S.raf = requestAnimationFrame(tick);
  };
  $('#tTot').textContent = fmtTime(dur);
  tick();
  // setTimeout (e não só requestAnimationFrame) para parar mesmo com o separador em segundo plano.
  S.stopTimer = setTimeout(() => { if (id === S.playId) stopClip(); }, dur);
}

function stopClip() {
  S.playId++;
  cancelAnimationFrame(S.raf);
  clearTimeout(S.stopTimer);
  if (S.phase === 'playing' || S.phase === 'buffering') DZ.stop();
  if (S.phase !== 'loading') setPhase(S.track ? 'ready' : 'idle');
}

async function nextTrack() {
  stopClip();
  flip(false);
  setPhase('loading');
  setStatus('');
  // Primeiro sorteia-se a categoria (enquanto a música carrega), depois toca a música.
  const artistMode = settings.mode === 'artists';
  let spin = null;
  if (artistMode) { S.category = null; showCategory(null); }
  else spin = settings.bingo in Bingo.SIDES ? spinCategory(Bingo.drawCategory(settings.bingo)) : (S.category = null, showCategory(null), null);
  $('#sidePick').hidden = true;
  const prefetched = S.next?.gen === settingsGen ? S.next.promise : null;
  S.next = null;
  clearTimeout(prefetchTimer);
  try {
    let track = prefetched ? await prefetched.catch(() => null) : null;
    // Se mudares as décadas/línguas enquanto procura, recomeça com as definições novas.
    for (let i = 0; !track && i < 5; i++) {
      track = await fetchTrack([S.track?.id]).catch((e) => { if (e instanceof StaleError) return null; throw e; });
    }
    if (!track) throw new Error('As definições mudaram muitas vezes seguidas. Tenta outra vez.');
    // No modo artistas, a categoria só se sorteia depois da música, para escolher uma que ela permita.
    if (artistMode && track.facts && settings.bingo in Bingo.ARTIST_SIDES) {
      spin = spinCategory(
        Bingo.drawArtistCategory(settings.bingo, track.facts, settings.artists.map((a) => a.name)),
        Bingo.artistKeys(settings.bingo, settings.artists.length),
      );
    }
    if (spin && !(await spin)) return; // outra ronda começou entretanto
    if (S.category?.key === 'group') track.groupPromise ??= isGroup(track);
    S.track = track;
    S.revealed = false;
    S.round++;
    played.add(track.id);
    store.set('played', [...played].slice(-3000));
    $('#roundNo').textContent = S.round;
    $('#sidePick').hidden = true;
    $('#openLink').hidden = true;
    $('#blockBtn').hidden = true;
    $('#fill').style.width = '0%';
    $('#tCur').textContent = '0:00';
    setPhase('ready');
    await playClip();
    prefetch();
  } catch (e) {
    S.spinId++;
    S.spinning = false;
    if (!S.track) { showCategory(null); $('#sidePick').hidden = false; }
    setPhase(S.track ? 'ready' : 'idle');
    setStatus(e.message, 'error');
  }
}

// ---------- Categorias do Bingo ----------

/** Mostra a categoria na frente da carta (ou esconde, com null). */
function showCategory(cat, { rolling = false } = {}) {
  const box = $('#frontCat');
  box.hidden = !cat;
  box.classList.toggle('rolling', rolling);
  if (!cat) return;
  box.style.setProperty('--cat', cat.color);
  $('#frontCatName').textContent = cat.name;
  $('#frontCatAsk').textContent = rolling ? '' : cat.ask;
}

/**
 * Animação da bola de espelhos: passa pelas categorias do lado, cada vez mais devagar,
 * e para na sorteada. Devolve false se entretanto começou outra ronda.
 */
async function spinCategory(cat, keys = Bingo.SIDES[settings.bingo]?.categories || []) {
  const id = ++S.spinId;
  S.category = cat;
  S.spinning = true;
  renderControls();
  let i = keys.indexOf(cat.key) + randInt(1, keys.length - 1);
  // Múltiplo do número de categorias + o que falta para parar logo antes da sorteada.
  const steps = 2 * keys.length + ((keys.indexOf(cat.key) - i) % keys.length + keys.length) % keys.length;
  for (let n = 0; n < steps; n++, i++) {
    if (id !== S.spinId) return false;
    showCategory(Bingo.category(keys[i % keys.length]), { rolling: true });
    await sleep(60 + n * n * 1.6);
  }
  if (id !== S.spinId) return false;
  showCategory(cat);
  S.spinning = false;
  renderControls();
  await sleep(500);
  return id === S.spinId;
}

/** Grupo (true), solo (false) ou desconhecido (null). Duetos e "feat." contam como grupo. */
async function isGroup(track) {
  const artist = track.artists[0] || '';
  if (Bingo.looksLikeSeveral(artist, track.title)) return true;
  return Bingo.isGroupType(await MB.artistType(artist));
}

/** Resposta da categoria na carta revelada. */
async function showAnswer(t) {
  const cat = S.category;
  $('#bCat').hidden = !cat;
  $('.back').classList.toggle('has-cat', !!cat);
  if (!cat) return;
  $('#bCat').style.setProperty('--cat', cat.color);
  $('#bCatName').textContent = cat.name;
  $('#bCatAnswer').textContent = '…';
  if (t.facts) { $('#bCatAnswer').textContent = Bingo.artistAnswer(cat.key, t); return; }
  const group = cat.key === 'group' ? await (t.groupPromise ??= isGroup(t)) : null;
  if (S.track !== t) return;
  $('#bCatAnswer').textContent = Bingo.answer(cat.key, {
    year: t.year, title: t.title, artist: t.artists.join(', '), group,
  });
}

async function reveal() {
  const t = S.track;
  if (!t || S.revealed || S.phase === 'loading') return;
  S.revealed = true;
  $('#bArtist').textContent = t.artists.join(', ');
  $('#bTitle').textContent = t.title;
  $('#bYear').textContent = '…';
  $('#backBg').style.backgroundImage = t.image ? `url("${t.image}")` : 'none';
  flip(true);
  renderControls();

  $('#bCat').hidden = true;
  const year = await t.yearPromise;
  if (S.track !== t) return;
  t.year = year;
  $('#bYear').textContent = year ?? '????';
  showAnswer(t);
  $('#openLink').href = t.link || '#';
  $('#openLink').hidden = !t.link;
  renderBlockButton();

  history.unshift({
    id: t.id, title: t.title, artist: t.artists.join(', '), year, image: t.image, link: t.link, lang: t.lang,
    cat: S.category?.key,
  });
  history = history.slice(0, 200);
  store.set('history', history);
  renderHistory();
  prefetch();
}

// ---------- Interface ----------

function flip(on) {
  $('#card').classList.toggle('flipped', on);
  $('#card').setAttribute('aria-label', on ? 'Carta revelada' : 'Carta — clica para revelar');
}

function setPhase(phase) {
  S.phase = phase;
  renderControls();
}

function renderControls() {
  const { phase, track, revealed } = S;
  const playing = phase === 'playing' || phase === 'buffering';
  const loading = phase === 'loading' || phase === 'buffering';
  $('#stage').classList.toggle('is-playing', phase === 'playing');

  const play = $('#playBtn');
  play.classList.toggle('playing', playing);
  play.classList.toggle('loading', loading);
  play.disabled = phase === 'loading';
  play.setAttribute('aria-label', playing ? 'Parar' : 'Tocar');

  $('#replayBtn').disabled = !track || phase === 'loading';
  $('#nextBtn').disabled = phase === 'loading';

  const rb = $('#revealBtn');
  rb.disabled = phase === 'loading' || !track;
  rb.textContent = revealed ? 'Próxima música' : 'Revelar';
  rb.classList.toggle('next', revealed);

  const msg = {
    idle: 'Carrega em ▶ para começar',
    loading: 'A escolher uma música…',
    buffering: 'A preparar…',
    playing: S.category ? 'Escrevam a resposta!' : 'Que ano é este?',
    ready: 'Já sabem? Carrega em Revelar.',
  }[phase];
  $('#frontMsg').textContent = S.spinning ? 'A sortear a categoria…' : msg;
}

function renderHistory() {
  const list = $('#historyList');
  if (!history.length) {
    list.innerHTML = '<li class="empty">As músicas reveladas aparecem aqui.</li>';
    return;
  }
  list.innerHTML = history.map((h, i) => `
    <li>
      <span class="n">${history.length - i}</span>
      ${h.image ? `<img src="${escapeHtml(h.image)}" alt="" loading="lazy">` : '<span class="noimg"></span>'}
      <span class="info">
        ${h.link ? `<a class="t" href="${escapeHtml(h.link)}" target="_blank" rel="noopener">${escapeHtml(h.title)}</a>` : `<span class="t">${escapeHtml(h.title)}</span>`}
        <span class="a">${h.cat ? catTag(h.cat) : ''}${h.lang && LANGUAGES[h.lang] ? `<span class="tag">${LANGUAGES[h.lang].code}</span>` : ''}${escapeHtml(h.artist)}</span>
      </span>
      <span class="y">${h.year ?? '—'}</span>
      <button type="button" class="block" data-block="${escapeHtml(h.artist)}" title="Bloquear ${escapeHtml(h.artist)}" aria-label="Bloquear ${escapeHtml(h.artist)}">${BLOCK_ICON}</button>
    </li>`).join('');
}

// ---------- Artistas bloqueados ----------

const BLOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 0 1 6.32 12.9L7.1 5.68A7.96 7.96 0 0 1 12 4zm0 16a8 8 0 0 1-6.32-12.9L16.9 18.32A7.96 7.96 0 0 1 12 20z"/></svg>';
const sameName = (a, b) => normalize(a) === normalize(b);

function blockArtist(name) {
  name = String(name || '').trim();
  if (!normalize(name)) return false;
  if (settings.blockedArtists.some((b) => sameName(b, name))) {
    setStatus(`${name} já está na lista de bloqueados.`);
    return false;
  }
  settings.blockedArtists = [...settings.blockedArtists, name];
  DZ.setBlockedArtists(settings.blockedArtists);
  saveSettings(); // a próxima música já escolhida pode ser deste artista
  renderBlocked();
  renderBlockButton();
  setStatus(`${name} está na lista de bloqueados: estas músicas não voltam a aparecer. Podes desfazer nas definições.`);
  return true;
}

function unblockArtist(name) {
  settings.blockedArtists = settings.blockedArtists.filter((b) => !sameName(b, name));
  DZ.setBlockedArtists(settings.blockedArtists);
  saveSettings();
  renderBlocked();
  renderBlockButton();
}

function renderBlocked() {
  const list = $('#blockedList');
  list.innerHTML = settings.blockedArtists.length
    ? settings.blockedArtists.map((b) => `<li><span>${escapeHtml(b)}</span><button type="button" data-unblock="${escapeHtml(b)}" aria-label="Desbloquear ${escapeHtml(b)}" title="Desbloquear">×</button></li>`).join('')
    : '<li class="empty">Nenhum artista bloqueado.</li>';
}

/** Botão na carta revelada para bloquear o artista desta música. */
function renderBlockButton() {
  const btn = $('#blockBtn');
  const artist = S.track?.artists?.[0];
  btn.hidden = !S.revealed || !artist;
  if (btn.hidden) return;
  const done = DZ.isBlocked(artist);
  btn.disabled = done;
  btn.innerHTML = `${BLOCK_ICON}<span>${done ? 'Na lista de bloqueados' : `Bloquear ${escapeHtml(artist)}`}</span>`;
}

function catTag(key) {
  const c = Bingo.category(key);
  return c.name ? `<i class="cat-dot" style="background:${c.color}" title="${escapeHtml(c.name)}"></i>` : '';
}

let statusTimer = 0;
function setStatus(msg, kind = 'info') {
  const el = $('#status');
  el.textContent = msg || '';
  el.classList.toggle('error', kind === 'error');
  clearTimeout(statusTimer);
  if (msg && kind !== 'error') statusTimer = setTimeout(() => { el.textContent = ''; }, 4000);
}

// DZ.unlock() tem de acontecer dentro do clique, antes de qualquer await (iOS).
function onPlay() {
  DZ.unlock();
  if (!S.track) return nextTrack();
  if (S.phase === 'playing' || S.phase === 'buffering') return stopClip();
  return playClip();
}
function onReplay() {
  DZ.unlock();
  if (S.track) playClip();
}
function onNext() {
  DZ.unlock();
  nextTrack();
}
function onReveal() {
  DZ.unlock();
  if (S.revealed) nextTrack();
  else reveal();
}

function bindControls() {
  $('#playBtn').addEventListener('click', onPlay);
  $('#replayBtn').addEventListener('click', onReplay);
  $('#nextBtn').addEventListener('click', onNext);
  $('#revealBtn').addEventListener('click', onReveal);
  $('#blockBtn').addEventListener('click', () => { if (S.track) blockArtist(S.track.artists[0]); });
  $('#historyList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-block]');
    if (btn) blockArtist(btn.dataset.block);
  });
  $('#card').addEventListener('click', () => { if (S.track && !S.revealed) reveal(); });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    const onButton = e.target.closest('button, a, [role="button"]');
    if (e.code === 'Space' && !onButton) { e.preventDefault(); onPlay(); }
    else if (e.key === 'Enter' && !onButton) { e.preventDefault(); onReveal(); }
    else if (e.key === 'Enter' && e.target.id === 'card') { e.preventDefault(); onReveal(); }
    else if (e.key === 'r' || e.key === 'R') onReplay();
    else if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight') onNext();
    else if (e.key === 'Escape') document.body.classList.remove('menu-open');
  });
}

// ---------- Modo artistas ----------
const MAX_ARTISTS = 10;

async function searchArtistsUI(q) {
  let list = [];
  try { list = await AR.searchArtists(q); } catch { setStatus('Não foi possível pesquisar artistas na Deezer.', 'error'); }
  if ($('#artistSearch').value.trim() !== q) return; // a pesquisa já mudou entretanto
  $('#artistResults').innerHTML = list.map((a) => `
    <li><button type="button" data-artist-id="${a.id}" data-artist-name="${escapeHtml(a.name)}">
      ${a.picture ? `<img src="${escapeHtml(a.picture)}" alt="">` : ''}<span>${escapeHtml(a.name)}</span>
    </button></li>`).join('') || '<li class="empty">Nenhum artista encontrado.</li>';
}

function addArtist(a) {
  if (settings.artists.some((x) => x.id === a.id)) return setStatus(`${a.name} já está escolhido.`);
  if (settings.artists.length >= MAX_ARTISTS) return setStatus(`Podes escolher até ${MAX_ARTISTS} artistas.`);
  settings.artists = [...settings.artists, a];
  $('#artistSearch').value = '';
  $('#artistResults').innerHTML = '';
  saveSettings();
  renderArtistTags();
}

function removeArtist(id) {
  settings.artists = settings.artists.filter((x) => x.id !== id);
  saveSettings();
  renderArtistTags();
}

function renderArtistTags() {
  $('#artistTags').innerHTML = settings.artists.map((a) => `<li><span>${escapeHtml(a.name)}</span><button type="button" data-remove-artist="${a.id}" aria-label="Remover ${escapeHtml(a.name)}" title="Remover">×</button></li>`).join('')
    || '<li class="empty">Ainda nenhum artista.</li>';
}

// ---------- Arranque ----------

bindSettings();
bindControls();
renderBlocked();
renderArtistTags();
renderLanguageList();
renderSettings();
renderControls();
renderHistory();
prefetch(); // a primeira música fica escolhida enquanto a página está aberta
