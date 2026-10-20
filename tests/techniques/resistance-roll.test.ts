import { describe, it, expect } from "vitest";
import {
  buildResistanceDialogParams,
  matchesPendingResistance,
} from "../../src/techniques/resistance-roll";

/**
 * Bug #6 fix: kata-activation.ts's resistance roll path only worked for PCs
 * (it always built a DicePickerDialog with a named `skill` + `skillCatId`,
 * and only matched a finished roll against `pending.skill`). NPC actors in
 * l5r5e have no per-skill entries — only flat skill categories — mirroring
 * critical-strike-roll.ts's launchFitnessCheck NPC branch exactly.
 */

describe("buildResistanceDialogParams", () => {
  it("PC: builds dialog params keyed on the named skill", () => {
    const pc = { type: "character" };
    expect(buildResistanceDialogParams(pc, "fitness", "martial", 3)).toEqual({
      actor: pc,
      skillId: "fitness",
      skillCatId: "martial",
      difficulty: 3,
      difficultyHidden: false,
    });
  });

  it("NPC: builds dialog params keyed on the flat skill category instead", () => {
    const npc = { type: "npc" };
    expect(buildResistanceDialogParams(npc, "fitness", "martial", 3)).toEqual({
      actor: npc,
      skillId: "martial",
      difficulty: 3,
      difficultyHidden: false,
    });
  });
});

describe("matchesPendingResistance", () => {
  const pending = { skill: "fitness", skillCatId: "martial" };

  it("PC: matches on l5rData.skillId === pending.skill", () => {
    expect(matchesPendingResistance({ skillId: "fitness" }, pending, "character")).toBe(true);
    expect(matchesPendingResistance({ skillId: "martial" }, pending, "character")).toBe(false);
  });

  it("NPC: matches on l5rData.skillId === pending.skillCatId", () => {
    expect(matchesPendingResistance({ skillId: "martial" }, pending, "npc")).toBe(true);
    expect(matchesPendingResistance({ skillId: "fitness" }, pending, "npc")).toBe(false);
  });
});
