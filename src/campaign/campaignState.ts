// Campaign state persistence — stores the locked player nation, campaign
// start timestamp, and active scenario ID in localStorage so a page
// reload preserves the campaign session.

export interface CampaignState {
  playerCountryId: string;
  startedAt: number;
  scenarioId: string;
  locked: boolean;
}

const STORAGE_KEY = "geopolis-campaign";

export function loadCampaign(): CampaignState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CampaignState;
    if (!parsed.playerCountryId || typeof parsed.startedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCampaign(state: CampaignState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable in some contexts
  }
}

export function clearCampaign(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isCampaignLocked(): boolean {
  const state = loadCampaign();
  return state?.locked ?? false;
}

export function getLockedPlayerCountryId(): string | null {
  const state = loadCampaign();
  return state?.locked ? state.playerCountryId : null;
}
