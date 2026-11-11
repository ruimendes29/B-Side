import { normalize } from '../lib/util';

// "Xutos & Pontapés" = "Xutos e Pontapés": ignora as palavras de ligação.
const artistKey = (name: string) => normalize(name).replace(/\b(e|and|y|et|und)\b/g, ' ').replace(/\s+/g, ' ').trim();

/** Artistas que nunca devem tocar (nomes como o utilizador os escreveu). */
export class BlockList {
  private readonly keys: string[];

  constructor(names: string[]) {
    this.keys = names.map(artistKey).filter(Boolean);
  }

  /**
   * O artista está bloqueado? Também apanha duetos e participações:
   * bloquear "Shakira" tira "Shakira & Wyclef Jean" e "Canção (feat. Shakira)".
   */
  has(artist: string, title = '') {
    if (!this.keys.length) return false;
    const names = ` ${artistKey(artist)} `;
    const feat = String(title).match(/\b(?:feat|ft|featuring|with)\.?\s+([^)\]]+)/i)?.[1] || '';
    const guests = ` ${artistKey(feat)} `;
    return this.keys.some((b) => names.includes(` ${b} `) || (feat && guests.includes(` ${b} `)));
  }
}
