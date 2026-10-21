import { describe, it, expect } from "vitest";
import {
  KATA_REGISTRY,
  PASSIVE_KATA_REGISTRY,
  MANUAL_KATA_REGISTRY,
  SKILL_CATEGORY_MAP,
} from "../../src/techniques/kata-registry";
import { KIHO_REGISTRY } from "../../src/techniques/kiho-registry";
import {
  EFFECT_TYPES,
  EFFECT_BUCKETS,
  FORMULA_SOURCES,
  DURATIONS,
} from "../../src/techniques/technique-engine";
import { L5R5E_STATUS_IDS } from "../../src/core/conditions";
import en from "../../lang/en.json";
import es from "../../lang/es.json";

/**
 * Registry data-integrity suite (Task 6, Fase 0).
 *
 * This file is the anti-drift mechanism every future kata task (7-20) is
 * checked against: it walks KATA_REGISTRY + PASSIVE_KATA_REGISTRY and
 * validates every effect against the *derived* vocabulary exports
 * (EFFECT_TYPES, EFFECT_BUCKETS, FORMULA_SOURCES, DURATIONS, L5R5E_STATUS_IDS)
 * rather than any hardcoded literal list here. If those exports ever grow or
 * shrink, this suite tracks them automatically instead of silently going
 * stale.
 */

type AnyEffect = Record<string, any>;
type AnyKata = Record<string, any>;

interface WalkedEffect {
  kataName: string;
  bucket: string;
  effect: AnyEffect;
}

/**
 * Recursively walks a list of effects belonging to `bucket`. The only
 * effect type that nests further effects is `resistance_roll.onFailure[]`
 * — those nested effects are walked too, tagged with bucket "onFailure",
 * which was "not validated anywhere" before this task per the brief.
 */
function walkEffectList(kataName: string, effects: AnyEffect[], bucket: string, out: WalkedEffect[]): void {
  for (const effect of effects) {
    out.push({ kataName, bucket, effect });
    if (effect.type === "resistance_roll" && Array.isArray(effect.onFailure)) {
      walkEffectList(kataName, effect.onFailure, "onFailure", out);
    }
    if (effect.type === "choice" && Array.isArray(effect.options)) {
      for (const option of effect.options) walkEffectList(kataName, option.effects ?? [], "choice", out);
    }
  }
}

/** Collects every (bucket, effect) pair reachable from a single kata definition. */
function collectEffects(kata: AnyKata): WalkedEffect[] {
  const out: WalkedEffect[] = [];
  const kataName = kata.names[0];

  if (Array.isArray(kata.onSuccess)) {
    walkEffectList(kataName, kata.onSuccess, "onSuccess", out);
  }
  // Kata-level "if you fail" effects (a failed activation roll), distinct
  // from resistance_roll.onFailure.
  if (Array.isArray(kata.onFailure)) {
    walkEffectList(kataName, kata.onFailure, "onActivationFailure", out);
  }
  if (Array.isArray(kata.onUse)) {
    walkEffectList(kataName, kata.onUse, "onUse", out);
  }
  for (const tier of kata.burst ?? []) {
    walkEffectList(kataName, tier.effects ?? [], "burst", out);
  }
  if (Array.isArray(kata.onExtraSuccesses?.effects)) {
    walkEffectList(kataName, kata.onExtraSuccesses.effects, "onExtraSuccesses", out);
  }
  if (Array.isArray(kata.onOpportunity)) {
    for (const opp of kata.onOpportunity) {
      if (Array.isArray(opp.effects)) {
        walkEffectList(kataName, opp.effects, "onOpportunity", out);
      }
    }
  }
  return out;
}

const ACTIVE_KATAS: AnyKata[] = KATA_REGISTRY;
const PASSIVE_KATAS: AnyKata[] = PASSIVE_KATA_REGISTRY;
const MANUAL_KATAS: AnyKata[] = MANUAL_KATA_REGISTRY;
const KIHOS: AnyKata[] = KIHO_REGISTRY;
const ALL_KATAS: AnyKata[] = [...ACTIVE_KATAS, ...PASSIVE_KATAS, ...MANUAL_KATAS, ...KIHOS];

const WALKED: WalkedEffect[] = ALL_KATAS.flatMap((kata) => collectEffects(kata));

