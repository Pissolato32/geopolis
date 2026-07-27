// CampaignModal — the nation selection and lock flow shown at startup or
// campaign reset. Lets the player pick a sovereign power from a structured
// list or by clicking on the WorldMap. Shows a confirmation step with
// baseline indicators before locking the campaign.

import { useState, useMemo } from "react";
import type { Country, WorldSeed } from "../shared/types.js";
import { round2 } from "../briefing/format.js";
import { ADVISORS } from "./advisorTypes.js";

interface Props {
  seed: WorldSeed;
  onConfirm: (countryId: string) => void;
  onMapPick?: () => void;
}

type Step = "select" | "confirm";

const SOVEREIGN_POWERS = [
  "USA", "CHN", "RUS", "DEU", "FRA", "GBR", "JPN", "IND", "BRA",
  "ISR", "IRN", "SAU", "TUR", "EGY", "ZAF", "NGA", "KOR", "AUS",
  "CAN", "MEX", "ESP", "ITA", "POL", "UKR", "PAK", "IDN", "VNM",
];

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function maxTension(country: Country): number {
  if (country.relationships.length === 0) return 0;
  return Math.max(...country.relationships.map((r) => r.tension));
}

export function CampaignModal({ seed, onConfirm }: Props) {
  const [step, setStep] = useState<Step>("select");
  const [selected, setSelected] = useState<Country | null>(null);
  const [search, setSearch] = useState("");

  const sovereignList = useMemo(() => {
    return seed.countries
      .filter((c) => SOVEREIGN_POWERS.includes(c.id))
      .sort((a, b) => b.economy.gdp - a.economy.gdp);
  }, [seed]);

  const searchResults = useMemo(() => {
    if (search.trim().length < 2) return [];
    return seed.countries
      .filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.id.toLowerCase().includes(search.toLowerCase()),
      )
      .slice(0, 10);
  }, [search, seed]);

  const handleSelect = (country: Country) => {
    setSelected(country);
    setStep("confirm");
  };

  const handleConfirm = () => {
    if (selected) onConfirm(selected.id);
  };

  const handleBack = () => {
    setStep("select");
    setSelected(null);
  };

  return (
    <div className="campaign-overlay">
      <div className="campaign-modal">
        {step === "select" && (
          <>
            <div className="campaign-header">
              <div className="campaign-brand">
                <span className="campaign-mark">◤</span>
                <div>
                  <h2>Select Your Nation</h2>
                  <p className="campaign-sub">Choose the country you will lead for this campaign. This choice is locked for the entire session.</p>
                </div>
              </div>
            </div>

            <div className="campaign-search-area">
              <input
                className="campaign-search"
                type="text"
                placeholder="Search any nation by name or code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {search.trim().length >= 2 ? (
              <div className="campaign-search-results">
                <div className="campaign-section-label">Search Results</div>
                <div className="campaign-grid">
                  {searchResults.map((c) => (
                    <button
                      key={c.id}
                      className="campaign-card"
                      onClick={() => handleSelect(c)}
                    >
                      <img className="campaign-flag" src={c.flag} alt="" />
                      <div className="campaign-card-info">
                        <span className="campaign-card-name">{c.name}</span>
                        <span className="campaign-card-code">{c.id} · {fmtMoney(c.economy.gdp)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="campaign-sovereign-list">
                <div className="campaign-section-label">Sovereign Powers — Recommended Start</div>
                <div className="campaign-grid">
                  {sovereignList.map((c) => (
                    <button
                      key={c.id}
                      className="campaign-card"
                      onClick={() => handleSelect(c)}
                    >
                      <img className="campaign-flag" src={c.flag} alt="" />
                      <div className="campaign-card-info">
                        <span className="campaign-card-name">{c.name}</span>
                        <span className="campaign-card-code">{c.id} · {fmtMoney(c.economy.gdp)}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="campaign-map-hint">
                  You can also click any nation on the world map to select it.
                </div>
              </div>
            )}

            <div className="campaign-advisor-preview">
              <div className="campaign-section-label">Your Advisory Council</div>
              <div className="campaign-advisor-row">
                {Object.values(ADVISORS).map((a) => (
                  <div key={a.name} className="campaign-advisor-chip" style={{ borderColor: a.accentColor }}>
                    <span className="campaign-advisor-icon">{a.icon}</span>
                    <div>
                      <span className="campaign-advisor-name">{a.name}</span>
                      <span className="campaign-advisor-title">{a.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {step === "confirm" && selected && (
          <>
            <div className="campaign-header">
              <div className="campaign-brand">
                <img className="campaign-flag-lg" src={selected.flag} alt="" />
                <div>
                  <h2>Assume Leadership of {selected.name}</h2>
                  <p className="campaign-sub">Review your nation's baseline indicators. Once confirmed, this choice is locked for the entire campaign.</p>
                </div>
              </div>
            </div>

            <div className="campaign-confirm-grid">
              <div className="campaign-confirm-card">
                <span className="campaign-confirm-label">GDP</span>
                <span className="campaign-confirm-value">{fmtMoney(selected.economy.gdp)}</span>
              </div>
              <div className="campaign-confirm-card">
                <span className="campaign-confirm-label">Economic Stability</span>
                <span className="campaign-confirm-value">{round2(selected.economy.stability)}%</span>
              </div>
              <div className="campaign-confirm-card">
                <span className="campaign-confirm-label">Military Readiness</span>
                <span className="campaign-confirm-value">{round2(selected.military.readiness)}%</span>
              </div>
              <div className="campaign-confirm-card">
                <span className="campaign-confirm-label">Max Tension</span>
                <span className="campaign-confirm-value">{round2(maxTension(selected))}</span>
              </div>
              <div className="campaign-confirm-card">
                <span className="campaign-confirm-label">Treasury</span>
                <span className="campaign-confirm-value">{fmtMoney(selected.economy.treasury)}</span>
              </div>
              <div className="campaign-confirm-card">
                <span className="campaign-confirm-label">Diplomatic Posture</span>
                <span className="campaign-confirm-value">{selected.posture}</span>
              </div>
            </div>

            <div className="campaign-confirm-actions">
              <button className="campaign-back-btn" onClick={handleBack}>
                ← Back to Selection
              </button>
              <button className="campaign-confirm-btn" onClick={handleConfirm}>
                ✓ Confirm &amp; Lock Campaign
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
