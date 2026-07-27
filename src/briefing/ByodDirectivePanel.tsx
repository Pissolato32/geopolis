// ByodDirectivePanel — freeform strategic directive input. Lets the player
// type a natural-language directive, analyzes it into option cards, and
// dispatches the selected option's intent through gameSocket.

import { useState } from "react";
import type { AnalysisSnapshot, DirectiveOption } from "./byodTypes.js";
import { analyzeDirective } from "./byodAnalyzer.js";
import { validateIntent } from "./intentValidator.js";
import { round2 } from "./format.js";
import { pushToast } from "../Toast.js";
import { gameSocket } from "../gameSocket.js";
import type { StrictIntent } from "../shared/types.js";

interface Props {
  snapshot: AnalysisSnapshot;
}

export function ByodDirectivePanel({ snapshot }: Props) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<DirectiveOption[]>([]);
  const [summary, setSummary] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleAnalyze = () => {
    if (text.trim().length < 5) {
      pushToast({ kind: "warning", title: "Directive too short", message: "Enter at least a few words describing your strategy.", dismissable: true, duration: 4000 });
      return;
    }
    setAnalyzing(true);
    setOptions([]);
    setSelectedId(null);
    setSubmitted(false);

    setTimeout(() => {
      try {
        const result = analyzeDirective(text, snapshot);
        setOptions(result.options);
        setSummary(result.summary);
      } catch {
        pushToast({ kind: "error", title: "Analysis failed", message: "Could not analyze the directive. Try rephrasing.", dismissable: true, duration: 5000 });
      } finally {
        setAnalyzing(false);
      }
    }, 400);
  };

  const handleSubmit = () => {
    if (!selectedId) return;
    const option = options.find((o) => o.id === selectedId);
    if (!option) return;

    const validation = validateIntent(option.intent);
    if (!validation.valid) {
      pushToast({ kind: "error", title: "Invalid directive payload", message: validation.error ?? "Validation failed", dismissable: true, duration: 5000 });
      return;
    }

    gameSocket.sendIntent(option.intent as StrictIntent);
    setSubmitted(true);
    pushToast({
      kind: "success",
      title: "Directive dispatched",
      message: `"${option.title}" transmitted to the cabinet.`,
      dismissable: true,
      duration: 5000,
    });
  };

  const impactClass = (dir: "up" | "down", value: number): string => {
    if (value === 0) return "impact-neutral";
    return dir === "up" ? "impact-up" : "impact-down";
  };

  const formatImpact = (value: number, suffix: string, dir: "up" | "down"): string => {
    const arrow = dir === "up" ? "▲" : "▼";
    return `${arrow} ${round2(Math.abs(value))}${suffix}`;
  };

  return (
    <div className="byod-panel">
      <div className="byod-header">
        <h3 className="section-heading">Custom Strategic Directive</h3>
        <span className="byod-subtitle">BYOD — Describe your strategy in plain language</span>
      </div>

      <div className="byod-input-area">
        <textarea
          className="byod-textarea"
          placeholder="e.g., Secretly support rebels while imposing tariffs on steel imports from CHN"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          disabled={analyzing}
        />
        <button
          className={`byod-analyze-btn ${analyzing ? "analyzing" : ""}`}
          onClick={handleAnalyze}
          disabled={analyzing || text.trim().length < 5}
        >
          {analyzing ? "Analyzing…" : "Analyze Directive & Draft Options"}
        </button>
      </div>

      {summary && (
        <div className="byod-summary">
          <span className="byod-summary-icon">◆</span>
          <span className="byod-summary-text">{summary}</span>
        </div>
      )}

      {options.length > 0 && (
        <div className="byod-options">
          <div className="byod-options-label">Generated Strategy Options</div>
          <div className="byod-option-grid">
            {options.map((option) => {
              const isSelected = selectedId === option.id;
              return (
                <button
                  key={option.id}
                  className={`byod-option ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedId(option.id)}
                  disabled={submitted}
                >
                  <div className="byod-option-header">
                    <span className="byod-option-type">{option.intent.intent}</span>
                    {isSelected && <span className="byod-option-check">✓</span>}
                  </div>
                  <h5 className="byod-option-title">{option.title}</h5>
                  <p className="byod-option-desc">{option.description}</p>
                  <div className="byod-impacts">
                    {option.impacts.map((imp, i) => (
                      <span
                        key={i}
                        className={`byod-impact-badge ${impactClass(imp.direction, imp.value)}`}
                      >
                        {imp.label} {formatImpact(imp.value, imp.suffix, imp.direction)}
                      </span>
                    ))}
                  </div>
                  <div className="byod-payload">
                    <span className="byod-payload-label">Intent:</span>
                    <code className="byod-payload-code">{option.intent.intent}</code>
                  </div>
                </button>
              );
            })}
          </div>

          {!submitted && (
            <button
              className={`byod-submit ${selectedId ? "ready" : ""}`}
              onClick={handleSubmit}
              disabled={!selectedId}
            >
              {selectedId ? "▶ Dispatch Selected Directive" : "Select an option to dispatch"}
            </button>
          )}

          {submitted && (
            <div className="byod-submitted">
              ✓ Directive transmitted to the cabinet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
