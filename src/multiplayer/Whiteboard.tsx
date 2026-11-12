// Quadro branco do telemóvel: escreve-se a resposta com o dedo ou com o teclado, no mesmo quadro.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Answer } from './session';

type Mode = 'draw' | 'type';
type Point = { x: number; y: number };

const EXPORT_WIDTH = 480; // px do PNG enviado: chega para ler na TV e fica pequeno (dezenas de kB)

const FingerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74a4.5 4.5 0 1 0-5 0zm9.84 4.63-4.54-2.26a1.4 1.4 0 0 0-.54-.11H13v-6a1.5 1.5 0 0 0-3 0v10.74l-3.43-.72a1 1 0 0 0-1.03.3l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27a1.5 1.5 0 0 0-.89-1.58z" /></svg>
);
const KeyboardIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z" /></svg>
);

interface Props {
  round: number;
  onSubmit: (answer: Answer) => void;
  sent: boolean;
}

export function Whiteboard({ round, onSubmit, sent }: Props) {
  const [mode, setMode] = useState<Mode>('draw');
  const [text, setText] = useState('');
  const [hasDrawing, setHasDrawing] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<Point | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // No modo teclado, abre logo o teclado do telemóvel.
  useEffect(() => { if (mode === 'type') textarea.current?.focus(); }, [mode]);

  // O canvas tem a resolução real do ecrã (devicePixelRatio) para o traço não ficar desfocado.
  useLayoutEffect(() => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#111';
  }, []);

  const pointOf = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const line = (a: Point, b: Point) => {
    const ctx = canvas.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  function clear() {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setHasDrawing(false);
    setText('');
  }

  /** PNG com fundo branco, à largura EXPORT_WIDTH. */
  function exportDrawing() {
    const c = canvas.current!;
    const out = document.createElement('canvas');
    out.width = EXPORT_WIDTH;
    out.height = Math.round((c.height / c.width) * EXPORT_WIDTH);
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(c, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  const empty = !hasDrawing && !text.trim();
  function submit() {
    if (empty) return;
    onSubmit({
      round,
      ...(text.trim() ? { text: text.trim().slice(0, 300) } : {}),
      ...(hasDrawing ? { drawing: exportDrawing() } : {}),
    });
  }

  return (
    <div className="board-wrap">
      <div className="board-bar">
        <div className="segmented board-mode" role="group" aria-label="Como escreves a resposta">
          <button type="button" aria-pressed={mode === 'draw'} aria-label="Escrever com o dedo" onClick={() => setMode('draw')}><FingerIcon /></button>
          <button type="button" aria-pressed={mode === 'type'} aria-label="Escrever com o teclado" onClick={() => setMode('type')}><KeyboardIcon /></button>
        </div>
        <button type="button" className="btn-link" onClick={clear} disabled={empty}>Apagar</button>
      </div>
      <div className={`board mode-${mode}`}>
        <canvas
          ref={canvas}
          aria-label="Quadro para desenhar a resposta"
          onPointerDown={(e) => {
            if (mode !== 'draw') return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = pointOf(e);
            line(p, { x: p.x + 0.01, y: p.y }); // um toque faz um ponto
            last.current = p;
            setHasDrawing(true);
          }}
          onPointerMove={(e) => {
            if (!last.current) return;
            const p = pointOf(e);
            line(last.current, p);
            last.current = p;
          }}
          onPointerUp={() => { last.current = null; }}
          onPointerCancel={() => { last.current = null; }}
        />
        {/* O texto fica por cima do desenho, no mesmo quadro. */}
        <textarea
          value={text}
          maxLength={300}
          placeholder={mode === 'type' ? 'Escreve a resposta…' : ''}
          aria-label="Resposta escrita"
          tabIndex={mode === 'type' ? 0 : -1}
          ref={textarea}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <button type="button" className="btn btn-green board-send" onClick={submit} disabled={empty}>
        {sent ? 'Atualizar resposta' : 'Enviar resposta'}
      </button>
    </div>
  );
}
