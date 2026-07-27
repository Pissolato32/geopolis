// CountryProfile — right panel. Renders either a Country profile (Overview,
// Economy, Military, Politics, Diplomacy, Intelligence tabs) or a Unit profile
// (Unit Mode) depending on what the SelectionManager currently holds.
// Country names in the Diplomacy tab are clickable links (cross-navigation).
// Action buttons dispatch strict intent JSON via the WebSocket. Foreign
// country metrics are masked by fog-of-war based on the player's intel
// level (ADR-001).

import { useEffect, useState } from "react";
import { selection } from "./selectionManager.js";
import { gameSocket } from "./gameSocket.js";
import type { Country, CountryIntelligence, CountryMilitaryDetail, DiplomaticPosture, IntelLevel, Relationship, StrictIntent, Unit, UnitType } from "./shared/types.js";

type Tab = "overview" | "economy" | "military" | "politics" | "diplomacy" | "intelligence";

const UNIT_COSTS: Record<UnitType, number> = {
  infantry: 50,
  armor: 120,
  navy: 200,
};

type IntelTier = "low" | "medium" | "high";

function intelTier(level: number): IntelTier {
  if (level >= 71) return "high";
  if (level >= 31) return "medium";
  return "low";
}

const ALL_TABS: Tab[] = ["overview", "economy", "military", "politics", "diplomacy", "intelligence"];

