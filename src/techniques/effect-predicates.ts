// @ts-nocheck

/**
 * Predicate evaluators used by `applyEffect` (technique-engine.ts) to decide,
 * per-target, whether a TechniqueEffect should actually apply. This lets a
 * single effect definition express conditions like "only if the target is
 * already Prone" or "only if the resistance roll fell short by 2 or less"
 * without each kata author having to special-case it in technique-engine.ts.
 *
 * Vocabulary is derived: PREDICATE_KEYS is Object.keys(PREDICATE_EVALUATORS),
 * so the Task 6 registry integrity test can validate kata definitions against
 * the real set of supported predicate keys instead of a hardcoded list.
 */

import { hasCondition } from "../core/conditions";
import { getSilhouette, isAtCriticalState } from "../core/actor-utils";
import { logWarn } from "../core/logger";

export const PREDICATE_EVALUATORS = {
  target_has_condition: (v, ctx, t) => hasCondition(t, v),
  target_lacks_condition: (v, ctx, t) => !hasCondition(t, v),
  attacker_has_condition: (v, ctx) => hasCondition(ctx.attacker, v),
  target_silhouette_gte: (v, ctx, t) => getSilhouette(t) >= v,
  target_is_incapacitated: (v, ctx, t) => isAtCriticalState(t) === v,
  shortfall_lte: (v, ctx) => (ctx.resistance?.shortfall ?? Infinity) <= v,
  shortfall_gte: (v, ctx) => (ctx.resistance?.shortfall ?? -1) >= v,
  activation_shortfall_lte: (v, ctx) => Math.max(0, ctx.tn - ctx.totalSuccess) <= v,
  activation_failed: (v, ctx) => (ctx.totalSuccess < ctx.tn) === v,
  resistance_failed: (v, ctx) => (ctx.resistance?.success === false) === v,
  extra_successes_gte: (v, ctx) => ctx.extraSuccesses >= v,
  all: (v, ctx, t) => v.every((p) => evaluatePredicate(p, ctx, t)),
  any: (v, ctx, t) => v.some((p) => evaluatePredicate(p, ctx, t)),
  not: (v, ctx, t) => !evaluatePredicate(v, ctx, t),
};
export const PREDICATE_KEYS = Object.keys(PREDICATE_EVALUATORS);

/**
 * Evaluates a single-key predicate object (e.g. `{ shortfall_lte: 2 }`)
 * against the current execution context and (optionally) a specific target.
 *
 * undefined/null → true (no predicate means "always applies").
 * Unknown key → warn + false (fail-closed: a typo in a kata definition must
 * not silently apply an effect it was never meant to trigger).
 */
export function evaluatePredicate(pred, ctx, target = null) {
  if (!pred) return true;
  const [key] = Object.keys(pred);
  const evaluator = PREDICATE_EVALUATORS[key];
  if (!evaluator) {
    logWarn("Unknown predicate key:", key);
    return false;
  }
  return evaluator(pred[key], ctx, target);
}
