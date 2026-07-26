// CabinetModal — overlay that presents dynamic cabinet decision cards to the
// player. Each card shows a crisis title, description, option buttons, and a
// "Delegate to Cabinet" button. Cards are dismissed one-by-one on resolution.

import { useState } from "react";
import type { CabinetCard } from "./shared/types.js";
import { gameSocket } from "./gameSocket.js";

interface CabinetModalProps {
  cards: CabinetCard[];
  onResolved: () => void;
}

const CATEGORY_ICONS: Record<CabinetCard["category"], string> = {
  Economy: "💰",
  Defense: "🛡",
  Diplomacy: "🤝",
  "Internal Politics": "🏛",
};

export function CabinetModal({ cards, onResolved }: CabinetModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolving, setResolving] = useState(false);

  if (cards.length === 0) return null;
  const card = cards[currentIndex];
  if (!card) return null;

  const resolve = (optionId: string | undefined, delegated: boolean) => {
    setResolving(true);
    gameSocket.sendIntent({
      intent: "resolve-cabinet-card",
      from: gameSocket.getPlayerCode(),
      cardId: card.id,
      optionId,
      delegated,
    });

    setTimeout(() => {
      if (currentIndex + 1 >= cards.length) {
        onResolved();
      } else {
        setCurrentIndex((i) => i + 1);
      }
      setResolving(false);
    }, 300);
  };

  return (
    <div className="cabinet-overlay" role="dialog" aria-modal="true" aria-labelledby="cabinet-title">
      <div className="cabinet-modal">
        <div className="cabinet-header">
          <span className="cabinet-icon" aria-hidden>{CATEGORY_ICONS[card.category]}</span>
          <div className="cabinet-header-text">
            <span className="cabinet-category">{card.category}</span>
            <h2 id="cabinet-title">{card.title}</h2>
          </div>
          <span className="cabinet-counter">{currentIndex + 1} / {cards.length}</span>
        </div>

        <p className="cabinet-description">{card.description}</p>

        <div className="cabinet-options">
          {card.options.map((opt) => (
            <button
              key={opt.id}
              className="cabinet-option-btn"
              disabled={resolving}
              onClick={() => resolve(opt.id, false)}
            >
              <span className="cabinet-option-label">{opt.label}</span>
              <span className="cabinet-option-effects">
                {opt.effects.treasuryDelta && (
                  <span className={opt.effects.treasuryDelta > 0 ? "effect-positive" : "effect-negative"}>
                    Treasury {opt.effects.treasuryDelta > 0 ? "+" : ""}{opt.effects.treasuryDelta}B
                  </span>
                )}
                {opt.effects.stabilityDelta && (
                  <span className={opt.effects.stabilityDelta > 0 ? "effect-positive" : "effect-negative"}>
                    Stability {opt.effects.stabilityDelta > 0 ? "+" : ""}{opt.effects.stabilityDelta}
                  </span>
                )}
                {opt.effects.militaryLoyaltyDelta && (
                  <span className={opt.effects.militaryLoyaltyDelta > 0 ? "effect-positive" : "effect-negative"}>
                    Loyalty {opt.effects.militaryLoyaltyDelta > 0 ? "+" : ""}{opt.effects.militaryLoyaltyDelta}
                  </span>
                )}
                {opt.effects.readinessDelta && (
                  <span className={opt.effects.readinessDelta > 0 ? "effect-positive" : "effect-negative"}>
                    Readiness {opt.effects.readinessDelta > 0 ? "+" : ""}{opt.effects.readinessDelta}
                  </span>
                )}
                {opt.effects.legislativeSupportDelta && (
                  <span className={opt.effects.legislativeSupportDelta > 0 ? "effect-positive" : "effect-negative"}>
                    Assembly {opt.effects.legislativeSupportDelta > 0 ? "+" : ""}
                    {Math.round(opt.effects.legislativeSupportDelta * 100)}%
                  </span>
                )}
                {opt.effects.tensionDelta && (
                  <span className={opt.effects.tensionDelta > 0 ? "effect-negative" : "effect-positive"}>
                    Tension {opt.effects.tensionDelta > 0 ? "+" : ""}{opt.effects.tensionDelta}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        <div className="cabinet-delegate">
          <button
            className="cabinet-delegate-btn"
            disabled={resolving}
            onClick={() => resolve(undefined, true)}
          >
            🎖 Delegate to Cabinet
          </button>
          <span className="cabinet-delegate-hint">
            Your ministers will choose based on your diplomatic posture.
          </span>
        </div>
      </div>
    </div>
  );
}
