import { useCallback, useRef, useState } from 'react';

export interface StatusMessage { text: string; kind: 'info' | 'error' }
export type SetStatus = (text: string, kind?: StatusMessage['kind']) => void;

/** Mensagem por baixo dos controlos. As informativas desaparecem ao fim de 4 s; os erros ficam. */
export function useStatus() {
  const [status, setState] = useState<StatusMessage>({ text: '', kind: 'info' });
  const timer = useRef(0);

  const setStatus = useCallback<SetStatus>((text, kind = 'info') => {
    setState({ text, kind });
    clearTimeout(timer.current);
    if (text && kind !== 'error') timer.current = window.setTimeout(() => setState({ text: '', kind: 'info' }), 4000);
  }, []);

  return [status, setStatus] as const;
}
