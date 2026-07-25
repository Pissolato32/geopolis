import type { StateStore } from './state-store';
import type { EntityDTO, SimulationState } from './types';

const CHART_COLORS = ['#58a6ff', '#3fb950', '#d29922'];
const METRIC_LABELS: Record<string, string> = {
  gdp: 'PIB',
  treasury: 'Tesouro',
  industrialOutput: 'Produção',
};

export class ChartsView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private state: Readonly<SimulationState> | null = null;
  private animFrameId: number | null = null;

  constructor(canvasId: string, store: StateStore) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.resize();
    window.addEventListener('resize', () => this.resize());

    store.onSimState((s) => {
      this.state = s;
      this.scheduleRender();
    });
  }

  private resize(): void {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.canvas.width = rect.width * devicePixelRatio;
    this.canvas.height = rect.height * devicePixelRatio;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.animFrameId !== null) return;
    this.animFrameId = requestAnimationFrame(() => {
      this.animFrameId = null;
      this.render();
    });
  }

  private formatCompact(val: number): string {
    if (Math.abs(val) >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
    if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
    if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
    if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
    return `$${val.toFixed(0)}`;
  }

  private render(): void {
    const w = this.canvas.width / devicePixelRatio;
    const h = this.canvas.height / devicePixelRatio;
    const state = this.state;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.save();
    this.ctx.scale(devicePixelRatio, devicePixelRatio);

    if (!state) {
      this.ctx.restore();
      return;
    }

    const entries = Object.values(state.entities).filter(
      (e) => e.components['economy.indicator'],
    );

    if (entries.length === 0) {
      this.ctx.fillStyle = '#8b949e';
      this.ctx.font = '12px Inter, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Sem dados econômicos', w / 2, h / 2);
      this.ctx.restore();
      return;
    }

    const metrics = ['gdp', 'treasury', 'industrialOutput'] as const;

    // Legend at top
    let legendX = 4;
    const legendY = 10;
    this.ctx.font = '9px Inter, sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    for (let mi = 0; mi < metrics.length; mi++) {
      this.ctx.fillStyle = CHART_COLORS[mi] ?? '#58a6ff';
      this.ctx.fillRect(legendX, legendY - 4, 8, 8);
      this.ctx.fillStyle = '#a8b3c7';
      const label = METRIC_LABELS[metrics[mi]!] ?? metrics[mi]!;
      this.ctx.fillText(label, legendX + 12, legendY);
      legendX += this.ctx.measureText(label).width + 30;
    }

    const maxVal = this.findMax(entries, metrics);
    const rowH = 16;
    const groupGap = 10;
    const nameColW = 34;
    const valueColW = 46;
    const barAreaW = w - nameColW - valueColW - 12;
    let y = 26;

    for (const entity of entries) {
      const indicator = entity.components['economy.indicator'] as Record<string, number>;
      const shortName = entity.name.replace(/^country-/i, '').toUpperCase();

      // Entity name header
      this.ctx.font = 'bold 10px Inter, sans-serif';
      this.ctx.fillStyle = '#e6edf3';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(shortName, 4, y);
      y += rowH * 0.6;

      for (let mi = 0; mi < metrics.length; mi++) {
        const metric = metrics[mi]!;
        const val = indicator[metric] ?? 0;
        const barW = maxVal > 0 ? (val / maxVal) * barAreaW : 0;

        // bar
        this.ctx.fillStyle = CHART_COLORS[mi] ?? '#58a6ff';
        this.ctx.fillRect(nameColW, y - 4, Math.max(1, barW), 8);

        // value label
        this.ctx.font = '8px Inter, sans-serif';
        this.ctx.fillStyle = '#8b949e';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(this.formatCompact(val), nameColW + barW + 5, y);

        y += rowH;
      }

      y += groupGap;
      if (y > h - rowH) break; // avoid overflow
    }

    this.ctx.restore();
  }

  private findMax(
    entries: EntityDTO[],
    metrics: readonly string[],
  ): number {
    let max = 0;
    for (const entity of entries) {
      const indicator = entity.components['economy.indicator'] as Record<string, number>;
      if (!indicator) continue;
      for (const m of metrics) {
        const v = indicator[m] ?? 0;
        if (v > max) max = v;
      }
    }
    return max;
  }
}
