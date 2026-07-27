// Tab2Domains — color-coded grid of domain execution results.

import type { IPresidentialBriefing } from "./briefingTypes.js";

interface Props {
  briefing: IPresidentialBriefing;
}

const STATUS_CONFIG: Record<string, { icon: string; class: string; label: string }> = {
  success: { icon: "✓", class: "status-success", label: "SUCESSO" },
  warning: { icon: "⚠", class: "status-warning", label: "ALERTA" },
  critical: { icon: "✕", class: "status-critical", label: "CRÍTICO" },
  neutral: { icon: "○", class: "status-neutral", label: "NEUTRO" },
};

const DOMAIN_ICONS: Record<string, string> = {
  militar: "⚔",
  inteligencia: "◆",
  diplomatico: "⬡",
  politico_economico: "▲",
  projetos: "◇",
  comunicacao: "◈",
};

export function Tab2Domains({ briefing }: Props) {
  return (
    <div className="domains-tab">
      <h3 className="section-heading">Resultados por Domínio — Turno {briefing.header.turn}</h3>
      <div className="domain-grid">
        {briefing.domainResults.map((result) => {
          const cfg = STATUS_CONFIG[result.status];
          return (
            <div key={result.domain} className={`domain-card ${cfg.class}`}>
              <div className="domain-card-header">
                <span className="domain-icon" aria-hidden>{DOMAIN_ICONS[result.domain] ?? "◇"}</span>
                <span className="domain-label">{result.label}</span>
                <span className={`domain-status-badge ${cfg.class}`}>
                  {cfg.icon} {cfg.label}
                </span>
              </div>
              <p className="domain-summary">{result.summary}</p>
              <ul className="domain-details">
                {result.details.map((detail, i) => (
                  <li key={i}>{detail}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
