import type { EventEmittedPayload } from './types';

const MAX_ENTRIES = 100;

export class EventLog {
  private readonly list: HTMLElement;
  private onSelectCountry: ((countryId: string) => void) | null = null;

  constructor(listId: string) {
    this.list = document.getElementById(listId) as HTMLElement;

    this.list.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const countryId = target.getAttribute('data-country');
      if (countryId && this.onSelectCountry) {
        this.onSelectCountry(countryId);
      }
    });
  }

  setOnSelectCountry(fn: (countryId: string) => void): void {
    this.onSelectCountry = fn;
  }

  addEntry(payload: EventEmittedPayload): void {
    const entry = document.createElement('div');
    const category = payload.eventType.startsWith('war')
      ? 'combat'
      : payload.eventType.startsWith('diplomacy')
        ? 'treaty'
        : 'economy';
    entry.className = `event-entry ${category}`;

    const meta = document.createElement('div');
    meta.className = 'event-meta';
    meta.innerHTML = `<span class="event-type">${payload.eventType}</span><span>T${payload.tick}</span>`;
    entry.appendChild(meta);

    const body = document.createElement('div');
    body.className = 'event-body';

    let details = '';
    if (payload.payload && typeof payload.payload === 'object') {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(payload.payload)) {
        const valStr = String(v);
        if (valStr.startsWith('country-')) {
          parts.push(`${k}: <span class="country-link" data-country="${valStr}">${valStr}</span>`);
        } else {
          parts.push(`${k}: ${valStr}`);
        }
      }
      details = parts.join(' | ');
    } else {
      details = payload.source;
    }

    body.innerHTML = details;
    entry.appendChild(body);

    this.list.prepend(entry);

    while (this.list.children.length > MAX_ENTRIES) {
      this.list.lastChild?.remove();
    }
  }

  clear(): void {
    this.list.innerHTML = '';
  }
}
