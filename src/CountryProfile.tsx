// CountryProfile — right panel. Renders either a Country profile (Economy,
// Military, Diplomacy tabs) or a Unit profile (Unit Mode) depending on what
// the SelectionManager currently holds. Country names in the Diplomacy tab
// are clickable links (cross-navigation). Action buttons dispatch strict
// intent JSON via the WebSocket.

import { useEffect, useState } from "react";
import { selection } from "./selectionManager.js";
import { gameSocket } from "./gameSocket.js";
import type { ConflictZone, Country, DiplomaticPosture, IntelLevel, Relationship, StrictIntent, Unit, UnitType } from "./shared/types.js";

type Tab = "economy" | "military" | "diplomacy";

const PLAYER_CODE = "USA";

export function CountryProfile() {
  const [sel, setSel] = useState<ReturnType<typeof selection.getSelected>>(null);
  const [tab, setTab] = useState<Tab>("economy");
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

  if (sel.kind === "zone") {
    return (
      <>
        <ZoneReport zone={sel.zone} toast={toast} />
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
  const isSelf = country.id === PLAYER_CODE;

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

      <nav className="tabs">
        {(["economy", "military", "diplomacy"] as Tab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? "tab tab-active" : "tab"}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <div className="tab-body">
        {tab === "economy" && <EconomyTab c={country} />}
        {tab === "military" && <MilitaryTab c={country} />}
        {tab === "diplomacy" && <DiplomacyTab c={country} />}
      </div>

      {!isSelf && (
        <ForeignActionPanel country={country} />
      )}
      {isSelf && <GovernancePanel country={country} />}
      {isSelf && <RecruitmentPanel country={country} />}

      {toast && <div className="toast">{toast}</div>}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function EconomyTab({ c }: { c: Country }) {
  const e = c.economy;
  return (
    <div className="stats-grid">
      <Stat label="GDP" value={fmtMoney(e.gdp)} />
      <Stat label="GDP / capita" value={`$${fmtMoney(e.gdpPerCapita)}`} />
      <Stat label="Treasury" value={`$${fmtMoney(e.treasury)}`} />
      <Stat label="Tax Rate" value={`${(e.taxRate * 100).toFixed(1)}%`} />
      <Stat label="Stability" value={`${e.stability}/100`} />
      <Stat label="Population" value={c.population.toLocaleString()} />
      <div className="bar">
        <span className="bar-label">Stability</span>
        <div className="bar-track">
          <div className="bar-fill bar-fill-stab" style={{ width: `${e.stability}%` }} />
        </div>
      </div>
    </div>
  );
}

function MilitaryTab({ c }: { c: Country }) {
  const m = c.military;
  return (
    <div className="stats-grid">
      <Stat label="Total Personnel" value={m.totalPersonnel.toLocaleString()} />
      <Stat label="Force Limit" value={m.forceLimit.toLocaleString()} />
      <Stat label="Readiness" value={`${m.readiness}/100`} />
      <Stat label="Morale" value={`${m.morale}/100`} />
      <Bar label="Readiness" value={m.readiness} cls="bar-fill-ready" />
      <Bar label="Morale" value={m.morale} cls="bar-fill-morale" />
    </div>
  );
}

function DiplomacyTab({ c }: { c: Country }) {
  if (c.relationships.length === 0) {
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
  const isPlayerUnit = unit.ownerCode === PLAYER_CODE;

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
  const [posture, setPosture] = useState<DiplomaticPosture>(country.posture);
  const [taxFeedback, setTaxFeedback] = useState<string | null>(null);

  // sync local state when the country object updates (e.g. after a turn)
  useEffect(() => {
    setTaxRate(country.economy.taxRate);
    setReadiness(country.military.readiness);
    setPosture(country.posture);
  }, [country.economy.taxRate, country.military.readiness, country.posture]);

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
    </footer>
  );
}

// ---- Foreign action panel (espionage + aid) ---------------------------------

function ForeignActionPanel({ country }: { country: Country }) {
  const [intel, setIntel] = useState<IntelLevel>(gameSocket.getIntel()[country.id] ?? 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    return gameSocket.onIntel((map) => setIntel(map[country.id] ?? 0));
  }, [country.id]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3000);
  };

  const act = (action: () => void, cooldown = 600) => {
    if (busy) return;
    setBusy(true);
    action();
    setTimeout(() => setBusy(false), cooldown);
  };

  const sendAid = () => {
    const intent: StrictIntent = { intent: "send-aid", from: PLAYER_CODE, target: country.id, amount: 50e9 };
    gameSocket.sendIntent(intent);
    flash("Aid package dispatched — relations improving.");
  };

  const gatherIntel = () => {
    const intent: StrictIntent = { intent: "gather-intel", from: PLAYER_CODE, target: country.id, cost: 30e9 };
    gameSocket.sendIntent(intent);
    flash("Intelligence operatives deployed.");
  };

  const fundSabotage = () => {
    const intent: StrictIntent = { intent: "fund-sabotage", from: PLAYER_CODE, target: country.id, cost: 100e9 };
    gameSocket.sendIntent(intent);
    flash("Covert operation initiated.");
  };

  return (
    <footer className="action-bar foreign-actions">
      <div className="intel-bar-section">
        <div className="intel-header">
          <span className="gov-label">Intel Level</span>
          <span className="intel-value">{intel}/100</span>
        </div>
        <div className="intel-bar">
          <div className="intel-fill" style={{ width: `${intel}%` }} />
        </div>
      </div>
      <button className="btn btn-success" disabled={busy} onClick={() => act(sendAid)}>
        Send Aid ($50B)
      </button>
      <button className="btn btn-info" disabled={busy} onClick={() => act(gatherIntel)}>
        Gather Intel ($30B)
      </button>
      <button className="btn btn-danger" disabled={busy} onClick={() => act(fundSabotage)}>
        Fund Sabotage ($100B)
      </button>
      {msg && <span className="gov-feedback">{msg}</span>}
    </footer>
  );
}

// ---- Recruitment panel (military production) --------------------------------

const RECRUIT_OPTIONS: { type: UnitType; label: string; cost: number; desc: string }[] = [
  { type: "infantry", label: "Train Infantry", cost: 50e9, desc: "300 strength · 80 readiness" },
  { type: "armor", label: "Build Armor", cost: 120e9, desc: "500 strength · 80 readiness" },
  { type: "navy", label: "Commission Fleet", cost: 200e9, desc: "800 strength · 80 readiness" },
];

function RecruitmentPanel({ country }: { country: Country }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const recruit = (type: UnitType, cost: number) => {
    if (busy) return;
    if (country.economy.treasury < cost) {
      setMsg("Insufficient treasury funds.");
      setTimeout(() => setMsg(null), 3000);
      return;
    }
    setBusy(true);
    const intent: StrictIntent = { intent: "recruit-unit", from: country.id, unitType: type, cost };
    gameSocket.sendIntent(intent);
    setMsg(`${RECRUIT_OPTIONS.find((o) => o.type === type)!.label} deployed at capital.`);
    setTimeout(() => setMsg(null), 3000);
    setTimeout(() => setBusy(false), 600);
  };

  return (
    <footer className="action-bar recruitment">
      <span className="gov-label">Military Production</span>
      <div className="recruit-grid">
        {RECRUIT_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            className={country.economy.treasury >= opt.cost ? "recruit-btn" : "recruit-btn recruit-disabled"}
            disabled={busy || country.economy.treasury < opt.cost}
            onClick={() => recruit(opt.type, opt.cost)}
          >
            <span className="recruit-label">{opt.label}</span>
            <span className="recruit-cost">${(opt.cost / 1e9).toFixed(0)}B</span>
            <span className="recruit-desc">{opt.desc}</span>
          </button>
        ))}
      </div>
      {msg && <span className="gov-feedback">{msg}</span>}
    </footer>
  );
}

