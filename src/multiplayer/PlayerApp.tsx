// Página do telemóvel (/j/CODIGO): entrar na sessão da TV, esperar pelo anfitrião e responder em cada ronda.
import { useEffect, useState } from 'react';
import { store } from '../lib/util';
import type { Settings } from '../types';
import { loadSettings, type UpdateSettings } from '../hooks/useSettings';
import { type SetStatus, useStatus } from '../hooks/useStatus';
import { GlassCard } from '../components/GlassCard';
import { CategoriesPanel } from '../components/settings/CategoriesPanel';
import { SongsPanel } from '../components/settings/SongsPanel';
import { FamePanel } from '../components/settings/FamePanel';
import { ArtistsPanel } from '../components/settings/ArtistsPanel';
import { LanguagesPanel } from '../components/settings/LanguagesPanel';
import { ClipPanel } from '../components/settings/ClipPanel';
import { Whiteboard } from './Whiteboard';
import { RESULT_DELAY_MS } from './roundCategory';
import { GearIcon } from '../components/icons';
import { modals } from '../modals/ModalService';
import {
  type Answer, type Command, type Session, isCode, joinSession, normalizeCode, sendCommand, setSessionSettings, submitAnswer,
  watchPlayerView,
} from './session';

type View = Omit<Session, 'answers'>;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Os mesmos painéis de definições do site. */
function SettingsPanels({ settings, update, setStatus }: { settings: Settings; update: UpdateSettings; setStatus: SetStatus }) {
  return (
    <div className="host-settings">
      <CategoriesPanel settings={settings} update={update} />
      <SongsPanel settings={settings} update={update} setStatus={setStatus} />
      {settings.mode !== 'playlists' && <FamePanel settings={settings} update={update} />}
      {settings.mode === 'artists' && <ArtistsPanel settings={settings} update={update} setStatus={setStatus} />}
      {settings.mode === 'decades' && <LanguagesPanel settings={settings} update={update} />}
      <ClipPanel settings={settings} update={update} />
    </div>
  );
}

const patched = (s: Settings, patch: Parameters<UpdateSettings>[0]): Settings => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) });

/** Antes do jogo: as definições da sessão mudam logo (só o anfitrião as vê). */
function HostSettings({ code, saved, setStatus }: { code: string; saved?: Partial<Settings>; setStatus: SetStatus }) {
  const settings = loadSettings(saved ?? {});
  const update: UpdateSettings = (patch) => {
    setSessionSettings(code, patched(settings, patch)).catch((e) => setStatus(message(e), 'error'));
  };
  return <SettingsPanels settings={settings} update={update} setStatus={setStatus} />;
}

/** Durante o jogo: as definições abrem num modal e só vão para a sessão ao guardar. */
function openGameSettings(code: string, saved: Partial<Settings> | undefined, setStatus: SetStatus) {
  void modals.open({
    title: 'Definições do jogo',
    value: loadSettings(saved ?? {}),
    render: (draft, setDraft) => (
      <SettingsPanels settings={draft} update={(patch) => setDraft((d) => patched(d, patch))} setStatus={setStatus} />
    ),
    onSave: (s) => setSessionSettings(code, s),
  });
}

