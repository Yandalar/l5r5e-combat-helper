import { describe, it, expect } from "vitest";
import {
  getEndurance,
  getCurrentFatigue,
  isIncapacitated,
  isAtCriticalState,
  getVoidPoints,
  spendVoidPoint,
  revertFatigueDamage,
} from "../../src/core/actor-utils";
import { createMockActor } from "../helpers/foundry-mocks";

/**
 * CHARACTERIZATION — pins current behavior, including quirks.
 * Written before the Fase 0 refactor so the refactor has a regression net.
 */

describe("getEndurance", () => {
  it("prefers system.endurance.value when present", () => {
    expect(getEndurance({ system: { endurance: { value: 7 } } })).toBe(7);
  });

  it("falls back to a flat numeric system.endurance — the REAL l5r5e shape", () => {
    // template.json declares `endurance: 0` as a flat number, so on real
    // actors this is the branch that always wins.
    const actor = createMockActor({ system: { endurance: 6 } });
    expect(getEndurance(actor)).toBe(6);
  });

  it("falls back to system.attributes.endurance", () => {
    expect(getEndurance({ system: { attributes: { endurance: 5 } } })).toBe(5);
  });

  it("derives from earth + fire when no explicit field exists", () => {
    expect(getEndurance({ system: { rings: { earth: 3, fire: 2 } } })).toBe(5);
  });

  it("KNOWN DIVERGENCE: the derived branch is earth+fire, but l5r5e computes (earth+fire)*2", () => {
    // Documented, not asserted as correct. Unreachable on real actors because
    // the flat-number branch above always matches first.
    expect(getEndurance({ system: { rings: { earth: 3, fire: 2 } } })).toBe(5);
    expect(getEndurance({ system: { rings: { earth: 3, fire: 2 } } })).not.toBe(10);
  });

  it("returns 0 when nothing matches", () => {
    expect(getEndurance({ system: {} })).toBe(0);
  });

  it("treats a flat endurance of 0 as 0", () => {
    expect(getEndurance(createMockActor())).toBe(0);
  });
});

describe("getCurrentFatigue", () => {
  it("prefers system.fatigue.value — the REAL l5r5e shape", () => {
    const actor = createMockActor({ system: { fatigue: { value: 4 } } });
    expect(getCurrentFatigue(actor)).toBe(4);
  });

  it("falls back to a flat numeric system.fatigue", () => {
    expect(getCurrentFatigue({ system: { fatigue: 3 } })).toBe(3);
  });

  it("falls back to system.attributes.fatigue", () => {
    expect(getCurrentFatigue({ system: { attributes: { fatigue: 2 } } })).toBe(2);
  });

  it("returns 0 when nothing matches", () => {
    expect(getCurrentFatigue({ system: {} })).toBe(0);
  });
});

describe("isIncapacitated", () => {
  it("detects via the statuses set", () => {
    expect(isIncapacitated(createMockActor({ statuses: ["incapacitated"] }))).toBe(true);
  });

  it("detects via an ActiveEffect name substring", () => {
    expect(isIncapacitated({ effects: [{ name: "Is Incapacitated Now" }] })).toBe(true);
  });

  it("detects via the legacy `label` field", () => {
    expect(isIncapacitated({ effects: [{ label: "incapacitated" }] })).toBe(true);
  });

  it("is false for a healthy actor", () => {
    expect(isIncapacitated(createMockActor())).toBe(false);
  });
});

describe("isAtCriticalState", () => {
  it("is true when incapacitated regardless of fatigue", () => {
    const a = createMockActor({ statuses: ["incapacitated"], system: { endurance: 10 } });
    expect(isAtCriticalState(a)).toBe(true);
  });

  it("is true when fatigue exceeds endurance", () => {
    const a = createMockActor({ system: { endurance: 5, fatigue: { value: 6 } } });
    expect(isAtCriticalState(a)).toBe(true);
  });

  it("is FALSE when fatigue exactly equals endurance (strict >)", () => {
    const a = createMockActor({ system: { endurance: 5, fatigue: { value: 5 } } });
    expect(isAtCriticalState(a)).toBe(false);
  });
});

describe("getVoidPoints", () => {
  it("reads system.void_points.value", () => {
    expect(getVoidPoints(createMockActor({ system: { void_points: { value: 2 } } }))).toBe(2);
  });

  it("returns 0 for a null actor", () => {
    expect(getVoidPoints(null)).toBe(0);
  });

  it("returns 0 when the field is absent (no fallback chain exists)", () => {
    expect(getVoidPoints({ system: {} })).toBe(0);
  });
});

describe("spendVoidPoint", () => {
  it("decrements by one via actor.update", async () => {
    const a = createMockActor({ system: { void_points: { value: 2 } } });
    await spendVoidPoint(a);
    expect(a.update).toHaveBeenCalledWith({ "system.void_points.value": 1 });
    expect(a.system.void_points.value).toBe(1);
  });

  it("throws when the actor has no void points", async () => {
    const a = createMockActor({ system: { void_points: { value: 0 } } });
    await expect(spendVoidPoint(a)).rejects.toThrow();
    expect(a.update).not.toHaveBeenCalled();
  });
});

describe("revertFatigueDamage", () => {
  it("subtracts the given amount", async () => {
    const a = createMockActor({ system: { fatigue: { value: 5 } } });
    await revertFatigueDamage(a, 3);
    expect(a.system.fatigue.value).toBe(2);
  });

  it("clamps at zero rather than going negative", async () => {
    const a = createMockActor({ system: { fatigue: { value: 2 } } });
    await revertFatigueDamage(a, 10);
    expect(a.system.fatigue.value).toBe(0);
  });

  it("throws when no fatigue field can be resolved", async () => {
    await expect(revertFatigueDamage({ system: {} } as any, 1)).rejects.toThrow();
  });
});
