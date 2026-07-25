// CountryProfile — right panel. Renders either a Country profile (Economy,
// Military, Diplomacy tabs) or a Conflict War Report (when clicking a ⚔️ icon).
// Enforces Fog of War principles (ADR-001) for neutral observers vs belligerents.
// Allows player to take over ("Assumir Nação") any sovereign country.

import { useEffect, useState } from "react";
import { selection } from "./selectionManager.js";
import { gameSocket } from "./gameSocket.js";
import type { ActiveConflict, Country, Relationship, StrictIntent } from "./shared/types.js";

type Tab = "economy" | "military" | "diplomacy";

export function CountryProfile({
  playerCountry,
  onSelectPlayerCountry,
}: {
  playerCountry: string;
  onSelectPlayerCountry: (code: string) => void;
}) {
  const [sel, setSel] = useState<ReturnType<typeof selection.getSelected>>(null);
  const [tab, setTab] = useState<Tab>("economy");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => selection.subscribe(setSel), []);

  useEffect(() => {
    return gameSocket.onIntentResponse((res) => {
      if (res.ok) {
        setToast(`Ordem Confirmada: ${res.acknowledged.intent}`);
      } else {
        setToast(`Rejeitada: ${res.error}`);
      }
      setTimeout(() => setToast(null), 3500);
    });
  }, []);

  if (!sel) {
    return (
      <aside className="panel profile-empty">
        <div className="placeholder">
          <div className="placeholder-icon" aria-hidden>◎</div>
          <h3>Nenhuma entidade selecionada</h3>
          <p>Clique em um país, ícone de guerra ⚔️ ou pesquise uma nação acima.</p>
        </div>
      </aside>
    );
  }

  if (sel.kind === "conflict") {
    return (
      <>
        <ConflictProfile conflict={sel.conflict} playerCountry={playerCountry} toast={toast} />
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  if (sel.kind === "country") {
    return (
      <>
        <CountryProfileBody
          country={sel.country}
          playerCountry={playerCountry}
          onSelectPlayerCountry={onSelectPlayerCountry}
          tab={tab}
          setTab={setTab}
          toast={toast}
        />
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  return null;
}

// ---- Conflict War Briefing (Fog of War Compliant) ---------------------------

function ConflictProfile({
  conflict,
  playerCountry,
  toast,
}: {
  conflict: ActiveConflict;
  playerCountry: string;
  toast: string | null;
}) {
  const seed = (window as unknown as { __worldSeed?: { countries: Country[] } }).__worldSeed;
  const attacker = seed?.countries.find((c) => c.id === conflict.attackerCode);
  const defender = seed?.countries.find((c) => c.id === conflict.defenderCode);

  const isBelligerent = conflict.attackerCode === playerCountry || conflict.defenderCode === playerCountry;

  return (
    <aside className="panel profile">
      <header className="profile-header">
        <div className="profile-mark unit-mark" style={{ color: "#e8635a" }} aria-hidden>⚔️</div>
        <div className="profile-title">
          <h2>{conflict.title}</h2>
          <span className="profile-code">Teatro de Operações: {conflict.locationName}</span>
        </div>
        <button className="chip close" onClick={() => selection.selectConflict(null)} title="Fechar">✕</button>
      </header>

      <div className="tab-body">
        {/* Fog of War Banner */}
        <div
          className="metric-card"
          style={{
            background: isBelligerent ? "rgba(232, 99, 90, 0.15)" : "rgba(74, 159, 232, 0.15)",
            border: `1px solid ${isBelligerent ? "var(--danger)" : "var(--info)"}`,
            padding: "8px 12px",
            marginBottom: "12px",
            borderRadius: "5px",
          }}
        >
          <span style={{ fontSize: "11px", fontWeight: "bold", color: isBelligerent ? "var(--danger)" : "var(--info)" }}>
            {isBelligerent
              ? "⚔️ STATUS: COMBATENTE DIRETO (Inteligência Tática Total)"
              : "👁️ STATUS: OBSERVADOR INTERNACIONAL (Fog of War / Relatório OSINT)"}
          </span>
        </div>

        {/* Belligerents comparison */}
        <div className="stats-grid" style={{ marginBottom: "12px" }}>
          <Stat label="Atacante" value={attacker ? attacker.name : conflict.attackerCode} />
          <Stat label="Defensor" value={defender ? defender.name : conflict.defenderCode} />
        </div>

        {isBelligerent ? (
          <div className="stats-grid">
            <Stat label="Baixas Atacante (Exatas)" value={conflict.attackerLosses.toLocaleString()} />
            <Stat label="Baixas Defensor (Exatas)" value={conflict.defenderLosses.toLocaleString()} />
            <Stat label="Efetivo Atacante" value={conflict.attEstimatedStrength.toLocaleString()} />
            <Stat label="Efetivo Defensor" value={conflict.defEstimatedStrength.toLocaleString()} />
            <Bar label="Intensidade de Conflito" value={90} cls="bar-fill-ready" />
          </div>
        ) : (
          <div className="stats-grid">
            <Stat label="Baixas Atacante (Estimadas)" value={`~${(Math.round(conflict.attackerLosses / 100) * 100).toLocaleString()}`} />
            <Stat label="Baixas Defensor (Estimadas)" value={`~${(Math.round(conflict.defenderLosses / 100) * 100).toLocaleString()}`} />
            <Stat label="Precisão das Estimativas" value="78% (OSINT/SIGINT)" />
            <Stat label="Início do Conflito" value={new Date(conflict.startedAt).toLocaleDateString("pt-BR")} />
            <Bar label="Intensidade Reportada" value={75} cls="bar-fill-ready" />
          </div>
        )}
      </div>

      {isBelligerent && (
        <footer className="action-bar">
          <button className="btn btn-danger" onClick={() => gameSocket.sendIntent({ intent: "declare-war", from: playerCountry, target: conflict.defenderCode === playerCountry ? conflict.attackerCode : conflict.defenderCode })}>Propor Trégua</button>
          <button className="btn btn-accent" onClick={() => gameSocket.sendIntent({ intent: "improve-relations", from: playerCountry, target: conflict.defenderCode === playerCountry ? conflict.attackerCode : conflict.defenderCode })}>Mobilizar Reservas</button>
        </footer>
      )}
      {!isBelligerent && (
        <footer className="action-bar muted">
          Nação Neutra — Observando via Fog of War.
        </footer>
      )}

      {toast && <div className="toast">{toast}</div>}
    </aside>
  );
}

// ---- Country profile -------------------------------------------------------

function CountryProfileBody({
  country,
  playerCountry,
  onSelectPlayerCountry,
  tab,
  setTab,
  toast,
}: {
  country: Country;
  playerCountry: string;
  onSelectPlayerCountry: (code: string) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  toast: string | null;
}) {
  const isSelf = country.id === playerCountry;
  const sendIntent = (intent: StrictIntent["intent"], extra?: { terms?: string }) => {
    const payload = { intent, from: playerCountry, target: country.id, ...(extra ?? {}) } as StrictIntent;
    gameSocket.sendIntent(payload);
  };

  return (
    <aside className="panel profile">
      <header className="profile-header">
        <img className="profile-flag" src={country.flag} alt={`Bandeira de ${country.name}`} />
        <div className="profile-title">
          <h2>{country.name}</h2>
          <span className="profile-code">{country.id} · {country.region || "—"}</span>
        </div>
        <button className="chip close" onClick={() => selection.selectCountry(null)} title="Fechar">✕</button>
      </header>

      {/* Takeover Nation Button */}
      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}>
        {!isSelf ? (
          <button
            className="btn btn-accent"
            style={{ width: "100%", textTransform: "none", fontSize: "12px" }}
            onClick={() => onSelectPlayerCountry(country.id)}
          >
            🎮 Assumir Nação (Comandar {country.name})
          </button>
        ) : (
          <div style={{ textAlign: "center", color: "var(--accent)", fontWeight: "bold", fontSize: "12px" }}>
            🎮 SUAS FORÇAS (Nação Assumida)
          </div>
        )}
      </div>

      <nav className="tabs">
        {(["economy", "military", "diplomacy"] as Tab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? "tab tab-active" : "tab"}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <div className="tab-body">
        {tab === "economy" && <EconomyTab c={country} />}
        {tab === "military" && <MilitaryTab c={country} />}
        {tab === "diplomacy" && <DiplomacyTab c={country} />}
      </div>

      {!isSelf && (
        <footer className="action-bar">
          <button className="btn btn-danger" onClick={() => sendIntent("declare-war")}>Declarar Guerra</button>
          <button className="btn btn-accent" onClick={() => sendIntent("propose-trade")}>Acordo Comercial</button>
          <button className="btn btn-success" onClick={() => sendIntent("improve-relations")}>Aproximar Relações</button>
        </footer>
      )}
      {isSelf && <footer className="action-bar muted">Seu Governo Nacional.</footer>}

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
      <Stat label="PIB (GDP)" value={fmtMoney(e.gdp)} />
      <Stat label="PIB per capita" value={`$${fmtMoney(e.gdpPerCapita)}`} />
      <Stat label="Tesouro Nacional" value={`$${fmtMoney(e.treasury)}`} />
      <Stat label="Alíquota Fiscal" value={`${(e.taxRate * 100).toFixed(1)}%`} />
      <Stat label="Estabilidade" value={`${e.stability}/100`} />
      <Stat label="População" value={c.population.toLocaleString()} />
      <div className="bar">
        <span className="bar-label">Estabilidade Social</span>
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
      <Stat label="Efetivo Total" value={m.totalPersonnel.toLocaleString()} />
      <Stat label="Capacidade Mobilizável" value={m.forceLimit.toLocaleString()} />
      <Stat label="Prontidão" value={`${m.readiness}/100`} />
      <Stat label="Moral" value={`${m.morale}/100`} />
      <Bar label="Prontidão das Forças" value={m.readiness} cls="bar-fill-ready" />
      <Bar label="Moral das Tropas" value={m.morale} cls="bar-fill-morale" />
    </div>
  );
}

function DiplomacyTab({ c }: { c: Country }) {
  if (c.relationships.length === 0) {
    return <div className="feed-empty">Sem relações diplomáticas mapeadas.</div>;
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
              <MiniMeter label="Afinidade" value={r.affinity} min={-100} max={100} />
              <MiniMeter label="Tensão" value={r.tension} min={0} max={100} />
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
    <button className="rel-code rel-link" onClick={jump} title={`Inspecionar ${code}`}>
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

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

export type { Relationship };