export default function PlayerApp({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(() => store.get('playerName', ''));
  const [me, setMe] = useState<string | null>(null);
  const [view, setView] = useState<View | null | undefined>(undefined); // undefined = a carregar, null = sessão acabou
  const [status, setStatus] = useStatus();
  const setError = (text: string) => setStatus(text, 'error');
  const [busy, setBusy] = useState(false);
  const [sentRound, setSentRound] = useState(0);
  const [choice, setChoice] = useState<{ round: number; i: number } | null>(null);

  useEffect(() => (me ? watchPlayerView(code, setView) : undefined), [me, code]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim().slice(0, 24);
    if (!isCode(code) || !n) return;
    setBusy(true);
    setError('');
    try {
      store.set('playerName', n);
      setMe(await joinSession(code, n));
      history.replaceState(null, '', `/j/${code}${location.search}`);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function send(answer: Answer) {
    try {
      await submitAnswer(code, answer);
      setSentRound(answer.round);
      if (answer.choice != null) setChoice({ round: answer.round, i: answer.choice });
    } catch (err) {
      setError(message(err));
    }
  }

  const command = (action: Command) => { sendCommand(code, action).catch((err) => setError(message(err))); };

  const hostPlaying = !!me && !!view && view.host === me && view.state === 'playing';
  // Deixou de ser anfitrião ou o jogo acabou: o modal das definições já não faz sentido.
  useEffect(() => { if (!hostPlaying) modals.closeAll(); }, [hostPlaying]);

  let body: React.ReactNode;
  if (!me) {
    body = (
      <form className="join" onSubmit={join}>
        <h1>Entrar no jogo</h1>
        <label>Código da TV
          <input value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} inputMode="text" autoCapitalize="characters"
            autoComplete="off" placeholder="ABCD" maxLength={4} className="code-input" />
        </label>
        <label>O teu nome
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoComplete="nickname" autoFocus={isCode(code)} />
        </label>
        <button type="submit" className="btn btn-green" disabled={busy || !isCode(code) || !name.trim()}>{busy ? 'A entrar…' : 'Entrar'}</button>
      </form>
    );
  } else if (view === undefined) {
    body = <p className="player-wait">A ligar…</p>;
  } else if (view === null) {
    body = <p className="player-wait">A sessão terminou: a TV foi desligada.</p>;
  } else {
    const players = Object.entries(view.players ?? {}).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
    const isHost = view.host === me;
    const hostName = view.host ? view.players?.[view.host]?.name : undefined;
    const round = view.round;

    if (view.state !== 'playing') {
      body = (
        <div className="player-lobby">
          <h1>Estás dentro, {view.players?.[me]?.name ?? name}!</h1>
          <p className="big-count">{players.length} {players.length === 1 ? 'jogador ligado' : 'jogadores ligados'}</p>
          <ul className="player-names">{players.map(([id, p]) => <li key={id}>{p.name}{id === view.host ? ' · anfitrião' : ''}</li>)}</ul>
          {isHost
            ? <button type="button" className="btn btn-green" onClick={() => command('start')}>Começar jogo</button>
            : <p className="hint">À espera que {hostName ?? 'o anfitrião'} comece o jogo.</p>}
          {isHost && <HostSettings code={code} saved={view.settings} setStatus={setStatus} />}
        </div>
      );
    } else if (!round) {
      body = <p className="player-wait">A escolher a primeira música…</p>;
    } else {
      const cat = round.cat;
      const answerWords = round.revealed && round.answer ? round.answer.split(' ') : null;
      // Com opções escolhe-se com um toque, sem quadro.
      const choosing = !!cat?.options?.length && !cat.lyric;
      const open = !round.revealed && !round.locked;
      const picked = choice?.round === round.n ? choice.i : undefined;
      body = (
        <div className="player-round">
          <div className="player-round-head">
            <span>Ronda {round.n}</span>
            {cat && <span className="player-cat" style={{ '--cat': cat.color } as React.CSSProperties}>{cat.name}</span>}
          </div>
          {cat && <p className="player-ask">{cat.ask}</p>}
          {cat && (cat.options || cat.lyric) && (
            <GlassCard color={cat.color} options={cat.options} revealed={round.revealed} delayMs={RESULT_DELAY_MS}
              correct={round.revealed && cat.options && round.answer ? cat.options.indexOf(round.answer) : -1}
              picked={picked} onPick={choosing && open ? (i) => void send({ round: round.n, choice: i }) : undefined}
              lyric={cat.lyric && { shown: cat.lyric.shown, hidden: answerWords ?? Array<string>(cat.lyric.blanks).fill('') }} />
          )}
          {round.revealed ? (
            <div className="player-reveal">
              <b className="b-year">{round.year ?? '????'}</b>
              <span>{round.artist} · <i>{round.title}</i></span>
              {round.answer && <span>Resposta: <b>{round.answer}</b></span>}
              <p className="hint">Vê as respostas de todos na TV.</p>
            </div>
          ) : round.locked ? (
            <p className="player-wait"><b>Results are in!</b><br />Olha para a TV.</p>
          ) : choosing ? null : (
            <Whiteboard key={round.n} round={round.n} onSubmit={send} sent={sentRound === round.n} />
          )}
          {sentRound === round.n && open && <p className="hint">Resposta enviada. Podes mudá-la até revelarem.</p>}
          {choosing && open && sentRound !== round.n && <p className="hint">Toca na tua resposta.</p>}
        </div>
      );
    }

    if (isHost && view.state === 'playing') {
      body = (
        <>
          {body}
          <div className="host-controls" role="group" aria-label="Comandos do anfitrião">
            <button type="button" className="btn btn-outline" onClick={() => command('play')}>▶ Tocar</button>
            <button type="button" className="btn btn-outline" onClick={() => command('reveal')}>Revelar</button>
            <button type="button" className="btn btn-outline" onClick={() => command('next')}>Próxima</button>
          </div>
        </>
      );
    }
  }

  return (
    <div className="player-app">
      <header className="player-top">
        <span className="brand-name">B-<b>Side</b></span>
        {me && <span className="pill">{code}</span>}
        {hostPlaying && (
          <button type="button" className="icon-btn" aria-label="Definições do jogo"
            onClick={() => openGameSettings(code, view?.settings ?? undefined, setStatus)}><GearIcon /></button>
        )}
      </header>
      {body}
      {status.text && <p className={`status${status.kind === 'error' ? ' error' : ''}`} role="status">{status.text}</p>}
    </div>
  );
}
