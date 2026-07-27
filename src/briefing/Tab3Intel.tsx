// Tab3Intel — Intelligence Radar table + Global Developments feed.

import type { IPresidentialBriefing } from "./briefingTypes.js";

interface Props {
  briefing: IPresidentialBriefing;
}

const CONFIDENCE_CONFIG: Record<string, { class: string; dot: string }> = {
  BAIXA: { class: "conf-low", dot: "●" },
  MEDIA: { class: "conf-medium", dot: "●●" },
  ALTA: { class: "conf-high", dot: "●●●" },
  CRITICA: { class: "conf-critical", dot: "●●●●" },
};

const CATEGORY_ICONS: Record<string, string> = {
  "Mercado / Commodities": "📈",
  Geopolítica: "🌍",
  Diplomacia: "🤝",
  Inteligência: "◆",
  Segurança: "🛡",
};

export function Tab3Intel({ briefing }: Props) {
  return (
    <div className="intel-tab">
      <div className="intel-section">
        <h3 className="section-heading">Radar de Inteligência</h3>
        <div className="intel-radar-table">
          <div className="intel-radar-head">
            <span className="ir-col ir-target">Alvo</span>
            <span className="ir-col ir-confidence">Confiança</span>
            <span className="ir-col ir-update">Atualização Acionável</span>
          </div>
          {briefing.intelligenceRadar.map((entry, i) => {
            const cfg = CONFIDENCE_CONFIG[entry.confidence];
            return (
              <div key={i} className={`intel-radar-row ${cfg.class}`}>
                <span className="ir-col ir-target">{entry.target}</span>
                <span className={`ir-col ir-confidence ${cfg.class}`}>
                  <span className="conf-dot">{cfg.dot}</span>
                  <span className="conf-text">{entry.confidence}</span>
                </span>
                <span className="ir-col ir-update">{entry.update}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="world-dev-section">
        <h3 className="section-heading">Desenvolvimentos Globais</h3>
        <div className="world-dev-list">
          {briefing.worldDevelopments.map((dev, i) => (
            <div key={i} className="world-dev-card">
              <div className="wd-header">
                <span className="wd-icon" aria-hidden>{CATEGORY_ICONS[dev.category] ?? "●"}</span>
                <span className="wd-category">{dev.category}</span>
              </div>
              <p className="wd-headline">{dev.headline}</p>
              <p className="wd-impact">
                <span className="wd-impact-label">Impacto:</span> {dev.impact}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
