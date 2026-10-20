import { describe, it, expect } from "vitest";
import {
  isEquippedWeapon,
  getEquippedWeapons,
  getEquippedWeapon,
  getSecondaryWeapon,
  resolveAttackWeapon,
  getWeaponBaseDamage,
  getWeaponDeadliness,
} from "../../src/core/weapon-utils";
import { createMockActor, createMockItem, createMockWeapon } from "../helpers/foundry-mocks";

describe("isEquippedWeapon", () => {
  it("is true for a weapon with equipped: true", () => {
    expect(isEquippedWeapon(createMockItem({ type: "weapon", system: { equipped: true, readied: false } }))).toBe(true);
  });

  it("is true for a weapon with readied: true", () => {
    expect(isEquippedWeapon(createMockItem({ type: "weapon", system: { equipped: false, readied: true } }))).toBe(true);
  });

  it("is false for a weapon that is neither equipped nor readied", () => {
    expect(isEquippedWeapon(createMockItem({ type: "weapon", system: { equipped: false, readied: false } }))).toBe(false);
  });

  it("is false for a non-weapon item even if equipped", () => {
    expect(isEquippedWeapon(createMockItem({ type: "armor", system: { equipped: true } }))).toBe(false);
  });

  it("tolerates null/undefined", () => {
    expect(isEquippedWeapon(null)).toBe(false);
    expect(isEquippedWeapon(undefined)).toBe(false);
  });
});

describe("getEquippedWeapons", () => {
  it("returns all equipped/readied weapons", () => {
    const w1 = createMockWeapon({ id: "w1" });
    const w2 = createMockWeapon({ id: "w2" });
    const unequipped = createMockItem({ type: "weapon", system: { equipped: false, readied: false } });
    const actor = createMockActor({ items: [w1, unequipped, w2] });
    expect(getEquippedWeapons(actor).map((w) => w.id)).toEqual(["w1", "w2"]);
  });

  it("returns an empty array when the actor has no items", () => {
    expect(getEquippedWeapons({} as any)).toEqual([]);
  });

  it("returns an empty array for a null actor", () => {
    expect(getEquippedWeapons(null)).toEqual([]);
  });
});

describe("getEquippedWeapon", () => {
  it("returns the first equipped/readied weapon", () => {
    const w1 = createMockWeapon({ id: "w1" });
    const w2 = createMockWeapon({ id: "w2" });
    const actor = createMockActor({ items: [w1, w2] });
    expect(getEquippedWeapon(actor).id).toBe("w1");
  });

  it("returns null when the actor has no weapons", () => {
    expect(getEquippedWeapon(createMockActor())).toBeNull();
  });

  it("returns null for a null actor", () => {
    expect(getEquippedWeapon(null)).toBeNull();
  });

  it("ignores unequipped weapons", () => {
    const actor = createMockActor({
      items: [createMockItem({ type: "weapon", system: { equipped: false, readied: false } })],
    });
    expect(getEquippedWeapon(actor)).toBeNull();
  });
});

describe("getSecondaryWeapon", () => {
  it("returns the second distinct equipped weapon, excluding the given one by id", () => {
    const w1 = createMockWeapon({ id: "w1" });
    const w2 = createMockWeapon({ id: "w2" });
    const actor = createMockActor({ items: [w1, w2] });
    expect(getSecondaryWeapon(actor, w1)?.id).toBe("w2");
  });

  it("returns null when there is only one equipped weapon", () => {
    const w1 = createMockWeapon({ id: "w1" });
    const actor = createMockActor({ items: [w1] });
    expect(getSecondaryWeapon(actor, w1)).toBeNull();
  });

  it("returns the first equipped weapon when no exclusion is given", () => {
    const w1 = createMockWeapon({ id: "w1" });
    const w2 = createMockWeapon({ id: "w2" });
    const actor = createMockActor({ items: [w1, w2] });
    expect(getSecondaryWeapon(actor)?.id).toBe("w1");
  });
});

describe("resolveAttackWeapon", () => {
  it("uses the roll's own item when it is a weapon", () => {
    const rollWeapon = createMockWeapon({ id: "roll-weapon" });
    const attacker = createMockActor({ items: [createMockWeapon({ id: "equipped" })] });
    expect(resolveAttackWeapon({ item: rollWeapon }, attacker).id).toBe("roll-weapon");
  });

  it("falls back to the attacker's equipped weapon when the roll item isn't a weapon", () => {
    const attacker = createMockActor({ items: [createMockWeapon({ id: "equipped" })] });
    expect(resolveAttackWeapon({ item: { type: "spell" } }, attacker).id).toBe("equipped");
  });

  it("falls back to the attacker's equipped weapon when there is no roll item", () => {
    const attacker = createMockActor({ items: [createMockWeapon({ id: "equipped" })] });
    expect(resolveAttackWeapon({}, attacker).id).toBe("equipped");
  });

  it("tolerates a null l5rData", () => {
    const attacker = createMockActor({ items: [createMockWeapon({ id: "equipped" })] });
    expect(resolveAttackWeapon(null, attacker).id).toBe("equipped");
  });
});

describe("getWeaponBaseDamage", () => {
  it("parses the weapon's damage value", () => {
    expect(getWeaponBaseDamage(createMockWeapon({ system: { damage: 4 } }))).toBe(4);
  });

  it("returns the fallback (default 0) when damage is not numeric", () => {
    expect(getWeaponBaseDamage(createMockWeapon({ system: { damage: "not-a-number" } }))).toBe(0);
  });

  it("returns the fallback when the weapon is null", () => {
    expect(getWeaponBaseDamage(null)).toBe(0);
  });

  it("respects a custom fallback", () => {
    expect(getWeaponBaseDamage(null, 2)).toBe(2);
  });

  it("treats an explicit damage of 0 as 0, not the fallback", () => {
    expect(getWeaponBaseDamage(createMockWeapon({ system: { damage: 0 } }), 9)).toBe(0);
  });
});

describe("getWeaponDeadliness", () => {
  it("parses the weapon's deadliness value", () => {
    expect(getWeaponDeadliness(createMockWeapon({ system: { deadliness: 7 } }))).toBe(7);
  });

  it("returns the fallback of 5 when the weapon is null", () => {
    expect(getWeaponDeadliness(null)).toBe(5);
  });

  it("returns the fallback of 5 when deadliness is undefined", () => {
    expect(getWeaponDeadliness(createMockWeapon({ system: {} }))).toBe(5);
  });

  it("returns the fallback of 5 when deadliness is not numeric", () => {
    expect(getWeaponDeadliness(createMockWeapon({ system: { deadliness: "n/a" } }))).toBe(5);
  });

  it("BUG #7: an explicit deadliness of 0 yields the fallback of 5, not 0", () => {
    // template.json defaults weapon deadliness to 0. Before the fix, one call
    // site in chat-messages.ts returned 0 here and another returned 5. Both
    // now go through this function, which always yields the documented
    // fallback for a falsy/zero value.
    expect(getWeaponDeadliness(createMockWeapon({ system: { deadliness: 0 } }))).toBe(5);
  });

  it("respects a custom fallback", () => {
    expect(getWeaponDeadliness(null, 3)).toBe(3);
  });
});
