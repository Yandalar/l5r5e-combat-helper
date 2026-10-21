import { describe, it, expect } from "vitest";
import { KATA_REGISTRY, normalizeKataName, kataMatchesItem } from "../../src/techniques/kata-registry";

const hida = KATA_REGISTRY.find((k) => k.names[0] === "Lord Hida's Grip")!;

describe("normalizeKataName", () => {
  it("drops a trailing clan tag, typographic apostrophes, accents and case", () => {
    expect(normalizeKataName("Lord Hida’s Grip (Crab)")).toBe("lord hida's grip");
    expect(normalizeKataName("El abrazo del Señor Hida")).toBe("el abrazo del senor hida");
  });
});

describe("kataMatchesItem", () => {
  it.each([
    "Lord Hida's Grip",
    "Lord Hida's Grip (Crab)",
    "Lord Hida’s Grip (Cangrejo)",
    "El abrazo del Señor Hida (Cangrejo)",
  ])("matches %s", (name) => {
    expect(kataMatchesItem(hida, { name })).toBe(true);
  });

  it("does not match other techniques", () => {
    expect(kataMatchesItem(hida, { name: "Soaring Slice" })).toBe(false);
    expect(kataMatchesItem(hida, { name: "" })).toBe(false);
  });

  it("matches by compendium source when declared", () => {
    expect(kataMatchesItem({ names: ["X"], compendiumIds: ["Compendium.a.b.Item.c"] }, {
      name: "Renamed", _stats: { compendiumSource: "Compendium.a.b.Item.c" },
    })).toBe(true);
  });
});
