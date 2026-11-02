import { $, $$, store, randInt, fmtTime, escapeHtml, minYear } from './util.js';
import * as DZ from './deezer.js';
import * as MB from './musicbrainz.js';
import { LANGUAGES, LANG_COLORS, pickLanguage, detectLanguage, artistFits } from './languages.js';

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
const DEFAULTS = {
  mode: 'decades',
  decades: [1970, 1980, 1990, 2000, 2010],
  languages: { en: 50, pt: 50 }, // percentagens (somam 100); a ordem define a cor na barra
  dzPlaylist: '',
  duration: 10,
  start: 'random',
  noRepeat: true,
};
const settings = { ...DEFAULTS, ...store.get('settings', {}) };
if (!['decades', 'playlists'].includes(settings.mode)) settings.mode = 'decades';
settings.languages = Object.fromEntries(Object.entries(settings.languages || {}).filter(([k]) => LANGUAGES[k]));
if (!Object.keys(settings.languages).length) settings.languages = { ...DEFAULTS.languages };
normalizeShares();

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
  if (settings.mode === 'decades') {
    const langs = languageShares().filter((l) => l.pct > 0).map((l) => `${LANGUAGES[l.key].code} ${l.pct}%`).join(' · ');
    const ds = [...settings.decades].sort();
    const decades = ds.length === DECADES.length ? 'todas as décadas' : ds.map(decadeLabel).join(' ');
    pill = `${langs} · ${decades}`;
  }
  $('#sourcePill').textContent = pill;
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
    // Mudar o ponto de início não invalida a próxima música, só o excerto.
    saveSettings({ keepPrefetch: key === 'start' });
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
    return await DZ.randomByLanguage({ lang, decades, exclude });
  } catch (e) {
    // Se uma língua não tiver nada nestas décadas, tenta as outras em vez de bloquear o jogo.
    const others = Object.fromEntries(Object.entries(settings.languages).filter(([k]) => k !== lang));
    const fallback = pickLanguage(others);
    if (!fallback) throw e;
    return DZ.randomByLanguage({ lang: fallback, decades, exclude });
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
  if (detectLanguage(track.title) === track.lang) return true;
  return artistFits(track.lang, await MB.artistCountry(track.artists[0]));
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

  if (settings.mode !== 'decades') {
    const id = DZ.parsePlaylistId(settings.dzPlaylist);
    if (!id) throw new Error('Cola o link de uma playlist da Deezer nas definições.');
    const track = await DZ.randomFromPlaylist(id, exclude);
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
    S.track = track;
    S.revealed = false;
    S.round++;
    played.add(track.id);
    store.set('played', [...played].slice(-3000));
    $('#roundNo').textContent = S.round;
    $('#openLink').hidden = true;
    $('#fill').style.width = '0%';
    $('#tCur').textContent = '0:00';
    setPhase('ready');
    await playClip();
    prefetch();
  } catch (e) {
    setPhase(S.track ? 'ready' : 'idle');
    setStatus(e.message, 'error');
  }
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

  const year = await t.yearPromise;
  if (S.track !== t) return;
  t.year = year;
  $('#bYear').textContent = year ?? '????';
  $('#openLink').href = t.link || '#';
  $('#openLink').hidden = !t.link;

  history.unshift({
    id: t.id, title: t.title, artist: t.artists.join(', '), year, image: t.image, link: t.link, lang: t.lang,
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
    playing: 'Que ano é este?',
    ready: 'Já sabem? Carrega em Revelar.',
  }[phase];
  $('#frontMsg').textContent = msg;
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
        <span class="a">${h.lang && LANGUAGES[h.lang] ? `<span class="tag">${LANGUAGES[h.lang].code}</span>` : ''}${escapeHtml(h.artist)}</span>
      </span>
      <span class="y">${h.year ?? '—'}</span>
    </li>`).join('');
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

// ---------- Arranque ----------

bindSettings();
bindControls();
renderLanguageList();
renderSettings();
renderControls();
renderHistory();
prefetch(); // a primeira música fica escolhida enquanto a página está aberta
