import { describe, it, expect } from "vitest";
import { PREDICATE_EVALUATORS, PREDICATE_KEYS, evaluatePredicate } from "../../src/techniques/effect-predicates";
import { createMockActor } from "../helpers/foundry-mocks";
import { expectModuleWarn } from "../helpers/setup";

function ctxFor(overrides: any = {}): any {
  return {
    attacker: null,
    targets: [],
    extraSuccesses: 0,
    opportunitiesSpent: 0,
    tn: 0,
    totalSuccess: 0,
    weapon: null,
    resistance: null,
    kata: null,
    chosenCondition: null,
    sourceMessageId: null,
    l5rData: null,
    ...overrides,
  };
}

describe("evaluatePredicate", () => {
  it("target_is_minion is true only for minion NPCs", () => {
    const minion = createMockActor({ type: "npc", system: { type: "minion" } });
    const adversary = createMockActor({ type: "npc", system: { type: "adversary" } });
    const pc = createMockActor({ type: "character" });
    expect(evaluatePredicate({ target_is_minion: true }, ctxFor(), minion)).toBe(true);
    expect(evaluatePredicate({ target_is_minion: true }, ctxFor(), adversary)).toBe(false);
    expect(evaluatePredicate({ target_is_minion: false }, ctxFor(), pc)).toBe(true);
  });

  it("undefined/null predicate is always true", () => {
    expect(evaluatePredicate(undefined, ctxFor())).toBe(true);
    expect(evaluatePredicate(null, ctxFor())).toBe(true);
  });

  it("warns and returns false for an unknown predicate key", () => {
    expectModuleWarn(/Unknown predicate key/);
    expect(evaluatePredicate({ totally_made_up: true } as any, ctxFor())).toBe(false);
  });
});

