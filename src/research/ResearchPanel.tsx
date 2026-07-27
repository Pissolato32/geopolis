// ResearchPanel — renders the technology tree with 3 branches, progress bars,
// advisor satisfaction bonuses, and tech node cards. Integrated into the
// Decision Room tab of the Briefing Dashboard.

import { useState } from "react";
import type { Country, TechBranch } from "../shared/types.js";
import { TECH_TREE, TECH_MAP, getBranchNodes, BRANCH_META } from "./techTree.js";
import {
  arePrerequisitesMet,
  getTechProgressPercent,
  aggregateKpiModifiers,
  getUnlockedTechs,
} from "./researchEngine.js";
import { IDEOLOGY_LABELS } from "../campaign/advisorTypes.js";

interface Props {
  playerCountry: Country;
  researchOutput: number;
  advisorBonus: number;
}

type FilterBranch = TechBranch | "all";

export function ResearchPanel({ playerCountry, researchOutput, advisorBonus }: Props) {
  const [filter, setFilter] = useState<FilterBranch>("all");
  const research = playerCountry.research;

  if (!research) {
    return (
      <div className="research-panel">
        <div className="research-header">
          <h3 className="section-heading">Research &amp; Technology Tree</h3>
          <span className="research-empty">Research system initializing…</span>
        </div>
      </div>
    );
  }

  const unlockedCount = getUnlockedTechs(research).length;
  const totalTechs = TECH_TREE.length;
  const mods = aggregateKpiModifiers(research);

  const branches: TechBranch[] = ["economy", "defense", "governance_intel"];
  const visibleBranches = filter === "all" ? branches : [filter];

  return (
    <div className="research-panel">
      <div className="research-header">
        <h3 className="section-heading">Research &amp; Technology Tree</h3>
        <div className="research-stats">
          <div className="research-stat">
            <span className="research-stat-label">Output / Tick</span>
            <span className="research-stat-value">{researchOutput.toFixed(1)}</span>
          </div>
          <div className="research-stat">
            <span className="research-stat-label">Advisor Bonus</span>
            <span className="research-stat-value bonus">+{advisorBonus.toFixed(1)}</span>
          </div>
          <div className="research-stat">
            <span className="research-stat-label">Unlocked</span>
            <span className="research-stat-value">{unlockedCount}/{totalTechs}</span>
          </div>
        </div>
      </div>

      {/* Active KPI modifiers summary */}
      {unlockedCount > 0 && (
        <div className="research-modifiers-bar">
          <span className="research-modifiers-label">Active KPI Bonuses:</span>
          {mods.gdpGrowthDelta ? <span className="mod-chip positive">GDP Growth +{(mods.gdpGrowthDelta * 100).toFixed(1)}%</span> : null}
          {mods.taxYieldBonus ? <span className="mod-chip positive">Tax Yield +{(mods.taxYieldBonus * 100).toFixed(1)}%</span> : null}
          {mods.readinessMaxBonus ? <span className="mod-chip positive">Readiness Cap +{mods.readinessMaxBonus}</span> : null}
          {mods.stabilityDelta ? <span className="mod-chip positive">Stability +{(mods.stabilityDelta * 100).toFixed(1)}%</span> : null}
          {mods.intelFidelityBonus ? <span className="mod-chip positive">Intel Fidelity +{(mods.intelFidelityBonus * 100).toFixed(1)}%</span> : null}
        </div>
      )}

      {/* Branch filter buttons */}
      <div className="research-filter-bar">
        <button
          className={`research-filter-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All Branches
        </button>
        {branches.map((b) => (
          <button
            key={b}
            className={`research-filter-btn ${filter === b ? "active" : ""}`}
            style={filter === b ? { borderColor: BRANCH_META[b].accentColor, color: BRANCH_META[b].accentColor } : {}}
            onClick={() => setFilter(b)}
          >
            {BRANCH_META[b].icon} {BRANCH_META[b].label}
          </button>
        ))}
      </div>

      {/* Tech tree branches */}
      <div className="research-branches">
        {visibleBranches.map((branch) => {
          const meta = BRANCH_META[branch];
          const nodes = getBranchNodes(branch);
          return (
            <div key={branch} className="research-branch" style={{ borderColor: meta.accentColor }}>
              <div className="research-branch-header" style={{ background: `${meta.accentColor}15` }}>
                <span className="research-branch-icon" style={{ color: meta.accentColor }}>{meta.icon}</span>
                <div className="research-branch-info">
                  <span className="research-branch-label">{meta.label}</span>
                  <span className="research-branch-desc">{meta.description}</span>
                </div>
              </div>

              <div className="research-tier-chain">
                {nodes.map((tech, idx) => {
                  const prog = research.progress[tech.id];
                  const pct = getTechProgressPercent(tech.id, research);
                  const isUnlocked = prog?.unlocked ?? false;
                  const prereqsMet = arePrerequisitesMet(tech.id, research);
                  const isResearchable = prereqsMet && !isUnlocked;
                  const isLocked = !prereqsMet && !isUnlocked;

                  return (
                    <div key={tech.id} className="research-tier-chain-item">
                      {idx > 0 && (
                        <div className={`research-connector ${isUnlocked ? "complete" : isLocked ? "locked" : "active"}`} />
                      )}
                      <div
                        className={`research-tech-card ${isUnlocked ? "unlocked" : isResearchable ? "researchable" : "locked"}`}
                        style={{ borderLeftColor: meta.accentColor }}
                      >
                        <div className="research-tech-header">
                          <span className="research-tech-tier">T{tech.tier}</span>
                          <span className="research-tech-name">{tech.name}</span>
                          {isUnlocked && <span className="research-tech-badge unlocked">Unlocked</span>}
                          {isLocked && <span className="research-tech-badge locked">Locked</span>}
                          {isResearchable && <span className="research-tech-badge active">In Progress</span>}
                        </div>

                        <p className="research-tech-desc">{tech.description}</p>

                        <div className="research-tech-modifiers">
                          {tech.kpiModifiers.gdpGrowthDelta && (
                            <span className="mod-tag">GDP +{(tech.kpiModifiers.gdpGrowthDelta * 100).toFixed(1)}%</span>
                          )}
                          {tech.kpiModifiers.taxYieldBonus && (
                            <span className="mod-tag">Tax +{(tech.kpiModifiers.taxYieldBonus * 100).toFixed(1)}%</span>
                          )}
                          {tech.kpiModifiers.readinessMaxBonus && (
                            <span className="mod-tag">Readiness +{tech.kpiModifiers.readinessMaxBonus}</span>
                          )}
                          {tech.kpiModifiers.stabilityDelta && (
                            <span className="mod-tag">Stability +{(tech.kpiModifiers.stabilityDelta * 100).toFixed(1)}%</span>
                          )}
                          {tech.kpiModifiers.intelFidelityBonus && (
                            <span className="mod-tag">Intel +{(tech.kpiModifiers.intelFidelityBonus * 100).toFixed(1)}%</span>
                          )}
                        </div>

                        <div className="research-tech-progress-area">
                          <div className="research-tech-cost">
                            <span className="cost-label">Cost</span>
                            <span className="cost-value">{tech.costPoints} pts</span>
                          </div>
                          {!isUnlocked && (
                            <>
                              <div className="research-tech-progress-bar">
                                <div
                                  className="research-tech-progress-fill"
                                  style={{
                                    width: `${pct}%`,
                                    background: `linear-gradient(90deg, ${meta.accentColor}, ${meta.accentColor}aa)`,
                                  }}
                                />
                              </div>
                              <span className="research-tech-progress-text">
                                {prog?.accumulatedPoints.toFixed(0) ?? 0} / {tech.costPoints} ({pct}%)
                              </span>
                            </>
                          )}
                          {isUnlocked && (
                            <span className="research-tech-completed-text">
                              Completed at tick {prog?.unlockedTick ?? "?"}
                            </span>
                          )}
                        </div>

                        {isLocked && tech.prerequisites.length > 0 && (
                          <div className="research-tech-prereqs">
                            <span className="prereq-label">Requires:</span>
                            {tech.prerequisites.map((pid) => {
                              const prereqTech = TECH_MAP.get(pid);
                              const prereqUnlocked = research.progress[pid]?.unlocked;
                              return (
                                <span
                                  key={pid}
                                  className={`prereq-tag ${prereqUnlocked ? "met" : "unmet"}`}
                                >
                                  {prereqTech?.name ?? pid}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Advisor satisfaction bonus explanation */}
      <div className="research-advisor-bonus-info">
        <div className="bonus-info-title">Advisor Satisfaction Research Bonus</div>
        <p className="bonus-info-text">
          Each advisor with satisfaction above 60% contributes +0.2 research points per tick.
          Vacant posts contribute nothing. Keep your cabinet satisfied to accelerate research.
        </p>
        {playerCountry.cabinet && (
          <div className="bonus-advisor-list">
            {(["finance", "treasury", "defense", "foreign", "stability"] as const).map((slotId) => {
              const advisor = playerCountry.cabinet![slotId];
              if (!advisor) return (
                <div key={slotId} className="bonus-advisor vacant">
                  <span className="bonus-advisor-slot">{slotId}</span>
                  <span className="bonus-advisor-status">Vacant</span>
                  <span className="bonus-advisor-contribution">+0.0</span>
                </div>
              );
              const contribution = advisor.satisfaction > 60
                ? (advisor.satisfaction - 60) * 0.2
                : 0;
              return (
                <div key={slotId} className="bonus-advisor">
                  <span className="bonus-advisor-slot">{slotId}</span>
                  <span className="bonus-advisor-name">{advisor.name}</span>
                  <span className="bonus-advisor-ideology">{IDEOLOGY_LABELS[advisor.ideology]}</span>
                  <span className="bonus-advisor-sat">{advisor.satisfaction}%</span>
                  <span className="bonus-advisor-contribution">+{contribution.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
