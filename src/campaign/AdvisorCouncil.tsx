// AdvisorCouncil — renders the AI Advisory Council cards with advisor
// attribution, urgency ratings, competing multi-advisor proposals, vacant
// post banners, and a cabinet management entry point.

import { useState } from "react";
import type {
  AdvisorAgenda,
  AdvisorCard,
  ByodAdvisorResponse,
  UrgencyRating,
} from "./advisorTypes.js";
import { ADVISORS, ADVISOR_SLOTS, IDEOLOGY_LABELS, URGENCY_LABELS } from "./advisorTypes.js";
import type { CompetingOption } from "../shared/types.js";

interface Props {
  agenda: AdvisorAgenda;
  advisorResponses: ByodAdvisorResponse[];
  onDirectiveSubmit: (text: string) => void;
  onCardDispatch: (card: AdvisorCard) => void;
  onCompetingOptionChosen: (option: CompetingOption, cardId: string) => void;
  onOpenCabinetManager: () => void;
  dispatched: boolean;
}

const URGENCY_CLASS: Record<UrgencyRating, string> = {
  critical: "urgency-critical",
  high: "urgency-high",
  standard: "urgency-standard",
};

export function AdvisorCouncil({
  agenda,
  advisorResponses,
  onDirectiveSubmit,
  onCardDispatch,
  onCompetingOptionChosen,
  onOpenCabinetManager,
  dispatched,
}: Props) {
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
        <button className="cabinet-manager-open-btn" onClick={onOpenCabinetManager}>
          ⚙ Manage Cabinet
        </button>
      </div>

      {/* Advisor roster strip — shows all 5 universal slots with vacant indicators */}
      <div className="advisor-roster">
        {Object.values(ADVISOR_SLOTS).map((meta) => (
          <div
            key={meta.slotId}
            className={`advisor-roster-chip ${agenda.vacantSlots.includes(meta.slotId) ? "vacant" : ""}`}
            style={{ borderColor: meta.accentColor }}
          >
            <span className="advisor-roster-icon" style={{ color: meta.accentColor }}>{meta.icon}</span>
            <div className="advisor-roster-info">
              <span className="advisor-roster-name">{meta.label}</span>
              <span className="advisor-roster-title">
                {agenda.vacantSlots.includes(meta.slotId) ? "Vacant" : meta.focus}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Vacant post banners */}
      {agenda.vacantSlots.length > 0 && (
        <div className="advisor-vacant-banners">
          {agenda.vacantSlots.map((slotId) => {
            const meta = ADVISOR_SLOTS[slotId];
            return (
              <div key={slotId} className="advisor-vacant-banner">
                <span className="advisor-vacant-icon">{meta.icon}</span>
                <span className="advisor-vacant-text">
                  Post Vacant — No Advisor Assigned for {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

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

      {/* Competing proposal cards (Step 2) */}
      {agenda.competingCards.length > 0 && (
        <div className="advisor-competing-cards">
          <div className="advisor-cards-label">Competing Council Proposals — {agenda.competingCards.length} item(s)</div>
          {agenda.competingCards.map((card) => (
            <div key={card.id} className="advisor-competing-card">
              <div className="advisor-competing-card-header">
                <h5 className="advisor-competing-card-title">{card.title}</h5>
                <span className="advisor-competing-card-trigger">{card.kpiTrigger}</span>
              </div>
              <p className="advisor-competing-card-desc">{card.description}</p>
              <div className="advisor-competing-options">
                {card.options.map((opt) => {
                  const meta = ADVISOR_SLOTS[opt.slotId];
                  return (
                    <button
                      key={opt.id}
                      className="advisor-competing-option"
                      style={{ borderLeftColor: meta.accentColor }}
                      disabled={dispatched}
                      onClick={() => onCompetingOptionChosen(opt, card.id)}
                    >
                      <div className="advisor-competing-option-header">
                        <span className="advisor-competing-option-icon" style={{ color: meta.accentColor }}>
                          {meta.icon}
                        </span>
                        <div className="advisor-competing-option-advisor">
                          <span className="advisor-competing-option-name">{opt.advisorName}</span>
                          <span className="advisor-competing-option-ideology">
                            {IDEOLOGY_LABELS[opt.ideology]}
                          </span>
                        </div>
                      </div>
                      <div className="advisor-competing-option-objective">
                        <span className="competing-label">Objective</span>
                        <span className="competing-value">{opt.objective}</span>
                      </div>
                      <div className="advisor-competing-option-kpi">
                        <span className="competing-label">Target KPI</span>
                        <span className="competing-value">{opt.targetKpi}</span>
                      </div>
                      <div className="advisor-competing-option-action">
                        <span className="competing-label">Action</span>
                        <span className="competing-value competing-action">{opt.label}</span>
                      </div>
                      <div className="advisor-competing-option-satisfaction">
                        <span className="competing-label">Satisfaction Impact</span>
                        <span className="competing-value satisfaction-positive">
                          {opt.satisfactionDelta > 0 ? "+" : ""}{opt.satisfactionDelta}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Single-advisor decision cards */}
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
                    This crisis persists until addressed
                  </div>
                )}
                {card.intent && !dispatched && (
                  <button
                    className="advisor-card-dispatch"
                    onClick={() => onCardDispatch(card)}
                  >
                    Dispatch Directive
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
