import { describe, it, expect } from "vitest";
import { applyEffect, executeKataOpportunity } from "../../src/techniques/technique-engine";
import { KATA_REGISTRY } from "../../src/techniques/kata-registry";
import { createMockActor, createMockItem, createMockWeapon } from "../helpers/foundry-mocks";
import { expectModuleWarn } from "../helpers/setup";

const NS = "l5r5e-combat-helper";

/**
 * applyEffect's unified dispatch (Task 4 — EffectContext refactor).
 *
 * Current signature: applyEffect(effect, ctx, targets)
 */

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

describe("applyEffect — condition", () => {
  it("applies the status and reports the affected target names", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Bandit" });

    const summary: any = await applyEffect(
      { type: "condition", target: "target", statusId: "prone", duration: "immediate" },
      ctxFor({ attacker }),
      [target],
    );

    expect(target.statuses.has("prone")).toBe(true);
    expect(summary).toMatchObject({ type: "condition", statusId: "prone", targets: ["Bandit"] });
  });

  it("stores an expiry record only for until_next_turn", async () => {
    const attacker = createMockActor({ id: "att" });
    const timed = createMockActor();
    const immediate = createMockActor();
    const ctx = ctxFor({ attacker });

    await applyEffect({ type: "condition", statusId: "dazed", duration: "until_next_turn" }, ctx, [timed]);
    await applyEffect({ type: "condition", statusId: "dazed", duration: "immediate" }, ctx, [immediate]);

    expect(timed.getFlag(NS, "activeKataEffects")).toEqual([
      { statusId: "dazed", type: "condition", expiresAfterCombatant: "att" },
    ]);
    expect(immediate.getFlag(NS, "activeKataEffects")).toBeUndefined();
  });

  it("applies to every target in a multi-target call", async () => {
    const attacker = createMockActor({ id: "att" });
    const a = createMockActor({ name: "A" });
    const b = createMockActor({ name: "B" });

    const summary: any = await applyEffect(
      { type: "condition", statusId: "immobilized", duration: "immediate" },
      ctxFor({ attacker }),
      [a, b],
    );

    expect(a.statuses.has("immobilized")).toBe(true);
    expect(b.statuses.has("immobilized")).toBe(true);
    expect(summary.targets).toEqual(["A", "B"]);
  });

  it("swallows a failing toggleStatusEffect and omits that target", async () => {
    expectModuleWarn(/Could not apply condition/);
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Broken" });
    target.toggleStatusEffect = async () => {
      throw new Error("no such status");
    };

    const summary: any = await applyEffect(
      { type: "condition", statusId: "bogus", duration: "immediate" },
      ctxFor({ attacker }),
      [target],
    );
    expect(summary.targets).toEqual([]);
  });
});

