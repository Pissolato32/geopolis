// Numeric formatting utilities. All user-facing values across dashboards
// use round2() to enforce a maximum of 2 decimal places.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatPct(n: number, decimals = 2): string {
  return `${round2(n).toFixed(decimals)}%`;
}

export function formatDelta(n: number, decimals = 2): string {
  const r = round2(n);
  const sign = r >= 0 ? "+" : "";
  return `${sign}${r.toFixed(decimals)}`;
}

export function formatSignedDelta(n: number, decimals = 2): string {
  const r = round2(n);
  const arrow = r >= 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(r).toFixed(decimals)}`;
}