const EN = en as Record<string, string>;
const ES = es as Record<string, string>;

/** Every statusId-shaped value (condition.statusId, condition_lock.conditions[]) found while walking. */
function statusIdsUsedBy(effect: AnyEffect): string[] {
  if (effect.type === "condition" && effect.statusId) return [effect.statusId];
  if (effect.type === "condition" && Array.isArray(effect.statusIds)) return effect.statusIds;
  if (effect.type === "condition_lock" && Array.isArray(effect.conditions)) return effect.conditions;
  return [];
}

describe("kata-registry integrity — effect walk", () => {
  it.each(WALKED.map((w) => [`${w.kataName} / ${w.bucket} / ${w.effect.type}`, w] as const))(
    "%s: effect.type is a known EFFECT_TYPE, legal in its bucket",
    (_label, w) => {
      expect(EFFECT_TYPES).toContain(w.effect.type);
      const legalBuckets = EFFECT_BUCKETS[w.effect.type as keyof typeof EFFECT_BUCKETS];
      expect(legalBuckets).toBeDefined();
      expect(legalBuckets).toContain(w.bucket);
    },
  );

  const FORMULA_FIELDS = ["formula", "difficulty", "severity", "increasesPrior"];
  it.each(
    WALKED.filter((w) => FORMULA_FIELDS.some((f) => typeof w.effect[f] === "object")).map(
      (w) => [`${w.kataName} / ${w.bucket} / ${w.effect.type}`, w] as const,
    ),
  )("%s: every formula's source is a known FORMULA_SOURCE", (_label, w) => {
    for (const field of FORMULA_FIELDS) {
      if (typeof w.effect[field] === "object") expect(FORMULA_SOURCES).toContain(w.effect[field].source);
    }
  });

  it.each(WALKED.filter((w) => w.effect.ringDifficulty).map((w) => [`${w.kataName} / ${w.bucket} / ${w.effect.type}`, w] as const))(
    "%s: ringDifficulty keys are rings with numeric offsets",
    (_label, w) => {
      for (const [ring, delta] of Object.entries(w.effect.ringDifficulty)) {
        expect(["air", "earth", "fire", "water", "void"]).toContain(ring);
        expect(typeof delta).toBe("number");
      }
    },
  );

  it.each(WALKED.filter((w) => w.effect.failureNote).map((w) => [w.kataName, w] as const))(
    "%s: failureNote has en+es i18n keys",
    (_label, w) => {
      expect(EN).toHaveProperty(w.effect.failureNote);
      expect(ES).toHaveProperty(w.effect.failureNote);
    },
  );

  it.each(
    WALKED.filter((w) => statusIdsUsedBy(w.effect).length > 0).map(
      (w) => [`${w.kataName} / ${w.bucket} / ${w.effect.type}`, w] as const,
    ),
  )("%s: every statusId/condition is a real L5R5E_STATUS_ID with en+es i18n keys", (_label, w) => {
    for (const id of statusIdsUsedBy(w.effect)) {
      expect(L5R5E_STATUS_IDS).toContain(id);
      const key = `l5r5e-combat-helper.conditions.${id}`;
      expect(EN, `missing en.json key ${key}`).toHaveProperty(key);
      expect(ES, `missing es.json key ${key}`).toHaveProperty(key);
    }
  });

  it.each(
    WALKED.filter((w) => w.effect.duration !== undefined).map(
      (w) => [`${w.kataName} / ${w.bucket} / ${w.effect.type}`, w] as const,
    ),
  )("%s: duration is a known DURATION", (_label, w) => {
    expect(DURATIONS).toContain(w.effect.duration);
  });
});

describe("kata-registry integrity — activation.skill resolution", () => {
  it.each(ACTIVE_KATAS.map((k) => [k.names[0], k] as const))(
    "%s: activation.skill resolves via SKILL_CATEGORY_MAP",
    (_name, kata) => {
      expect(SKILL_CATEGORY_MAP).toHaveProperty(kata.activation.skill);
    },
  );

  it.each(PASSIVE_KATAS.map((k) => [k.names[0], k] as const))(
    "%s: every activation.skills[] entry resolves via SKILL_CATEGORY_MAP",
    (_name, kata) => {
      expect(Array.isArray(kata.activation.skills)).toBe(true);
      for (const skill of kata.activation.skills) {
        expect(SKILL_CATEGORY_MAP).toHaveProperty(skill);
      }
    },
  );
});

