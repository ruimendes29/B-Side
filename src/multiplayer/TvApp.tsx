// Página da TV (/tv). Cabe toda no ecrã, sem scroll (o comando da TV mal deixa fazer scroll):
// carta e controlos ao centro, músicas já tocadas numa coluna estreita à direita.
// As definições vêm da sessão no Firebase e quem as muda é o anfitrião, no telemóvel.
// Ao revelar mostra "Results are in!" com o quadro de cada jogador e, logo a seguir, a resposta certa por baixo.
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useGame } from '../hooks/useGame';
import { useStatus } from '../hooks/useStatus';
import { useShortcuts } from '../hooks/useShortcuts';
import { loadSettings } from '../hooks/useSettings';
import { player } from '../services/AudioPlayer';
import { Card } from '../components/Card';
import { Controls } from '../components/Controls';
import { Progress } from '../components/Progress';
import { History } from '../components/History';
import { GlassCard } from '../components/GlassCard';
import { RESULT_DELAY_MS, type RoundCategory, publicCategory } from './roundCategory';
import {
  type Answer, type Player, type Session, createSession, endSession, joinUrl, lockRound, onCommand, revealRound, setHost,
  setState, startRound, watchSession,
} from './session';

const EMPTY_GRACE_MS = 60_000; // um telemóvel com o ecrã bloqueado sai por momentos: não apagar logo
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Lobby({ code, players, host, sound, onSound, error }: {
  code?: string; players: [string, Player][]; host?: string; sound: boolean; onSound: () => void; error: string;
}) {
  const [qr, setQr] = useState('');
  useEffect(() => { if (code) void QRCode.toDataURL(joinUrl(code), { margin: 1, width: 360 }).then(setQr); }, [code]);
  const hostName = players.find(([id]) => id === host)?.[1].name;
  return (
    <section className="tv-lobby">
      {error ? <p className="status error">{error}</p> : !code ? <p>A criar a sessão…</p> : (
        <>
          <div className="tv-join">
            {qr && <img className="tv-qr" src={qr} alt={`QR para entrar: ${joinUrl(code)}`} />}
            <div>
              <p>Lê o QR com a câmara do telemóvel ou abre</p>
              <p className="tv-url">{joinUrl(code).replace(/^https?:\/\//, '').replace(/\/[^/]*$/, '')}</p>
              <p>e escreve o código</p>
              <p className="tv-code">{code}</p>
            </div>
          </div>
          <p className="big-count">{players.length} {players.length === 1 ? 'jogador ligado' : 'jogadores ligados'}</p>
          <ul className="player-names">{players.map(([id, p]) => <li key={id}>{p.name}{id === host ? ' · anfitrião' : ''}</li>)}</ul>
          <p className="hint">{hostName ? `${hostName} escolhe as definições e começa o jogo no telemóvel.` : 'O primeiro a entrar é o anfitrião.'}</p>
          {/* O browser só deixa tocar som depois de um clique ou tecla nesta página. */}
          <button type="button" className={`btn ${sound ? 'btn-outline' : 'btn-green'}`} autoFocus onClick={onSound}>
            {sound ? 'Som ativado ✓' : 'Carrega OK no comando para ativar o som'}
          </button>
        </>
      )}
    </section>
  );
}

/** Resposta certa da ronda, por baixo dos quadros dos jogadores. */
interface Solution { year: number | null; artist: string; title: string; category?: { name: string; color: string; answer: string } }

/** Quadro de cada jogador com o nome por baixo e, a aparecer devagar, a resposta certa. */
function Results({ players, answers, round, cat, solution }: {
  players: [string, Player][]; answers: Record<string, Answer>; round: number; cat: RoundCategory | null; solution?: Solution;
}) {
  const answerOf = (id: string) => (answers[id]?.round === round ? answers[id] : undefined);
  // Categorias com opções: em vez dos quadros, as opções com quem escolheu cada uma.
  const options = cat?.options?.length && !cat.lyric ? cat.options : null;
  const cols = players.length <= 4 ? Math.max(players.length, 1) : players.length <= 8 ? 4 : 5;
  const rows = Math.ceil(players.length / cols);
  return (
    <section className="tv-results" role="dialog" aria-label="Respostas">
      <h1>Results are in!</h1>
      {options ? (
        <div className="tv-results-choices">
          <GlassCard color={cat!.color} options={options} delayMs={RESULT_DELAY_MS}
            correct={solution?.category ? options.indexOf(solution.category.answer) : -1}
            votes={options.map((_, i) => players.filter(([id]) => answerOf(id)?.choice === i).map(([, p]) => p.name))} />
          {players.some(([id]) => answerOf(id)?.choice == null) && (
            <p className="hint">Sem resposta: {players.filter(([id]) => answerOf(id)?.choice == null).map(([, p]) => p.name).join(', ')}</p>
          )}
        </div>
      ) : <div className="tv-results-grid" style={{ '--cols': cols, '--rows': rows } as React.CSSProperties}>
        {players.map(([id, p]) => {
          const a = answerOf(id);
          return (
            <figure key={id}>
              <div className={`board-shot${a ? '' : ' none'}`}>
                {a?.drawing?.startsWith('data:image/png;base64,') && <img src={a.drawing} alt={`Desenho de ${p.name}`} />}
                {a?.text && <p>{a.text}</p>}
                {!a && <p>Sem resposta</p>}
              </div>
              <figcaption>{p.name}</figcaption>
            </figure>
          );
        })}
      </div>}
      {solution && (
        <div className="tv-solution" role="status">
          {solution.category && (
            <p className="tv-solution-cat" style={{ '--cat': solution.category.color } as React.CSSProperties}>
              <span>{solution.category.name}</span> <b>{solution.category.answer}</b>
            </p>
          )}
          <p><b className="tv-solution-year">{solution.year ?? '????'}</b> {solution.artist} · <i>{solution.title}</i></p>
        </div>
      )}
      <p className="hint">Carrega OK para fechar</p>
    </section>
  );
}

export default function TvApp() {
  const [status, setStatus] = useStatus();
  const [code, setCode] = useState<string>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [sound, setSound] = useState(false);
  const [results, setResults] = useState(false);
  const [gen, setGen] = useState(0); // sobe quando a sessão acaba, para criar outra

  const saved = JSON.stringify(session?.settings ?? null);
  const settings = useMemo(() => (session?.settings ? loadSettings(session.settings) : loadSettings()), [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const game = useGame(settings, setStatus);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => { createSession(loadSettings()).then(setCode, (e) => setError(message(e))); }, [gen]);
  useEffect(() => (code ? watchSession(code, setSession) : undefined), [code]);

  const players = Object.entries(session?.players ?? {}).sort((a, b) => a[1].joinedAt - b[1].joinedAt);

  // OK: acabam as respostas, a carta vira e aparece "Results are in!" com a resposta certa. Outro OK fecha.
  const resultsRef = useRef(false);
  function reveal() {
    const g = gameRef.current;
    if (resultsRef.current) {
      resultsRef.current = false;
      setResults(false);
      return;
    }
    if (!g.track || g.revealed || g.phase === 'loading' || !code) return;
    resultsRef.current = true;
    setResults(true);
    void lockRound(code);
    g.actions.reveal();
  }
  const actions = { ...game.actions, reveal };
  useShortcuts(actions);

  // Comandos do anfitrião (só o anfitrião pode escrevê-los: database.rules.json).
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => (code ? onCommand(code, (action) => {
    if (action === 'start') { void setState(code, 'playing'); actionsRef.current.next(); }
    else if (action in actionsRef.current) actionsRef.current[action as 'play' | 'reveal' | 'next' | 'replay']();
  }) : undefined), [code]);

  // Anfitrião: o primeiro a entrar; se sair, passa ao seguinte.
  useEffect(() => {
    if (!code || !session) return;
    if (session.host && session.players?.[session.host]) return;
    const first = players[0]?.[0] ?? null;
    if (first !== (session.host ?? null)) void setHost(code, first);
  }, [code, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sessão que já teve jogadores e ficou sem nenhum: apaga-a e mostra outro código.
  const hadPlayers = useRef(false);
  useEffect(() => {
    if (!code || !session) return;
    if (players.length) { hadPlayers.current = true; return; }
    if (!hadPlayers.current) return;
    const timer = window.setTimeout(() => {
      hadPlayers.current = false;
      setCode(undefined);
      setSession(null);
      endSession(code).then(() => setGen((g) => g + 1), (e) => setError(message(e)));
    }, EMPTY_GRACE_MS);
    return () => clearTimeout(timer);
  }, [code, players.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nova ronda: a categoria já ficou escolhida antes de o número da ronda subir (useGame).
  useEffect(() => {
    resultsRef.current = false;
    setResults(false);
    if (!code || !game.round) return;
    const cat = game.front && !game.front.rolling ? publicCategory(game.front.cat) : null;
    void startRound(code, { n: game.round, cat, revealed: false });
  }, [code, game.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const answerText = game.answer?.answer;
  useEffect(() => {
    const t = game.track;
    if (!code || !game.round || !game.revealed || game.year === undefined || !t || answerText === '…') return;
    void revealRound(code, { revealed: true, answer: answerText ?? null, year: game.year, title: t.title, artist: t.artists.join(', ') });
  }, [code, game.round, game.revealed, game.year, answerText]); // eslint-disable-line react-hooks/exhaustive-deps

  const round = session?.round?.n === game.round ? session.round : undefined;
  const answers = session?.answers ?? {};
  const answered = round ? players.filter(([id]) => answers[id]?.round === round.n).length : 0;
  const lobby = session?.state !== 'playing';
  const solution: Solution | undefined = game.revealed && game.year !== undefined && game.track && answerText !== '…'
    ? {
      year: game.year, artist: game.track.artists.join(', '), title: game.track.title,
      category: game.answer ? { name: game.answer.name, color: game.answer.color, answer: game.answer.answer } : undefined,
    }
    : undefined;

  return (
    <div className="tv">
      <main className="tv-main">
        <header className="tv-top">
          <span className="brand-name">B-<b>Side</b></span>
          <span className="tv-round">Ronda {game.round}</span>
          <span className="pill">{code ?? '…'} · {players.length} {players.length === 1 ? 'jogador' : 'jogadores'}</span>
        </header>
        <section className={`tv-stage${game.phase === 'playing' ? ' is-playing' : ''}`}>
          <Card {...game} onReveal={reveal} />
          <Progress clip={game.clip} playing={game.phase === 'playing'} defaultMs={settings.duration * 1000} />
          <Controls phase={game.phase} hasTrack={!!game.track} revealed={game.revealed}
            onPlay={actions.play} onReplay={actions.replay} onNext={actions.next} onReveal={reveal} />
          {round && !round.revealed && (
            <p className="tv-progress">
              Respostas: {answered}/{players.length}
              {players.map(([id, p]) => <span key={id} className={answers[id]?.round === round.n ? 'done' : undefined}>{p.name}</span>)}
            </p>
          )}
          <p className={`status${status.kind === 'error' ? ' error' : ''}`} role="status" aria-live="polite">{status.text}</p>
        </section>
      </main>
      <aside className="tv-side">
        <History history={game.history} onBlock={() => false} onClear={game.actions.clearHistory} />
      </aside>
      {lobby && (
        <div className="tv-overlay">
          <Lobby code={code} players={players} host={session?.host} sound={sound} error={error}
            onSound={() => { player.unlock(); setSound(true); }} />
        </div>
      )}
      {!lobby && results && round && (
        <div className="tv-overlay"><Results players={players} answers={answers} round={round.n} cat={round.cat} solution={solution} /></div>
      )}
    </div>
  );
}
