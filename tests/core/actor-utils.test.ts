import { describe, it, expect } from "vitest";
import {
  getEndurance,
  getCurrentFatigue,
  isIncapacitated,
  isAtCriticalState,
  getVoidPoints,
  spendVoidPoint,
  revertFatigueDamage,
  getSilhouette,
  getStrife,
  getMaxStrife,
  getHonorRank,
  getVigilance,
  getSkillRank,
  resolveFatigueField,
  applyFatigue,
  resolveStrifeField,
  applyStrife,
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

describe("getSilhouette", () => {
  it("prefers actor flag when present", () => {
    const a = createMockActor({ flags: { "l5r5e-combat-helper": { silhouette: 4 } } });
    expect(getSilhouette(a)).toBe(4);
  });

  it("falls back to system.silhouette if no flag", () => {
    const a = createMockActor({ system: { silhouette: 3 } });
    expect(getSilhouette(a)).toBe(3);
  });

  it("derives from prototypeToken.width >= 4 → 5", () => {
    const a = createMockActor();
    a.prototypeToken.width = 4;
    expect(getSilhouette(a)).toBe(5);
  });

  it("derives from prototypeToken.width >= 3 → 4", () => {
    const a = createMockActor();
    a.prototypeToken.width = 3;
    expect(getSilhouette(a)).toBe(4);
  });

  it("derives from prototypeToken.width >= 2 → 3", () => {
    const a = createMockActor();
    a.prototypeToken.width = 2;
    expect(getSilhouette(a)).toBe(3);
  });

  it("defaults to 2 when nothing matches", () => {
    const a = createMockActor({ prototypeToken: { width: 1 } } as any);
    expect(getSilhouette(a)).toBe(2);
  });

  it("returns 2 for null actor", () => {
    expect(getSilhouette(null)).toBe(2);
  });

  it("defaults to 2 when only base mock actor created", () => {
    const a = createMockActor();
    expect(getSilhouette(a)).toBe(2);
  });
});

describe("getStrife", () => {
  it("reads system.strife.value when present", () => {
    const a = createMockActor({ system: { strife: { value: 3 } } });
    expect(getStrife(a)).toBe(3);
  });

  it("falls back to flat numeric system.strife", () => {
    expect(getStrife({ system: { strife: 2 } } as any)).toBe(2);
  });

  it("returns 0 when nothing matches", () => {
    expect(getStrife({ system: {} } as any)).toBe(0);
  });

  it("returns 0 for null actor", () => {
    expect(getStrife(null)).toBe(0);
  });
});

describe("getMaxStrife", () => {
  it("reads system.strife.max", () => {
    const a = createMockActor({ system: { strife: { max: 5 } } });
    expect(getMaxStrife(a)).toBe(5);
  });

  it("returns 0 when field is absent", () => {
    expect(getMaxStrife({ system: {} } as any)).toBe(0);
  });

  it("returns 0 for null actor", () => {
    expect(getMaxStrife(null)).toBe(0);
  });
});

describe("getHonorRank", () => {
  it("extracts tens digit: 0 → 0", () => {
    expect(getHonorRank({ system: { social: { honor: 0 } } } as any)).toBe(0);
  });

  it("extracts tens digit: 9 → 0", () => {
    expect(getHonorRank({ system: { social: { honor: 9 } } } as any)).toBe(0);
  });

  it("extracts tens digit: 10 → 1", () => {
    expect(getHonorRank({ system: { social: { honor: 10 } } } as any)).toBe(1);
  });

  it("extracts tens digit: 55 → 5", () => {
    expect(getHonorRank({ system: { social: { honor: 55 } } } as any)).toBe(5);
  });

  it("extracts tens digit: 100 → 10 (clamped)", () => {
    expect(getHonorRank({ system: { social: { honor: 100 } } } as any)).toBe(10);
  });

  it("returns 0 for null actor", () => {
    expect(getHonorRank(null)).toBe(0);
  });
});

describe("getVigilance", () => {
  it("reads system.vigilance.value when present", () => {
    const a = createMockActor({ system: { vigilance: { value: 4 } } } as any);
    expect(getVigilance(a)).toBe(4);
  });

  it("falls back to flat numeric system.vigilance", () => {
    expect(getVigilance({ system: { vigilance: 3 } } as any)).toBe(3);
  });

  it("returns 0 when nothing matches", () => {
    expect(getVigilance({ system: {} } as any)).toBe(0);
  });

  it("returns 0 for null actor", () => {
    expect(getVigilance(null)).toBe(0);
  });
});

describe("getSkillRank", () => {
  it("reads PC skill rank from nested path system.skills.<category>.<skillId>", () => {
    const a = createMockActor({
      type: "character",
      system: { skills: { martial: { fitness: 3 } } },
    });
    const map = { fitness: "martial" };
    expect(getSkillRank(a, "fitness", map)).toBe(3);
  });

  it("reads NPC skill rank as flat category number", () => {
    const a = createMockActor({
      type: "npc",
      system: { skills: { martial: 2 } },
    });
    const map = { fitness: "martial" };
    expect(getSkillRank(a, "fitness", map)).toBe(2);
  });

  it("defaults to 'martial' category when skill not in map", () => {
    const a = createMockActor({
      type: "character",
      system: { skills: { martial: { unknown_skill: 1 } } },
    });
    const map = {}; // skill not in map
    expect(getSkillRank(a, "unknown_skill", map)).toBe(1);
  });

  it("returns 0 for null actor", () => {
    expect(getSkillRank(null, "fitness", {})).toBe(0);
  });
});

describe("resolveFatigueField", () => {
  it("prefers system.fatigue.value", () => {
    const a = createMockActor({ system: { fatigue: { value: 4 } } });
    expect(resolveFatigueField(a)).toBe("system.fatigue.value");
  });

  it("falls back to flat numeric system.fatigue", () => {
    expect(resolveFatigueField({ system: { fatigue: 3 } } as any)).toBe("system.fatigue");
  });

  it("falls back to system.attributes.fatigue", () => {
    expect(resolveFatigueField({ system: { attributes: { fatigue: 2 } } } as any)).toBe(
      "system.attributes.fatigue",
    );
  });

  it("returns null when no field can be resolved", () => {
    expect(resolveFatigueField({ system: {} } as any)).toBe(null);
  });
});

describe("applyFatigue", () => {
  it("adds delta to fatigue", async () => {
    const a = createMockActor({ system: { fatigue: { value: 2 } } });
    const result = await applyFatigue(a, 3);
    expect(a.system.fatigue.value).toBe(5);
    expect(result).toBe(5);
  });

  it("subtracts when delta is negative", async () => {
    const a = createMockActor({ system: { fatigue: { value: 5 } } });
    const result = await applyFatigue(a, -2);
    expect(a.system.fatigue.value).toBe(3);
    expect(result).toBe(3);
  });

  it("clamps at zero (does not go negative)", async () => {
    const a = createMockActor({ system: { fatigue: { value: 2 } } });
    const result = await applyFatigue(a, -10);
    expect(a.system.fatigue.value).toBe(0);
    expect(result).toBe(0);
  });

  it("throws when no fatigue field can be resolved", async () => {
    await expect(applyFatigue({ system: {} } as any, 1)).rejects.toThrow();
  });
});

describe("resolveStrifeField", () => {
  it("prefers system.strife.value", () => {
    const a = createMockActor({ system: { strife: { value: 2 } } });
    expect(resolveStrifeField(a)).toBe("system.strife.value");
  });

  it("falls back to flat numeric system.strife", () => {
    expect(resolveStrifeField({ system: { strife: 1 } } as any)).toBe("system.strife");
  });

  it("returns null when no field can be resolved", () => {
    expect(resolveStrifeField({ system: {} } as any)).toBe(null);
  });
});

describe("applyStrife", () => {
  it("adds delta to strife", async () => {
    const a = createMockActor({ system: { strife: { value: 1 } } });
    const result = await applyStrife(a, 2);
    expect(a.system.strife.value).toBe(3);
    expect(result).toBe(3);
  });

  it("subtracts when delta is negative", async () => {
    const a = createMockActor({ system: { strife: { value: 3 } } });
    const result = await applyStrife(a, -1);
    expect(a.system.strife.value).toBe(2);
    expect(result).toBe(2);
  });

  it("clamps at zero (does not go negative)", async () => {
    const a = createMockActor({ system: { strife: { value: 1 } } });
    const result = await applyStrife(a, -10);
    expect(a.system.strife.value).toBe(0);
    expect(result).toBe(0);
  });

  it("throws when no strife field can be resolved", async () => {
    await expect(applyStrife({ system: {} } as any, 1)).rejects.toThrow();
  });
});
