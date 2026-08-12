// App — the 3-panel command dashboard. Loads the world seed, wires the
// WebSocket, and composes the left event log, center map, and right profile.
// The topbar carries the global search, player country picker, and speed controls.

import { useEffect, useState } from "react";
import {
  Activity,
  BriefcaseBusiness,
  ChevronDown,
  Circle,
  FastForward,
  FlaskConical,
  Lock,
  Map,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Shield,
  Swords,
  Trophy,
  WifiOff,
  Zap,
} from "lucide-react";
import { EventLog } from "./EventLog.js";
import { WorldMap } from "./WorldMap.js";
import { CountryProfile } from "./CountryProfile.js";
import { GlobalSearch } from "./GlobalSearch.js";
import { MarketTicker } from "./MarketTicker.js";
import { CabinetModal } from "./CabinetModal.js";
import { BriefingDashboard } from "./briefing/BriefingDashboard.js";
import { generateBriefing } from "./briefing/briefingGenerator.js";
import { gameSocket } from "./gameSocket.js";
import type { ConnectionStatus, SimSpeed } from "./gameSocket.js";
import { loadOrSeedWorld } from "./gameStore.js";
import { ToastContainer, pushToast } from "./Toast.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { useOnlineStatus } from "./useOnlineStatus.js";
import { reportError } from "./errors.js";
import type { CabinetCard, GameEvent, WorldSeed } from "./shared/types.js";
import seedData from "../data/world-seed-2026.json";
import { CampaignModal } from "./campaign/CampaignModal.js";
import { loadCampaign, saveCampaign, clearCampaign, type CampaignState } from "./campaign/campaignState.js";
import { generateAdvisorAgenda, evaluateDirectiveByAdvisors, competingOptionToIntent } from "./campaign/advisorEngine.js";
import type { AdvisorCard, AdvisorAgenda, ByodAdvisorResponse } from "./campaign/advisorTypes.js";
import { CabinetManagerModal } from "./campaign/CabinetManagerModal.js";
import { applyAdvisorFeedback, ADVISOR_SLOTS } from "./campaign/advisorTypes.js";
import type { AdvisorSlotId, AdvisorState, CompetingOption, CabinetState } from "./shared/types.js";
import { ResearchPanel } from "./research/ResearchPanel.js";
import { calculateResearchOutput, calculateAdvisorResearchBonus, createInitialResearchState } from "./research/researchEngine.js";
import { CovertOpsPanel } from "./CovertOpsPanel.js";
import { WarRoom } from "./WarRoom.js";
import { VictoryModal } from "./VictoryModal.js";
import { calculateVictoryProgress } from "./victory/victoryManager.js";
import { initializeBlocs } from "./domain/diplomacy/multilateralBlocs.js";
import type { CovertOpType } from "./shared/types.js";

const SEED = seedData as WorldSeed;

interface ScenarioMeta {
  id: string;
  name: string;
  description: string;
}

type ViewMode = "map" | "briefing" | "research";

