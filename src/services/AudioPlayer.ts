const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/** Um único <audio> para os excertos. */
export class AudioPlayer {
  private readonly audio = new Audio();
  private unlocked = false;

  constructor() {
    this.audio.preload = 'auto';
  }

  /** Chamar dentro de um clique, antes de qualquer await, para o iOS deixar tocar som depois. */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.audio.src = SILENT;
    this.audio.play().catch(() => {});
  }

  async play(url: string, startSeconds: number) {
    const { audio } = this;
    if (audio.src !== url) {
      audio.src = url;
      await new Promise<void>((resolve, reject) => {
        const ok = () => { off(); resolve(); };
        const fail = () => { off(); reject(new Error('Não foi possível carregar o excerto.')); };
        const off = () => { audio.removeEventListener('loadedmetadata', ok); audio.removeEventListener('error', fail); };
        audio.addEventListener('loadedmetadata', ok);
        audio.addEventListener('error', fail);
        audio.load();
      });
    }
    audio.currentTime = startSeconds;
    await audio.play();
  }

  stop() {
    this.audio.pause();
  }
}

export const player = new AudioPlayer();
