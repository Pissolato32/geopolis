// Tab4Decisions — Strategic Decision Room with option selection.

import { useState } from "react";
import type { IPresidentialBriefing } from "./briefingTypes.js";

interface Props {
  briefing: IPresidentialBriefing;
  onSubmit: (selections: Record<string, string>) => void;
}

const DOMAIN_ICONS: Record<string, string> = {
  security: "🛡",
  diplomacy: "🤝",
  economy: "▲",
};

export function Tab4Decisions({ briefing, onSubmit }: Props) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const select = (domain: string, optionId: string) => {
    setSelections((prev) => ({ ...prev, [domain]: optionId }));
  };

  const allSelected = briefing.decisionOptions.every((group) => selections[group.domain]);
  const pendingCount = briefing.decisionOptions.length - Object.keys(selections).length;

  const handleSubmit = () => {
    if (!allSelected) return;
    setSubmitted(true);
    onSubmit(selections);
  };

  return (
    <div className="decisions-tab">
      <div className="decisions-header">
        <h3 className="section-heading">Sala de Decisão Estratégica</h3>
        <div className="decisions-status">
          {submitted ? (
            <span className="decisions-done">✓ Decisões transmitidas ao Gabinete</span>
          ) : (
            <span className="decisions-pending">
              {pendingCount > 0 ? `${pendingCount} decisão(ões) pendente(s)` : "Todas as decisões selecionadas"}
            </span>
          )}
        </div>
      </div>

      {briefing.decisionOptions.map((group) => (
        <div key={group.domain} className="decision-group">
          <div className="decision-group-header">
            <span className="dg-icon" aria-hidden>{DOMAIN_ICONS[group.domain] ?? "◇"}</span>
            <h4 className="dg-label">{group.domainLabel}</h4>
          </div>
          <div className="decision-options">
            {group.options.map((option) => {
              const isSelected = selections[group.domain] === option.id;
              return (
                <button
                  key={option.id}
                  className={`decision-option ${isSelected ? "selected" : ""}`}
                  onClick={() => select(group.domain, option.id)}
                  disabled={submitted}
                >
                  <div className="do-header">
                    <span className="do-code">OPÇÃO {option.code}</span>
                    {isSelected && <span className="do-check">✓</span>}
                  </div>
                  <h5 className="do-title">{option.title}</h5>
                  <p className="do-description">{option.description}</p>
                  <div className="do-meta">
                    <div className="do-cost">
                      <span className="do-meta-label">Custo Estimado</span>
                      <span className="do-meta-value">{option.estimatedCost}</span>
                    </div>
                    <div className="do-impact">
                      <span className="do-meta-label">Impacto Projetado</span>
                      <span className="do-meta-value">{option.projectedImpact}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {!submitted && (
        <button
          className={`decisions-submit ${allSelected ? "ready" : ""}`}
          onClick={handleSubmit}
          disabled={!allSelected}
        >
          {allSelected ? "▶ Transmitir Decisões ao Gabinete" : `Selecione todas as opções (${pendingCount} restante(s))`}
        </button>
      )}
    </div>
  );
}