describe("PREDICATE_EVALUATORS", () => {
  it("PREDICATE_KEYS is derived from PREDICATE_EVALUATORS", () => {
    expect(PREDICATE_KEYS).toEqual(Object.keys(PREDICATE_EVALUATORS));
    expect(PREDICATE_KEYS).toContain("target_has_condition");
  });

  it("target_has_condition checks the target's status", () => {
    const t = createMockActor({ statuses: ["prone"] });
    expect(evaluatePredicate({ target_has_condition: "prone" }, ctxFor(), t)).toBe(true);
    expect(evaluatePredicate({ target_has_condition: "dazed" }, ctxFor(), t)).toBe(false);
  });

  it("target_lacks_condition is the negation", () => {
    const t = createMockActor({ statuses: ["prone"] });
    expect(evaluatePredicate({ target_lacks_condition: "prone" }, ctxFor(), t)).toBe(false);
    expect(evaluatePredicate({ target_lacks_condition: "dazed" }, ctxFor(), t)).toBe(true);
  });

  it("attacker_has_condition checks ctx.attacker's status", () => {
    const attacker = createMockActor({ statuses: ["enraged"] });
    expect(evaluatePredicate({ attacker_has_condition: "enraged" }, ctxFor({ attacker }))).toBe(true);
    expect(evaluatePredicate({ attacker_has_condition: "dazed" }, ctxFor({ attacker }))).toBe(false);
  });

  it("target_silhouette_gte compares getSilhouette(target) against the threshold", () => {
    const big = createMockActor({ system: { silhouette: 4 } });
    const small = createMockActor({ system: { silhouette: 1 } });
    expect(evaluatePredicate({ target_silhouette_gte: 3 }, ctxFor(), big)).toBe(true);
    expect(evaluatePredicate({ target_silhouette_gte: 3 }, ctxFor(), small)).toBe(false);
  });

  it("target_is_incapacitated compares isAtCriticalState(target) to the expected boolean", () => {
    const down = createMockActor({ statuses: ["incapacitated"] });
    const up = createMockActor();
    expect(evaluatePredicate({ target_is_incapacitated: true }, ctxFor(), down)).toBe(true);
    expect(evaluatePredicate({ target_is_incapacitated: true }, ctxFor(), up)).toBe(false);
    expect(evaluatePredicate({ target_is_incapacitated: false }, ctxFor(), up)).toBe(true);
  });

  describe("shortfall_lte / shortfall_gte", () => {
    it("compare against ctx.resistance.shortfall", () => {
      const ctx = ctxFor({ resistance: { shortfall: 2 } });
      expect(evaluatePredicate({ shortfall_lte: 2 }, ctx)).toBe(true);
      expect(evaluatePredicate({ shortfall_lte: 1 }, ctx)).toBe(false);
      expect(evaluatePredicate({ shortfall_gte: 2 }, ctx)).toBe(true);
      expect(evaluatePredicate({ shortfall_gte: 3 }, ctx)).toBe(false);
    });

    it("default so an absent resistance never satisfies either bound", () => {
      const ctx = ctxFor({ resistance: null });
      // shortfall_lte defaults the missing shortfall to Infinity, so no finite bound is ever satisfied.
      expect(evaluatePredicate({ shortfall_lte: 100 }, ctx)).toBe(false);
      // shortfall_gte defaults the missing shortfall to -1, so no non-negative bound is satisfied either.
      expect(evaluatePredicate({ shortfall_gte: 0 }, ctx)).toBe(false);
    });
  });

  it("activation_shortfall_lte compares max(0, ctx.tn - ctx.totalSuccess)", () => {
    const ctx = ctxFor({ tn: 5, totalSuccess: 3 });
    expect(evaluatePredicate({ activation_shortfall_lte: 2 }, ctx)).toBe(true);
    expect(evaluatePredicate({ activation_shortfall_lte: 1 }, ctx)).toBe(false);
  });

  it("resistance_failed compares ctx.resistance.success === false to the expected boolean", () => {
    expect(evaluatePredicate({ resistance_failed: true }, ctxFor({ resistance: { success: false } }))).toBe(true);
    expect(evaluatePredicate({ resistance_failed: true }, ctxFor({ resistance: { success: true } }))).toBe(false);
    expect(evaluatePredicate({ resistance_failed: false }, ctxFor({ resistance: { success: true } }))).toBe(true);
  });

  it("extra_successes_gte compares ctx.extraSuccesses", () => {
    const ctx = ctxFor({ extraSuccesses: 3 });
    expect(evaluatePredicate({ extra_successes_gte: 3 }, ctx)).toBe(true);
    expect(evaluatePredicate({ extra_successes_gte: 4 }, ctx)).toBe(false);
  });

  describe("all / any / not", () => {
    const t = createMockActor({ statuses: ["prone"] });

    it("all requires every sub-predicate to hold", () => {
      const pred = { all: [{ target_has_condition: "prone" }, { target_silhouette_gte: 1 }] };
      expect(evaluatePredicate(pred, ctxFor(), t)).toBe(true);
      const failing = { all: [{ target_has_condition: "prone" }, { target_has_condition: "dazed" }] };
      expect(evaluatePredicate(failing, ctxFor(), t)).toBe(false);
    });

    it("any requires at least one sub-predicate to hold", () => {
      const pred = { any: [{ target_has_condition: "dazed" }, { target_has_condition: "prone" }] };
      expect(evaluatePredicate(pred, ctxFor(), t)).toBe(true);
      const failing = { any: [{ target_has_condition: "dazed" }, { target_has_condition: "bleeding" }] };
      expect(evaluatePredicate(failing, ctxFor(), t)).toBe(false);
    });

    it("not negates its sub-predicate", () => {
      expect(evaluatePredicate({ not: { target_has_condition: "prone" } }, ctxFor(), t)).toBe(false);
      expect(evaluatePredicate({ not: { target_has_condition: "dazed" } }, ctxFor(), t)).toBe(true);
    });
  });
});