export function CountryProfile() {
  const [sel, setSel] = useState<ReturnType<typeof selection.getSelected>>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => selection.subscribe(setSel), []);

  useEffect(() => {
    return gameSocket.onIntentResponse((res) => {
      if (res.ok) {
        setToast(`Order acknowledged: ${res.acknowledged.intent}`);
      } else {
        setToast(`Rejected: ${res.error}`);
      }
      setTimeout(() => setToast(null), 3500);
    });
  }, []);

  if (!sel) {
    return (
      <aside className="panel profile-empty">
        <div className="placeholder">
          <div className="placeholder-icon" aria-hidden>◎</div>
          <h3>No entity selected</h3>
          <p>Click a province, a military marker, or search a nation above.</p>
        </div>
      </aside>
    );
  }

  if (sel.kind === "unit") {
    return (
      <>
        <UnitProfile unit={sel.unit} toast={toast} />
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  return (
    <>
      <CountryProfileBody country={sel.country} tab={tab} setTab={setTab} toast={toast} />
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

// ---- Country profile -------------------------------------------------------

function CountryProfileBody({
  country,
  tab,
  setTab,
  toast,
}: {
  country: Country;
  tab: Tab;
  setTab: (t: Tab) => void;
  toast: string | null;
}) {
  const [playerCode, setPlayerCode] = useState(gameSocket.getPlayerCode());
  const [intelLevel, setIntelLevel] = useState(gameSocket.getIntel(country.id));

  useEffect(() => gameSocket.onPlayerChange(setPlayerCode), []);
  useEffect(() => gameSocket.onIntelChange((target, level) => {
    if (target === country.id) setIntelLevel(level);
  }), [country.id]);

  const isSelf = country.id === playerCode;
  const tier = intelTier(intelLevel);
  const intel = country.intelligence;

  const sendIntent = (intent: StrictIntent["intent"], extra?: { terms?: string }) => {
    const payload = { intent, from: playerCode, target: country.id, ...(extra ?? {}) } as StrictIntent;
    gameSocket.sendIntent(payload);
  };

  const takeCommand = () => {
    gameSocket.setPlayerCountry(country.id);
    setPlayerCode(country.id);
  };

  return (
    <aside className="panel profile">
      <header className="profile-header">
        <img className="profile-flag" src={country.flag} alt={`Flag of ${country.name}`} />
        <div className="profile-title">
          <h2>{country.name}</h2>
          <span className="profile-code">{country.id} · {country.region || "—"}</span>
        </div>
        <button className="chip close" onClick={() => selection.selectCountry(null)} title="Close">✕</button>
      </header>

      {intel && (isSelf || tier !== "low") && (
        <div className="quick-stats">
          <QuickStat label="Population" value={country.population.toLocaleString()} />
          <QuickStat label="GDP" value={fmtMoney(country.economy.gdp)} />
          {intel.gdpGrowth !== undefined && (
            <QuickStat
              label="Growth"
              value={`${intel.gdpGrowth >= 0 ? "↑ +" : "↓ "}${(intel.gdpGrowth * 100).toFixed(1)}%`}
              className={intel.gdpGrowth >= 0 ? "positive" : "negative"}
            />
          )}
          <QuickStat label="Regime" value={intel.regimeLabel} />
          {intel.hdiRank > 0 && <QuickStat label="HDI Rank" value={`#${intel.hdiRank}`} />}
          {intel.militaryPowerScore > 0 && (
            <QuickStat label="Military Power" value={`${intel.militaryPowerScore}/100`} />
          )}
          {intel.passportRank > 0 && (
            <QuickStat label="Passport Rank" value={`#${intel.passportRank}`} />
          )}
        </div>
      )}

      {!isSelf && (
        <button className="btn btn-take-command" onClick={takeCommand} title={`Take control of ${country.name}`}>
          🎮 Assumir Nação (Take Command)
        </button>
      )}

      {!isSelf && (
        <div className={`intel-banner intel-${tier}`}>
          <span className="intel-label">Intel Level</span>
          <div className="intel-bar-track">
            <div className="intel-bar-fill" style={{ width: `${intelLevel}%` }} />
          </div>
          <span className="intel-value">{intelLevel}/100 · {tier.toUpperCase()}</span>
        </div>
      )}

      <nav className="tabs">
        {ALL_TABS.map((t) => (
          <button
            key={t}
            className={tab === t ? "tab tab-active" : "tab"}
            onClick={() => setTab(t)}
          >
            {t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <div className="tab-body">
        {tab === "overview" && <OverviewTab c={country} isSelf={isSelf} tier={tier} />}
        {tab === "economy" && <EconomyTab c={country} isSelf={isSelf} tier={tier} />}
        {tab === "military" && <MilitaryTab c={country} isSelf={isSelf} tier={tier} />}
        {tab === "politics" && <PoliticsTab c={country} isSelf={isSelf} tier={tier} />}
        {tab === "diplomacy" && <DiplomacyTab c={country} />}
        {tab === "intelligence" && <IntelligenceTab c={country} isSelf={isSelf} tier={tier} />}
      </div>

      {!isSelf && (
        <ForeignActionPanel country={country} sendIntent={sendIntent} />
      )}
      {isSelf && <GovernancePanel country={country} />}

      {toast && <div className="toast">{toast}</div>}
    </aside>
  );
}

// ---- QuickStat component ---------------------------------------------------

function QuickStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`quick-stat${className ? " " + className : ""}`}>
      <div className="quick-stat-label">{label}</div>
      <div className="quick-stat-value">{value}</div>
    </div>
  );
}

// ---- IntelligenceGauge component -------------------------------------------

function IntelligenceGauge({
  label,
  value,
  min,
  max,
  unit,
  invertColor,
  source,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  invertColor?: boolean;
  source?: string;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const normalized = invertColor ? 100 - pct : pct;
  const colorClass = normalized >= 66 ? "gauge-fill-green" : normalized >= 33 ? "gauge-fill-yellow" : "gauge-fill-red";

  return (
    <div className="gauge">
      <div className="gauge-label">{label}</div>
      <div className="gauge-value">{value}{unit ?? ""}</div>
      <div className="gauge-bar">
        <div className={`gauge-fill ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      {source && <div className="gauge-source">{source}</div>}
    </div>
  );
}

// ---- Overview Tab ----------------------------------------------------------

function OverviewTab({ c, isSelf, tier }: { c: Country; isSelf: boolean; tier: IntelTier }) {
  const intel = c.intelligence;
  const showFull = isSelf || tier === "high";
  const showPartial = showFull || tier === "medium";
  const stability = c.economy?.stability ?? 0;

  return (
    <div className="stats-grid">
      <Stat label="Population" value={(c.population ?? 0).toLocaleString()} />
      <Stat label="GDP" value={fmtMoney(c.economy?.gdp ?? 0)} />
      {intel && (showFull || showPartial) && (
        <>
          <Stat label="GDP Growth" value={`${intel.gdpGrowth >= 0 ? "+" : ""}${(intel.gdpGrowth * 100).toFixed(1)}%`} />
          <Stat label="Regime" value={intel.regimeLabel} />
          <Stat label="HDI Rank" value={intel.hdiRank > 0 ? `#${intel.hdiRank}` : "—"} />
          <Stat label="Military Power" value={`${intel.militaryPowerScore}/100`} />
          <Stat label="Passport Rank" value={intel.passportRank > 0 ? `#${intel.passportRank}` : "—"} />
        </>
      )}
      <div className="bar">
        <span className="bar-label">Stability</span>
        <div className="bar-track">
          <div className="bar-fill bar-fill-stab" style={{ width: `${stability}%` }} />
        </div>
      </div>

      {intel && showFull && intel.keyRisks?.length > 0 && (
        <div className="risk-tags-section">
          <span className="risk-tags-label">Key Risks</span>
          <div className="risk-tags">
            {intel.keyRisks.map((risk, i) => (
              <span key={i} className="risk-tag">{risk}</span>
            ))}
          </div>
        </div>
      )}

      {intel && showFull && (
        <div className="intel-grid">
          <IntelligenceGauge label="Democracy Index" value={intel.democracyIndex} min={0} max={10} />
          <IntelligenceGauge label="Freedom Score" value={intel.freedomScore} min={0} max={100} />
          <IntelligenceGauge label="Corruption (CPI)" value={intel.corruptionIndex} min={0} max={100} />
          <IntelligenceGauge label="Stability" value={stability} min={0} max={100} />
        </div>
      )}
    </div>
  );
}

// ---- Intelligence Tab ------------------------------------------------------

function IntelligenceTab({ c, isSelf, tier }: { c: Country; isSelf: boolean; tier: IntelTier }) {
  const intel = c.intelligence;
  const milDetail = c.militaryDetail;

  if (!intel) {
    return <div className="feed-empty">No intelligence data available.</div>;
  }
  const stability = c.economy?.stability ?? 0;

  // Fog-of-war: low intel shows only regime type (public info)
  if (!isSelf && tier === "low") {
    return (
      <div className="stats-grid fog-masked">
        <Stat label="Regime Type" value={intel.regimeLabel} />
        <Stat label="Population" value={(c.population ?? 0).toLocaleString()} />
        <div className="feed-empty">Insufficient intel for detailed metrics.</div>
      </div>
    );
  }

  const showFull = isSelf || tier === "high";

  return (
    <div className="intel-scroll">
      {/* Section 1: Regime Classification */}
      <div className="intel-section">
        <div className="intel-regime-row">
          <span className={`regime-badge ${intel.regimeType.includes("democracy") ? "regime-democracy" : intel.regimeType.includes("authoritarian") || intel.regimeType.includes("one-party") || intel.regimeType.includes("junta") ? "regime-authoritarian" : "regime-hybrid"}`}>
            {intel.regimeLabel}
          </span>
          <span className="freedom-status">{intel.freedomStatus}</span>
          {intel.isEstimated && <span className="estimated-badge">Estimated</span>}
        </div>
      </div>

      {/* Section 2: Key Metrics Grid */}
      {(showFull || tier === "medium") && (
        <div className="intel-grid">
          <IntelligenceGauge label="Democracy Index" value={intel.democracyIndex} min={0} max={10} source="EIU" />
          <IntelligenceGauge label="Freedom Score" value={intel.freedomScore} min={0} max={100} source="Freedom House" />
          <IntelligenceGauge label="Corruption (CPI)" value={intel.corruptionIndex} min={0} max={100} source="Transparency Intl" />
          <IntelligenceGauge label="Crime Index" value={intel.crimeIndex} min={0} max={10} invertColor source="Numbeo" />
          <IntelligenceGauge label="Terror Index" value={intel.terrorIndex} min={0} max={10} invertColor source="IEP" />
          <IntelligenceGauge label="Stability Score" value={stability} min={0} max={100} />
          <IntelligenceGauge label="Fragility Index" value={intel.fragilityIndex} min={0} max={120} invertColor source="Fund for Peace" />
          <IntelligenceGauge label="HDI Score" value={intel.hdiScore} min={0} max={1} unit="" source="UNDP" />
        </div>
      )}

      {/* Section 3: GFP Details */}
      {showFull && (
        <div className="intel-section">
          <h4 className="intel-section-title">Global Firepower</h4>
          <div className="stats-grid">
            <Stat label="GFP Rank" value={intel.gfpRank > 0 ? `#${intel.gfpRank} of 145` : "—"} />
            <Stat label="PwrIndx Score" value={intel.gfpScore > 0 ? intel.gfpScore.toFixed(4) : "—"} />
            <Stat label="Military Power" value={`${intel.militaryPowerScore}/100`} />
            <Stat label="GFP Total" value={intel.gfpTotalScore > 0 ? fmtMoney(intel.gfpTotalScore) : "—"} />
          </div>
        </div>
      )}

      {/* Section 4: Military Detail (if available) */}
      {showFull && milDetail && (
        <MilitaryDetailSection detail={milDetail} />
      )}

      {/* Section 5: Key Risks */}
      {showFull && intel.keyRisks?.length > 0 && (
        <div className="intel-section">
          <h4 className="intel-section-title">Key Risks</h4>
          <div className="risk-tags">
            {intel.keyRisks.map((risk, i) => (
              <span key={i} className="risk-tag">{risk}</span>
            ))}
          </div>
        </div>
      )}

      {/* Section 6: Source Attribution */}
      <div className="source-footer">
        Data sourced from: Global Firepower, Freedom House, Transparency International, UNDP, EIU, IEP
        {intel.isEstimated && " · Values estimated from economic/military indicators"}
      </div>
    </div>
  );
}

// ---- Military Detail Section ----------------------------------------------

function MilitaryDetailSection({ detail }: { detail: CountryMilitaryDetail }) {
  const [section, setSection] = useState<string>("manpower");
  const sections = ["manpower", "airpower", "land", "naval", "financials", "geography", "logistics", "resources"];

  const sectionData: Record<string, { label: string; value: number }[]> = {
    manpower: [
      { label: "Available Manpower", value: detail.availableManpower },
      { label: "Fit for Service", value: detail.fitForService },
      { label: "Reaching Mil Age/Year", value: detail.reachingMilAgeAnnual },
      { label: "Active Personnel", value: detail.activePersonnel },
      { label: "Reserve Personnel", value: detail.reservePersonnel },
      { label: "Paramilitary", value: detail.paramilitaryPersonnel },
    ],
    airpower: [
      { label: "Total Aircraft", value: detail.totalAircraft },
      { label: "Fighters", value: detail.fighterAircraft },
      { label: "Attack", value: detail.attackAircraft },
      { label: "Transport", value: detail.transportAircraft },
      { label: "Trainer", value: detail.trainerAircraft },
      { label: "Helicopters", value: detail.helicopters },
      { label: "Attack Helicopters", value: detail.attackHelicopters },
    ],
    land: [
      { label: "Tanks", value: detail.tanks },
      { label: "Armored Vehicles", value: detail.armoredVehicles },
      { label: "Self-Propelled Artillery", value: detail.selfPropelledArtillery },
      { label: "Towed Artillery", value: detail.towedArtillery },
      { label: "MLRS", value: detail.mlrs },
    ],
    naval: [
      { label: "Total Naval", value: detail.totalNaval },
      { label: "Aircraft Carriers", value: detail.aircraftCarriers },
      { label: "Submarines", value: detail.submarines },
      { label: "Destroyers", value: detail.destroyers },
      { label: "Frigates", value: detail.frigates },
      { label: "Corvettes", value: detail.corvettes },
      { label: "Patrol Craft", value: detail.patrolCraft },
    ],
    financials: [
      { label: "Defense Budget", value: detail.defenseBudget },
      { label: "External Debt", value: detail.externalDebt },
      { label: "PPP", value: detail.purchasingPowerParity },
      { label: "Foreign Reserves", value: detail.foreignReserves },
    ],
    geography: [
      { label: "Land Area (km²)", value: detail.squareLandArea },
      { label: "Coastline (km)", value: detail.coastlineKm },
      { label: "Shared Borders (km)", value: detail.sharedBordersKm },
      { label: "Waterways (km)", value: detail.waterwaysKm },
    ],
    logistics: [
      { label: "Internet Coverage (%)", value: detail.internetCoverage },
      { label: "Labor Force", value: detail.laborForce },
      { label: "Merchant Marine", value: detail.merchantMarineFleet },
      { label: "Ports", value: detail.ports },
      { label: "Airports", value: detail.airports },
      { label: "Roadways (km)", value: detail.roadwayKm },
      { label: "Railways (km)", value: detail.railwayKm },
    ],
    resources: [
      { label: "Oil Production (bbl/day)", value: detail.oilProduction },
      { label: "Oil Consumption (bbl/day)", value: detail.oilConsumption },
      { label: "Oil Reserves (bbl)", value: detail.oilProvenReserves },
      { label: "Gas Production (m³)", value: detail.naturalGasProduction },
      { label: "Gas Consumption (m³)", value: detail.naturalGasConsumption },
    ],
  };

  const formatValue = (label: string, value: number): string => {
    if (label.includes("km") || label.includes("bbl") || label.includes("m³")) return value.toLocaleString();
    if (label.includes("Budget") || label.includes("Debt") || label.includes("PPP") || label.includes("Reserves")) return fmtMoney(value);
    if (label.includes("(%)" )) return `${value}%`;
    return value.toLocaleString();
  };

  return (
    <div className="intel-section">
      <h4 className="intel-section-title">Military Equipment</h4>
      <div className="mil-detail-tabs">
        {sections.map((s) => (
          <button
            key={s}
            className={section === s ? "mil-detail-tab tab-active" : "mil-detail-tab"}
            onClick={() => setSection(s)}
          >
            {s[0]!.toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <div className="stats-grid">
        {sectionData[section]?.map((item) => (
          <Stat key={item.label} label={item.label} value={formatValue(item.label, item.value)} />
        ))}
      </div>
    </div>
  );
}

// ---- Politics Tab ----------------------------------------------------------

function formatPosture(posture: DiplomaticPosture | undefined): string {
  if (!posture) return "—";
  return posture[0]!.toUpperCase() + posture.slice(1);
}

function PoliticsTab({ c, isSelf, tier }: { c: Country; isSelf: boolean; tier: IntelTier }) {
  const intel = c.intelligence;
  const showFull = isSelf || tier === "high";
  const showPartial = showFull || tier === "medium";
  const legSupport = c.economy?.legislativeSupport ?? 0;
  const stability = c.economy?.stability ?? 0;

  return (
    <div className="stats-grid">
      {intel && (showFull || showPartial) && (
        <>
          <Stat label="Regime Type" value={intel.regimeLabel} />
          <Stat label="Freedom Status" value={intel.freedomStatus} />
          <Stat label="Democracy Index" value={`${intel.democracyIndex}/10`} />
          <Stat label="Freedom Score" value={`${intel.freedomScore}/100`} />
          <Stat label="Corruption (CPI)" value={`${intel.corruptionIndex}/100`} />
          <Stat label="Fragility Index" value={`${intel.fragilityIndex}/120`} />
          <Stat label="Stability" value={intel.stabilityLabel} />
        </>
      )}
      <Stat label="Diplomatic Posture" value={formatPosture(c.posture)} />
      <Stat label="Legislative Support" value={`${(legSupport * 100).toFixed(0)}%`} />
      <div className="bar">
        <span className="bar-label">Stability</span>
        <div className="bar-track">
          <div className="bar-fill bar-fill-stab" style={{ width: `${stability}%` }} />
        </div>
      </div>
      {intel && showFull && intel.keyRisks?.length > 0 && (
        <div className="risk-tags-section">
          <span className="risk-tags-label">Key Risks</span>
          <div className="risk-tags">
            {intel.keyRisks.map((risk, i) => (
              <span key={i} className="risk-tag">{risk}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Existing tabs (Economy, Military, Diplomacy) -------------------------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function estimateGdp(gdp: number): string {
  const abs = Math.abs(gdp);
  const rounded = abs >= 1e12 ? Math.round(gdp / 1e11) * 1e11 : Math.round(gdp / 1e10) * 1e10;
  if (rounded >= 1e12) return `~$${(rounded / 1e12).toFixed(1)}T (est.)`;
  return `~$${(rounded / 1e9).toFixed(0)}B (est.)`;
}

function estimateRange(value: number, spreadPct: number): string {
  const spread = value * spreadPct;
  const lo = Math.max(0, value - spread);
  const hi = value + spread;
  if (hi >= 1e12) return `$${(lo / 1e12).toFixed(1)}T – $${(hi / 1e12).toFixed(1)}T`;
  if (hi >= 1e9) return `$${(lo / 1e9).toFixed(0)}B – $${(hi / 1e9).toFixed(0)}B`;
  return `$${fmtMoney(lo)} – $${fmtMoney(hi)}`;
}

function stabilityLabel(s: number): string {
  if (s >= 75) return "Strong";
  if (s >= 50) return "Moderate";
  if (s >= 25) return "Unstable";
  return "Critical";
}

function EconomyTab({ c, isSelf, tier }: { c: Country; isSelf: boolean; tier: IntelTier }) {
  const e = c.economy;
  const gdp = e?.gdp ?? 0;
  const stability = e?.stability ?? 0;
  if (isSelf || tier === "high") {
    return (
      <div className="stats-grid">
        <Stat label="GDP" value={fmtMoney(gdp)} />
        <Stat label="GDP / capita" value={`${fmtMoney(e?.gdpPerCapita ?? 0)}`} />
        <Stat label="Treasury" value={`${fmtMoney(e?.treasury ?? 0)}`} />
        <Stat label="Tax Rate" value={`${((e?.taxRate ?? 0) * 100).toFixed(1)}%`} />
        <Stat label="Stability" value={`${stability}/100`} />
        <Stat label="Population" value={(c.population ?? 0).toLocaleString()} />
        {c.intelligence && <Stat label="GDP Growth" value={`${c.intelligence.gdpGrowth >= 0 ? "+" : ""}${(c.intelligence.gdpGrowth * 100).toFixed(1)}%`} />}
        <div className="bar">
          <span className="bar-label">Stability</span>
          <div className="bar-track">
            <div className="bar-fill bar-fill-stab" style={{ width: `${stability}%` }} />
          </div>
        </div>
      </div>
    );
  }
  if (tier === "medium") {
    return (
      <div className="stats-grid">
        <Stat label="GDP" value={estimateGdp(gdp)} />
        <Stat label="Treasury" value={estimateRange(e?.treasury ?? 0, 0.2)} />
        <Stat label="Stability" value={`${stabilityLabel(stability)} (${stability}±15)`} />
        <Stat label="Population" value={(c.population ?? 0).toLocaleString()} />
        <div className="bar">
          <span className="bar-label">Stability (est.)</span>
          <div className="bar-track">
            <div className="bar-fill bar-fill-stab" style={{ width: `${Math.max(0, Math.min(100, stability))}%`, opacity: 0.6 }} />
          </div>
        </div>
      </div>
    );
  }
  // low intel
  return (
    <div className="stats-grid fog-masked">
      <Stat label="GDP" value={estimateGdp(gdp)} />
      <Stat label="Treasury" value="Classified" />
      <Stat label="Tax Rate" value="Unknown" />
      <Stat label="Stability" value={stabilityLabel(stability)} />
      <Stat label="Population" value={(c.population ?? 0).toLocaleString()} />
    </div>
  );
}

function MilitaryTab({ c, isSelf, tier }: { c: Country; isSelf: boolean; tier: IntelTier }) {
  const m = c.military;
  const personnel = m?.totalPersonnel ?? 0;
  const readiness = m?.readiness ?? 0;
  const morale = m?.morale ?? 0;
  if (isSelf || tier === "high") {
    return (
      <div className="stats-grid">
        <Stat label="Total Personnel" value={personnel.toLocaleString()} />
        <Stat label="Force Limit" value={(m?.forceLimit ?? 0).toLocaleString()} />
        <Stat label="Readiness" value={`${readiness}/100`} />
        <Stat label="Morale" value={`${morale}/100`} />
        {c.intelligence && <Stat label="Military Power" value={`${c.intelligence.militaryPowerScore}/100`} />}
        {c.intelligence && <Stat label="GFP Rank" value={c.intelligence.gfpRank > 0 ? `#${c.intelligence.gfpRank}` : "—"} />}
        <Bar label="Readiness" value={readiness} cls="bar-fill-ready" />
        <Bar label="Morale" value={morale} cls="bar-fill-morale" />
      </div>
    );
  }
  if (tier === "medium") {
    return (
      <div className="stats-grid">
        <Stat label="Total Personnel" value={`~${(personnel * 0.9).toLocaleString(undefined, { maximumFractionDigits: 0 })} – ${(personnel * 1.1).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <Stat label="Readiness" value={readiness >= 70 ? "High" : readiness >= 40 ? "Medium" : "Low"} />
        <Stat label="Morale" value={morale >= 70 ? "High" : morale >= 40 ? "Medium" : "Low"} />
      </div>
    );
  }
  // low intel
  return (
    <div className="stats-grid fog-masked">
      <Stat label="Total Personnel" value="Classified" />
      <Stat label="Readiness" value="Unknown" />
      <Stat label="Morale" value="Unknown" />
    </div>
  );
}

function DiplomacyTab({ c }: { c: Country }) {
  if (!c.relationships || c.relationships.length === 0) {
    return <div className="feed-empty">No active relationships modeled.</div>;
  }
  return (
    <ul className="rel-list">
      {c.relationships
        .slice()
        .sort((a, b) => b.tension - a.tension)
        .map((r) => (
          <li key={r.countryCode} className="rel-row">
            <DiploLink code={r.countryCode} />
            <div className="rel-meters">
              <MiniMeter label="Affinity" value={r.affinity} min={-100} max={100} />
              <MiniMeter label="Tension" value={r.tension} min={0} max={100} />
            </div>
          </li>
        ))}
    </ul>
  );
}

function DiploLink({ code }: { code: string }) {
  const jump = () => {
    const seed = (window as unknown as { __worldSeed?: { countries: Country[] } }).__worldSeed;
    const country = seed?.countries.find((x) => x.id === code);
    if (country) selection.selectCountry(country);
  };
  return (
    <button className="rel-code rel-link" onClick={jump} title={`Inspect ${code}`}>
      {code}
    </button>
  );
}

function Bar({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className={`bar-fill ${cls}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function MiniMeter({
  label,
  value,
  min,
  max,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mini-meter">
      <span className="mini-label">
        {label} <b>{value > 0 ? "+" : ""}{value}</b>
      </span>
      <div className="bar-track">
        <div className="bar-fill bar-fill-diplo" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---- Unit profile ----------------------------------------------------------

const UNIT_TYPE_LABEL: Record<Unit["type"], string> = {
  infantry: "Infantry",
  armor: "Armor",
  navy: "Navy",
};

function UnitProfile({ unit, toast }: { unit: Unit; toast: string | null }) {
  const owner = (window as unknown as { __worldSeed?: { countries: Country[] } }).__worldSeed?.countries.find(
    (c) => c.id === unit.ownerCode
  );
  const isPlayerUnit = unit.ownerCode === gameSocket.getPlayerCode();

  const disband = () => {
    const payload: StrictIntent = { intent: "disband-unit", unitId: unit.id, from: unit.ownerCode };
    gameSocket.sendIntent(payload);
  };
  const move = () => {
    const to: [number, number] = [unit.latlng[0] + 3, unit.latlng[1] + 3];
    const payload: StrictIntent = { intent: "move-unit", unitId: unit.id, from: unit.ownerCode, to };
    gameSocket.sendIntent(payload);
  };

  return (
    <aside className="panel profile">
      <header className="profile-header">
        <div className="profile-mark unit-mark" aria-hidden>▣</div>
        <div className="profile-title">
          <h2>{unit.name}</h2>
          <span className="profile-code">
            {unit.id} · {UNIT_TYPE_LABEL[unit.type]}
          </span>
        </div>
        <button className="chip close" onClick={() => selection.selectUnit(null)} title="Close">✕</button>
      </header>

      <div className="tab-body">
        <div className="stats-grid">
          <Stat label="Owning Nation" value={owner ? owner.name : unit.ownerCode} />
          <Stat label="Unit Type" value={UNIT_TYPE_LABEL[unit.type]} />
          <Stat label="Readiness" value={`${unit.readiness}%`} />
          <Stat label="Morale" value={`${unit.morale}%`} />
          <Stat label="Strength" value={unit.strength.toLocaleString()} />
          <Stat label="Position" value={`${unit.latlng[0].toFixed(1)}, ${unit.latlng[1].toFixed(1)}`} />
        </div>
        <Bar label="Readiness" value={unit.readiness} cls="bar-fill-ready" />
        <Bar label="Morale" value={unit.morale} cls="bar-fill-morale" />
      </div>

      {isPlayerUnit && (
        <footer className="action-bar">
          <button className="btn btn-accent" onClick={move}>Move Unit</button>
          <button className="btn btn-danger" onClick={disband}>Disband</button>
        </footer>
      )}
      {!isPlayerUnit && <footer className="action-bar muted">Foreign unit — no orders available.</footer>}

      {toast && <div className="toast">{toast}</div>}
    </aside>
  );
}

// ---- Foreign action panel (covert ops + diplomacy) -------------------------

function ForeignActionPanel({
  country,
  sendIntent,
}: {
  country: Country;
  sendIntent: (intent: StrictIntent["intent"], extra?: { terms?: string }) => void;
}) {
  return (
    <footer className="action-bar foreign-actions">
      <div className="action-group">
        <span className="action-group-label">Diplomacy</span>
        <div className="action-row">
          <button className="btn btn-danger" onClick={() => sendIntent("declare-war")}>Declare War</button>
          <button className="btn btn-accent" onClick={() => sendIntent("propose-trade")}>Propose Trade</button>
          <button className="btn btn-success" onClick={() => sendIntent("improve-relations")}>Improve Relations</button>
        </div>
      </div>
      <div className="action-group">
        <span className="action-group-label">Foreign Policy</span>
        <div className="action-row">
          <button
            className="btn btn-aid"
            onClick={() => sendIntentWithAmount("send-aid", 50)}
            title="+15 affinity, -20 tension"
          >
            Send Aid ($50B)
          </button>
          <button
            className="btn btn-intel"
            onClick={() => sendIntentWithAmount("gather-intel", 30)}
            title="+25 intel points"
          >
            Gather Intel ($30B)
          </button>
          <button
            className="btn btn-sabotage"
            onClick={() => sendIntentWithAmount("fund-sabotage", 100)}
            title="-15 to -25 stability & readiness (30% failure risk)"
          >
            Fund Sabotage ($100B)
          </button>
        </div>
      </div>
    </footer>
  );

  function sendIntentWithAmount(intent: "send-aid" | "gather-intel" | "fund-sabotage", amount: number) {
    const payload = { intent, from: gameSocket.getPlayerCode(), target: country.id, amount, cost: amount } as StrictIntent;
    gameSocket.sendIntent(payload);
  }
}

// ---- Military production panel (player nation) -----------------------------

function MilitaryProductionPanel({ country }: { country: Country }) {
  const recruit = (unitType: UnitType) => {
    const cost = UNIT_COSTS[unitType];
    const payload: StrictIntent = { intent: "recruit-unit", from: country.id, unitType, cost };
    gameSocket.sendIntent(payload);
  };
  return (
    <div className="action-group production">
      <span className="action-group-label">Military Production</span>
      <div className="action-row">
        <button className="btn btn-mil" onClick={() => recruit("infantry")} title="$50B — deploys at capital">
          Train Infantry ($50B)
        </button>
        <button className="btn btn-mil" onClick={() => recruit("armor")} title="$120B — deploys at capital">
          Build Armor ($120B)
        </button>
        <button className="btn btn-mil" onClick={() => recruit("navy")} title="$200B — deploys at capital">
          Commission Fleet ($200B)
        </button>
      </div>
    </div>
  );
}

// ---- Governance panel (player nation controls) -----------------------------

const POSTURES: { value: DiplomaticPosture; label: string; desc: string }[] = [
  { value: "isolationist", label: "Isolationist", desc: "Focus inward, avoid foreign entanglements" },
  { value: "diplomatic", label: "Diplomatic", desc: "Seek cooperation, trade, and soft power" },
  { value: "assertive", label: "Assertive", desc: "Project strength, defend interests firmly" },
  { value: "expansionist", label: "Expansionist", desc: "Pursue territorial and resource expansion" },
];

function GovernancePanel({ country }: { country: Country }) {
  const [taxRate, setTaxRate] = useState(country.economy.taxRate);
  const [readiness, setReadiness] = useState(country.military.readiness);
  const [posture, setPosture] = useState<DiplomaticPosture>(country.posture ?? "diplomatic");
  const [taxFeedback, setTaxFeedback] = useState<string | null>(null);

  useEffect(() => {
    setTaxRate(country.economy?.taxRate ?? 0);
    setReadiness(country.military?.readiness ?? 50);
    setPosture(country.posture ?? "diplomatic");
  }, [country.economy?.taxRate, country.military?.readiness, country.posture]);

  const commitTax = (val: number) => {
    setTaxRate(val);
    const intent: StrictIntent = { intent: "set-tax", from: country.id, rate: val };
    gameSocket.sendIntent(intent);
    const impact = Math.round(country.economy.gdp * (val - country.economy.taxRate));
    setTaxFeedback(
      impact >= 0
        ? `Treasury +${fmtMoney(impact)} / year`
        : `Treasury ${fmtMoney(impact)} / year`
    );
    setTimeout(() => setTaxFeedback(null), 3000);
  };

  const commitReadiness = (val: number) => {
    setReadiness(val);
    const intent: StrictIntent = { intent: "set-readiness", from: country.id, level: val };
    gameSocket.sendIntent(intent);
  };

  const commitPosture = (val: DiplomaticPosture) => {
    setPosture(val);
    const intent: StrictIntent = { intent: "set-posture", from: country.id, posture: val };
    gameSocket.sendIntent(intent);
  };

  return (
    <footer className="action-bar governance">
      <div className="gov-section">
        <div className="gov-header">
          <span className="gov-label">Tax Rate</span>
          <span className="gov-value">{(taxRate * 100).toFixed(0)}%</span>
        </div>
        <input
          className="gov-slider"
          type="range"
          min={0}
          max={0.5}
          step={0.01}
          value={taxRate}
          onChange={(e) => setTaxRate(Number(e.target.value))}
          onMouseUp={(e) => commitTax(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => commitTax(Number((e.target as HTMLInputElement).value))}
        />
        {taxFeedback && <span className="gov-feedback">{taxFeedback}</span>}
        <div className="gov-hint">Higher rates fill your treasury but reduce growth.</div>
      </div>

      <div className="gov-section">
        <div className="gov-header">
          <span className="gov-label">Military Readiness</span>
          <span className="gov-value">{readiness}%</span>
        </div>
        <input
          className="gov-slider"
          type="range"
          min={10}
          max={100}
          step={5}
          value={readiness}
          onChange={(e) => setReadiness(Number(e.target.value))}
          onMouseUp={(e) => commitReadiness(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => commitReadiness(Number((e.target as HTMLInputElement).value))}
        />
        <div className="gov-hint">High readiness improves combat but erodes morale.</div>
      </div>

      <div className="gov-section">
        <span className="gov-label">Diplomatic Posture</span>
        <div className="posture-row">
          {POSTURES.map((p) => (
            <button
              key={p.value}
              className={posture === p.value ? "posture-btn posture-active" : "posture-btn"}
              onClick={() => commitPosture(p.value)}
              title={p.desc}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="gov-hint">{POSTURES.find((p) => p.value === posture)?.desc}</div>
      </div>

      <MilitaryProductionPanel country={country} />
    </footer>
  );
}

// referenced to keep the type import used in this module's surface
export type { Relationship, CountryIntelligence, IntelLevel };