describe("applyEffect — damage", () => {
  it("adds fatigue after subtracting armor", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({
      system: { fatigue: { value: 1 } },
      items: [createMockItem({ type: "armor", system: { equipped: true, armor: { physical: 2 } } })],
    });

    const summary: any = await applyEffect(
      { type: "damage", formula: { source: "fixed", value: 5 }, ignoresArmor: false },
      ctxFor({ attacker }),
      [target],
    );

    expect(target.system.fatigue.value).toBe(4); // 1 + (5 - 2)
    expect(summary).toMatchObject({ type: "damage", resource: "fatigue", mode: "add", results: [{ damage: 3 }] });
  });

  it("ignores armor when ignoresArmor is set", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({
      system: { fatigue: { value: 0 } },
      items: [createMockItem({ type: "armor", system: { equipped: true, armor: { physical: 4 } } })],
    });

    await applyEffect(
      { type: "damage", formula: { source: "fixed", value: 5 }, ignoresArmor: true },
      ctxFor({ attacker }),
      [target],
    );
    expect(target.system.fatigue.value).toBe(5);
  });

  it("skips the target entirely when armor fully absorbs the hit", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({
      system: { fatigue: { value: 2 } },
      items: [createMockItem({ type: "armor", system: { equipped: true, armor: { physical: 9 } } })],
    });

    const summary: any = await applyEffect(
      { type: "damage", formula: { source: "fixed", value: 3 }, ignoresArmor: false },
      ctxFor({ attacker }),
      [target],
    );

    expect(target.system.fatigue.value).toBe(2);
    expect(target.update).not.toHaveBeenCalled();
    expect(summary.results).toEqual([]);
  });

  it("writes through the system.fatigue.value path used by real actors", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ system: { fatigue: { value: 0 } } });
    await applyEffect(
      { type: "damage", formula: { source: "fixed", value: 2 }, ignoresArmor: true },
      ctxFor({ attacker }),
      [target],
    );
    expect(target.update).toHaveBeenCalledWith({ "system.fatigue.value": 2 });
  });

  it("resolves the formula per target (silhouette differs between targets)", async () => {
    const attacker = createMockActor({ id: "att" });
    const small = createMockActor({ name: "Small", system: { silhouette: 2, fatigue: { value: 0 } } });
    const big = createMockActor({ name: "Big", system: { silhouette: 5, fatigue: { value: 0 } } });

    const summary: any = await applyEffect(
      { type: "damage", formula: { source: "target_silhouette" }, ignoresArmor: true },
      ctxFor({ attacker }),
      [small, big],
    );

    expect(summary.results).toEqual([
      { target: "Small", damage: 2, resource: "fatigue", mode: "add" },
      { target: "Big", damage: 5, resource: "fatigue", mode: "add" },
    ]);
  });

  it("resource: 'strife' writes via applyStrife and ignores armor unconditionally", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({
      system: { strife: { value: 0 } },
      items: [createMockItem({ type: "armor", system: { equipped: true, armor: { physical: 9 } } })],
    });

    const summary: any = await applyEffect(
      { type: "damage", formula: { source: "fixed", value: 3 }, resource: "strife" },
      ctxFor({ attacker }),
      [target],
    );

    expect(target.system.strife.value).toBe(3);
    expect(summary).toMatchObject({ type: "damage", resource: "strife", ignoresArmor: true });
  });

  it("mode: 'remove' subtracts instead of adds", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ system: { fatigue: { value: 5 } } });

    await applyEffect(
      { type: "damage", formula: { source: "fixed", value: 2 }, mode: "remove", ignoresArmor: true },
      ctxFor({ attacker }),
      [target],
    );
    expect(target.system.fatigue.value).toBe(3);
  });

  it("isolates a per-target failure instead of aborting the whole effect (applyFatigue/applyStrife can throw)", async () => {
    expectModuleWarn(/Could not apply fatigue damage/);
    const attacker = createMockActor({ id: "att" });
    // No resolvable fatigue field at all — applyFatigue throws.
    const broken = createMockActor({ name: "Broken", system: { fatigue: undefined } });
    const ok = createMockActor({ name: "OK", system: { fatigue: { value: 0 } } });

    const summary: any = await applyEffect(
      { type: "damage", formula: { source: "fixed", value: 3 }, ignoresArmor: true },
      ctxFor({ attacker }),
      [broken, ok],
    );

    // The broken target is skipped, but the rest of the loop still runs —
    // the throw does not propagate up and abort applyEffect entirely.
    expect(ok.system.fatigue.value).toBe(3);
    expect(summary.results).toEqual([{ target: "OK", damage: 3, resource: "fatigue", mode: "add" }]);
  });
});

describe("applyEffect — assistance", () => {
  it("stores an assistance record without touching statuses", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Ally" });

    const summary: any = await applyEffect(
      { type: "assistance", target: "all_against_target", duration: "until_next_turn" },
      ctxFor({ attacker }),
      [target],
    );

    expect(target.getFlag(NS, "activeKataEffects")).toEqual([
      { statusId: null, type: "assistance", expiresAfterCombatant: "att" },
    ]);
    expect(target.statuses.size).toBe(0);
    expect(summary).toMatchObject({ type: "assistance", targets: ["Ally"] });
  });
});

