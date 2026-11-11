// Liga um elemento ao TooltipService. Não tem estado: passar o rato não volta a desenhar nada.
import {
  cloneElement, useEffect, useRef,
  type FocusEvent, type HTMLAttributes, type MouseEvent, type PointerEvent, type ReactElement,
} from 'react';
import { tooltips } from './TooltipService';
import type { TooltipTheme } from './themes';
import type { Placement } from './placement';
import './tooltip.css';

interface Props {
  content: string;
  theme?: TooltipTheme;
  placement?: Placement;
  /** Um único elemento (botão, link…) que recebe os eventos; não é embrulhado noutro elemento. */
  children: ReactElement<HTMLAttributes<HTMLElement>>;
}

export function Tooltip({ content, theme = 'default', placement = 'top', children }: Props) {
  const anchor = useRef<HTMLElement | null>(null);

  // O texto mudou enquanto está aberta (ex.: "Tocar" -> "Parar").
  useEffect(() => tooltips.update(anchor.current, content, { theme, placement, delayed: false }), [content, theme, placement]);
  // O elemento desapareceu (ex.: linha removida do histórico) com a tooltip aberta.
  useEffect(() => () => tooltips.hide(anchor.current), []);

  const open = (el: HTMLElement, delayed: boolean) => {
    anchor.current = el;
    tooltips.show(el, content, { theme, placement, delayed });
  };

  const p = children.props;
  return cloneElement(children, {
    'data-tooltip': '', // cursor de ajuda, só se o elemento não tiver outro (ver tooltip.css)
    onMouseEnter: (e: MouseEvent<HTMLElement>) => { p.onMouseEnter?.(e); open(e.currentTarget, true); },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => { p.onMouseLeave?.(e); tooltips.hide(e.currentTarget); },
    onPointerDown: (e: PointerEvent<HTMLElement>) => { p.onPointerDown?.(e); tooltips.hide(e.currentTarget); },
    // Só com o teclado: depois de um clique o foco fica no botão e a tooltip não deve ficar presa.
    onFocus: (e: FocusEvent<HTMLElement>) => { p.onFocus?.(e); if (e.currentTarget.matches(':focus-visible')) open(e.currentTarget, false); },
    onBlur: (e: FocusEvent<HTMLElement>) => { p.onBlur?.(e); tooltips.hide(e.currentTarget); },
  } as HTMLAttributes<HTMLElement>);
}
