// Tab1Briefing — Executive Summary narrative + expandable Special Reports.

import { useState } from "react";
import type { IPresidentialBriefing } from "./briefingTypes.js";

interface Props {
  briefing: IPresidentialBriefing;
}

export function Tab1Briefing({ briefing }: Props) {
  const [expanded, setExpanded] = useState<string | null>(briefing.specialReports[0]?.id ?? null);

  return (
    <div className="briefing-tab">
      <div className="exec-summary">
        <div className="exec-summary-header">
          <span className="exec-summary-icon" aria-hidden>◢</span>
          <h2>Resumo Executivo</h2>
          <span className="exec-summary-addr">Senhor Presidente</span>
        </div>
        <p className="exec-summary-text">{briefing.executiveSummary}</p>
      </div>

      <div className="special-reports">
        <h3 className="section-heading">Relatórios Especiais do Gabinete</h3>
        {briefing.specialReports.map((report) => {
          const isOpen = expanded === report.id;
          return (
            <div key={report.id} className={`special-report ${isOpen ? "open" : ""}`}>
              <button
                className="special-report-header"
                onClick={() => setExpanded(isOpen ? null : report.id)}
                aria-expanded={isOpen}
              >
                <span className={`sr-chevron ${isOpen ? "sr-chevron-open" : ""}`} aria-hidden>▸</span>
                <div className="sr-title-block">
                  <span className="sr-title">{report.title}</span>
                  {report.subtitle && <span className="sr-subtitle">{report.subtitle}</span>}
                </div>
              </button>
              {isOpen && (
                <div className="special-report-body">
                  {report.sections.map((section, i) => (
                    <div key={i} className="sr-section">
                      <h4 className="sr-section-heading">{section.heading}</h4>
                      <p className="sr-section-content">{section.content}</p>
                      {section.metrics && (
                        <div className="sr-metrics">
                          {Object.entries(section.metrics).map(([key, val]) => (
                            <div key={key} className="sr-metric">
                              <span className="sr-metric-label">{key}</span>
                              <span className="sr-metric-value">{val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {report.recommendation && (
                    <div className="sr-recommendation">
                      <span className="sr-rec-label">Recomendação</span>
                      <p className="sr-rec-text">{report.recommendation}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="assessment-block">
        <h3 className="section-heading">Avaliação Estratégica</h3>
        <div className="assessment-grid">
          <div className="assessment-card">
            <span className="assessment-label">Resultado Tático</span>
            <p>{briefing.assessment.tacticalResult}</p>
          </div>
          <div className="assessment-card">
            <span className="assessment-label">Causa Raiz</span>
            <p>{briefing.assessment.rootCause}</p>
          </div>
          <div className="assessment-card assessment-outlook">
            <span className="assessment-label">Perspectiva Estratégica</span>
            <p>{briefing.assessment.strategicOutlook}</p>
          </div>
        </div>
        <div className="costs-table">
          <h4 className="costs-title">Custos Fiscais & Políticos</h4>
          {briefing.assessment.fiscalAndPoliticalCosts.map((cost, i) => (
            <div key={i} className="cost-row">
              <span className="cost-item">{cost.item}</span>
              <span className="cost-value">{cost.cost}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
