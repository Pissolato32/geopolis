// GlobalSearch — a "Command & Search" bar that autocomplete-filters all 246
// countries by name or alpha-3 code. Selecting a result updates the
// SelectionManager and opens the country profile, exactly as if the country
// were clicked on the map. Covers the ~72 micro-states that have no map
// geometry at 110m resolution.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Country, WorldSeed } from "./shared/types.js";
import { selection } from "./selectionManager.js";

export function GlobalSearch({ seed }: { seed: WorldSeed }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return seed.countries
      .filter(
        (c) =>
          c.name.toLowerCase().includes(query) || c.id.toLowerCase() === query || c.id.toLowerCase().startsWith(query)
      )
      .slice(0, 8);
  }, [q, seed]);

  useEffect(() => {
    setActiveIdx(0);
  }, [q]);

  // close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (c: Country) => {
    selection.selectCountry(c);
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="search" ref={wrapRef}>
      <span className="search-icon" aria-hidden>
        ⌕
      </span>
      <input
        ref={inputRef}
        className="search-input"
        type="text"
        placeholder="Search 246 nations by name or code…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        spellCheck={false}
        autoComplete="off"
      />
      {open && q.trim() && (
        <ul className="search-results">
          {results.length === 0 && <li className="search-empty">No matching nations.</li>}
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                className={i === activeIdx ? "search-item active" : "search-item"}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => choose(c)}
              >
                <img className="search-flag" src={c.flag} alt="" />
                <span className="search-name">{c.name}</span>
                <span className="search-code">{c.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