describe("kata-registry integrity — name lookup round-trip", () => {
  /**
   * Mirrors the exact lookup used by executeKataOpportunity
   * (`KATA_REGISTRY.find(k => k.names.includes(kataName))`) and by
   * handlePassiveKataButtonClick (`PASSIVE_KATA_REGISTRY.find(k =>
   * k.names.includes(kataName))`). If two entries ever shared a first name,
   * this would silently resolve to the wrong kata at runtime.
   */
  it.each(ACTIVE_KATAS.map((k) => [k.names[0], k] as const))(
    "%s: names[0] round-trips through KATA_REGISTRY.find(...)",
    (name, kata) => {
      const found = KATA_REGISTRY.find((k) => k.names.includes(name));
      expect(found).toBe(kata);
    },
  );

  it.each(PASSIVE_KATAS.map((k) => [k.names[0], k] as const))(
    "%s: names[0] round-trips through PASSIVE_KATA_REGISTRY.find(...)",
    (name, kata) => {
      const found = PASSIVE_KATA_REGISTRY.find((k) => k.names.includes(name));
      expect(found).toBe(kata);
    },
  );
});

describe("kata-registry integrity — cross-registry invariants", () => {
  it("no name is repeated across KATA_REGISTRY + PASSIVE_KATA_REGISTRY combined", () => {
    const allNames = ALL_KATAS.flatMap((k) => k.names as string[]);
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const name of allNames) {
      if (seen.has(name)) duplicates.push(name);
      seen.add(name);
    }
    expect(duplicates).toEqual([]);
  });

  it("every i18n key a kata references (cardNote, informationalNote, spendKey, hint) exists in en+es", () => {
    const keys = ALL_KATAS.flatMap((k) => [
      k.cardNote,
      k.informationalNote,
      k.enhancement?.note,
      ...(k.onOpportunity ?? []).flatMap((o: AnyKata) => [o.spendKey, o.hint]),
    ]).filter(Boolean);
    for (const key of keys) {
      expect(EN, `missing en.json key ${key}`).toHaveProperty(key);
      expect(ES, `missing es.json key ${key}`).toHaveProperty(key);
    }
  });

  it("passive costMin <= costMax on every onOpportunity entry that has both (numeric)", () => {
    for (const kata of PASSIVE_KATAS) {
      for (const opp of kata.onOpportunity ?? []) {
        if (typeof opp.costMin === "number" && typeof opp.costMax === "number") {
          expect(
            opp.costMin,
            `${kata.names[0]}: costMin (${opp.costMin}) must be <= costMax (${opp.costMax})`,
          ).toBeLessThanOrEqual(opp.costMax);
        }
      }
    }
  });

  /**
   * Every effect type technique-engine.ts can dispatch should eventually be
   * exercised by at least one registry entry. Tasks 7-20 add 19 more katas —
   * as each phase lands, the corresponding entry below should be removed. An
   * entry with no comment explaining *why* it's still unused is a smell.
   */
  // Kihō base (K0) adds these for the kihō registry, which ticket K1 fills.
  const KNOWN_UNUSED_EFFECT_TYPES: string[] = ["gain_void", "choice", "clear_technique_effects"];

  it("every EFFECT_TYPE is used by the registry or explicitly listed as known-unused", () => {
    const usedTypes = new Set(WALKED.map((w) => w.effect.type));
    const unaccountedFor = EFFECT_TYPES.filter(
      (t) => !usedTypes.has(t) && !KNOWN_UNUSED_EFFECT_TYPES.includes(t),
    );
    expect(unaccountedFor).toEqual([]);

    // Also guard the other direction: a type listed as "known unused" that
    // the registry actually uses now should be pruned from the list above,
    // otherwise the surjectivity check silently stops meaning anything for it.
    const staleKnownUnused = KNOWN_UNUSED_EFFECT_TYPES.filter((t) => usedTypes.has(t));
    expect(staleKnownUnused).toEqual([]);
  });
});
