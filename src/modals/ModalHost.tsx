// Desenha os modais abertos no ModalService. Usa o <dialog> nativo: o foco fica dentro do modal,
// Escape e o fundo fecham (passando pela pergunta "guardar ou descartar?" se houver alterações).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_LABELS, type ModalEntry, type ModalService, modals as defaultService, sameJson } from './ModalService';
import './modal.css';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ModalFrame<T>({ entry }: { entry: ModalEntry<T> }) {
  const labels = { ...DEFAULT_LABELS, ...entry.labels };
  const [draft, setDraft] = useState(entry.value);
  const [asking, setAsking] = useState(false); // a mostrar "guardar ou descartar?"
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = !(entry.isEqual ?? sameJson)(draft, entry.value);

  useEffect(() => {
    const d = dialog.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);

  async function save() {
    setSaving(true);
    setError('');
    try {
      await entry.onSave?.(draft);
      entry.settle(draft);
    } catch (e) {
      setError(message(e));
      setAsking(false);
      setSaving(false);
    }
  }
  const discard = () => entry.settle(undefined);
  const requestClose = () => { if (saving) return; if (dirty) setAsking(true); else discard(); };

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={`modal-title-${entry.id}`}
      onCancel={(e) => { e.preventDefault(); requestClose(); }}
      // Clique no fundo (fora da caixa) conta como fechar.
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div className="modal-box">
        <header className="modal-head">
          <h2 id={`modal-title-${entry.id}`}>{entry.title}</h2>
          <button type="button" className="modal-x" aria-label={labels.close} onClick={requestClose}>×</button>
        </header>
        <div className="modal-body">{entry.render(draft, setDraft)}</div>
        {error && <p className="modal-error" role="alert">{error}</p>}
        {asking ? (
          <footer className="modal-foot modal-ask" role="alertdialog" aria-label={labels.unsavedTitle}>
            <p><b>{labels.unsavedTitle}</b><br />{labels.unsavedText}</p>
            <div className="modal-actions">
              <button type="button" className="modal-btn" onClick={() => setAsking(false)}>{labels.keepEditing}</button>
              <button type="button" className="modal-btn" onClick={discard}>{labels.discard}</button>
              <button type="button" className="modal-btn modal-primary" onClick={save} disabled={saving} autoFocus>{labels.save}</button>
            </div>
          </footer>
        ) : (
          <footer className="modal-foot">
            <div className="modal-actions">
              <button type="button" className="modal-btn" onClick={discard} disabled={!dirty || saving}>{labels.discard}</button>
              <button type="button" className="modal-btn modal-primary" onClick={save} disabled={!dirty || saving}>{labels.save}</button>
            </div>
          </footer>
        )}
      </div>
    </dialog>
  );
}

/** Montar uma vez na app. */
export function ModalHost({ service = defaultService }: { service?: ModalService }) {
  const stack = useSyncExternalStore(service.subscribe, service.snapshot);
  return <>{stack.map((entry) => <ModalFrame key={entry.id} entry={entry} />)}</>;
}
