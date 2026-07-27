// AdvisorCouncil — renders the AI Advisory Council cards with advisor
// attribution, urgency ratings, and rationale. Integrates BYOD directive
// evaluation so advisors generate tailored responses to player freeform text.

import { useState } from "react";
import type { AdvisorAgenda, AdvisorCard, ByodAdvisorResponse, UrgencyRating } from "./advisorTypes.js";
import { ADVISORS, URGENCY_LABELS } from "./advisorTypes.js";

interface Props {
  agenda: AdvisorAgenda;
  advisorResponses: ByodAdvisorResponse[];
  onDirectiveSubmit: (text: string) => void;
  onCardDispatch: (card: AdvisorCard) => void;
  dispatched: boolean;
}

const URGENCY_CLASS: Record<UrgencyRating, string> = {
  critical: "urgency-critical",
  high: "urgency-high",
  standard: "urgency-standard",
};

export function AdvisorCouncil({ agenda, advisorResponses, onDirectiveSubmit, onCardDispatch, dispatched }: Props) {
  const [directiveText, setDirectiveText] = useState("");
  const [evaluating, setEvaluating] = useState(false);

  const handleEvaluate = () => {
    if (directiveText.trim().length < 5) return;
    setEvaluating(true);
    setTimeout(() => {
      onDirectiveSubmit(directiveText);
      setEvaluating(false);
    }, 300);
  };

  return (
    <div className="advisor-council">
      <div className="advisor-council-header">
        <h3 className="section-heading">AI Advisory Council</h3>
        <span className="advisor-council-summary">{agenda.councilSummary}</span>
      </div>

      {/* Advisor roster strip */}
      <div className="advisor-roster">
        {Object.values(ADVISORS).map((a) => (
          <div key={a.domain} className="advisor-roster-chip" style={{ borderColor: a.accentColor }}>
            <span className="advisor-roster-icon" style={{ color: a.accentColor }}>{a.icon}</span>
            <div className="advisor-roster-info">
              <span className="advisor-roster-name">{a.name}</span>
              <span className="advisor-roster-title">{a.title}</span>
            </div>
          </div>
        ))}
      </div>

      {/* BYOD directive input */}
      <div className="advisor-byod-area">
        <div className="advisor-byod-label">Submit a Directive for Council Evaluation</div>
        <div className="advisor-byod-input">
          <textarea
            className="advisor-byod-textarea"
            placeholder="e.g., Impose economic sanctions on RUS while pursuing back-channel diplomacy to de-escalate"
            value={directiveText}
            onChange={(e) => setDirectiveText(e.target.value)}
            rows={2}
            disabled={evaluating || dispatched}
          />
          <button
            className={`advisor-byod-btn ${evaluating ? "evaluating" : ""}`}
            onClick={handleEvaluate}
            disabled={evaluating || directiveText.trim().length < 5 || dispatched}
          >
            {evaluating ? "Council convening…" : "Submit to Council"}
          </button>
        </div>
      </div>

      {/* Advisor BYOD responses */}
      {advisorResponses.length > 0 && (
        <div className="advisor-responses">
          <div className="advisor-responses-label">Council Responses</div>
          {advisorResponses.map((resp, i) => {
            const advisor = ADVISORS[resp.advisorDomain];
            return (
              <div key={i} className="advisor-response" style={{ borderColor: advisor.accentColor }}>
                <div className="advisor-response-header">
                  <span className="advisor-response-icon" style={{ color: advisor.accentColor }}>{advisor.icon}</span>
                  <span className="advisor-response-name">{resp.advisorName}</span>
                  <span className={`urgency-badge ${URGENCY_CLASS[resp.urgency]}`}>{URGENCY_LABELS[resp.urgency]}</span>
                  <span className={`advisor-stance ${resp.supportsDirective ? "supports" : "cautions"}`}>
                    {resp.supportsDirective ? "Concurs" : "Cautions"}
                  </span>
                </div>
                <p className="advisor-response-rec">{resp.recommendation}</p>
                <div className="advisor-response-counter">
                  <span className="advisor-counter-label">Counter-proposal:</span>
                  <span className="advisor-counter-text">{resp.counterProposal}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Decision cards */}
      <div className="advisor-cards">
        <div className="advisor-cards-label">Active Agenda — {agenda.cards.length} item(s)</div>
        <div className="advisor-card-list">
          {agenda.cards.map((card) => {
            const advisor = ADVISORS[card.advisorDomain];
            return (
              <div key={card.id} className="advisor-card" style={{ borderColor: advisor.accentColor }}>
                <div className="advisor-card-top">
                  <div className="advisor-card-attribution">
                    <span className="advisor-card-icon" style={{ color: advisor.accentColor }}>{advisor.icon}</span>
                    <div className="advisor-card-advisor">
                      <span className="advisor-card-name">{card.advisorName}</span>
                      <span className="advisor-card-domain">{advisor.title}</span>
                    </div>
                  </div>
                  <span className={`urgency-badge ${URGENCY_CLASS[card.urgency]}`}>
                    {URGENCY_LABELS[card.urgency]}
                  </span>
                </div>
                <div className="advisor-card-rationale">{card.rationale}</div>
                <h5 className="advisor-card-title">{card.title}</h5>
                <p className="advisor-card-desc">{card.description}</p>
                <div className="advisor-card-meta">
                  <div className="advisor-card-cost">
                    <span className="meta-label">Cost</span>
                    <span className="meta-value">{card.estimatedCost}</span>
                  </div>
                  <div className="advisor-card-impact">
                    <span className="meta-label">Impact</span>
                    <span className="meta-value">{card.projectedImpact}</span>
                  </div>
                </div>
                {card.persistent && (
                  <div className="advisor-card-persistent">
                    ⚠ This crisis persists until addressed
                  </div>
                )}
                {card.intent && !dispatched && (
                  <button
                    className="advisor-card-dispatch"
                    onClick={() => onCardDispatch(card)}
                  >
                    ▶ Dispatch Directive
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
