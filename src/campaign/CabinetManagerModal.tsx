// CabinetManagerModal — overlay for inspecting, dismissing, and appointing
// advisors. When dismissing, presents 3 candidate options with distinct
// ideological profiles plus a 4th "Leave Post Vacant" option.

import { useState } from "react";
import type {
  AdvisorSlotId,
  AdvisorCandidate,
  AdvisorState,
  CabinetState,
} from "../shared/types.js";
import {
  ADVISOR_SLOTS,
  SLOT_ORDER,
  IDEOLOGY_LABELS,
  generateCandidates,
  createDefaultCabinet,
} from "./advisorTypes.js";

interface Props {
  cabinet: CabinetState;
  tick: number;
  onAppoint: (slotId: AdvisorSlotId, advisor: AdvisorState) => void;
  onLeaveVacant: (slotId: AdvisorSlotId) => void;
  onClose: () => void;
}

type Mode = "inspect" | "selecting";

export function CabinetManagerModal({
  cabinet,
  tick,
  onAppoint,
  onLeaveVacant,
  onClose,
}: Props) {
  const [mode, setMode] = useState<Mode>("inspect");
  const [activeSlot, setActiveSlot] = useState<AdvisorSlotId | null>(null);
  const [candidates, setCandidates] = useState<AdvisorCandidate[]>([]);

  const handleDismissClick = (slotId: AdvisorSlotId) => {
    const cands = generateCandidates(slotId, tick);
    setCandidates(cands);
    setActiveSlot(slotId);
    setMode("selecting");
  };

  const handleAppoint = (candidate: AdvisorCandidate) => {
    if (!activeSlot) return;
    const advisor: AdvisorState = {
      slotId: activeSlot,
      name: candidate.name,
      ideology: candidate.ideology,
      satisfaction: candidate.satisfactionPrediction,
      loyalty: candidate.loyaltyPrediction,
      appointedTick: tick,
    };
    onAppoint(activeSlot, advisor);
    setMode("inspect");
    setActiveSlot(null);
  };

  const handleLeaveVacant = () => {
    if (!activeSlot) return;
    onLeaveVacant(activeSlot);
    setMode("inspect");
    setActiveSlot(null);
  };

  const handleFillVacant = (slotId: AdvisorSlotId) => {
    const cands = generateCandidates(slotId, tick);
    setCandidates(cands);
    setActiveSlot(slotId);
    setMode("selecting");
  };

  const slotMeta = activeSlot ? ADVISOR_SLOTS[activeSlot] : null;

  return (
    <div className="campaign-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="cabinet-manager-modal" onClick={(e) => e.stopPropagation()}>
        {mode === "inspect" && (
          <>
            <div className="cabinet-manager-header">
              <div>
                <h2>Cabinet Management</h2>
                <p className="cabinet-manager-sub">
                  Inspect advisor ratings, dismiss underperforming ministers, or appoint new ones.
                </p>
              </div>
              <button className="cabinet-manager-close" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="cabinet-manager-list">
              {SLOT_ORDER.map((slotId) => {
                const meta = ADVISOR_SLOTS[slotId];
                const advisor = cabinet[slotId];
                return (
                  <div
                    key={slotId}
                    className={`cabinet-manager-slot ${advisor ? "filled" : "vacant"}`}
                    style={{ borderLeftColor: meta.accentColor }}
                  >
                    <div className="cabinet-manager-slot-header">
                      <span className="cabinet-manager-slot-icon" style={{ color: meta.accentColor }}>
                        {meta.icon}
                      </span>
                      <div className="cabinet-manager-slot-info">
                        <span className="cabinet-manager-slot-label">{meta.label}</span>
                        <span className="cabinet-manager-slot-focus">{meta.focus}</span>
                      </div>
                    </div>

                    {advisor ? (
                      <>
                        <div className="cabinet-manager-advisor-name">
                          {advisor.name}
                          <span className="cabinet-manager-ideology">
                            {IDEOLOGY_LABELS[advisor.ideology]}
                          </span>
                        </div>
                        <div className="cabinet-manager-ratings">
                          <div className="cabinet-manager-rating">
                            <span className="rating-label">Satisfaction</span>
                            <div className="rating-bar">
                              <div
                                className="rating-fill satisfaction"
                                style={{ width: `${advisor.satisfaction}%` }}
                              />
                            </div>
                            <span className="rating-value">{advisor.satisfaction}%</span>
                          </div>
                          <div className="cabinet-manager-rating">
                            <span className="rating-label">Loyalty</span>
                            <div className="rating-bar">
                              <div
                                className="rating-fill loyalty"
                                style={{ width: `${advisor.loyalty}%` }}
                              />
                            </div>
                            <span className="rating-value">{advisor.loyalty}%</span>
                          </div>
                        </div>
                        <button
                          className="cabinet-manager-dismiss-btn"
                          onClick={() => handleDismissClick(slotId)}
                        >
                          Dismiss &amp; Replace
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="cabinet-manager-vacant-banner">
                          Post Vacant — No Advisor Assigned
                        </div>
                        <p className="cabinet-manager-vacant-note">
                          No advisor salary or dissatisfaction mechanics. No option cards
                          from this council.
                        </p>
                        <button
                          className="cabinet-manager-appoint-btn"
                          onClick={() => handleFillVacant(slotId)}
                        >
                          Appoint Advisor
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {mode === "selecting" && activeSlot && slotMeta && (
          <>
            <div className="cabinet-manager-header">
              <div>
                <h2>Appoint {slotMeta.label}</h2>
                <p className="cabinet-manager-sub">
                  Choose from 3 candidates with distinct ideological profiles, or leave the post vacant.
                </p>
              </div>
              <button
                className="cabinet-manager-close"
                onClick={() => { setMode("inspect"); setActiveSlot(null); }}
                aria-label="Back"
              >
                ←
              </button>
            </div>

            <div className="cabinet-candidates-list">
              {candidates.map((cand) => (
                <button
                  key={cand.id}
                  className="cabinet-candidate-card"
                  style={{ borderLeftColor: slotMeta.accentColor }}
                  onClick={() => handleAppoint(cand)}
                >
                  <div className="cabinet-candidate-header">
                    <span className="cabinet-candidate-name">{cand.name}</span>
                    <span className="cabinet-candidate-ideology">
                      {IDEOLOGY_LABELS[cand.ideology]}
                    </span>
                  </div>
                  <p className="cabinet-candidate-bio">{cand.bio}</p>
                  <div className="cabinet-candidate-predictions">
                    <span className="prediction-label">Est. Satisfaction</span>
                    <span className="prediction-value">{cand.satisfactionPrediction}%</span>
                    <span className="prediction-label">Est. Loyalty</span>
                    <span className="prediction-value">{cand.loyaltyPrediction}%</span>
                  </div>
                </button>
              ))}

              {/* 4th option: Leave Post Vacant */}
              <button
                className="cabinet-candidate-card vacant-option"
                onClick={handleLeaveVacant}
              >
                <div className="cabinet-candidate-header">
                  <span className="cabinet-candidate-name">Leave Post Vacant</span>
                </div>
                <p className="cabinet-candidate-bio">
                  Remove the advisor without appointing an immediate replacement.
                  No advisor salary or dissatisfaction mechanics. No option cards
                  from this council.
                </p>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { createDefaultCabinet };
