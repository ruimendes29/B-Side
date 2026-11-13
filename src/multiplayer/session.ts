// Sessões com TV e telemóveis no Firebase Realtime Database (projeto b-side-c1322, conta pessoal do Rui).
// Guarda só o necessário: a TV, as definições (o anfitrião muda-as no telemóvel), os jogadores,
// a ronda atual e as respostas dessa ronda. A sessão é apagada quando a TV se desliga (onDisconnect)
// ou quando fica sem jogadores (a TV apaga-a, ver TvApp); cada jogador sai quando fecha o separador.
// A configuração web do Firebase não é secreta: o acesso é controlado por database.rules.json.
import {
  browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, inMemoryPersistence, initializeAuth, signInAnonymously,
} from 'firebase/auth';
import {
  connectDatabaseEmulator, get, getDatabase, onChildAdded, onDisconnect, onValue, push, ref, remove, serverTimestamp, set, update,
} from 'firebase/database';
import type { Settings } from '../types';
import type { RoundCategory } from './roundCategory';
import { app, emulator } from './firebaseApp';

const auth = initializeAuth(app, { persistence: emulator ? inMemoryPersistence : [indexedDBLocalPersistence, browserLocalPersistence] });
const db = getDatabase(app);

if (emulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
}

export interface Player { name: string; joinedAt: number }

export interface RoundInfo {
  n: number;
  cat: RoundCategory | null;
  /** "Results are in!" na TV: já não se pode responder, mas a resposta certa ainda não se vê. */
  locked?: boolean;
  revealed: boolean;
  answer?: string | null;
  year?: number | null;
  title?: string;
  artist?: string;
}

/** `choice`: índice da opção escolhida, nas categorias com opções (aí não há quadro). */
export interface Answer { round: number; text?: string; drawing?: string; choice?: number }

export interface Session {
  tv: string;
  state: 'lobby' | 'playing';
  host?: string;
  /** Sem listas vazias: o Firebase não as guarda. Ler sempre com loadSettings. */
  settings?: Partial<Settings>;
  players?: Record<string, Player>;
  round?: RoundInfo;
  answers?: Record<string, Answer>;
}

export type Command = 'start' | 'play' | 'reveal' | 'next' | 'replay';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I, que se confundem
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
export const isCode = (s: string) => /^[A-Z0-9]{4}$/.test(s);
export const joinUrl = (code: string) => `${location.origin}/j/${code}${emulator ? '?emulator' : ''}`;

const at = (code: string, path = '') => ref(db, `sessions/${code}${path && `/${path}`}`);

let uid: Promise<string> | null = null;
/** Login anónimo: cada browser fica com um id que se mantém se recarregares a página. */
export const signIn = () => (uid ??= signInAnonymously(auth).then((c) => c.user.uid));

// ---------- TV ----------

/** O Firebase não aceita `undefined`. */
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

let created: Promise<string> | null = null;
/** Cria a sessão da TV (uma de cada vez, mesmo com o StrictMode a correr os efeitos duas vezes). */
export function createSession(settings: Settings) {
  return (created ??= (async () => {
    const tv = await signIn();
    for (let i = 0; i < 10; i++) {
      const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      if ((await get(at(code, 'tv'))).exists()) continue;
      await set(at(code), { tv, state: 'lobby', settings: plain(settings) });
      await onDisconnect(at(code)).remove();
      return code;
    }
    throw new Error('Não consegui criar a sessão. Recarrega a página.');
  })());
}

/** Apaga a sessão; a próxima chamada a createSession cria outra, com outro código. */
export async function endSession(code: string) {
  created = null;
  await onDisconnect(at(code)).cancel();
  await remove(at(code));
}

export const watchSession = (code: string, cb: (s: Session | null) => void) =>
  onValue(at(code), (snap) => cb(snap.val()));

/** Comandos do anfitrião: a TV executa cada um e apaga-o. */
export const onCommand = (code: string, cb: (action: Command) => void) =>
  onChildAdded(at(code, 'commands'), (snap) => {
    void remove(snap.ref);
    cb(snap.val()?.action);
  });

export const setHost = (code: string, host: string | null) => set(at(code, 'host'), host);
export const setState = (code: string, state: Session['state']) => set(at(code, 'state'), state);
/** Nova ronda: apaga as respostas da anterior. */
export const startRound = (code: string, round: RoundInfo) => update(at(code), { round, answers: null });
export const revealRound = (code: string, patch: Partial<RoundInfo>) => update(at(code, 'round'), patch);
export const lockRound = (code: string) => update(at(code, 'round'), { locked: true });

// ---------- Telemóvel ----------

export async function joinSession(code: string, name: string) {
  const me = await signIn();
  if (!(await get(at(code, 'tv'))).exists()) throw new Error(`Não há nenhuma sessão ${code}. Confirma o código na TV.`);
  const node = at(code, `players/${me}`);
  let joinedAt: object | number = serverTimestamp();
  const add = async () => {
    await set(node, { name, joinedAt });
    await onDisconnect(node).remove();
  };
  await add();
  joinedAt = (await get(node)).val().joinedAt; // ao voltar, mantém a ordem (o anfitrião é o primeiro)
  // Ecrã bloqueado ou rede em baixo: o Firebase tira o jogador; quando a ligação volta, ele volta a entrar.
  onValue(ref(db, '.info/connected'), (c) => { if (c.val()) add().catch(() => {}); });
  return me;
}

/** O telemóvel ouve só o que precisa (não as respostas dos outros, que podem ter desenhos). */
export function watchPlayerView(code: string, cb: (s: Omit<Session, 'answers'> | null) => void) {
  const view: Partial<Session> = {};
  let exists = true;
  const emit = () => cb(exists ? { ...(view as Session) } : null);
  const subs = [
    onValue(at(code, 'tv'), (s) => { exists = s.exists(); emit(); }),
    ...(['state', 'host', 'settings', 'players', 'round'] as const).map((key) =>
      onValue(at(code, key), (s) => { (view as Record<string, unknown>)[key] = s.val() ?? undefined; emit(); })),
  ];
  return () => subs.forEach((off) => off());
}

/** Só o anfitrião pode (database.rules.json). */
export const setSessionSettings = (code: string, settings: Settings) => set(at(code, 'settings'), plain(settings));
export const sendCommand = (code: string, action: Command) => push(at(code, 'commands'), { action });
export const submitAnswer = async (code: string, answer: Answer) => set(at(code, `answers/${await signIn()}`), answer);
