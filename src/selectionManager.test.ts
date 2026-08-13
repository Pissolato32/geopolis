import { describe, expect, it, vi } from "vitest";
import { SelectionManager } from "./selectionManager.js";
import { makeUnit } from "./test-utils/unit-factory.js";
import { makeCountry } from "./test-utils/country-factory.js";

describe("SelectionManager", () => {
  it("starts with null selection", () => {
    const sm = new SelectionManager();
    expect(sm.getSelected()).toBeNull();
  });

  it("getSelected returns the country after selectCountry", () => {
    const sm = new SelectionManager();
    const usa = makeCountry("USA");
    sm.selectCountry(usa);
    const sel = sm.getSelected();
    expect(sel).not.toBeNull();
    expect(sel!.kind).toBe("country");
    expect(sel!.kind === "country" && sel!.country.id).toBe("USA");
  });

  it("getSelected returns the unit after selectUnit", () => {
    const sm = new SelectionManager();
    const unit = makeUnit("USA-1", "USA");
    sm.selectUnit(unit);
    const sel = sm.getSelected();
    expect(sel).not.toBeNull();
    expect(sel!.kind).toBe("unit");
    expect(sel!.kind === "unit" && sel!.unit.id).toBe("USA-1");
  });

  it("clear() sets selection to null", () => {
    const sm = new SelectionManager();
    sm.selectCountry(makeCountry("USA"));
    expect(sm.getSelected()).not.toBeNull();
    sm.clear();
    expect(sm.getSelected()).toBeNull();
  });

  it("selectCountry(null) sets selection to null", () => {
    const sm = new SelectionManager();
    sm.selectCountry(makeCountry("USA"));
    sm.selectCountry(null);
    expect(sm.getSelected()).toBeNull();
  });

  it("selectUnit(null) sets selection to null", () => {
    const sm = new SelectionManager();
    sm.selectUnit(makeUnit("USA-1", "USA"));
    sm.selectUnit(null);
    expect(sm.getSelected()).toBeNull();
  });

  it("fires subscriber callback on country selection", () => {
    const sm = new SelectionManager();
    const cb = vi.fn();
    sm.subscribe(cb);
    sm.selectCountry(makeCountry("USA"));
    expect(cb).toHaveBeenCalledTimes(1);
    const sel = cb.mock.calls[0]![0];
    expect(sel.kind).toBe("country");
  });

  it("fires subscriber callback on unit selection", () => {
    const sm = new SelectionManager();
    const cb = vi.fn();
    sm.subscribe(cb);
    sm.selectUnit(makeUnit("USA-1", "USA"));
    expect(cb).toHaveBeenCalledTimes(1);
    const sel = cb.mock.calls[0]![0];
    expect(sel.kind).toBe("unit");
  });

  it("fires subscriber callback on clear", () => {
    const sm = new SelectionManager();
    const cb = vi.fn();
    sm.subscribe(cb);
    sm.clear();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0]).toBeNull();
  });

  it("does not fire callback when selecting the same country", () => {
    const sm = new SelectionManager();
    const cb = vi.fn();
    sm.subscribe(cb);
    const usa = makeCountry("USA");
    sm.selectCountry(usa);
    expect(cb).toHaveBeenCalledTimes(1);
    sm.selectCountry(usa);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does not fire callback when selecting the same unit", () => {
    const sm = new SelectionManager();
    const cb = vi.fn();
    sm.subscribe(cb);
    const unit = makeUnit("USA-1", "USA");
    sm.selectUnit(unit);
    expect(cb).toHaveBeenCalledTimes(1);
    sm.selectUnit(unit);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("fires callback when switching from country to unit", () => {
    const sm = new SelectionManager();
    const cb = vi.fn();
    sm.subscribe(cb);
    sm.selectCountry(makeCountry("USA"));
    sm.selectUnit(makeUnit("USA-1", "USA"));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("fires callback when switching from one country to another", () => {
    const sm = new SelectionManager();
    const cb = vi.fn();
    sm.subscribe(cb);
    sm.selectCountry(makeCountry("USA"));
    sm.selectCountry(makeCountry("CAN"));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe stops receiving callbacks", () => {
    const sm = new SelectionManager();
    const cb = vi.fn();
    const unsub = sm.subscribe(cb);
    sm.selectCountry(makeCountry("USA"));
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    sm.selectCountry(makeCountry("CAN"));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("supports multiple subscribers", () => {
    const sm = new SelectionManager();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    sm.subscribe(cb1);
    sm.subscribe(cb2);
    sm.selectCountry(makeCountry("USA"));
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it("switching from country to null fires callback", () => {
    const sm = new SelectionManager();
    const cb = vi.fn();
    sm.subscribe(cb);
    sm.selectCountry(makeCountry("USA"));
    sm.selectCountry(null);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1]![0]).toBeNull();
  });
});
