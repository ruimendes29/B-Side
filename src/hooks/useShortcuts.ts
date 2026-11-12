import { useEffect } from 'react';

interface Actions { play: () => void; replay: () => void; next: () => void; reveal: () => void }

/** Atalhos de teclado (e do comando da TV: setas, OK e teclas de media). */
export function useShortcuts(actions: Actions, onEscape?: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      const onButton = target.closest('button, a, [role="button"]');
      if (e.code === 'Space' && !onButton) { e.preventDefault(); actions.play(); }
      else if (e.key === 'Enter' && (!onButton || target.classList.contains('card'))) { e.preventDefault(); actions.reveal(); }
      else if (e.key === 'r' || e.key === 'R' || e.key === 'ArrowLeft') actions.replay();
      else if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight' || e.key === 'MediaTrackNext') actions.next();
      // Comandos de TV: play/pausa e ⏭ chegam como teclas de media.
      else if (e.key === 'MediaPlayPause' || e.key === 'MediaPlay' || e.key === 'MediaPause') { e.preventDefault(); actions.play(); }
      else if (e.key === 'Escape') onEscape?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
}
