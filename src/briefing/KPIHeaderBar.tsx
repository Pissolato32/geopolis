// KPIHeaderBar — top metrics bar with trend indicators and escalation gauge.

import type { IPresidentialBriefing } from "./briefingTypes.js";

interface Props {
  briefing: IPresidentialBriefing;
}

function TrendBadge({ value, suffix = "%", invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  const positive = value >= 0;
  const good = invert ? !positive : positive;
  return (
    <span className={`kpi-trend ${good ? "trend-up" : "trend-down"}`}>
      {positive ? "▲" : "▼"} {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

function EscalationGauge({ level }: { level: number }) {
  const segments = Array.from({ length: 10 }, (_, i) => i < level);
  return (
    <div className="escalation-gauge" title={`Escalation Level: ${level}/10`}>
      {segments.map((active, i) => (
        <span
          key={i}
          className={`esc-seg ${active ? "esc-active" : ""} ${
            i < 3 ? "esc-low" : i < 6 ? "esc-mid" : "esc-high"
          }`}
        />
      ))}
      <span className="esc-label">{level}/10</span>
    </div>
  );
}

function MiniBar({ label, value, max = 100, unit = "%" }: { label: string; value: number; max?: number; unit?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="kpi-minibar">
      <span className="minibar-label">{label}</span>
      <div className="minibar-track">
        <div className="minibar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="minibar-value">{value}{unit}</span>
    </div>
  );
}

export function KPIHeaderBar({ briefing }: Props) {
  const m = briefing.stateMetrics;
  const h = briefing.header;

  return (
    <div className="kpi-header">
      <div className="kpi-header-left">
        <div className="kpi-turn">
          <span className="kpi-turn-label">TURN</span>
          <span className="kpi-turn-num">{h.turn}</span>
        </div>
        <div className="kpi-date">
          <span className="kpi-date-main">{h.date}</span>
          <span className="kpi-date-sub">{h.periodStr}</span>
        </div>
      </div>

      <div className="kpi-cards">
        <div className="kpi-card">
          <span className="kpi-card-label">Popularidade</span>
          <span className="kpi-card-value">{m.popularity}%</span>
          <TrendBadge value={m.trends.popularity} />
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">PIB</span>
          <span className="kpi-card-value">+{m.gdpGrowth}%</span>
          <TrendBadge value={m.trends.gdpGrowth} />
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Inflação</span>
          <span className="kpi-card-value">{m.inflation}%</span>
          <TrendBadge value={m.trends.inflation} invert />
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Dívida/PIB</span>
          <span className="kpi-card-value">{m.debtToGdp}%</span>
          <TrendBadge value={m.trends.debtToGdp} invert />
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Câmbio</span>
          <span className="kpi-card-value">R${m.exchangeRate.toFixed(2)}</span>
          <TrendBadge value={m.trends.exchangeRate} suffix="" invert />
        </div>
        <div className="kpi-card">
          <span className="kpi-card-label">Déficit</span>
          <span className="kpi-card-value">{m.deficit}%</span>
          <TrendBadge value={m.trends.deficit} invert />
        </div>
      </div>

      <div className="kpi-header-right">
        <div className="kpi-congress">
          <span className="kpi-section-label">Congresso</span>
          <div className="congress-row">
            <span className="congress-chamber">
              <b>{m.congressSupport.senators}</b><small>/81 Sen</small>
            </span>
            <span className="congress-chamber">
              <b>{m.congressSupport.deputies}</b><small>/513 Dep</small>
            </span>
          </div>
        </div>
        <div className="kpi-military">
          <span className="kpi-section-label">Prontidão Militar</span>
          <MiniBar label="Exército" value={m.militaryReadiness.army} />
          <MiniBar label="Marinha" value={m.militaryReadiness.navy} />
          <MiniBar label="Aeronáutica" value={m.militaryReadiness.airForce} />
        </div>
        <div className="kpi-escalation">
          <span className="kpi-section-label">Escalonamento</span>
          <EscalationGauge level={m.escalation} />
        </div>
      </div>
    </div>
  );
}