// ---- Zone report (conflict zone intel display) ------------------------------

function ZoneReport({ zone, toast }: { zone: ConflictZone; toast: string | null }) {
  const intel = gameSocket.getIntel();
  // use the intel level of the zone's primary owner
  const primaryOwner = zone.ownerCodes[0];
  const intelLevel = intel[primaryOwner] ?? 0;

  const intelTier: "low" | "medium" | "high" =
    intelLevel >= 71 ? "high" : intelLevel >= 31 ? "medium" : "low";

  return (
    <section className="panel profile-pane">
      <header className="profile-head zone-head">
        <span className="zone-icon" aria-hidden>⬢</span>
        <div>
          <h2>Conflict Zone Report</h2>
          <span className="brand-sub">
            {zone.hostility >= 70 ? "Active hostilities detected" : zone.hostility >= 35 ? "Military presence" : "Neutral deployment"}
          </span>
        </div>
      </header>

      <div className="profile-body">
        <div className="zone-meta">
          <div className="stat-row">
            <span className="stat-label">Location</span>
            <span className="stat-value">{zone.centroid[0].toFixed(1)}°, {zone.centroid[1].toFixed(1)}°</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Hostility Index</span>
            <span className="stat-value">{zone.hostility}/100</span>
          </div>
        </div>

        <div className="intel-gate">
          <div className="intel-header">
            <span className="gov-label">Reconnaissance</span>
            <span className={`intel-tier intel-tier-${intelTier}`}>{intelTier.toUpperCase()} INTEL</span>
          </div>

          {intelTier === "low" && (
            <div className="intel-content intel-unknown">
              <p>Unknown military presence detected.</p>
              <p className="intel-hint">Gather intelligence on the involved nations to reveal more.</p>
            </div>
          )}
          {intelTier === "medium" && (
            <div className="intel-content intel-partial">
              <p>Estimated unit count: <b>{zone.unitCount}</b></p>
              <p>{zone.dominantType === "armor" ? "Armored presence suspected" : zone.dominantType === "navy" ? "Naval activity suspected" : "Infantry presence suspected"}.</p>
              <p className="intel-hint">Further intelligence will reveal exact units and readiness.</p>
            </div>
          )}
          {intelTier === "high" && (
            <div className="intel-content intel-full">
              <div className="zone-unit-list">
                {zone.units.map((u) => (
                  <div key={u.id} className="zone-unit-row">
                    <span className="zone-unit-name">{u.name}</span>
                    <span className="zone-unit-type">{u.type}</span>
                    <span className="zone-unit-stat">R{u.readiness} M{u.morale}</span>
                  </div>
                ))}
              </div>
              <div className="zone-owners">
                <span className="gov-label">Deployed by</span>
                <span>{zone.ownerCodes.join(", ")}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </section>
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

// referenced to keep the type import used in this module's surface
export type { Relationship };
