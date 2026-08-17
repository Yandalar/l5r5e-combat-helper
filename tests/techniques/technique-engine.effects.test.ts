import { describe, it, expect } from "vitest";
import { applyEffect } from "../../src/techniques/technique-engine";
import { createMockActor, createMockItem, createMockWeapon } from "../helpers/foundry-mocks";
import { expectModuleWarn } from "../helpers/setup";

const NS = "l5r5e-combat-helper";

/**
 * CHARACTERIZATION — applyEffect's dispatch, before Fase 0.5 unifies the
 * active and passive dispatchers.
 *
 * Current signature: applyEffect(effect, attacker, targets, extraSuccesses)
 */

describe("applyEffect — condition", () => {
  it("applies the status and reports the affected target names", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Bandit" });

    const summary: any = await applyEffect(
      { type: "condition", target: "target", statusId: "prone", duration: "immediate" },
      attacker,
      [target],
      0,
    );

    expect(target.statuses.has("prone")).toBe(true);
    expect(summary).toMatchObject({ type: "condition", statusId: "prone", targets: ["Bandit"] });
  });

  it("stores an expiry record only for until_next_turn", async () => {
    const attacker = createMockActor({ id: "att" });
    const timed = createMockActor();
    const immediate = createMockActor();

    await applyEffect(
      { type: "condition", statusId: "dazed", duration: "until_next_turn" },
      attacker, [timed], 0,
    );
    await applyEffect(
      { type: "condition", statusId: "dazed", duration: "immediate" },
      attacker, [immediate], 0,
    );

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
      attacker, [a, b], 0,
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
      attacker, [target], 0,
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
      attacker, [target], 0,
    );

    expect(target.system.fatigue.value).toBe(4); // 1 + (5 - 2)
    expect(summary).toMatchObject({ type: "damage", results: [{ damage: 3 }] });
  });

  it("ignores armor when ignoresArmor is set", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({
      system: { fatigue: { value: 0 } },
      items: [createMockItem({ type: "armor", system: { equipped: true, armor: { physical: 4 } } })],
    });

    await applyEffect(
      { type: "damage", formula: { source: "fixed", value: 5 }, ignoresArmor: true },
      attacker, [target], 0,
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
      attacker, [target], 0,
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
      attacker, [target], 0,
    );
    expect(target.update).toHaveBeenCalledWith({ "system.fatigue.value": 2 });
  });

  it("resolves the formula per target (silhouette differs between targets)", async () => {
    const attacker = createMockActor({ id: "att" });
    const small = createMockActor({ name: "Small", system: { silhouette: 2, fatigue: { value: 0 } } });
    const big = createMockActor({ name: "Big", system: { silhouette: 5, fatigue: { value: 0 } } });

    const summary: any = await applyEffect(
      { type: "damage", formula: { source: "target_silhouette" }, ignoresArmor: true },
      attacker, [small, big], 0,
    );

    expect(summary.results).toEqual([
      { target: "Small", damage: 2 },
      { target: "Big", damage: 5 },
    ]);
  });
});

describe("applyEffect — assistance", () => {
  it("stores an assistance record without touching statuses", async () => {
    const attacker = createMockActor({ id: "att" });
    const target = createMockActor({ name: "Ally" });

    const summary: any = await applyEffect(
      { type: "assistance", target: "all_against_target", duration: "until_next_turn" },
      attacker, [target], 0,
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
      attacker, [target], 0,
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
    await applyEffect({ type: "attack_tn_reduction", duration: "immediate" }, attacker, [target], 0);
    expect(target.getFlag(NS, "pendingTnReduction").amount).toBe(1);
  });
});

describe("applyEffect — types routed elsewhere or unknown", () => {
  it.each(["resistance_roll", "resistance_buff", "critical_severity_boost"])(
    "%s returns null from the active dispatcher (handled on another path)",
    async (type) => {
      const summary: any = await applyEffect({ type } as any, createMockActor(), [createMockActor()], 0);
      expect(summary).toBeNull();
    },
  );

  it("BUG: condition_lock is in no active-path dispatcher at all — it warns as unknown", async () => {
    // It is only implemented inside applyPassiveKataOpportunity. Fase 0.5
    // unifies the dispatchers so bucket legality is validated as data instead.
    expectModuleWarn(/Unknown effect type/);
    const summary: any = await applyEffect(
      { type: "condition_lock", conditions: ["prone"] } as any,
      createMockActor(), [createMockActor()], 0,
    );
    expect(summary).toBeNull();
  });

  it("warns and returns null for a genuinely unknown type", async () => {
    expectModuleWarn(/Unknown effect type/);
    expect(await applyEffect({ type: "nonsense" } as any, createMockActor(), [], 0)).toBeNull();
  });
});
