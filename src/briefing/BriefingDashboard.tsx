// BriefingDashboard — the Presidential Strategy Briefing Command Center.
// Composes the KPI header, tabbed navigation, and all five tab panels.

import { useMemo, useState } from "react";
import type { BriefingTab, IPresidentialBriefing } from "./briefingTypes.js";
import type { StrictIntent } from "../shared/types.js";
import type { AnalysisSnapshot } from "./byodTypes.js";
import type { AdvisorAgenda, AdvisorCard, ByodAdvisorResponse } from "../campaign/advisorTypes.js";
import type { CompetingOption } from "../shared/types.js";

import { KPIHeaderBar } from "./KPIHeaderBar.js";
import { Tab1Briefing } from "./Tab1Briefing.js";
import { Tab2Domains } from "./Tab2Domains.js";
import { Tab3Intel } from "./Tab3Intel.js";
import { Tab4Decisions } from "./Tab4Decisions.js";
import { Tab5Archive } from "./Tab5Archive.js";
import { AdvisorCouncil } from "../campaign/AdvisorCouncil.js";
import { gameSocket } from "../gameSocket.js";
import { pushToast } from "../Toast.js";

interface Props {
  briefing: IPresidentialBriefing;
  advisorAgenda?: AdvisorAgenda;
  advisorResponses?: ByodAdvisorResponse[];
  onAdvisorDirective?: (text: string) => void;
  onCardDispatch?: (card: AdvisorCard) => void;
  onCompetingOptionChosen?: (option: CompetingOption, cardId: string) => void;
  onOpenCabinetManager?: () => void;
  campaignLocked?: boolean;
  playerCode?: string;
}

function buildSnapshot(): AnalysisSnapshot {
  const countries = gameSocket.getCountries();
  const market = gameSocket.getMarket();
  const units = gameSocket.getUnits();
  return {
    tick: gameSocket.getTick(),
    playerCode: gameSocket.getPlayerCode(),
    countries: countries.map((c) => ({
      id: c.id,
      name: c.name,
      gdp: c.economy.gdp,
      gdpGrowth: c.economy.stability,
      tension: c.relationships.length > 0 ? Math.max(...c.relationships.map((r) => r.tension)) : 0,
      readiness: c.military.readiness,
      relationships: c.relationships.map((r) => ({ countryCode: r.countryCode, tension: r.tension, affinity: r.affinity })),
    })),
    market: market.map((m) => ({ resource: m.resource, price: m.price, delta: m.delta })),
    units: units.map((u) => ({ ownerCode: u.ownerCode, type: u.type, readiness: u.readiness, latlng: u.latlng })),
  };
}

const TABS: Array<{ id: BriefingTab; label: string; icon: string }> = [
  { id: "briefing", label: "Briefing Executivo", icon: "◢" },
  { id: "domains", label: "Resultados por Domínio", icon: "◈" },
  { id: "intel", label: "Radar & Inteligência", icon: "◆" },
  { id: "decisions", label: "Sala de Decisão", icon: "▶" },
  { id: "archive", label: "Arquivo Reservado", icon: "▣" },
];

export function BriefingDashboard({
  briefing,
  advisorAgenda,
  advisorResponses = [],
  onAdvisorDirective,
  onCardDispatch,
  onCompetingOptionChosen,
  onOpenCabinetManager,
  campaignLocked = false,
}: Props) {
  const [tab, setTab] = useState<BriefingTab>("briefing");
  const snapshot = useMemo(() => buildSnapshot(), []);

  const handleDecisionSubmit = (selections: Record<string, string>) => {
    let dispatched = 0;
    for (const group of briefing.decisionOptions) {
      const optionId = selections[group.domain];
      if (!optionId) continue;
      const option = group.options.find((o) => o.id === optionId);
      if (!option?.intent) continue;
      gameSocket.sendIntent(option.intent as StrictIntent);
      dispatched++;
    }
    if (dispatched > 0) {
      pushToast({ kind: "info", title: "Gabinete", message: `${dispatched} decisão(ões) transmitida(s) ao gabinete`, dismissable: true, duration: 5000 });
    }
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
        {tab === "decisions" && (
          <>
            <Tab4Decisions briefing={briefing} snapshot={snapshot} onSubmit={handleDecisionSubmit} campaignLocked={campaignLocked} />
            {advisorAgenda && onAdvisorDirective && onCardDispatch && (
              <AdvisorCouncil
                agenda={advisorAgenda}
                advisorResponses={advisorResponses}
                onDirectiveSubmit={onAdvisorDirective}
                onCardDispatch={onCardDispatch}
                onCompetingOptionChosen={onCompetingOptionChosen ?? (() => {})}
                onOpenCabinetManager={onOpenCabinetManager ?? (() => {})}
                dispatched={false}
              />
            )}
          </>
        )}
        {tab === "archive" && <Tab5Archive briefing={briefing} />}
      </div>
    </div>
  );
}
