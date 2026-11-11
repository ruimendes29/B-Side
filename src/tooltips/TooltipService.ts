// Uma única tooltip para a app inteira, num <div> no <body> controlado diretamente no DOM.
// Mostrar, esconder e mudar de posição não passa pelo estado do React (nenhum componente volta a
// ser desenhado) e não há timers: o atraso ao passar o rato e o desvanecer são transições CSS.
import { TOOLTIP_THEMES, type TooltipTheme } from './themes';
import { placeTooltip, type Placement } from './placement';

const ID = 'app-tooltip';
const HOVER_DELAY = '300ms';

export interface TooltipOptions { theme: TooltipTheme; placement: Placement; delayed: boolean }

export class TooltipService {
  private el: HTMLDivElement | null = null;
  private anchor: HTMLElement | null = null;

  private node() {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = ID;
      this.el.setAttribute('role', 'tooltip');
      this.el.className = 'tooltip';
      document.body.appendChild(this.el);
    }
    return this.el;
  }

  /** Mostra a tooltip junto de `anchor` (ou move-a para lá, se já estiver aberta noutro elemento). */
  show(anchor: HTMLElement, text: string, { theme, placement, delayed }: TooltipOptions) {
    const el = this.node();
    if (this.anchor && this.anchor !== anchor) this.unlink(this.anchor);
    const wasOpen = el.classList.contains('is-open');
    this.anchor = anchor;
    el.textContent = text;
    const colors = TOOLTIP_THEMES[theme];
    el.style.setProperty('--tooltip-bg', colors.background);
    el.style.setProperty('--tooltip-fg', colors.color);
    // Já aberta (a passar de um botão para outro): muda logo, sem esperar outra vez.
    el.style.setProperty('--tooltip-delay', delayed && !wasOpen ? HOVER_DELAY : '0s');
    const pos = placeTooltip(anchor.getBoundingClientRect(), el.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, placement);
    el.style.top = `${pos.top}px`;
    el.style.left = `${pos.left}px`;
    el.classList.remove('tooltip--top', 'tooltip--bottom');
    el.classList.add(`tooltip--${pos.placement}`, 'is-open');
    anchor.setAttribute('aria-describedby', [anchor.getAttribute('aria-describedby'), ID].filter(Boolean).join(' '));
    if (!wasOpen) this.listen(true);
  }

  /** Esconde (com transição). Com `anchor`, só se a tooltip estiver nesse elemento. */
  hide = (anchor?: HTMLElement | null) => {
    if (!this.anchor || (anchor && anchor !== this.anchor)) return;
    this.unlink(this.anchor);
    this.anchor = null;
    this.el?.classList.remove('is-open');
    this.listen(false);
  };

  /** O texto mudou (ex.: "Tocar" passa a "Parar"): atualiza se estiver aberta nesse elemento. */
  update(anchor: HTMLElement | null, text: string, options: TooltipOptions) {
    if (anchor && anchor === this.anchor) this.show(anchor, text, { ...options, delayed: false });
  }

  private unlink(anchor: HTMLElement) {
    const rest = (anchor.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== ID);
    if (rest.length) anchor.setAttribute('aria-describedby', rest.join(' '));
    else anchor.removeAttribute('aria-describedby');
  }

  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.hide(); };
  private onMove = () => this.hide();

  private listen(on: boolean) {
    const method = on ? 'addEventListener' : 'removeEventListener';
    window[method]('keydown', this.onKey as EventListener);
    // shortcut: fecha com scroll/resize em vez de seguir o elemento; chega para dicas curtas, mudar se houver tooltips abertas durante scroll.
    window[method]('scroll', this.onMove, true);
    window[method]('resize', this.onMove);
  }
}

export const tooltips = new TooltipService();
