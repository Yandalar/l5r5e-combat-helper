import { describe, it, expect } from "vitest";
import { resolveFormula, resolveTargets } from "../../src/techniques/technique-engine";
import { createMockActor, createMockWeapon, createMockItem } from "../helpers/foundry-mocks";
import { expectModuleWarn } from "../helpers/setup";

/**
 * resolveFormula/resolveTargets after the EffectContext refactor (Task 4).
 *
 * Current signatures:
 *   resolveFormula(formula, ctx, target)
 *   resolveTargets(effectTarget, ctx)
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

describe("resolveFormula", () => {
  it("fixed returns the literal value", () => {
    expect(resolveFormula({ source: "fixed", value: 4 }, ctxFor(), null)).toBe(4);
  });

  it("plus adds one or more other formulas", () => {
    const a = createMockActor({ system: { rings: { water: 3 }, skills: { scholar: { medicine: 2 } } } });
    const ctx = ctxFor({ attacker: a, extraSuccesses: 1 });
    const waterPlusMedicine = { source: "attacker_ring", ring: "water", plus: { source: "attacker_skill_rank", skill: "medicine" } };
    expect(resolveFormula(waterPlusMedicine, ctx, null)).toBe(5);
    const withList = { source: "fixed", value: 1, plus: [{ source: "fixed", value: 2 }, { source: "extra_successes" }] };
    expect(resolveFormula(withList, ctx, null)).toBe(4);
  });

  it("attacker_ring reads system.rings[ring]", () => {
    const a = createMockActor({ system: { rings: { earth: 3 } } });
    expect(resolveFormula({ source: "attacker_ring", ring: "earth" }, ctxFor({ attacker: a }), null)).toBe(3);
  });

  it("attacker_ring returns 0 for an unknown ring", () => {
    const a = createMockActor();
    expect(resolveFormula({ source: "attacker_ring", ring: "nope" }, ctxFor({ attacker: a }), null)).toBe(0);
  });

  it("extra_successes reads ctx.extraSuccesses", () => {
    expect(resolveFormula({ source: "extra_successes" }, ctxFor({ extraSuccesses: 3 }), null)).toBe(3);
  });

  it("opportunities_spent reads ctx.opportunitiesSpent", () => {
    expect(resolveFormula({ source: "opportunities_spent" }, ctxFor({ opportunitiesSpent: 2 }), null)).toBe(2);
  });

  it("attacker_school_rank reads system.identity.school_rank", () => {
    const a = createMockActor({ system: { identity: { school_rank: 4 } } });
    expect(resolveFormula({ source: "attacker_school_rank" }, ctxFor({ attacker: a }), null)).toBe(4);
  });

  it("attacker_honor_rank reads via getHonorRank (tens digit of system.social.honor)", () => {
    const a = createMockActor({ system: { social: { honor: 45 } } });
    expect(resolveFormula({ source: "attacker_honor_rank" }, ctxFor({ attacker: a }), null)).toBe(4);
  });

  it("attacker_skill_rank reads via getSkillRank + SKILL_CATEGORY_MAP", () => {
    const a = createMockActor({ system: { skills: { martial: { melee: 3 } } } });
    expect(
      resolveFormula({ source: "attacker_skill_rank", skill: "melee" }, ctxFor({ attacker: a }), null),
    ).toBe(3);
  });

  it("target_vigilance reads the target's system.vigilance", () => {
    const t = createMockActor({ system: { vigilance: 2 } });
    expect(resolveFormula({ source: "target_vigilance" }, ctxFor(), t)).toBe(2);
  });

  it("resistance_shortfall reads ctx.resistance.shortfall, defaulting to 0", () => {
    expect(resolveFormula({ source: "resistance_shortfall" }, ctxFor(), null)).toBe(0);
    expect(
      resolveFormula({ source: "resistance_shortfall" }, ctxFor({ resistance: { shortfall: 3 } }), null),
    ).toBe(3);
  });

  describe("weapon_base / weapon_deadliness", () => {
    it("weapon_base reads the attacker's equipped weapon damage", () => {
      const a = createMockActor({ items: [createMockWeapon({ system: { damage: 4 } })] });
      expect(resolveFormula({ source: "weapon_base" }, ctxFor({ attacker: a }), null)).toBe(4);
    });

    it("weapon_base prefers ctx.weapon over re-deriving the attacker's equipped weapon", () => {
      const specific = createMockWeapon({ system: { damage: 7 } });
      const a = createMockActor({ items: [createMockWeapon({ system: { damage: 2 } }), specific] });
      expect(
        resolveFormula({ source: "weapon_base" }, ctxFor({ attacker: a, weapon: specific }), null),
      ).toBe(7);
    });

    it("weapon_base with slot: 'secondary' reads the attacker's second weapon, excluding ctx.weapon", () => {
      const primary = createMockWeapon({ system: { damage: 3 } });
      const secondary = createMockWeapon({ system: { damage: 5 } });
      const a = createMockActor({ items: [primary, secondary] });
      expect(
        resolveFormula(
          { source: "weapon_base", slot: "secondary" },
          ctxFor({ attacker: a, weapon: primary }),
          null,
        ),
      ).toBe(5);
    });

    it("weapon_deadliness reads the attacker's equipped weapon deadliness", () => {
      const a = createMockActor({ items: [createMockWeapon({ system: { deadliness: 6 } })] });
      expect(resolveFormula({ source: "weapon_deadliness" }, ctxFor({ attacker: a }), null)).toBe(6);
    });
  });

  describe("composable modifiers (replace the old *_plus_extra sources)", () => {
    it("plusExtraSuccesses adds ctx.extraSuccesses on top of the base source", () => {
      const a = createMockActor({ system: { rings: { fire: 2 } } });
      expect(
        resolveFormula(
          { source: "attacker_ring", ring: "fire", plusExtraSuccesses: true },
          ctxFor({ attacker: a, extraSuccesses: 3 }),
          null,
        ),
      ).toBe(5);
    });

    it("weapon_base + plusExtraSuccesses yields just the extras when no weapon is equipped", () => {
      const a = createMockActor({
        items: [createMockItem({ type: "weapon", system: { damage: 9, equipped: false, readied: false } })],
      });
      expect(
        resolveFormula(
          { source: "weapon_base", plusExtraSuccesses: true },
          ctxFor({ attacker: a, extraSuccesses: 2 }),
          null,
        ),
      ).toBe(2);
    });

    it("plusOpportunitiesSpent adds ctx.opportunitiesSpent", () => {
      expect(
        resolveFormula(
          { source: "fixed", value: 1, plusOpportunitiesSpent: true },
          ctxFor({ opportunitiesSpent: 4 }),
          null,
        ),
      ).toBe(5);
    });

    it("multiplier, bonus, min and max compose on top of the base value", () => {
      expect(resolveFormula({ source: "fixed", value: 3, multiplier: 2, bonus: 1 }, ctxFor(), null)).toBe(7);
      expect(resolveFormula({ source: "fixed", value: 3, min: 10 }, ctxFor(), null)).toBe(10);
      expect(resolveFormula({ source: "fixed", value: 30, max: 10 }, ctxFor(), null)).toBe(10);
    });
  });

  it("warns and returns 0 for an unknown source", () => {
    expectModuleWarn(/Unknown formula source/);
    expect(resolveFormula({ source: "totally_made_up" } as any, ctxFor(), null)).toBe(0);
  });

  describe("target_silhouette", () => {
    it("reads system.silhouette when something has set it", () => {
      const t = createMockActor({ system: { silhouette: 3 } });
      expect(resolveFormula({ source: "target_silhouette" }, ctxFor(), t)).toBe(3);
    });

    it("falls back to getSilhouette's default of 2 for a real l5r5e actor (BUG #8 fix)", () => {
      // The l5r5e system does not define `silhouette` in template.json at all.
      // Fase 0.4's getSilhouette() resolves a flag/prototypeToken-based
      // fallback chain that defaults to 2 (Medium), not the old hardcoded 1.
      const realActor = createMockActor();
      expect(realActor.system.silhouette).toBeUndefined();
      expect(resolveFormula({ source: "target_silhouette" }, ctxFor(), realActor)).toBe(2);
    });

    it("always receives the real target — scheduleResistanceRolls resolves it per-target now (BUG #1 fix)", () => {
      // Previously scheduleResistanceRolls resolved the difficulty formula
      // once, before its per-target loop, with target hardcoded to null —
      // collapsing every target's silhouette-based difficulty to 1. That
      // path is exercised end-to-end in technique-engine.effects.test.ts;
      // here we just confirm resolveFormula itself has no null-target
      // special case left to exploit.
      const t = createMockActor({ system: { silhouette: 4 } });
      expect(resolveFormula({ source: "target_silhouette" }, ctxFor(), t)).toBe(4);
    });
  });
});

describe("resolveTargets", () => {
  const attacker = createMockActor({ id: "att" });
  const t1 = createMockActor({ id: "t1" });
  const t2 = createMockActor({ id: "t2" });
  const ctx = ctxFor({ attacker, targets: [t1, t2] });

  it("'attacker' resolves to the attacker alone", () => {
    expect(resolveTargets("attacker", ctx)).toEqual([attacker]);
  });

  it("'target' resolves to ctx.targets", () => {
    expect(resolveTargets("target", ctx)).toEqual([t1, t2]);
  });

  it("'all_against_target' also resolves to ctx.targets", () => {
    expect(resolveTargets("all_against_target", ctx)).toEqual([t1, t2]);
  });

  it("an unknown target string is fail-closed: warns and resolves to no targets", () => {
    expectModuleWarn(/Unknown effect target/);
    expect(resolveTargets("typo_here" as any, ctx)).toEqual([]);
  });
});
