import { describe, it, expect } from "vitest";
import {
  storeActiveKataEffect,
  processExpiredKataEffects,
  processEndOfTurnKataEffects,
  clearAllKataEffects,
} from "../../src/techniques/technique-engine";
import { createMockActor } from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";

function world(...actors: any[]): void {
  (globalThis as any).game.actors.push(...actors);
}

/** CHARACTERIZATION — timed-effect bookkeeping across turns and combat end. */

describe("storeActiveKataEffect", () => {
  it("appends without clobbering earlier entries", async () => {
    const actor = createMockActor();
    await storeActiveKataEffect(actor, { type: "condition", statusId: "prone", expiresAfterCombatant: "a" });
    await storeActiveKataEffect(actor, { type: "assistance", statusId: null, expiresAfterCombatant: "a" });

    const stored = actor.getFlag(NS, "activeKataEffects");
    expect(stored).toHaveLength(2);
    expect(stored.map((e: any) => e.type)).toEqual(["condition", "assistance"]);
  });
});

describe("processExpiredKataEffects", () => {
  it("removes a condition whose expiry matches the combatant", async () => {
    const target = createMockActor({ statuses: ["immobilized"] });
    await storeActiveKataEffect(target, {
      type: "condition", statusId: "immobilized", expiresAfterCombatant: "att",
    });
    world(target);

    await processExpiredKataEffects("att");

    expect(target.statuses.has("immobilized")).toBe(false);
    expect(target.getFlag(NS, "activeKataEffects")).toEqual([]);
  });

  it("leaves effects belonging to a different combatant untouched", async () => {
    const target = createMockActor({ statuses: ["prone"] });
    await storeActiveKataEffect(target, {
      type: "condition", statusId: "prone", expiresAfterCombatant: "someone_else",
    });
    world(target);

    await processExpiredKataEffects("att");

    expect(target.statuses.has("prone")).toBe(true);
    expect(target.getFlag(NS, "activeKataEffects")).toHaveLength(1);
  });

  it("decrements resistanceBuff and unsets it at zero", async () => {
    const actor = createMockActor();
    await actor.setFlag(NS, "resistanceBuff", 2);
    await storeActiveKataEffect(actor, {
      type: "resistance_buff", amount: 2, expiresAfterCombatant: "att",
    });
    world(actor);

    await processExpiredKataEffects("att");
    expect(actor.getFlag(NS, "resistanceBuff")).toBeUndefined();
  });

  it("keeps the remainder when only part of the buff expires", async () => {
    const actor = createMockActor();
    await actor.setFlag(NS, "resistanceBuff", 3);
    await storeActiveKataEffect(actor, {
      type: "resistance_buff", amount: 1, expiresAfterCombatant: "att",
    });
    world(actor);

    await processExpiredKataEffects("att");
    expect(actor.getFlag(NS, "resistanceBuff")).toBe(2);
  });

  it("BUG: a NEGATIVE resistance_buff is skipped entirely and never expires", async () => {
    // The guard is `effect.amount > 0`, and the arithmetic is
    // Math.max(0, current - amount). Striking as Water (Fase 1) needs a
    // negative buff, so both must become sign-symmetric.
    const actor = createMockActor();
    await actor.setFlag(NS, "resistanceBuff", -2);
    await storeActiveKataEffect(actor, {
      type: "resistance_buff", amount: -2, expiresAfterCombatant: "att",
    });
    world(actor);

    await processExpiredKataEffects("att");
    expect(actor.getFlag(NS, "resistanceBuff")).toBe(-2); // still there
  });

  it("clears pendingTnReduction for an attack_tn_reduction effect", async () => {
    const actor = createMockActor();
    await actor.setFlag(NS, "pendingTnReduction", { amount: 1, expiresAfterCombatant: "att" });
    await storeActiveKataEffect(actor, { type: "attack_tn_reduction", expiresAfterCombatant: "att" });
    world(actor);

    await processExpiredKataEffects("att");
    expect(actor.getFlag(NS, "pendingTnReduction")).toBeUndefined();
  });

  it("touches every actor in the world, not just the combatant", async () => {
    const a = createMockActor({ statuses: ["dazed"] });
    const b = createMockActor({ statuses: ["dazed"] });
    for (const actor of [a, b]) {
      await storeActiveKataEffect(actor, {
        type: "condition", statusId: "dazed", expiresAfterCombatant: "att",
      });
    }
    world(a, b);

    await processExpiredKataEffects("att");
    expect(a.statuses.has("dazed")).toBe(false);
    expect(b.statuses.has("dazed")).toBe(false);
  });

  it("skips actors with no stored effects without writing to them", async () => {
    const untouched = createMockActor();
    world(untouched);
    await processExpiredKataEffects("att");
    expect(untouched.setFlag).not.toHaveBeenCalled();
  });
});

