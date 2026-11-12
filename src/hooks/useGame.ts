// Estado de uma partida: escolher, tocar e revelar músicas, e o sorteio das categorias.
// Os pedidos são assíncronos e podem acabar fora de ordem, por isso cada ação tem um id
// (playId, spinId) e a música pré-carregada guarda a "geração" das definições com que foi escolhida.
import { useEffect, useRef, useState } from 'react';
import type { HistoryEntry, Phase, Settings, Track } from '../types';
import { randInt, sleep, store } from '../lib/util';
import { player } from '../services/AudioPlayer';
import { deezer } from '../services/DeezerService';
import { trackPicker, StaleError } from '../services/TrackPicker';
import type { Category, CategoryContext, Question } from '../categories/Category';
import { contextFor, sideFor } from '../categories/sides';
import type { SetStatus } from './useStatus';

export interface CategoryView { key: string; name: string; color: string; ask: string; options?: string[] }
export interface Clip { startedAt: number; durationMs: number }

const view = (c: Category, q: Question = { ask: c.ask }): CategoryView => ({ key: c.key, name: c.name, color: c.color, ...q });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Só estas definições mudam a escolha das músicas; mudar as outras não descarta a próxima. */
const pickKey = (s: Settings) => JSON.stringify([s.mode, s.decades, s.languages, s.dzPlaylist, s.artists, s.noRepeat, s.blockedArtists, s.fame]);

