import type { ApiClient } from './api-client';

export class ControlPanel {
  private readonly btnPlay: HTMLButtonElement;
  private readonly btnPause: HTMLButtonElement;
  private readonly btnStep: HTMLButtonElement;
  private readonly btnReset: HTMLButtonElement;
  private readonly speedSelect: HTMLSelectElement;
  private readonly onReset: () => void;
  private autoPlay = false;
  private playInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    onReset: () => void,
    private readonly api: ApiClient,
  ) {
    this.btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
    this.btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
    this.btnStep = document.getElementById('btn-step') as HTMLButtonElement;
    this.btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
    this.speedSelect = document.getElementById('speed-select') as HTMLSelectElement;
    this.onReset = onReset;

    this.btnPlay.addEventListener('click', () => this.togglePlay());
    this.btnPause.addEventListener('click', () => this.togglePlay());
    this.btnStep.addEventListener('click', () => this.step());
    this.btnReset.addEventListener('click', () => this.reset());

    this.speedSelect.addEventListener('change', () => this.adjustSpeed());
  }

  private step(): void {
    this.api.tick().catch(() => {});
  }

  private togglePlay(): void {
    this.autoPlay = !this.autoPlay;
    this.btnPlay.disabled = this.autoPlay;
    this.btnPause.disabled = !this.autoPlay;

    if (this.autoPlay) {
      const speed = parseInt(this.speedSelect.value, 10);
      this.api.tick().catch(() => {});
      this.playInterval = setInterval(() => {
        this.api.tick().catch(() => {});
      }, speed);
    } else {
      if (this.playInterval !== null) {
        clearInterval(this.playInterval);
        this.playInterval = null;
      }
    }
  }

  private adjustSpeed(): void {
    if (this.autoPlay) {
      if (this.playInterval !== null) clearInterval(this.playInterval);
      const speed = parseInt(this.speedSelect.value, 10);
      this.playInterval = setInterval(() => {
        this.api.tick().catch(() => {});
      }, speed);
    }
  }

  private reset(): void {
    if (this.autoPlay) this.togglePlay();
    this.onReset();
  }

  isPlaying(): boolean {
    return this.autoPlay;
  }
}
