import { describe, it, expect } from "vitest";
import en from "../../lang/en.json";
import es from "../../lang/es.json";

/**
 * `lang/en.json` and `lang/es.json` must define exactly the same set of
 * keys — CLAUDE.md requires every new user-facing string to get an entry in
 * both files, but nothing previously checked that mechanically. Searched
 * `tests/` first (per Task 6 brief) for an existing en/es parity check
 * before adding this: none exists — `tests/helpers/setup.ts` only checks
 * that keys used in tests resolve against `en.json`, it never compares
 * against `es.json` or looks for orphaned es-only keys.
 */
describe("i18n key parity — lang/en.json vs lang/es.json", () => {
  it("has no keys present in en.json but missing from es.json", () => {
    const enKeys = new Set(Object.keys(en));
    const esKeys = new Set(Object.keys(es));
    const missingFromEs = [...enKeys].filter((k) => !esKeys.has(k));
    expect(missingFromEs).toEqual([]);
  });

  it("has no keys present in es.json but missing from en.json", () => {
    const enKeys = new Set(Object.keys(en));
    const esKeys = new Set(Object.keys(es));
    const missingFromEn = [...esKeys].filter((k) => !enKeys.has(k));
    expect(missingFromEn).toEqual([]);
  });
});
