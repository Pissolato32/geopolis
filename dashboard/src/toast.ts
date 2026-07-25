const LS_KEY = 'geopolis.achievements';
const TOAST_DURATION = 5000;

export class AchievementToast {
  private readonly container: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'achievement-toast-container';
    document.body.appendChild(this.container);
  }

  show(id: string, title: string, description: string): void {
    const saved = this.loadUnlocked();
    if (saved.has(id)) return;
    saved.add(id);
    this.saveUnlocked(saved);

    const toast = document.createElement('div');
    toast.className = 'achievement-toast';

    const icon = document.createElement('span');
    icon.className = 'achievement-icon';
    icon.textContent = '🏆';
    toast.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'achievement-body';

    const label = document.createElement('span');
    label.className = 'achievement-label';
    label.textContent = 'Conquista Desbloqueada!';
    body.appendChild(label);

    const titleEl = document.createElement('strong');
    titleEl.className = 'achievement-title';
    titleEl.textContent = title;
    body.appendChild(titleEl);

    const descEl = document.createElement('p');
    descEl.className = 'achievement-desc';
    descEl.textContent = description;
    body.appendChild(descEl);

    toast.appendChild(body);
    this.container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('achievement-toast-visible'));

    setTimeout(() => {
      toast.classList.remove('achievement-toast-visible');
      toast.classList.add('achievement-toast-hiding');
      setTimeout(() => toast.remove(), 300);
    }, TOAST_DURATION);
  }

  private loadUnlocked(): Set<string> {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set();
    }
  }

  private saveUnlocked(ids: Set<string>): void {
    localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
  }
}
