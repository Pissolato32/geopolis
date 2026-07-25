import { useEffect, useState } from "react";
import { gameSocket } from "./gameSocket.js";

const LS_KEY_ACHIEVEMENTS = "geopolis.unlocked_achievements";
const LS_KEY_POINTS = "geopolis.achievement_points";

export interface AchievementToastData {
  id: string;
  title: string;
  description: string;
  points: number;
}

export function AchievementManager({
  onPointsUpdate,
}: {
  onPointsUpdate: (pts: number) => void;
}) {
  const [activeToast, setActiveToast] = useState<AchievementToastData | null>(null);

  useEffect(() => {
    // Initial points count
    const savedPts = parseInt(localStorage.getItem(LS_KEY_POINTS) ?? "0", 10);
    onPointsUpdate(savedPts);

    return gameSocket.onEvent((evt) => {
      // Check for achievement events
      if (evt.type === "diplomacy.treaty-signed") {
        unlockAchievement("treaty_signed", "Diplomata Global", "Assinou um tratado bilateral entre superpotências", 50);
      } else if (evt.type === "war.combat-resolved") {
        unlockAchievement("first_combat", "Batismo de Fogo", "Resolveu um engajamento militar em zona de conflito", 100);
      } else if (evt.type === "economy.indicator" && evt.gdp > 5000000000000) {
        unlockAchievement("economic_power", "Superpotência Econômica", "Alcançou um PIB superior a $5 Trilhões", 150);
      }
    });
  }, []);

  const unlockAchievement = (id: string, title: string, description: string, points: number) => {
    try {
      const unlockedStr = localStorage.getItem(LS_KEY_ACHIEVEMENTS) ?? "[]";
      const unlocked = new Set<string>(JSON.parse(unlockedStr));

      if (unlocked.has(id)) return;

      unlocked.add(id);
      localStorage.setItem(LS_KEY_ACHIEVEMENTS, JSON.stringify([...unlocked]));

      const currentPts = parseInt(localStorage.getItem(LS_KEY_POINTS) ?? "0", 10) + points;
      localStorage.setItem(LS_KEY_POINTS, currentPts.toString());

      onPointsUpdate(currentPts);
      setActiveToast({ id, title, description, points });

      setTimeout(() => {
        setActiveToast(null);
      }, 4500);
    } catch {
      // ignore
    }
  };

  if (!activeToast) return null;

  return (
    <div className="achievement-toast-container">
      <div className="achievement-toast achievement-toast-visible">
        <span className="achievement-icon">🏆</span>
        <div className="achievement-body">
          <span className="achievement-label">Conquista Desbloqueada (+{activeToast.points} PTS)</span>
          <strong className="achievement-title">{activeToast.title}</strong>
          <p className="achievement-desc">{activeToast.description}</p>
        </div>
      </div>
    </div>
  );
}
