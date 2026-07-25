type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TutorialStep {
  readonly targetSelector: string;
  readonly message: string;
  readonly position?: TooltipPosition;
  readonly onEnter?: () => void;
  readonly condition?: () => boolean;
}

const LS_KEY = 'geopolis.tutorial.completed';

export class TutorialOverlay {
  private readonly overlay: HTMLDivElement;
  private readonly svg: SVGElement;
  private readonly maskCircle: SVGCircleElement;
  private readonly tooltip: HTMLDivElement;
  private readonly skipBtn: HTMLButtonElement;
  private currentStep = 0;
  private readonly steps: ReadonlyArray<TutorialStep>;
  private destroyed = false;

  constructor(steps: ReadonlyArray<TutorialStep>) {
    this.steps = steps;

    this.overlay = document.createElement('div');
    this.overlay.id = 'tutorial-overlay';

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.style.display = 'block';

    const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
    mask.id = 'tutorial-mask';

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', 'white');
    mask.appendChild(bg);

    this.maskCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.maskCircle.setAttribute('cx', '0');
    this.maskCircle.setAttribute('cy', '0');
    this.maskCircle.setAttribute('r', '0');
    this.maskCircle.setAttribute('fill', 'black');
    mask.appendChild(this.maskCircle);

    this.svg.appendChild(mask);

    const overlayRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    overlayRect.setAttribute('width', '100%');
    overlayRect.setAttribute('height', '100%');
    overlayRect.setAttribute('fill', 'rgba(0,0,0,0.7)');
    overlayRect.setAttribute('mask', 'url(#tutorial-mask)');
    this.svg.appendChild(overlayRect);

    this.overlay.appendChild(this.svg);

    this.tooltip = document.createElement('div');
    this.tooltip.id = 'tutorial-tooltip';
    this.overlay.appendChild(this.tooltip);

    this.skipBtn = document.createElement('button');
    this.skipBtn.id = 'tutorial-skip';
    this.skipBtn.textContent = 'Pular Tutorial';
    this.overlay.appendChild(this.skipBtn);

    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay || e.target === this.svg) {
        this.next();
      }
    });

    this.skipBtn.addEventListener('click', () => this.skip());

    this.showStep(0);

    window.addEventListener('resize', this.handleResize);
  }

  private readonly handleResize = (): void => {
    this.positionSpotlight();
  };

  static isCompleted(): boolean {
    return localStorage.getItem(LS_KEY) === 'true';
  }

  static markCompleted(): void {
    localStorage.setItem(LS_KEY, 'true');
  }

  static reset(): void {
    localStorage.removeItem(LS_KEY);
  }

  private showStep(index: number): void {
    if (index >= this.steps.length) {
      this.finish();
      return;
    }

    this.currentStep = index;
    const step = this.steps[index]!;

    this.tooltip.querySelector('.tutorial-step-num')?.remove();
    const stepNum = document.createElement('span');
    stepNum.className = 'tutorial-step-num';
    stepNum.textContent = `${index + 1}/${this.steps.length}`;
    this.tooltip.appendChild(stepNum);

    this.tooltip.querySelector('.tutorial-message')?.remove();
    const msg = document.createElement('p');
    msg.className = 'tutorial-message';
    msg.textContent = step.message;
    this.tooltip.appendChild(msg);

    this.tooltip.className = `tooltip-${step.position ?? 'bottom'}`;

    if (step.onEnter) step.onEnter();

    this.positionSpotlight();
  }

  private positionSpotlight(): void {
    const step = this.steps[this.currentStep];
    if (!step) return;

    const target = document.querySelector(step.targetSelector);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.max(rect.width, rect.height) / 2 + 30;

    this.maskCircle.setAttribute('cx', String(cx));
    this.maskCircle.setAttribute('cy', String(cy));
    this.maskCircle.setAttribute('r', String(radius));

    this.positionTooltip(cx, cy, radius, rect, step.position ?? 'bottom');
  }

  private positionTooltip(
    cx: number,
    cy: number,
    radius: number,
    _targetRect: DOMRect,
    position: TooltipPosition,
  ): void {
    const ttW = 320;
    const ttH = this.tooltip.offsetHeight || 80;
    const gap = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = 0;
    let top = 0;

    switch (position) {
      case 'bottom':
        left = cx - ttW / 2;
        top = cy + radius + gap;
        if (left < 8) left = 8;
        if (left + ttW > vw - 8) left = vw - ttW - 8;
        if (top + ttH > vh - 8) top = cy - radius - ttH - gap;
        break;
      case 'top':
        left = cx - ttW / 2;
        top = cy - radius - ttH - gap;
        if (left < 8) left = 8;
        if (left + ttW > vw - 8) left = vw - ttW - 8;
        if (top < 8) top = cy + radius + gap;
        break;
      case 'left':
        left = cx - radius - ttW - gap;
        top = cy - ttH / 2;
        if (left < 8) left = cx + radius + gap;
        if (top < 8) top = 8;
        if (top + ttH > vh - 8) top = vh - ttH - 8;
        break;
      case 'right':
        left = cx + radius + gap;
        top = cy - ttH / 2;
        if (left + ttW > vw - 8) left = cx - radius - ttW - gap;
        if (top < 8) top = 8;
        if (top + ttH > vh - 8) top = vh - ttH - 8;
        break;
    }

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  next(): void {
    const nextIdx = this.currentStep + 1;

    if (nextIdx >= this.steps.length) {
      this.finish();
    } else {
      this.showStep(nextIdx);
    }
  }

  private finish(): void {
    TutorialOverlay.markCompleted();
    this.destroy();
    if (this.onComplete) this.onComplete();
  }

  private skip(): void {
    TutorialOverlay.markCompleted();
    this.destroy();
  }

  onComplete: (() => void) | null = null;

  private destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('resize', this.handleResize);
    this.overlay.remove();
  }
}
