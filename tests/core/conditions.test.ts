import { describe, it, expect } from "vitest";
import {
  L5R5E_STATUS_IDS,
  CONDITION_STATUS_IDS,
  resolveConditionStatusId,
  isValidStatusId,
  hasCondition,
} from "../../src/core/conditions";
import { createMockActor, createMockActiveEffect } from "../helpers/foundry-mocks";

describe("L5R5E_STATUS_IDS", () => {
  it("contains expected core condition statuses", () => {
    expect(L5R5E_STATUS_IDS).toContain("bleeding");
    expect(L5R5E_STATUS_IDS).toContain("dying");
    expect(L5R5E_STATUS_IDS).toContain("unconscious");
    expect(L5R5E_STATUS_IDS).toContain("incapacitated");
  });

  it("contains all ring-dependent wounded statuses", () => {
    const rings = ["earth", "air", "water", "fire", "void"];
    for (const ring of rings) {
      expect(L5R5E_STATUS_IDS).toContain(`lightly_wounded_${ring}`);
      expect(L5R5E_STATUS_IDS).toContain(`severely_wounded_${ring}`);
    }
  });

  it("is frozen and immutable", () => {
    expect(Object.isFrozen(L5R5E_STATUS_IDS)).toBe(true);
  });
});

describe("CONDITION_STATUS_IDS", () => {
  it("has resolver functions for each condition", () => {
    const expected = [
      "lightly_wounded",
      "severely_wounded",
      "bleeding",
      "dying",
      "dead",
      "unconscious",
      "incapacitated",
    ];
    for (const name of expected) {
      expect(name in CONDITION_STATUS_IDS).toBe(true);
      expect(typeof CONDITION_STATUS_IDS[name]).toBe("function");
    }
  });
});

describe("resolveConditionStatusId", () => {
  it("resolves bleeding to 'bleeding'", () => {
    expect(resolveConditionStatusId("bleeding")).toBe("bleeding");
  });

  it("resolves dying to 'dying'", () => {
    expect(resolveConditionStatusId("dying")).toBe("dying");
  });

  it("resolves dead to 'unconscious'", () => {
    expect(resolveConditionStatusId("dead")).toBe("unconscious");
  });

  it("resolves unconscious to 'unconscious'", () => {
    expect(resolveConditionStatusId("unconscious")).toBe("unconscious");
  });

  it("resolves incapacitated to 'incapacitated'", () => {
    expect(resolveConditionStatusId("incapacitated")).toBe("incapacitated");
  });

  it("resolves lightly_wounded with ring to ring-specific status", () => {
    expect(resolveConditionStatusId("lightly_wounded", "earth")).toBe(
      "lightly_wounded_earth"
    );
    expect(resolveConditionStatusId("lightly_wounded", "fire")).toBe(
      "lightly_wounded_fire"
    );
  });

  it("returns null for lightly_wounded without ring", () => {
    expect(resolveConditionStatusId("lightly_wounded")).toBe(null);
  });

  it("resolves severely_wounded with ring to ring-specific status", () => {
    expect(resolveConditionStatusId("severely_wounded", "water")).toBe(
      "severely_wounded_water"
    );
    expect(resolveConditionStatusId("severely_wounded", "void")).toBe(
      "severely_wounded_void"
    );
  });

  it("returns null for severely_wounded without ring", () => {
    expect(resolveConditionStatusId("severely_wounded")).toBe(null);
  });

  it("returns null for unknown condition names", () => {
    expect(resolveConditionStatusId("unknown_condition")).toBe(null);
    expect(resolveConditionStatusId("fake_status")).toBe(null);
  });
});

describe("isValidStatusId", () => {
  it("returns true for valid l5r5e status IDs", () => {
    expect(isValidStatusId("bleeding")).toBe(true);
    expect(isValidStatusId("dying")).toBe(true);
    expect(isValidStatusId("unconscious")).toBe(true);
    expect(isValidStatusId("lightly_wounded_earth")).toBe(true);
    expect(isValidStatusId("severely_wounded_fire")).toBe(true);
  });

  it("returns false for unknown status IDs", () => {
    expect(isValidStatusId("unknown_status")).toBe(false);
    expect(isValidStatusId("foobar")).toBe(false);
    expect(isValidStatusId("")).toBe(false);
  });
});

describe("hasCondition", () => {
  it("detects condition via actor.statuses", () => {
    const actor = createMockActor({ statuses: ["bleeding"] });
    expect(hasCondition(actor, "bleeding")).toBe(true);
  });

  it("returns false when condition not in actor.statuses", () => {
    const actor = createMockActor({ statuses: ["bleeding"] });
    expect(hasCondition(actor, "dying")).toBe(false);
  });

  it("detects condition via effects[].statuses fallback path", () => {
    const effect = createMockActiveEffect({ statuses: ["prone"] });
    const actor = createMockActor({ effects: [effect] });
    expect(hasCondition(actor, "prone")).toBe(true);
  });

  it("returns false when condition not in effects", () => {
    const effect = createMockActiveEffect({ statuses: ["prone"] });
    const actor = createMockActor({ effects: [effect] });
    expect(hasCondition(actor, "dazed")).toBe(false);
  });

  it("returns false for null actor", () => {
    expect(hasCondition(null, "bleeding")).toBe(false);
  });

  it("returns false for actor with no statuses or effects", () => {
    const actor = createMockActor();
    expect(hasCondition(actor, "bleeding")).toBe(false);
  });

  it("checks both statuses and effects, preferring statuses path", () => {
    const effect = createMockActiveEffect({ statuses: ["dying"] });
    const actor = createMockActor({
      statuses: ["bleeding"],
      effects: [effect],
    });
    expect(hasCondition(actor, "bleeding")).toBe(true);
    expect(hasCondition(actor, "dying")).toBe(true);
  });
});
