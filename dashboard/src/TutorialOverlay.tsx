import { useEffect, useState } from "react";

export interface TutorialStep {
  targetSelector: string;
  message: string;
  position?: "top" | "bottom" | "left" | "right";
}

const STEPS: TutorialStep[] = [
  {
    targetSelector: ".brand",
    message: "Bem-vindo ao GeoPolis Command! Este é o simulador geopolítico e estratégico global em tempo real.",
    position: "bottom",
  },
  {
    targetSelector: ".search",
    message: "Barra de Comando & Busca: Digite o nome ou código de qualquer uma das 246 nações do mundo para localizá-la no mapa.",
    position: "bottom",
  },
  {
    targetSelector: ".time-controls",
    message: "Controles de Tempo: Pause a simulação ou acelere a velocidade em 1x, 2x ou 5x para observar as dinâmicas globais.",
    position: "bottom",
  },
  {
    targetSelector: ".map-pane",
    message: "Mapa Tático Canvas: Clique em qualquer país para inspecioná-lo ou nos ícones de guerra ⚔️ para ver relatórios de combate com Fog of War.",
    position: "right",
  },
  {
    targetSelector: ".event-log",
    message: "Feed de Inteligência ao Vivo: Acompanhe declarações de guerra, sanções econômicas e tratados assinados em tempo real.",
    position: "right",
  },
  {
    targetSelector: ".profile",
    message: "Painel de Comando: Veja métricas do PIB, estabilidade, forças armadas e clique em 'Assumir Nação' para governar qualquer potência!",
    position: "left",
  },
];

const LS_KEY = "geopolis.tutorial.completed";

export function TutorialOverlay({ onClose }: { onClose: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightPos, setSpotlightPos] = useState<{ cx: number; cy: number; r: number } | null>(null);

  const step = STEPS[currentStep];

  useEffect(() => {
    if (!step) return;

    const updatePosition = () => {
      const target = document.querySelector(step.targetSelector);
      if (target) {
        const rect = target.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const r = Math.max(rect.width, rect.height) / 2 + 20;
        setSpotlightPos({ cx, cy, r });
      } else {
        setSpotlightPos({ cx: window.innerWidth / 2, cy: window.innerHeight / 2, r: 100 });
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [currentStep, step]);

  const handleNext = () => {
    if (currentStep + 1 >= STEPS.length) {
      localStorage.setItem(LS_KEY, "true");
      onClose();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(LS_KEY, "true");
    onClose();
  };

  if (!step) return null;

  return (
    <div className="tutorial-overlay">
      <svg className="tutorial-svg">
        <defs>
          <mask id="tutorial-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotlightPos && (
              <circle
                cx={spotlightPos.cx}
                cy={spotlightPos.cy}
                r={spotlightPos.r}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(6, 10, 14, 0.78)"
          mask="url(#tutorial-spotlight-mask)"
        />
      </svg>

      <div className="tutorial-box">
        <div className="tutorial-header">
          <span className="tutorial-badge">TUTORIAL INTRODUTÓRIO ({currentStep + 1}/{STEPS.length})</span>
          <button className="chip" onClick={handleSkip}>Pular</button>
        </div>
        <p className="tutorial-msg">{step.message}</p>
        <div className="tutorial-actions">
          <button className="btn btn-accent" onClick={handleNext}>
            {currentStep + 1 === STEPS.length ? "Concluir Tutorial" : "Próximo →"}
          </button>
        </div>
      </div>
    </div>
  );
}