export default function App() {
  const [seed] = useState<WorldSeed>(SEED);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string>("");
  const [tick, setTick] = useState(0);
  const [turnBusy, setTurnBusy] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [activeScenario, setActiveScenario] = useState("world-seed-2026");
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [playerCode, setPlayerCode] = useState("USA");
  const [playerOpen, setPlayerOpen] = useState(false);
  const [simPaused, setSimPaused] = useState(true);
  const [simSpeed, setSimSpeed] = useState<SimSpeed>(0);
  const [cabinetCards, setCabinetCards] = useState<CabinetCard[]>([]);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("offline");
  const [view, setView] = useState<ViewMode>("map");
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [campaign, setCampaign] = useState<CampaignState | null>(null);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [advisorAgenda, setAdvisorAgenda] = useState<AdvisorAgenda>({ cards: [], competingCards: [], councilSummary: "", vacantSlots: [] });
  const [advisorResponses, setAdvisorResponses] = useState<ByodAdvisorResponse[]>([]);
  const [showCabinetManager, setShowCabinetManager] = useState(false);
  const [showVictoryModal, setShowVictoryModal] = useState(false);
  const [showWarRoom, setShowWarRoom] = useState(false);
  const [cabinetOverride, setCabinetOverride] = useState<CabinetState | null>(null);
  const { online, wasOffline } = useOnlineStatus();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/scenarios")
      .then((r) => r.json())
      .then((d: { scenarios: ScenarioMeta[] }) => {
        if (!cancelled) setScenarios(d.scenarios);
      })
      .catch(() => {
        if (!cancelled) setScenarios([{ id: "world-seed-2026", name: "Modern World 2026", description: "" }]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const world = await loadOrSeedWorld(seed);
        if (cancelled) return;
        (window as unknown as { __worldSeed?: WorldSeed }).__worldSeed = seed;
        gameSocket.setPersistedWorld(world, seed);
        gameSocket.connect();
        setStatus("ready");
      } catch (err) {
        console.error("[app] failed to load/seed world", err);
        if (cancelled) return;
        setErrMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seed]);

  useEffect(() => {
    const saved = loadCampaign();
    if (saved && saved.locked) {
      gameSocket.setPlayerCountry(saved.playerCountryId);
      setPlayerCode(saved.playerCountryId);
      setCampaign(saved);
    } else {
      setShowCampaignModal(true);
    }
  }, []);

  useEffect(() => gameSocket.onTick(setTick), []);
  useEffect(() => gameSocket.onEvent((evt) => {
    setEvents((prev) => {
      const next = [...prev, evt];
      return next.length > 500 ? next.slice(-500) : next;
    });
  }), []);
  useEffect(() => gameSocket.onPlayerChange(setPlayerCode), []);
  useEffect(() => gameSocket.onSimStateChange((s) => {
    setSimPaused(s.paused);
    setSimSpeed(s.speed);
  }), []);
  useEffect(() => gameSocket.onCabinetCards(setCabinetCards), []);
  useEffect(() => gameSocket.onConnectionChange(setConnStatus), []);

  useEffect(() => {
    if (wasOffline && online) {
      pushToast({ kind: "success", title: "Back online", message: "Connection restored. Your queued actions have been sent.", dismissable: true, duration: 4000 });
    }
  }, [wasOffline, online]);

  const advanceTurn = async () => {
    if (turnBusy) return;
    setTurnBusy(true);
    try {
      await gameSocket.advanceTurn();
    } catch (err) {
      reportError(err, {
        category: "api",
        source: "App.advanceTurn",
      });
    } finally {
      setTimeout(() => setTurnBusy(false), 400);
    }
  };

  const playerCountry = seed.countries.find((c) => c.id === playerCode);
  const campaignLocked = campaign?.locked ?? false;

  const handleCampaignConfirm = (countryId: string) => {
    const state: CampaignState = {
      playerCountryId: countryId,
      startedAt: Date.now(),
      scenarioId: activeScenario,
      locked: true,
    };
    saveCampaign(state);
    setCampaign(state);
    gameSocket.setPlayerCountry(countryId);
    setPlayerCode(countryId);
    setShowCampaignModal(false);
    pushToast({
      kind: "success",
      title: "Campaign Locked",
      message: `You are now leading ${seed.countries.find((c) => c.id === countryId)?.name ?? countryId}.`,
      dismissable: true,
      duration: 5000,
    });
  };

  const handleResetCampaign = () => {
    clearCampaign();
    setCampaign(null);
    setShowResetConfirm(false);
    setShowCampaignModal(true);
    pushToast({
      kind: "info",
      title: "Campaign Reset",
      message: "Select a new nation to begin a fresh campaign.",
      dismissable: true,
      duration: 4000,
    });
  };

  const pickPlayer = (code: string) => {
    if (campaignLocked) return;
    gameSocket.setPlayerCountry(code);
    setPlayerCode(code);
    setPlayerOpen(false);
  };

  const setSpeed = (speed: SimSpeed) => {
    if (speed === 0) {
      gameSocket.setPaused(true);
    } else {
      gameSocket.setSpeed(speed);
    }
  };

  const currentPlayer = gameSocket.getCountries().find((c) => c.id === playerCode);
  const effectiveCabinet = cabinetOverride ?? currentPlayer?.cabinet;
  const playerWithCabinet = effectiveCabinet && currentPlayer
    ? { ...currentPlayer, cabinet: effectiveCabinet }
    : currentPlayer;
  useEffect(() => {
    if (!playerWithCabinet || !campaignLocked) return;
    const agenda = generateAdvisorAgenda({
      tick,
      player: playerWithCabinet,
      countries: gameSocket.getCountries(),
      events,
      previousCards: advisorAgenda.cards,
    });
    setAdvisorAgenda(agenda);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, campaignLocked, cabinetOverride]);

  const handleAdvisorDirective = (text: string) => {
    if (!currentPlayer) return;
    const responses = evaluateDirectiveByAdvisors(text, currentPlayer, gameSocket.getCountries());
    setAdvisorResponses(responses);
  };

  const handleCardDispatch = (card: AdvisorCard) => {
    if (card.intent) {
      gameSocket.sendIntent(card.intent);
      pushToast({
        kind: "success",
        title: "Advisor Directive Dispatched",
        message: `"${card.title}" by ${card.advisorName} transmitted.`,
        dismissable: true,
        duration: 5000,
      });
    }
  };

  const handleCompetingOptionChosen = (option: CompetingOption, _cardId: string) => {
    const intent = competingOptionToIntent(option, playerCode);
    if (intent) {
      gameSocket.sendIntent(intent);
    }
    if (currentPlayer?.cabinet) {
      const rejectedSlots = advisorAgenda.competingCards
        .find((c) => c.id === _cardId)?.options
        .filter((o) => o.slotId !== option.slotId)
        .map((o) => o.slotId) ?? [];
      const updated = applyAdvisorFeedback(currentPlayer.cabinet, option.slotId, rejectedSlots);
      setCabinetOverride(updated);
    }
    pushToast({
      kind: "success",
      title: "Competing Proposal Accepted",
      message: `${option.advisorName}'s proposal accepted. Satisfaction +${option.satisfactionDelta}%.`,
      dismissable: true,
      duration: 5000,
    });
  };

  const handleAppointAdvisor = (slotId: AdvisorSlotId, advisor: AdvisorState) => {
    if (!currentPlayer?.cabinet) return;
    const updated = { ...currentPlayer.cabinet, [slotId]: advisor };
    setCabinetOverride(updated);
    pushToast({
      kind: "success",
      title: "Advisor Appointed",
      message: `${advisor.name} appointed as ${ADVISOR_SLOTS[slotId].label}.`,
      dismissable: true,
      duration: 4000,
    });
  };

  const handleLeaveVacant = (slotId: AdvisorSlotId) => {
    if (!currentPlayer?.cabinet) return;
    const updated = { ...currentPlayer.cabinet, [slotId]: null };
    setCabinetOverride(updated);
    pushToast({
      kind: "info",
      title: "Post Left Vacant",
      message: `${ADVISOR_SLOTS[slotId].label} is now vacant. No advisor cards from this council.`,
      dismissable: true,
      duration: 4000,
    });
  };

  if (showCampaignModal) {
    return (
      <div className="app-shell">
        <CampaignModal seed={seed} onConfirm={handleCampaignConfirm} />
        <ToastContainer />
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="app-shell">
        <div className="boot-screen">
          <div className="boot-spinner" aria-hidden />
          <h2>Initializing world…</h2>
          <p>Seeding 246 nations, diplomatic relations, and military forces.</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="app-shell">
        <div className="boot-screen boot-error">
          <h2>Could not connect to the world database</h2>
          <p>{errMsg}</p>
          <button className="btn btn-accent" onClick={() => location.reload()}>Retry</button>
        </div>
        <ToastContainer />
      </div>
    );
  }

  const researchPlayer = gameSocket.getCountries().find((c) => c.id === playerCode);
  const playerWithResearch = researchPlayer
    ? { ...researchPlayer, research: researchPlayer.research ?? createInitialResearchState(researchPlayer.id) }
    : undefined;

  const allCountries = gameSocket.getCountries();
  const victoryProgress = playerWithResearch
    ? calculateVictoryProgress(playerWithResearch, allCountries, initializeBlocs(allCountries, tick), tick)
    : null;

  const handleLaunchCovertOp = (_type: CovertOpType, _target: string) => {
    pushToast({ kind: "info", title: "Operation Launched", message: `Covert operation initiated against ${_target}.`, dismissable: true, duration: 4000 });
  };

  const handleAbortCovertOp = (_opId: string) => {
    pushToast({ kind: "info", title: "Operation Aborted", message: "Active covert mission has been terminated.", dismissable: true, duration: 3000 });
  };

  const connLabel =
    connStatus === "live" ? "Live Engine WebSocket" :
    connStatus === "connecting" ? "Connecting…" :
    connStatus === "reconnecting" ? "Reconnecting…" :
    connStatus === "sim" ? "Local Simulator Mode" : "Offline";
  const connClass =
    connStatus === "live" ? "status-ok" :
    connStatus === "connecting" || connStatus === "reconnecting" ? "status-warn" :
    "status-error";

  return (
    <div className="app-shell">
      <ErrorBoundary>
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden><Shield size={18} /></span>
            <div>
              <h1>GEOSIM COMMAND</h1>
              <span className="brand-sub">Modern World Dashboard · 2026</span>
            </div>
          </div>
          <GlobalSearch seed={seed} />
          <div className="topbar-status">
            {campaignLocked ? (
              <div className="player-picker locked" title="Campaign locked — nation cannot be changed">
                <span className="player-trigger locked-trigger">
                  {playerCountry ? (
                    <>
                      <img className="player-flag" src={playerCountry.flag} alt="" />
                      <span>{playerCountry.id}</span>
                    </>
                  ) : (
                    <span>No Nation</span>
                  )}
                  <Lock size={14} aria-hidden="true" />
                </span>
              </div>
            ) : (
              <div className={`player-picker${playerOpen ? " open" : ""}`}>
                <button
                  className="player-trigger"
                  onClick={() => setPlayerOpen((o) => !o)}
                  title="Select your player country"
                  aria-expanded={playerOpen}
                  aria-haspopup="menu"
                >
                  {playerCountry ? (
                    <>
                      <img className="player-flag" src={playerCountry.flag} alt="" />
                      <span>{playerCountry.id}</span>
                    </>
                  ) : (
                    <span>Select Player</span>
                  )}
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                {playerOpen && (
                  <div className="player-menu" role="menu">
                    <input
                      className="player-search"
                      type="text"
                      placeholder="Search country…"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setPlayerOpen(false);
                      }}
                    />
                    {seed.countries
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .slice(0, 50)
                      .map((c) => (
                        <button
                          key={c.id}
                          className={`player-option${c.id === playerCode ? " active" : ""}`}
                          onClick={() => pickPlayer(c.id)}
                        >
                          <img className="player-flag-sm" src={c.flag} alt="" />
                          <span className="player-name">{c.name}</span>
                          <span className="player-code">{c.id}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          {campaignLocked && (
            <button className="reset-campaign-btn" onClick={() => setShowResetConfirm(true)} title="Start a new campaign">
              <RotateCcw size={14} aria-hidden="true" /> New Campaign
            </button>
          )}
          <div className={`scenario-picker${scenarioOpen ? " open" : ""}`}>
            <button className="scenario-trigger" onClick={() => setScenarioOpen((o) => !o)} title="Switch scenario" aria-expanded={scenarioOpen}>
              {scenarios.find((s) => s.id === activeScenario)?.name ?? "Modern World 2026"}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {scenarioOpen && (
              <div className="scenario-menu" role="menu">
                {scenarios.map((s) => (
                  <button key={s.id} className={`scenario-option${s.id === activeScenario ? " active" : ""}`} onClick={() => { setActiveScenario(s.id); setScenarioOpen(false); void location.reload(); }}>
                    <span className="scenario-name">{s.name}</span>
                    {s.description && <span className="scenario-desc">{s.description}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="tick-badge" title="Simulation turn">Turn {tick}</span>
          <button className="victory-header-btn" onClick={() => setShowVictoryModal(true)} title="Campaign Victory Progress">
            <Trophy size={15} aria-hidden="true" /> Victory
          </button>
          <div className="view-toggle" role="tablist" aria-label="Application views">
            <button className={`view-btn ${view === "map" ? "active" : ""}`} onClick={() => setView("map")} title="Map Command View" role="tab" aria-selected={view === "map"}>
              <Map size={15} aria-hidden="true" /> Map
            </button>
            <button className={`view-btn ${view === "briefing" ? "active" : ""}`} onClick={() => setView("briefing")} title="Presidential Briefing" role="tab" aria-selected={view === "briefing"}>
              <BriefcaseBusiness size={15} aria-hidden="true" /> Briefing
            </button>
            <button className={`view-btn ${view === "research" ? "active" : ""}`} onClick={() => setView("research")} title="Tecnologia & P&D" role="tab" aria-selected={view === "research"}>
              <FlaskConical size={15} aria-hidden="true" /> Tech &amp; R&amp;D
            </button>
            <button className="view-btn" onClick={() => setShowWarRoom(true)} title="War Room — Active Conflicts">
              <Swords size={15} aria-hidden="true" /> War Room
            </button>
          </div>
          <div className="speed-controls" role="group" aria-label="Simulation speed">
            <button className={simPaused ? "speed-btn active" : "speed-btn"} onClick={() => setSpeed(0)} title="Pause simulation" aria-label="Pause simulation"><Pause size={15} aria-hidden="true" /></button>
            <button className={!simPaused && simSpeed === 1 ? "speed-btn active" : "speed-btn"} onClick={() => setSpeed(1)} title="1x speed" aria-label="1x speed"><Play size={15} aria-hidden="true" /></button>
            <button className={!simPaused && simSpeed === 2 ? "speed-btn active" : "speed-btn"} onClick={() => setSpeed(2)} title="2x speed" aria-label="2x speed"><FastForward size={15} aria-hidden="true" />2x</button>
            <button className={!simPaused && simSpeed === 5 ? "speed-btn active" : "speed-btn"} onClick={() => setSpeed(5)} title="5x speed" aria-label="5x speed"><FastForward size={15} aria-hidden="true" />5x</button>
            <button className={turnBusy ? "speed-btn advance turn-busy" : "speed-btn advance"} onClick={advanceTurn} disabled={turnBusy} title="Advance one tick" aria-label="Advance one tick"><Zap size={15} aria-hidden="true" /></button>
          </div>
          <span className={`status ${connClass}`} title={`Connection: ${connLabel}`}><Circle size={8} fill="currentColor" aria-hidden="true" /> {connLabel}{connStatus === "live" ? ` · ${seed.countryCount} nations` : ""}</span>
          {!online && <span className="status status-error" title="You are offline"><WifiOff size={13} aria-hidden="true" /> No Internet</span>}
          </div>
        </header>
      {view === "map" && <MarketTicker />}
      {view === "research" ? (
        <div className="research-fullpage">
          {playerWithResearch && (
            <>
              <ResearchPanel playerCountry={playerWithResearch} researchOutput={calculateResearchOutput(playerWithResearch)} advisorBonus={calculateAdvisorResearchBonus(playerWithResearch.cabinet)} />
              <CovertOpsPanel playerCountry={playerWithResearch} onLaunch={handleLaunchCovertOp} onAbort={handleAbortCovertOp} />
            </>
          )}
        </div>
      ) : view === "briefing" ? (
        <BriefingDashboard
          briefing={generateBriefing({ tick, playerCode, countries: gameSocket.getCountries(), units: gameSocket.getUnits(), market: gameSocket.getMarket(), events })}
          advisorAgenda={advisorAgenda}
          advisorResponses={advisorResponses}
          onAdvisorDirective={handleAdvisorDirective}
          onCardDispatch={handleCardDispatch}
          onCompetingOptionChosen={handleCompetingOptionChosen}
          onOpenCabinetManager={() => setShowCabinetManager(true)}
          campaignLocked={campaignLocked}
          playerCode={playerCode}
        />
      ) : (
        <main className="layout">
          <EventLog />
          <section className="map-pane"><WorldMap seed={seed} /></section>
          <CountryProfile />
        </main>
      )}
      {showResetConfirm && (
        <div className="campaign-overlay" onClick={() => setShowResetConfirm(false)}>
          <div className="reset-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Start New Campaign?</h3>
            <p>This will end your current campaign as {playerCountry?.name ?? playerCode} and let you select a new nation. All progress will be reset.</p>
            <div className="reset-confirm-actions">
              <button className="reset-cancel-btn" onClick={() => setShowResetConfirm(false)}>Cancel</button>
              <button className="reset-confirm-btn" onClick={handleResetCampaign}>Confirm Reset</button>
            </div>
          </div>
        </div>
      )}
      {cabinetCards.length > 0 && <CabinetModal cards={cabinetCards} onResolved={() => setCabinetCards([])} />}
      <WarRoom open={showWarRoom} onClose={() => setShowWarRoom(false)} events={events} seed={seed} playerCode={playerCode} intelLevel={0.5} />
      {showVictoryModal && victoryProgress && <VictoryModal progress={victoryProgress} onClose={() => setShowVictoryModal(false)} />}
      {showCabinetManager && currentPlayer?.cabinet && (
        <CabinetManagerModal cabinet={cabinetOverride ?? currentPlayer.cabinet} tick={tick} onAppoint={handleAppointAdvisor} onLeaveVacant={handleLeaveVacant} onClose={() => setShowCabinetManager(false)} />
      )}
      </ErrorBoundary>
      <ToastContainer />
    </div>
  );
}
