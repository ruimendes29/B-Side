// Sessões com TV e telemóveis no Firebase Realtime Database (projeto b-side-c1322, conta pessoal do Rui).
// Guarda só o necessário: a TV, os jogadores, a ronda atual e as respostas dessa ronda.
// A sessão é apagada quando a TV se desliga (onDisconnect) e cada jogador sai quando fecha o separador.
// A configuração web do Firebase não é secreta: o acesso é controlado por database.rules.json.
import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, inMemoryPersistence, initializeAuth, signInAnonymously,
} from 'firebase/auth';
import {
  connectDatabaseEmulator, get, getDatabase, onChildAdded, onDisconnect, onValue, push, ref, remove, serverTimestamp, set, update,
} from 'firebase/database';
import type { RoundCategory } from './roundCategory';

// Testes locais: `?emulator` na página usa os emuladores do Firebase (npm run emulators), num projeto
// demo- que nunca fala com a Google. Aí o login fica só em memória, para a TV e vários "telemóveis"
// poderem ser separadores do mesmo browser.
const emulator = new URLSearchParams(location.search).has('emulator');

const app = initializeApp(emulator
  ? { apiKey: 'demo', projectId: 'demo-b-side', databaseURL: 'https://demo-b-side-default-rtdb.firebaseio.com' }
  : {
    apiKey: 'AIzaSyCFPbBMp-YG-59H0b32DeNby6bvqRwXXBk',
    authDomain: 'b-side-c1322.firebaseapp.com',
    databaseURL: 'https://b-side-c1322-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'b-side-c1322',
    appId: '1:483519232221:web:42a6a6f94a52ed3ab0c334',
  });
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
  revealed: boolean;
  answer?: string | null;
  year?: number | null;
  title?: string;
  artist?: string;
}

export interface Answer { round: number; text?: string; drawing?: string }

export interface Session {
  tv: string;
  state: 'lobby' | 'playing';
  host?: string;
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

let created: Promise<string> | null = null;
/** Cria a sessão da TV (uma por página, mesmo com o StrictMode a correr os efeitos duas vezes). */
export function createSession() {
  return (created ??= (async () => {
    const tv = await signIn();
    for (let i = 0; i < 10; i++) {
      const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      if ((await get(at(code, 'tv'))).exists()) continue;
      await set(at(code), { tv, state: 'lobby' });
      await onDisconnect(at(code)).remove();
      return code;
    }
    throw new Error('Não consegui criar a sessão. Recarrega a página.');
  })());
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

// ---------- Telemóvel ----------

export async function joinSession(code: string, name: string) {
  const me = await signIn();
  if (!(await get(at(code, 'tv'))).exists()) throw new Error(`Não há nenhuma sessão ${code}. Confirma o código na TV.`);
  await set(at(code, `players/${me}`), { name, joinedAt: serverTimestamp() });
  await onDisconnect(at(code, `players/${me}`)).remove();
  return me;
}

/** O telemóvel ouve só o que precisa (não as respostas dos outros, que podem ter desenhos). */
export function watchPlayerView(code: string, cb: (s: Omit<Session, 'answers'> | null) => void) {
  const view: Partial<Session> = {};
  let exists = true;
  const emit = () => cb(exists ? { ...(view as Session) } : null);
  const subs = [
    onValue(at(code, 'tv'), (s) => { exists = s.exists(); emit(); }),
    ...(['state', 'host', 'players', 'round'] as const).map((key) =>
      onValue(at(code, key), (s) => { (view as Record<string, unknown>)[key] = s.val() ?? undefined; emit(); })),
  ];
  return () => subs.forEach((off) => off());
}

export const sendCommand = (code: string, action: Command) => push(at(code, 'commands'), { action });
export const submitAnswer = async (code: string, answer: Answer) => set(at(code, `answers/${await signIn()}`), answer);
