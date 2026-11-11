export type Placement = 'top' | 'bottom';

interface Box { top: number; bottom: number; left: number; width: number }
interface Size { width: number; height: number }

/**
 * Posição (fixed) da tooltip: do lado pedido se couber, senão do outro; centrada no elemento
 * e encostada às margens do ecrã quando sairia para fora.
 */
export function placeTooltip(anchor: Box, tip: Size, viewport: Size, preferred: Placement = 'top', gap = 8, margin = 8) {
  const fitsTop = anchor.top - gap - tip.height >= margin;
  const fitsBottom = anchor.bottom + gap + tip.height <= viewport.height - margin;
  const placement: Placement = preferred === 'top'
    ? (fitsTop || !fitsBottom ? 'top' : 'bottom')
    : (fitsBottom || !fitsTop ? 'bottom' : 'top');
  const top = placement === 'top' ? anchor.top - gap - tip.height : anchor.bottom + gap;
  const centred = anchor.left + anchor.width / 2 - tip.width / 2;
  const left = Math.max(margin, Math.min(centred, viewport.width - margin - tip.width));
  return { top, left, placement };
}
