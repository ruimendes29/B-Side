// Cores das categorias: os valores estão em style.css (:root, --cat-*); aqui só os nomes.
export const CATEGORY_TONES = ['pink', 'yellow', 'blue', 'orange', 'purple'] as const;
export type CategoryTone = (typeof CATEGORY_TONES)[number];

/** Variável CSS da cor, para usar em style={{ background: toneVar('pink') }}. */
export const toneVar = (tone: CategoryTone) => `var(--cat-${tone})`;