describe("applyEffect — attack_tn_reduction", () => {
  it("sets pendingTnReduction with the attacker as the expiry owner", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Foe" });

    const summary: any = await applyEffect(
      { type: "attack_tn_reduction", amount: 2, duration: "until_next_turn" },
      ctxFor({ attacker }),
      [target],
    );

    expect(target.getFlag(NS, "pendingTnReduction")).toEqual({
      amount: 2,
      expiresAfterCombatant: "att",
    });
    expect(summary).toMatchObject({ type: "attack_tn_reduction", amount: 2 });
  });

  it("defaults the amount to 1", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor();
    await applyEffect({ type: "attack_tn_reduction", duration: "immediate" }, ctxFor({ attacker }), [target]);
    expect(target.getFlag(NS, "pendingTnReduction").amount).toBe(1);
  });
});

describe("applyEffect — resistance_roll (now resolves in the unified dispatcher)", () => {
  it("schedules a resistance roll per target and returns a scheduled summary", async () => {
    const attacker = createMockActor({ id: "att", name: "Att" });
    const target = createMockActor({ id: "t1", name: "Foe" });

    const summary: any = await applyEffect(
      { type: "resistance_roll", skill: "fitness", difficulty: { source: "fixed", value: 3 }, onFailure: [] },
      ctxFor({ attacker }),
      [target],
    );

    // Summary type matches effect.type verbatim (not an invented
    // "...scheduled" name) so EFFECT_SUMMARY_RENDERERS can be keyed 1:1 off
    // EFFECT_TYPES.
    expect(summary).toMatchObject({ type: "resistance_roll", difficulty: 3 });
    expect(summary.targets).toEqual([target]);
    expect(target.getFlag(NS, "pendingResistanceRoll")).toMatchObject({
      skill: "fitness",
      difficulty: 3,
      attackerId: "att",
    });
  });

  it("resolves the difficulty formula per target (BUG #1 fix)", async () => {
    const attacker = createMockActor({ id: "att" });
    const small = createMockActor({ name: "Small", system: { silhouette: 2 } });
    const big = createMockActor({ name: "Big", system: { silhouette: 5 } });

    await applyEffect(
      { type: "resistance_roll", skill: "fitness", difficulty: { source: "target_silhouette" }, onFailure: [] },
      ctxFor({ attacker }),
      [small, big],
    );

    expect(small.getFlag(NS, "pendingResistanceRoll").difficulty).toBe(2);
    expect(big.getFlag(NS, "pendingResistanceRoll").difficulty).toBe(5);
  });
});

describe("applyEffect — resistance_buff (now resolves in the unified dispatcher)", () => {
  it("adds ctx.opportunitiesSpent to the target's resistanceBuff flag", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Ally" });

    const summary: any = await applyEffect(
      { type: "resistance_buff", target: "attacker" },
      ctxFor({ attacker, opportunitiesSpent: 3, kata: { activation: { ring: "earth" } } }),
      [target],
    );

    expect(target.getFlag(NS, "resistanceBuff")).toBe(3);
    expect(summary).toMatchObject({ type: "resistance_buff", amount: 3, targets: ["Ally"] });
  });

  it("falls back to effect.amount when opportunitiesSpent is 0", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Ally" });

    await applyEffect(
      { type: "resistance_buff", amount: 2 },
      ctxFor({ attacker, opportunitiesSpent: 0, kata: { activation: { ring: "water" } } }),
      [target],
    );
    expect(target.getFlag(NS, "resistanceBuff")).toBe(2);
  });
});

describe("applyEffect — critical_severity_boost (now resolves in the unified dispatcher)", () => {
  it("stores pendingCriticalSeverityBoost keyed to the attacker", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Foe" });

    const summary: any = await applyEffect(
      { type: "critical_severity_boost", target: "target" },
      ctxFor({ attacker, opportunitiesSpent: 2 }),
      [target],
    );

    expect(target.getFlag(NS, "pendingCriticalSeverityBoost")).toEqual({
      amount: 2,
      expiresEndOfTurnCombatant: "att",
    });
    expect(summary).toMatchObject({ type: "critical_severity_boost", amount: 2 });
  });
});

