import { describe, it, expect } from "vitest";
import { calculateCriticalSeverity } from "../../src/critical/critical-strike-roll";
import {
  getCriticalEffect,
  isWeaponSharp,
  DEFAULT_CRITICAL_TABLE,
} from "../../src/critical/critical-effects-table";
import { createMockWeapon } from "../helpers/foundry-mocks";

/** CHARACTERIZATION — the critical severity pipeline, pinned before Fase 3. */

describe("calculateCriticalSeverity", () => {
  it("subtracts nothing when the mitigation roll fails", () => {
    expect(calculateCriticalSeverity(5, false, 0)).toBe(5);
    expect(calculateCriticalSeverity(5, false, 3)).toBe(5); // bonus ignored on failure
  });

  it("subtracts 1 plus bonus successes on a successful mitigation", () => {
    expect(calculateCriticalSeverity(5, true, 0)).toBe(4);
    expect(calculateCriticalSeverity(5, true, 2)).toBe(2);
  });

  it("never drops below 1", () => {
    expect(calculateCriticalSeverity(3, true, 10)).toBe(1);
    expect(calculateCriticalSeverity(0, false, 0)).toBe(1);
  });
});

describe("getCriticalEffect", () => {
  it("maps severity into the right table band", () => {
    expect(getCriticalEffect(1).nameKey).toBe("closeCall");
    expect(getCriticalEffect(3).nameKey).toBe("fleshWound");
    expect(getCriticalEffect(5).nameKey).toBe("debilitatingGash");
    expect(getCriticalEffect(7).nameKey).toBe("permanentInjury");
  });

  it("respects band boundaries", () => {
    expect(getCriticalEffect(2).nameKey).toBe("closeCall");
    expect(getCriticalEffect(4).nameKey).toBe("fleshWound");
    expect(getCriticalEffect(6).nameKey).toBe("debilitatingGash");
  });

  it("localizes name and effect", () => {
    const e = getCriticalEffect(3);
    expect(e.name).toBeTruthy();
    expect(e.effect).toBeTruthy();
    expect(e.name).not.toContain("l5r5e-combat-helper.");
  });

  it("falls back to the last band above the table's maximum", () => {
    const last = DEFAULT_CRITICAL_TABLE[DEFAULT_CRITICAL_TABLE.length - 1];
    expect(getCriticalEffect(999).nameKey).toBe(last.nameKey);
  });

  it("QUIRK: severity 0 resolves to closeCall, since the first band starts at 0", () => {
    expect(getCriticalEffect(0).nameKey).toBe("closeCall");
  });
});

describe("isWeaponSharp", () => {
  it("detects Razor-Edged by property name, case-insensitively", () => {
    const w = createMockWeapon({ system: { properties: [{ name: "Razor-Edged" }] } });
    expect(isWeaponSharp(w)).toBe(true);
  });

  it("detects Razor-Edged by compendium id", () => {
    const w = createMockWeapon({ system: { properties: [{ id: "L5RCorePro000001" }] } });
    expect(isWeaponSharp(w)).toBe(true);
  });

  it("is false for a plain weapon, a null weapon, or malformed properties", () => {
    expect(isWeaponSharp(createMockWeapon())).toBe(false);
    expect(isWeaponSharp(null)).toBe(false);
    expect(isWeaponSharp({ system: { properties: "nope" } } as any)).toBe(false);
  });
});
