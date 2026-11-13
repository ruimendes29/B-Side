// Serviço de modais genérico, sem nada desta app: serve para qualquer projeto React.
// O modal edita uma cópia (rascunho) do valor que recebe. Nada muda de vez até se carregar em Guardar:
// fechar com alterações por guardar pergunta se é para guardar ou descartar.
// Montar <ModalHost /> uma vez na app; depois `modals.open({...})` em qualquer sítio.
import type { ReactNode } from 'react';

export type SetDraft<T> = (next: T | ((draft: T) => T)) => void;

export interface ModalLabels {
  save: string;
  discard: string;
  close: string;
  unsavedTitle: string;
  unsavedText: string;
  keepEditing: string;
}

export interface ModalOptions<T> {
  title: string;
  /** Valor inicial. O modal trabalha numa cópia; o original nunca é mexido. */
  value: T;
  /** Conteúdo do modal: recebe o rascunho e a forma de o mudar. */
  render: (draft: T, setDraft: SetDraft<T>) => ReactNode;
  /** Chamado ao guardar. Se falhar, o modal fica aberto e mostra o erro. */
  onSave?: (value: T) => void | Promise<void>;
  /** Para saber se há alterações. Por omissão compara em JSON. */
  isEqual?: (a: T, b: T) => boolean;
  labels?: Partial<ModalLabels>;
}

export const DEFAULT_LABELS: ModalLabels = {
  save: 'Guardar',
  discard: 'Descartar',
  close: 'Fechar',
  unsavedTitle: 'Alterações por guardar',
  unsavedText: 'Queres guardar as alterações antes de fechar?',
  keepEditing: 'Continuar a editar',
};

export interface ModalEntry<T = unknown> extends ModalOptions<T> {
  id: number;
  /** Fecha o modal: com o valor guardado, ou `undefined` se foi descartado. */
  settle: (value: T | undefined) => void;
}

type Listener = () => void;

export class ModalService {
  private stack: ModalEntry[] = [];
  private listeners = new Set<Listener>();
  private nextId = 1;

  /** Abre um modal. A promessa dá o valor guardado, ou `undefined` se as alterações foram descartadas. */
  open<T>(options: ModalOptions<T>): Promise<T | undefined> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      const entry: ModalEntry<T> = {
        ...options,
        id,
        settle: (value) => {
          this.stack = this.stack.filter((e) => e.id !== id);
          this.emit();
          resolve(value);
        },
      };
      this.stack = [...this.stack, entry as ModalEntry];
      this.emit();
    });
  }

  /** Fecha todos sem guardar (ex.: a página mudou de estado e o modal já não faz sentido). */
  closeAll() {
    [...this.stack].reverse().forEach((e) => e.settle(undefined));
  }

  // Para useSyncExternalStore.
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  snapshot = () => this.stack;

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const modals = new ModalService();

export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