describe("applyEffect — condition_lock (now resolves in the unified dispatcher)", () => {
  it("applies when the target already has the chosen condition", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Foe", statuses: ["bleeding"] });

    const summary: any = await applyEffect(
      { type: "condition_lock", conditions: ["bleeding", "prone"] },
      ctxFor({ attacker, chosenCondition: "bleeding" }),
      [target],
    );

    expect(summary).toMatchObject({ type: "condition_lock", conditionId: "bleeding", targets: ["Foe"] });
  });

  it("returns null when no condition was chosen", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Foe" });

    const summary = await applyEffect(
      { type: "condition_lock", conditions: ["prone"] },
      ctxFor({ attacker, chosenCondition: null }),
      [target],
    );
    expect(summary).toBeNull();
  });

  it("skips a target that lacks the chosen condition", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Foe" });

    const summary: any = await applyEffect(
      { type: "condition_lock", conditions: ["bleeding"] },
      ctxFor({ attacker, chosenCondition: "bleeding" }),
      [target],
    );
    expect(summary.targets).toEqual([]);
  });
});

describe("applyEffect — effect.when predicate filtering", () => {
  it("filters out targets that fail the predicate and reports them as skipped", async () => {
    const attacker = createMockActor({ id: "att" });
    const eligible = createMockActor({ name: "Eligible", statuses: ["prone"] });
    const ineligible = createMockActor({ name: "Ineligible" });

    const summary: any = await applyEffect(
      {
        type: "condition",
        statusId: "dazed",
        duration: "immediate",
        when: { target_has_condition: "prone" },
      },
      ctxFor({ attacker }),
      [eligible, ineligible],
    );

    expect(eligible.statuses.has("dazed")).toBe(true);
    expect(ineligible.statuses.has("dazed")).toBe(false);
    expect(summary.targets).toEqual(["Eligible"]);
    expect(summary.skipped).toEqual(["Ineligible"]);
  });

  it("applies to everyone when effect.when is absent", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Foe" });

    const summary: any = await applyEffect(
      { type: "condition", statusId: "prone", duration: "immediate" },
      ctxFor({ attacker }),
      [target],
    );
    expect(summary.skipped).toBeUndefined();
  });
});

describe("applyEffect — genuinely unknown type", () => {
  it("warns and returns null", async () => {
    expectModuleWarn(/Unknown effect type/);
    expect(await applyEffect({ type: "nonsense" } as any, ctxFor(), [])).toBeNull();
  });
});

describe("executeKataOpportunity — ctx enrichment (Finding 2 fix)", () => {
  const soaringSlice = KATA_REGISTRY.find((k) => k.names.includes("Soaring Slice"));

  it("fills in ctx.kata and ctx.opportunitiesSpent from the resolved kata definition", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Foe" });
    const ctx = ctxFor({ attacker, targets: [target], opportunitiesSpent: 0, kata: null });

    await executeKataOpportunity("Soaring Slice", ctx, 0);

    expect(ctx.kata).toBe(soaringSlice);
    expect(ctx.opportunitiesSpent).toBe(soaringSlice.onOpportunity[0].cost);
  });

  it("honors an explicitly-set nonzero ctx.opportunitiesSpent instead of overriding it", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Foe" });
    const ctx = ctxFor({ attacker, targets: [target], opportunitiesSpent: 5 });

    await executeKataOpportunity("Soaring Slice", ctx, 0);
    expect(ctx.opportunitiesSpent).toBe(5);
  });

  it("still applies the onOpportunity effect using the enriched ctx", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Foe" });
    const ctx = ctxFor({ attacker, targets: [target], opportunitiesSpent: 0 });

    await executeKataOpportunity("Soaring Slice", ctx, 0);
    expect(target.getFlag(NS, "pendingTnReduction")).toMatchObject({ amount: 1, expiresAfterCombatant: "att" });
  });
});
