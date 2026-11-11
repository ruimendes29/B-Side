// Temas das tooltips. Para juntar um tema, acrescenta uma entrada: o nome fica logo disponível
// em <Tooltip theme="…">. Usa variáveis CSS da app para as cores seguirem o resto da interface.
import { CATEGORY_TONES, type CategoryTone, toneVar } from '../theme/colors';

export interface TooltipThemeColors { background: string; color: string }

const categoryThemes = Object.fromEntries(
  CATEGORY_TONES.map((tone) => [tone, { background: toneVar(tone), color: '#000' }]),
) as Record<CategoryTone, TooltipThemeColors>;

export const TOOLTIP_THEMES = {
  default: { background: 'var(--elev-3)', color: 'var(--text)' },
  accent: { background: 'var(--green)', color: '#000' },
  danger: { background: 'var(--red)', color: '#000' },
  ...categoryThemes,
} satisfies Record<string, TooltipThemeColors>;

export type TooltipTheme = keyof typeof TOOLTIP_THEMES;
