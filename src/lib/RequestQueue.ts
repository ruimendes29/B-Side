import { sleep } from './util';

/**
 * Faz os pedidos um de cada vez, com uma pausa entre eles, e repete quando a API
 * responde com "demasiados pedidos" (MusicBrainz: 503, Wikidata: 429).
 */
export class RequestQueue {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly opts: { gapMs: number; retryStatus: number; retries: number; retryDelayMs: (attempt: number) => number; name: string }) {}

  fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const { gapMs, retryStatus, retries, retryDelayMs, name } = this.opts;
    const run = this.queue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        const res = await fetch(url, init);
        if (res.ok) return (await res.json()) as T;
        if (res.status !== retryStatus || attempt === retries) throw new Error(`${name} ${res.status}`);
        await sleep(retryDelayMs(attempt));
      }
    });
    this.queue = run.catch(() => {}).then(() => sleep(gapMs));
    return run;
  }
}
