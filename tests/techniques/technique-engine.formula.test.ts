import { describe, it, expect } from "vitest";
import { resolveFormula, resolveTargets } from "../../src/techniques/technique-engine";
import { createMockActor, createMockWeapon, createMockItem } from "../helpers/foundry-mocks";
import { expectModuleWarn } from "../helpers/setup";

/**
 * CHARACTERIZATION — resolveFormula/resolveTargets before the Fase 0.5
 * EffectContext refactor changes their signatures.
 *
 * Current signature: resolveFormula(formula, attacker, target, extraSuccesses)
 */

describe("resolveFormula", () => {
  it("fixed returns the literal value", () => {
    expect(resolveFormula({ source: "fixed", value: 4 }, null, null, 0)).toBe(4);
  });

  it("attacker_ring reads system.rings[ring]", () => {
    const a = createMockActor({ system: { rings: { earth: 3 } } });
    expect(resolveFormula({ source: "attacker_ring", ring: "earth" }, a, null, 0)).toBe(3);
  });

  it("attacker_ring returns 0 for an unknown ring", () => {
    const a = createMockActor();
    expect(resolveFormula({ source: "attacker_ring", ring: "nope" }, a, null, 0)).toBe(0);
  });

  it("extra_successes passes the argument through", () => {
    expect(resolveFormula({ source: "extra_successes" }, null, null, 3)).toBe(3);
  });

  it("attacker_school_rank reads system.identity.school_rank", () => {
    const a = createMockActor({ system: { identity: { school_rank: 4 } } });
    expect(resolveFormula({ source: "attacker_school_rank" }, a, null, 0)).toBe(4);
  });

  it("attacker_ring_plus_extra adds the extra successes", () => {
    const a = createMockActor({ system: { rings: { fire: 2 } } });
    expect(resolveFormula({ source: "attacker_ring_plus_extra", ring: "fire" }, a, null, 3)).toBe(5);
  });

  it("weapon_base_plus_extra reads the first equipped weapon's damage", () => {
    const a = createMockActor({ items: [createMockWeapon({ system: { damage: 4 } })] });
    expect(resolveFormula({ source: "weapon_base_plus_extra" }, a, null, 2)).toBe(6);
  });

  it("weapon_base_plus_extra yields just the extras when no weapon is equipped", () => {
    const a = createMockActor({
      items: [createMockItem({ type: "weapon", system: { damage: 9, equipped: false, readied: false } })],
    });
    expect(resolveFormula({ source: "weapon_base_plus_extra" }, a, null, 2)).toBe(2);
  });

  it("warns and returns 0 for an unknown source", () => {
    expectModuleWarn(/Unknown formula source/);
    expect(resolveFormula({ source: "totally_made_up" } as any, null, null, 0)).toBe(0);
  });

  describe("target_silhouette", () => {
    it("reads system.silhouette when something has set it", () => {
      const t = createMockActor({ system: { silhouette: 3 } });
      expect(resolveFormula({ source: "target_silhouette" }, null, t, 0)).toBe(3);
    });

    it("BUG #8: defaults to 1, and l5r5e never populates system.silhouette", () => {
      // The l5r5e system does not define `silhouette` in template.json at all,
      // so on a real actor this ALWAYS returns 1 — which silently reduces
      // Lord Hida's Grip to a TN-1 kata dealing 1 damage.
      // Fase 0.4 introduces getSilhouette() with a flag-based fallback chain.
      const realActor = createMockActor();
      expect(realActor.system.silhouette).toBeUndefined();
      expect(resolveFormula({ source: "target_silhouette" }, null, realActor, 0)).toBe(1);
    });

    it("BUG #1: returns 1 when target is null, which is how scheduleResistanceRolls calls it", () => {
      // technique-engine.ts:396 resolves resistance difficulty with target=null,
      // so a silhouette-based resistance TN collapses to 1 for every target.
      expect(resolveFormula({ source: "target_silhouette" }, null, null, 0)).toBe(1);
    });
  });
});

describe("resolveTargets", () => {
  const attacker = createMockActor({ id: "att" });
  const t1 = createMockActor({ id: "t1" });
  const t2 = createMockActor({ id: "t2" });

  it("'attacker' resolves to the attacker alone", () => {
    expect(resolveTargets("attacker", attacker, [t1, t2])).toEqual([attacker]);
  });

  it("'target' resolves to the assigned targets", () => {
    expect(resolveTargets("target", attacker, [t1, t2])).toEqual([t1, t2]);
  });

  it("'all_against_target' also resolves to the assigned targets", () => {
    expect(resolveTargets("all_against_target", attacker, [t1])).toEqual([t1]);
  });

  it("QUIRK: an unknown target string silently behaves as 'target'", () => {
    // Fase 0.5 makes this fail-closed instead.
    expect(resolveTargets("typo_here" as any, attacker, [t1])).toEqual([t1]);
  });
});
