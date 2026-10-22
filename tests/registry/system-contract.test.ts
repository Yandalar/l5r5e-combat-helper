import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { SKILL_CATEGORY_MAP } from "../../src/techniques/kata-registry";
import { L5R5E_STATUS_IDS } from "../../src/core/conditions";

/**
 * Optional, gated contract check against a real installed Foundry l5r5e
 * system. Confirms two hardcoded/derived vocabularies in this module
 * (SKILL_CATEGORY_MAP, L5R5E_STATUS_IDS) still match the real system data
 * they were transcribed from, catching drift if a future l5r5e system
 * update renames or removes a skill/condition.
 *
 * Skips cleanly via `it.skipIf` when the system isn't installed at
 * `L5R5E_SYSTEM_PATH` (or the default macOS Foundry data path) — e.g. in CI,
 * where no Foundry install exists. Does not fail in that case.
 *
 * `scripts/config.js` is real JS with `export const`, not JSON — per the
 * Task 6 brief, rather than writing a full ES-module parser this extracts
 * only the array literal it needs with a simple, targeted regex.
 */

const SYSTEM_PATH =
  process.env.L5R5E_SYSTEM_PATH ??
  join(homedir(), "Library/Application Support/FoundryVTT/Data/systems/l5r5e");

const SYSTEM_EXISTS = existsSync(SYSTEM_PATH);

describe("system contract — real l5r5e system install", () => {
  it.skipIf(!SYSTEM_EXISTS)(
    "SKILL_CATEGORY_MAP matches Actor.templates.skills.skills in template.json exactly",
    () => {
      const template = JSON.parse(readFileSync(join(SYSTEM_PATH, "template.json"), "utf-8"));
      const skillsByCategory = template?.Actor?.templates?.skills?.skills;
      expect(
        skillsByCategory,
        "template.json shape changed — Actor.templates.skills.skills not found",
      ).toBeDefined();

      // Invert {category: {skillId: 0, ...}, ...} into {skillId: category}
      // — the same shape as SKILL_CATEGORY_MAP — so the two can be compared
      // directly instead of hand-maintaining a duplicate expected list here.
      const expected: Record<string, string> = {};
      for (const [category, skills] of Object.entries(
        skillsByCategory as Record<string, Record<string, unknown>>,
      )) {
        for (const skillId of Object.keys(skills)) {
          expected[skillId] = category;
        }
      }

      // kata-registry.ts's SKILL_CATEGORY_MAP doc comment claims this map is
      // "Total over the real skill tree" — so this is a full equality check,
      // not a subset check.
      expect(SKILL_CATEGORY_MAP).toEqual(expected);
    },
  );

  it.skipIf(!SYSTEM_EXISTS)(
    "every L5R5E_STATUS_IDS entry is a real condition id in scripts/config.js",
    () => {
      const configSrc = readFileSync(join(SYSTEM_PATH, "scripts", "config.js"), "utf-8");

      // Extract the `conditions: [ ... ]` array literal (ends right before
      // the following `regex:` key), then pull every top-level `id: "..."`
      // out of it. Each condition object also nests a compendium reference
      // `system: { id: "L5RCoreConXXXXXX" }` — filtered out by its
      // `L5RCoreCon` prefix, which no real status id uses.
      const block = configSrc.match(/conditions:\s*\[([\s\S]*?)\]\s*,\s*\n\s*regex:/);
      expect(
        block,
        "could not find `conditions: [...]` array in config.js — system format may have changed",
      ).not.toBeNull();

      const ids = [...block![1].matchAll(/id:\s*"([^"]+)"/g)]
        .map((m) => m[1])
        .filter((id) => !id.startsWith("L5RCoreCon"));

      expect(ids.length, "extracted zero condition ids — regex likely broken").toBeGreaterThan(0);

      // Subset check, not full equality: L5R5E_STATUS_IDS's doc comment
      // only claims these are "recognized" ids, not an exhaustive mirror of
      // every condition the real system defines (e.g. it deliberately
      // excludes "dead", mapping it to "unconscious" instead — see
      // src/core/conditions.ts). A missing entry here means we're claiming
      // an id is valid that the real system no longer has.
      const missing = L5R5E_STATUS_IDS.filter((id) => !ids.includes(id));
      expect(
        missing,
        `L5R5E_STATUS_IDS has id(s) not found in the real system's conditions list: ${missing.join(", ")}`,
      ).toEqual([]);
    },
  );

  it.skipIf(!SYSTEM_EXISTS)(
    "DicePickerDialog still exposes the ringId / difficulty setters core/dice-picker.ts relies on",
    () => {
      const source = readFileSync(join(SYSTEM_PATH, "scripts/dice/dice-picker-dialog.js"), "utf-8");
      expect(source).toContain("set ringId(");
      expect(source).toContain("set difficulty(");
      // The ring click goes through the setter, so the TN can follow it.
      expect(source).toMatch(/this\.ringId\s*=\s*event\.target\.dataset\.ringid/);
    },
  );
});