export function useGame(settings: Settings, setStatus: SetStatus) {
  const [phase, setPhaseState] = useState<Phase>('idle');
  const [track, setTrack] = useState<Track | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [year, setYear] = useState<number | null | undefined>(undefined); // undefined = ainda a confirmar
  const [round, setRound] = useState(0);
  const [front, setFront] = useState<{ cat: CategoryView; rolling: boolean } | null>(null);
  const [answer, setAnswer] = useState<CategoryView & { answer: string } | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => store.get('history', []));

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const r = useRef({
    phase: 'idle' as Phase,
    track: null as Track | null,
    preview: '',
    clipStart: null as number | null,
    revealed: false,
    category: null as Category | null,
    playId: 0,
    spinId: 0,
    stopTimer: 0,
    gen: 0, // sobe sempre que muda algo que afeta a escolha das músicas
    next: null as { gen: number; promise: Promise<Track> } | null,
    prefetchTimer: 0,
    played: new Set<string>(store.get<string[]>('played', [])),
    recent: [] as { artist: string; lang?: Track['lang'] }[],
    pickKey: pickKey(settings),
  }).current;

  const setPhase = (p: Phase) => { r.phase = p; setPhaseState(p); };
  const historyRef = useRef(history);
  historyRef.current = history;
  // Músicas tocadas nesta sessão (mesmo sem revelar) e depois o histórico guardado.
  const ctx = (): CategoryContext => contextFor(settingsRef.current, [...r.recent, ...historyRef.current]);

  const pick = () => {
    const gen = r.gen;
    return trackPicker.pick(settingsRef.current, r.played, [r.track?.id], () => gen !== r.gen);
  };

  function prefetch() {
    if (r.next?.gen === r.gen) return;
    const next = { gen: r.gen, promise: pick() };
    next.promise.catch(() => {});
    r.next = next;
  }

  /** Descarta a próxima música já escolhida e escolhe outra com as definições novas. */
  function invalidateNext() {
    r.gen++;
    r.next = null;
    clearTimeout(r.prefetchTimer);
    r.prefetchTimer = window.setTimeout(prefetch, 400); // espera que acabes de clicar
  }

  // A primeira música fica escolhida enquanto a página está aberta; depois, a cada mudança relevante.
  const key = pickKey(settings);
  useEffect(() => {
    if (key === r.pickKey) prefetch();
    else { r.pickKey = key; invalidateNext(); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Reprodução ----------

  function stopClip() {
    r.playId++;
    clearTimeout(r.stopTimer);
    if (r.phase === 'playing' || r.phase === 'buffering') player.stop();
    if (r.phase !== 'loading') setPhase(r.track ? 'ready' : 'idle');
  }

  async function playClip() {
    const t = r.track;
    if (!t) return;
    stopClip();
    const id = ++r.playId;
    const s = settingsRef.current;
    // Na letra começa sempre do início do excerto, para não tocar logo o refrão.
    const fromStart = s.start === 'begin' || r.category?.key === 'chorus';
    r.clipStart ??= fromStart ? 0 : randInt(0, Math.max(0, 30 - s.duration)) * 1000;
    const start = r.clipStart;
    const dur = Math.min(s.duration * 1000, 30000 - start);

    setPhase('buffering');
    setStatus('');
    try {
      try {
        await player.play(r.preview, start / 1000);
      } catch {
        r.preview = await deezer.freshPreview(t); // o link pode ter expirado
        await player.play(r.preview, start / 1000);
      }
    } catch (e) {
      if (id !== r.playId) return;
      setPhase('ready');
      setStatus(message(e), 'error');
      return;
    }
    if (id !== r.playId) return;
    setPhase('playing');
    setClip({ startedAt: performance.now(), durationMs: dur });
    // setTimeout para parar mesmo com o separador em segundo plano.
    r.stopTimer = window.setTimeout(() => { if (id === r.playId) stopClip(); }, dur);
  }

  // ---------- Categorias ----------

  /**
   * Animação do sorteio: passa pelas categorias do lado, cada vez mais devagar,
   * e para na sorteada. Devolve false se entretanto começou outra ronda.
   */
  async function spinCategory(cat: Category, keys: Category[], question: Question) {
    const id = ++r.spinId;
    r.category = cat;
    setSpinning(true);
    const n = keys.length;
    const at = keys.indexOf(cat);
    let i = at + randInt(1, n - 1);
    // Múltiplo do número de categorias + o que falta para parar logo antes da sorteada.
    const steps = 2 * n + (((at - i) % n) + n) % n;
    for (let k = 0; k < steps; k++, i++) {
      if (id !== r.spinId) return false;
      setFront({ cat: view(keys[i % n]), rolling: true });
      await sleep(60 + k * k * 1.6);
    }
    if (id !== r.spinId) return false;
    setFront({ cat: view(cat, question), rolling: false });
    setSpinning(false);
    await sleep(500);
    return id === r.spinId;
  }

  function clearCategory() {
    r.category = null;
    setFront(null);
  }

  // ---------- Rondas ----------

  async function nextTrack() {
    stopClip();
    r.revealed = false;
    setRevealed(false);
    setPhase('loading');
    setStatus('');
    const s = settingsRef.current;
    const side = sideFor(s.mode, s.side);
    let spin: Promise<boolean> | null = null;
    clearCategory();

    const prefetched = r.next?.gen === r.gen ? r.next.promise : null;
    r.next = null;
    clearTimeout(r.prefetchTimer);
    try {
      let t = prefetched ? await prefetched.catch(() => null) : null;
      // Se mudares as definições enquanto procura, recomeça com as definições novas.
      for (let i = 0; !t && i < 5; i++) {
        t = await pick().catch((e) => { if (e instanceof StaleError) return null; throw e; });
      }
      if (!t) throw new Error('As definições mudaram muitas vezes seguidas. Tenta outra vez.');
      // A categoria sorteia-se depois da música, só entre as que ela permite (ex.: a letra precisa de refrão).
      if (side) {
        const c = side.draw(ctx(), t);
        if (c) spin = spinCategory(c, side.categories(ctx()), c.question(t, ctx()));
      }
      if (spin && !(await spin)) return; // outra ronda começou entretanto
      r.track = t;
      r.preview = t.preview;
      r.clipStart = null;
      setTrack(t);
      setYear(undefined);
      setAnswer(null);
      setClip(null);
      setRound((n) => n + 1);
      r.played.add(t.id);
      r.recent = [{ artist: t.artists.join(', '), lang: t.lang }, ...r.recent].slice(0, 100);
      store.set('played', [...r.played].slice(-3000));
      if (r.category) void r.category.answer(t, ctx()); // adianta pedidos (ex.: grupo ou solo)
      setPhase('ready');
      await playClip();
      prefetch();
    } catch (e) {
      r.spinId++;
      setSpinning(false);
      if (!r.track) clearCategory();
      setPhase(r.track ? 'ready' : 'idle');
      setStatus(message(e), 'error');
    }
  }

  async function reveal() {
    const t = r.track;
    if (!t || r.revealed || r.phase === 'loading') return;
    r.revealed = true;
    setRevealed(true);
    const y = await t.yearPromise;
    if (r.track !== t) return;
    t.year = y;
    setYear(y);
    const cat = r.category;
    if (cat) {
      setAnswer({ ...view(cat), answer: '…' });
      Promise.resolve(cat.answer(t, ctx())).then((a) => { if (r.track === t) setAnswer({ ...view(cat), answer: a }); });
    }
    setHistory((h) => {
      const next = [{
        id: t.id, title: t.title, artist: t.artists.join(', '), year: y, image: t.image, link: t.link, lang: t.lang, cat: cat?.key,
      }, ...h].slice(0, 200);
      store.set('history', next);
      return next;
    });
    prefetch();
  }

  function clearHistory() {
    setHistory([]);
    r.played = new Set(r.track ? [r.track.id] : []);
    store.set('history', []);
    store.set('played', [...r.played]);
  }

  // ---------- Ações (player.unlock() tem de acontecer dentro do clique, antes de qualquer await: iOS) ----------

  const actions = {
    play() {
      player.unlock();
      if (!r.track) return void nextTrack();
      if (r.phase === 'playing' || r.phase === 'buffering') return stopClip();
      void playClip();
    },
    replay() {
      player.unlock();
      if (r.track) void playClip();
    },
    next() {
      player.unlock();
      void nextTrack();
    },
    reveal() {
      player.unlock();
      if (r.revealed) void nextTrack();
      else void reveal();
    },
    clearHistory,
  };

  return { phase, track, revealed, year, round, front, answer, clip, spinning, history, actions };
}
