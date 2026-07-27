// BriefingDashboard — the Presidential Strategy Briefing Command Center.
// Composes the KPI header, tabbed navigation, and all five tab panels.

import { useState } from "react";
import type { BriefingTab, IPresidentialBriefing } from "./briefingTypes.js";
import { KPIHeaderBar } from "./KPIHeaderBar.js";
import { Tab1Briefing } from "./Tab1Briefing.js";
import { Tab2Domains } from "./Tab2Domains.js";
import { Tab3Intel } from "./Tab3Intel.js";
import { Tab4Decisions } from "./Tab4Decisions.js";
import { Tab5Archive } from "./Tab5Archive.js";

interface Props {
  briefing: IPresidentialBriefing;
}

const TABS: Array<{ id: BriefingTab; label: string; icon: string }> = [
  { id: "briefing", label: "Briefing Executivo", icon: "◢" },
  { id: "domains", label: "Resultados por Domínio", icon: "◈" },
  { id: "intel", label: "Radar & Inteligência", icon: "◆" },
  { id: "decisions", label: "Sala de Decisão", icon: "▶" },
  { id: "archive", label: "Arquivo Reservado", icon: "▣" },
];

export function BriefingDashboard({ briefing }: Props) {
  const [tab, setTab] = useState<BriefingTab>("briefing");

  const handleDecisionSubmit = (selections: Record<string, string>) => {
    // In future: transmit to game engine via gameSocket.
    // For now the UI confirms and holds the selection.
    void selections;
  };

  return (
    <div className="briefing-dashboard">
      <KPIHeaderBar briefing={briefing} />

      <nav className="briefing-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`briefing-tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="bt-icon" aria-hidden>{t.icon}</span>
            <span className="bt-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="briefing-content">
        {tab === "briefing" && <Tab1Briefing briefing={briefing} />}
        {tab === "domains" && <Tab2Domains briefing={briefing} />}
        {tab === "intel" && <Tab3Intel briefing={briefing} />}
        {tab === "decisions" && <Tab4Decisions briefing={briefing} onSubmit={handleDecisionSubmit} />}
        {tab === "archive" && <Tab5Archive briefing={briefing} />}
      </div>
    </div>
  );
}
