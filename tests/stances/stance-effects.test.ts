import { describe, it, expect } from "vitest";
import {
  getAirTNBonus,
  getFireStrifeBonus,
  isEarthStanceProtected,
} from "../../src/stances/stance-effects";
import { createMockActor } from "../helpers/foundry-mocks";

/** CHARACTERIZATION — feature #3 (apply_stances_effects), already shipped. */

describe("getAirTNBonus", () => {
  it("is 0 outside Air stance", () => {
    expect(getAirTNBonus(createMockActor({ system: { stance: "earth" } }))).toBe(0);
  });

  it("is 1 in Air stance below school rank 4", () => {
    const a = createMockActor({ system: { stance: "air", identity: { school_rank: 3 } } });
    expect(getAirTNBonus(a)).toBe(1);
  });

  it("is 2 in Air stance at school rank 4 or above", () => {
    const a = createMockActor({ system: { stance: "air", identity: { school_rank: 4 } } });
    expect(getAirTNBonus(a)).toBe(2);
    const b = createMockActor({ system: { stance: "air", identity: { school_rank: 5 } } });
    expect(getAirTNBonus(b)).toBe(2);
  });

  it("is 0 for a null target", () => {
    expect(getAirTNBonus(null)).toBe(0);
  });
});

describe("getFireStrifeBonus", () => {
  it("is 0 outside Fire stance", () => {
    const a = createMockActor({ system: { stance: "water" } });
    expect(getFireStrifeBonus(a, { summary: { strife: 3 } })).toBe(0);
  });

  it("returns the roll's strife in Fire stance", () => {
    const a = createMockActor({ system: { stance: "fire" } });
    expect(getFireStrifeBonus(a, { summary: { strife: 3 } })).toBe(3);
  });

  it("is 0 when the roll carries no strife", () => {
    const a = createMockActor({ system: { stance: "fire" } });
    expect(getFireStrifeBonus(a, {})).toBe(0);
    expect(getFireStrifeBonus(a, null)).toBe(0);
  });

  it("is 0 for a null attacker", () => {
    expect(getFireStrifeBonus(null, { summary: { strife: 5 } })).toBe(0);
  });
});

describe("isEarthStanceProtected", () => {
  it("is true only in Earth stance", () => {
    expect(isEarthStanceProtected(createMockActor({ system: { stance: "earth" } }))).toBe(true);
    expect(isEarthStanceProtected(createMockActor({ system: { stance: "fire" } }))).toBe(false);
  });

  it("is false for a null target", () => {
    expect(isEarthStanceProtected(null)).toBe(false);
  });

  it("defaults to Void stance on a fresh actor, so it is false", () => {
    expect(isEarthStanceProtected(createMockActor())).toBe(false);
  });
});
