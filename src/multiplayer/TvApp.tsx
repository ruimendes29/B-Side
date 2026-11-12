// Página da TV (/tv): o jogo normal, mais a sessão com os telemóveis.
// Antes de começar mostra o QR, o código e quantos jogadores estão ligados; o anfitrião começa no telemóvel.
// Em cada ronda envia a categoria (sem a resposta) e, ao revelar, mostra as respostas de todos.
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import App, { type GameExtras } from '../App';
import type { useGame } from '../hooks/useGame';
import { player } from '../services/AudioPlayer';
import { publicCategory } from './roundCategory';
import {
  type Session, createSession, joinUrl, onCommand, revealRound, setHost, setState, startRound, watchSession,
} from './session';

type Game = ReturnType<typeof useGame>;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useTvSession(game: Game): GameExtras {
  const [code, setCode] = useState<string>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [sound, setSound] = useState(false);
  const [qr, setQr] = useState('');
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => { createSession().then(setCode, (e) => setError(message(e))); }, []);
  useEffect(() => (code ? watchSession(code, setSession) : undefined), [code]);
  useEffect(() => { if (code) QRCode.toDataURL(joinUrl(code), { margin: 1, width: 360 }).then(setQr); }, [code]);

  // Comandos do anfitrião (só o anfitrião pode escrevê-los: database.rules.json).
  useEffect(() => (code ? onCommand(code, (action) => {
    const { actions } = gameRef.current;
    if (action === 'start') { void setState(code, 'playing'); actions.next(); }
    else if (action in actions) actions[action as 'play' | 'reveal' | 'next' | 'replay']();
  }) : undefined), [code]);

  // Anfitrião: o primeiro a entrar; se sair, passa ao seguinte.
  useEffect(() => {
    if (!code || !session) return;
    const players = session.players ?? {};
    if (session.host && players[session.host]) return;
    const first = Object.entries(players).sort((a, b) => a[1].joinedAt - b[1].joinedAt)[0]?.[0] ?? null;
    if (first !== (session.host ?? null)) void setHost(code, first);
  }, [code, session]);

  // Nova ronda: a categoria já ficou escolhida antes de o número da ronda subir (useGame).
  useEffect(() => {
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

  const players = Object.entries(session?.players ?? {}).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  const hostName = session?.host ? session.players?.[session.host]?.name : undefined;

  if (session?.state !== 'playing') {
    return {
      overlay: (
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
              <ul className="player-names">{players.map(([id, p]) => <li key={id}>{p.name}{id === session?.host ? ' · anfitrião' : ''}</li>)}</ul>
              <p className="hint">{hostName ? `${hostName} começa o jogo no telemóvel.` : 'O primeiro a entrar é o anfitrião e começa o jogo.'}</p>
              {/* O browser só deixa tocar som depois de um clique ou tecla nesta página. */}
              <button type="button" className={`btn ${sound ? 'btn-outline' : 'btn-green'}`} autoFocus
                onClick={() => { player.unlock(); setSound(true); }}>
                {sound ? 'Som ativado ✓' : 'Carrega OK no comando para ativar o som'}
              </button>
            </>
          )}
        </section>
      ),
    };
  }

  const round = session.round;
  if (!round || round.n !== game.round) return {};
  const answers = session.answers ?? {};
  const answered = players.filter(([id]) => answers[id]?.round === round.n);
  return {
    belowCard: round.revealed ? (
      <section className="tv-answers" aria-label="Respostas">
        {players.map(([id, p]) => {
          const a = answers[id]?.round === round.n ? answers[id] : undefined;
          return (
            <figure key={id} className="tv-answer">
              <figcaption>{p.name}</figcaption>
              {a?.drawing?.startsWith('data:image/png;base64,') && <img src={a.drawing} alt={`Resposta desenhada por ${p.name}`} />}
              {a?.text && <p>{a.text}</p>}
              {!a && <p className="none">Sem resposta</p>}
            </figure>
          );
        })}
      </section>
    ) : (
      <p className="tv-progress">
        Respostas: {answered.length}/{players.length}
        {players.map(([id, p]) => <span key={id} className={answers[id]?.round === round.n ? 'done' : undefined}>{p.name}</span>)}
      </p>
    ),
  };
}

export default function TvApp() {
  return <App useExtras={useTvSession} />;
}