describe("processEndOfTurnKataEffects", () => {
  it("clears a critical_severity_boost keyed to end of turn", async () => {
    const actor = createMockActor();
    await actor.setFlag(NS, "pendingCriticalSeverityBoost", { amount: 2, expiresEndOfTurnCombatant: "att" });
    await storeActiveKataEffect(actor, {
      type: "critical_severity_boost", amount: 2, expiresEndOfTurnCombatant: "att",
    });
    world(actor);

    await processEndOfTurnKataEffects("att");
    expect(actor.getFlag(NS, "pendingCriticalSeverityBoost")).toBeUndefined();
    expect(actor.getFlag(NS, "activeKataEffects")).toEqual([]);
  });

  it("ignores effects keyed to the start-of-turn expiry field", async () => {
    const actor = createMockActor();
    await storeActiveKataEffect(actor, {
      type: "condition", statusId: "prone", expiresAfterCombatant: "att",
    });
    world(actor);

    await processEndOfTurnKataEffects("att");
    expect(actor.getFlag(NS, "activeKataEffects")).toHaveLength(1);
  });

  it("QUIRK: does NOT honor statusId, so a timed condition here is never removed", async () => {
    const actor = createMockActor({ statuses: ["dazed"] });
    await storeActiveKataEffect(actor, {
      type: "condition", statusId: "dazed", expiresEndOfTurnCombatant: "att",
    });
    world(actor);

    await processEndOfTurnKataEffects("att");
    expect(actor.statuses.has("dazed")).toBe(true); // status survives
    expect(actor.getFlag(NS, "activeKataEffects")).toEqual([]); // record does not
  });
});

describe("clearAllKataEffects", () => {
  it("removes statuses, records and every pending flag across all actors", async () => {
    const actor = createMockActor({ statuses: ["immobilized"] });
    await actor.setFlag(NS, "resistanceBuff", 2);
    await actor.setFlag(NS, "pendingTnReduction", { amount: 1 });
    await actor.setFlag(NS, "pendingCriticalSeverityBoost", { amount: 1 });
    await storeActiveKataEffect(actor, {
      type: "condition", statusId: "immobilized", expiresAfterCombatant: "att",
    });
    world(actor);

    await clearAllKataEffects();

    expect(actor.statuses.has("immobilized")).toBe(false);
    expect(actor.getFlag(NS, "activeKataEffects")).toBeUndefined();
    expect(actor.getFlag(NS, "resistanceBuff")).toBeUndefined();
    expect(actor.getFlag(NS, "pendingTnReduction")).toBeUndefined();
    expect(actor.getFlag(NS, "pendingCriticalSeverityBoost")).toBeUndefined();
  });

  it("QUIRK: an actor with no activeKataEffects keeps its stray pending flags", async () => {
    // The `if (effects.length === 0) continue` guard short-circuits before the
    // pending-flag cleanup, so an orphaned buff survives combat end.
    const actor = createMockActor();
    await actor.setFlag(NS, "resistanceBuff", 2);
    world(actor);

    await clearAllKataEffects();
    expect(actor.getFlag(NS, "resistanceBuff")).toBe(2);
  });

  it("swallows a failing toggleStatusEffect silently (bare empty catch)", async () => {
    const actor = createMockActor();
    actor.toggleStatusEffect = async () => {
      throw new Error("boom");
    };
    await storeActiveKataEffect(actor, {
      type: "condition", statusId: "prone", expiresAfterCombatant: "att",
    });
    world(actor);

    // No declaration needed: the catch block logs nothing at all today.
    // Fase 0.6 turns it into a logWarn, at which point this test declares it.
    await expect(clearAllKataEffects()).resolves.toBeUndefined();
    expect(actor.getFlag(NS, "activeKataEffects")).toBeUndefined();
  });
});
