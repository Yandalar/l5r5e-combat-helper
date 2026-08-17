import { describe, it, expect } from "vitest";
import {
  checkAttackSuccess,
  calculateDamage,
  getArmorResistance,
} from "../../src/core/damage-calculator";
import { createMockActor, createMockItem, createMockWeapon } from "../helpers/foundry-mocks";

/** CHARACTERIZATION — pins current behavior before the Fase 0 refactor. */

describe("checkAttackSuccess", () => {
  it("succeeds when successes meet the TN", () => {
    expect(checkAttackSuccess({ summary: { totalSuccess: 3 }, difficulty: 3 })).toBe(true);
  });

  it("fails when successes fall short", () => {
    expect(checkAttackSuccess({ summary: { totalSuccess: 2 }, difficulty: 3 })).toBe(false);
  });

  it("defaults the TN to 2 when difficulty is absent", () => {
    expect(checkAttackSuccess({ summary: { totalSuccess: 2 } })).toBe(true);
    expect(checkAttackSuccess({ summary: { totalSuccess: 1 } })).toBe(false);
  });

  it("defaults totalSuccess to 0", () => {
    expect(checkAttackSuccess({})).toBe(false);
  });

  it("adds tnBonus to the TN (Air stance path)", () => {
    expect(checkAttackSuccess({ summary: { totalSuccess: 3 }, difficulty: 3 }, 1)).toBe(false);
    expect(checkAttackSuccess({ summary: { totalSuccess: 4 }, difficulty: 3 }, 1)).toBe(true);
  });

  it("QUIRK: difficulty 0 is falsy, so it becomes the default TN of 2", () => {
    expect(checkAttackSuccess({ summary: { totalSuccess: 1 }, difficulty: 0 })).toBe(false);
  });
});

describe("calculateDamage", () => {
  it("uses the roll's own item when it is a weapon", () => {
    const weapon = createMockWeapon({ system: { damage: 5 } });
    const attacker = createMockActor();
    expect(calculateDamage({ item: weapon, summary: { totalSuccess: 2 }, difficulty: 2 }, attacker)).toBe(5);
  });

  it("falls back to the first equipped/readied weapon on the attacker", () => {
    const attacker = createMockActor({
      items: [createMockWeapon({ system: { damage: 4 } })],
    });
    expect(calculateDamage({ summary: { totalSuccess: 2 }, difficulty: 2 }, attacker)).toBe(4);
  });

  it("adds bonus successes above the TN", () => {
    const attacker = createMockActor({ items: [createMockWeapon({ system: { damage: 3 } })] });
    expect(calculateDamage({ summary: { totalSuccess: 5 }, difficulty: 2 }, attacker)).toBe(6);
  });

  it("never subtracts for a failed roll (bonus clamps at 0)", () => {
    const attacker = createMockActor({ items: [createMockWeapon({ system: { damage: 3 } })] });
    expect(calculateDamage({ summary: { totalSuccess: 0 }, difficulty: 4 }, attacker)).toBe(3);
  });

  it("returns 0 base damage when the attacker has no weapon", () => {
    expect(calculateDamage({ summary: { totalSuccess: 2 }, difficulty: 2 }, createMockActor())).toBe(0);
  });

  it("ignores unequipped weapons", () => {
    const attacker = createMockActor({
      items: [createMockItem({ type: "weapon", system: { damage: 9, equipped: false, readied: false } })],
    });
    expect(calculateDamage({ summary: { totalSuccess: 2 }, difficulty: 2 }, attacker)).toBe(0);
  });

  it("accepts a readied-but-not-equipped weapon", () => {
    const attacker = createMockActor({
      items: [createMockItem({ type: "weapon", system: { damage: 7, equipped: false, readied: true } })],
    });
    expect(calculateDamage({ summary: { totalSuccess: 2 }, difficulty: 2 }, attacker)).toBe(7);
  });

  it("QUIRK: bonus successes use the raw TN, ignoring any Air-stance tnBonus", () => {
    // checkAttackSuccess() receives tnBonus but calculateDamage() does not,
    // so an Air-stance defender raises the hit threshold without reducing damage.
    const attacker = createMockActor({ items: [createMockWeapon({ system: { damage: 2 } })] });
    expect(calculateDamage({ summary: { totalSuccess: 4 }, difficulty: 2 }, attacker)).toBe(4);
  });
});

describe("getArmorResistance", () => {
  it("reads physical resistance from the first equipped armor", () => {
    const target = createMockActor({
      items: [createMockItem({ type: "armor", system: { equipped: true, armor: { physical: 3 } } })],
    });
    expect(getArmorResistance(target)).toBe(3);
  });

  it("ignores unequipped armor", () => {
    const target = createMockActor({
      items: [createMockItem({ type: "armor", system: { equipped: false, armor: { physical: 3 } } })],
    });
    expect(getArmorResistance(target)).toBe(0);
  });

  it("ignores supernatural resistance", () => {
    const target = createMockActor({
      items: [
        createMockItem({
          type: "armor",
          system: { equipped: true, armor: { physical: 1, supernatural: 9 } },
        }),
      ],
    });
    expect(getArmorResistance(target)).toBe(1);
  });

  it("adds the kata resistanceBuff flag", async () => {
    const target = createMockActor({
      items: [createMockItem({ type: "armor", system: { equipped: true, armor: { physical: 2 } } })],
    });
    await target.setFlag("l5r5e-combat-helper", "resistanceBuff", 2);
    expect(getArmorResistance(target)).toBe(4);
  });

  it("tolerates a target with no getFlag (plain object)", () => {
    expect(getArmorResistance({ items: [] } as any)).toBe(0);
  });

  it("returns 0 for a target with no items", () => {
    expect(getArmorResistance({} as any)).toBe(0);
  });

  it("PRE-EXISTING GAP: a negative resistanceBuff is passed through unclamped", () => {
    // Striking as Water (Fase 1) needs a negative buff. Recorded here so the
    // Fase 1 change to this behavior is visible as an intentional diff.
    const target = createMockActor();
    target.getFlag = () => -2;
    expect(getArmorResistance(target)).toBe(-2);
  });
});
