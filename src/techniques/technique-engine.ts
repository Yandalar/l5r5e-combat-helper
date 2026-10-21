// @ts-nocheck

import { MODULE_ID } from "../core/module-constants";
import { logWarn } from "../core/logger";
import { hasCondition } from "../core/conditions";
import {
  getHonorRank,
  getSilhouette,
  getVigilance,
  getSkillRank,
  applyFatigue,
  applyStrife,
  getCurrentFatigue,
  getStrife,
} from "../core/actor-utils";
import { createCriticalStrikeMessage } from "../ui/chat-messages";
import { getArmorResistance } from "../core/damage-calculator";
import {
  getEquippedWeapon,
  getSecondaryWeapon,
  getWeaponBaseDamage,
  getWeaponDeadliness,
} from "../core/weapon-utils";
import { evaluatePredicate } from "./effect-predicates";
import {
  createKataSuccessMessage,
  createKataFailureMessage,
  createResistanceRollRequestMessage,
} from "./technique-chat";
import { KATA_REGISTRY, SKILL_CATEGORY_MAP } from "./kata-registry";
import {
  applyKataTokenAura,
  removeKataTokenAura,
  clearAllKataTokenAuras,
  applyResistanceActiveEffect,
  removeResistanceActiveEffects,
  applyTnReductionActiveEffect,
  removeTnReductionActiveEffect,
  applyCriticalSeverityBoostActiveEffect,
  removeCriticalSeverityBoostActiveEffect,
  applyConditionLockActiveEffect,
  removeConditionLockActiveEffects,
} from "./token-effects";
import { actorRef, kataEffectActors } from "../core/actor-refs";

/**
 * @typedef {{
 *   attacker: Actor,
 *   targets: Actor[],
 *   extraSuccesses: number,
 *   opportunitiesSpent: number,        // 0 outside onOpportunity
 *   tn: number,                        // the EFFECTIVE tn (post tnReduction)
 *   totalSuccess: number,
 *   weapon: Item|null,
 *   resistance: null | { skill, difficulty, totalSuccess, success, shortfall },
 *   kata: object,
 *   chosenCondition: string|null,
 *   sourceMessageId: string|null,
 *   l5rData: object|null,
 * }} EffectContext
 */

/** `slot === "secondary"` reads the attacker's second equipped weapon (excluding ctx.weapon); otherwise ctx.weapon itself, falling back to the attacker's (first) equipped weapon. */
function resolveWeaponSlot(ctx, slot) {
  return slot === "secondary"
    ? getSecondaryWeapon(ctx.attacker, ctx.weapon)
    : (ctx.weapon ?? getEquippedWeapon(ctx.attacker));
}

/**
 * Vocabulary of formula sources. This is a plain object (not a switch) so
 * that FORMULA_SOURCES = Object.keys(...) is the single source of truth for
 * "what formula sources exist" — the Task 6 registry integrity test imports
 * only this export, never a hardcoded list.
 */
export const FORMULA_RESOLVERS = {
  fixed: (f, ctx, target) => f.value,
  attacker_ring: (f, ctx) => parseInt(ctx.attacker.system.rings?.[f.ring]) || 0,
  attacker_school_rank: (f, ctx) => parseInt(ctx.attacker.system.identity?.school_rank) || 0,
  attacker_honor_rank: (f, ctx) => getHonorRank(ctx.attacker),
  attacker_skill_rank: (f, ctx) => getSkillRank(ctx.attacker, f.skill, SKILL_CATEGORY_MAP),
  target_silhouette: (f, ctx, target) => getSilhouette(target),
  target_vigilance: (f, ctx, target) => getVigilance(target),
  extra_successes: (f, ctx) => ctx.extraSuccesses,
  opportunities_spent: (f, ctx) => ctx.opportunitiesSpent,
  weapon_base: (f, ctx) => getWeaponBaseDamage(resolveWeaponSlot(ctx, f.slot)),
  weapon_deadliness: (f, ctx) => getWeaponDeadliness(resolveWeaponSlot(ctx, f.slot)),
  /** Rank in the skill of the roll that triggered the kata (passive katas: "the skill used for the check"). */
  attacker_roll_skill_rank: (f, ctx) => getSkillRank(ctx.attacker, ctx.rollSkillId ?? ctx.l5rData?.skillId, SKILL_CATEGORY_MAP),
  resistance_shortfall: (f, ctx) => ctx.resistance?.shortfall ?? 0,
};
export const FORMULA_SOURCES = Object.keys(FORMULA_RESOLVERS);

/**
 * Resolves a Formula to a concrete number given the execution context and
 * (when relevant) a specific target. Composable modifiers replace what used
 * to be separate combinatorial sources (`attacker_ring_plus_extra`,
 * `weapon_base_plus_extra`, ...): e.g. `{ source: "attacker_ring", ring:
 * "earth", plusExtraSuccesses: true }` instead of a dedicated
 * `attacker_ring_plus_extra` source.
 */
export function resolveFormula(formula, ctx, target) {
  const resolver = FORMULA_RESOLVERS[formula.source];
  if (!resolver) {
    logWarn("Unknown formula source:", formula.source);
    return 0;
  }
  let v = resolver(formula, ctx, target) * (formula.multiplier ?? 1);
  if (formula.plusExtraSuccesses) v += ctx.extraSuccesses;
  if (formula.plusOpportunitiesSpent) v += ctx.opportunitiesSpent;
  v += formula.bonus ?? 0;
  if (formula.min !== undefined) v = Math.max(formula.min, v);
  if (formula.max !== undefined) v = Math.min(formula.max, v);
  return v;
}

/**
 * Resolves which actors an effect targets. Fail-closed: an unrecognized
 * `effectTarget` string logs a warning and resolves to no targets at all,
 * rather than silently behaving like "target" (the old, undocumented
 * behavior).
 */
export function resolveTargets(effectTarget, ctx) {
  switch (effectTarget) {
    case "attacker":
      return [ctx.attacker];
    case "target":
    case "all_against_target":
      return ctx.targets;
    // "One of the targets of your action" (rank-4 styles, Spinning Blades...).
    case "first_target":
      return ctx.targets.slice(0, 1);
    // "One target per N opportunities spent" (Open-Hand Style): N = ctx.costStep.
    case "first_n_by_cost":
      return ctx.targets.slice(0, Math.floor((ctx.opportunitiesSpent || 0) / (ctx.costStep || 1)));
    default:
      logWarn("Unknown effect target:", effectTarget);
      return [];
  }
}

/**
 * Applies a single TechniqueEffect to a pre-resolved list of targets, per
 * the unified EFFECT_HANDLERS dispatcher. `effect.when` (a predicate, see
 * effect-predicates.ts) is evaluated per target *before* the handler runs —
 * targets that fail the predicate are filtered out and reported back in the
 * summary's `skipped` field instead of being handled.
 *
 * Returns a summary object for chat display, or null (unknown effect type,
 * or a handler that legitimately has nothing to report — e.g. condition_lock
 * with no chosenCondition).
 */
export async function applyEffect(effect, ctx, targets) {
  const handler = EFFECT_HANDLERS[effect.type];
  if (!handler) {
    console.warn("L5R5e Combat Helper | Unknown effect type:", effect.type);
    return null;
  }

  const filtered = [];
  const skipped = [];
  for (const t of targets) {
    if (evaluatePredicate(effect.when, ctx, t)) filtered.push(t);
    else skipped.push(t.name);
  }

  const summary = await handler(effect, ctx, filtered);
  if (summary && skipped.length) summary.skipped = skipped;
  return summary;
}

async function applyConditionEffect(effect, ctx, targets) {
  if (effect.remove) return removeConditionsEffect(effect, targets);
  const applied = [];
  for (const target of targets) {
    try {
      await target.toggleStatusEffect(effect.statusId, { active: true });
      applied.push(target.name);
      if (effect.duration === "until_next_turn") {
        await storeActiveKataEffect(target, {
          statusId: effect.statusId,
          type: "condition",
          expiresAfterCombatant: ctx.attacker.id,
        });
      }
    } catch (e) {
      console.warn(
        `L5R5e Combat Helper | Could not apply condition ${effect.statusId} to ${target.name}:`,
        e,
      );
    }
  }
  return {
    type: "condition",
    statusId: effect.statusId,
    targets: applied,
    duration: effect.duration,
  };
}

/** `remove: true` + `statusIds`: ends whichever of those conditions the targets suffer (Flowing Water Strike). */
async function removeConditionsEffect(effect, targets) {
  const removed = [];
  for (const target of targets) {
    for (const statusId of effect.statusIds ?? []) {
      if (!hasCondition(target, statusId)) continue;
      try {
        await target.toggleStatusEffect(statusId, { active: false });
        removed.push(`${target.name} (${game.i18n.localize(`l5r5e-combat-helper.conditions.${statusId}`)})`);
      } catch (e) {
        logWarn(`Could not remove ${statusId} from ${target.name}:`, e);
      }
    }
  }
  return { type: "condition", remove: true, targets: removed };
}

/**
 * Supports `resource`/`mode` (fatigue|strife, add|remove) — the shape Phase
 * 2/3 katas need, defined now so the signature does not need to change
 * again later. This is also the fatigue-write migration promised in Task 3:
 * the only remaining direct `target.update(...)` fatigue write is replaced
 * with `applyFatigue`/`applyStrife` from actor-utils.
 */
async function applyDamageEffect(effect, ctx, targets) {
  const resource = effect.resource ?? "fatigue";
  const mode = effect.mode ?? "add";
  const apply = resource === "strife" ? applyStrife : applyFatigue;
  const ignoresArmor = resource === "strife" ? true : Boolean(effect.ignoresArmor);
  const results = [];
  for (const target of targets) {
    const raw = resolveFormula(effect.formula, ctx, target);
    const armor = ignoresArmor ? 0 : getArmorResistance(target);
    // `increasesPrior`: this damage raises a hit already dealt (Flowing Water
    // Strike, Spinning Blades), so resistance is only subtracted once.
    const prior = effect.increasesPrior ? resolveFormula(effect.increasesPrior, ctx, target) : null;
    const amount = prior === null
      ? Math.max(0, raw - armor)
      : Math.max(0, prior + raw - armor) - Math.max(0, prior - armor);
    if (amount <= 0) continue;
    const signed = mode === "remove" ? -amount : amount;
    // Per-target error isolation: applyFatigue/applyStrife throw when no
    // resource field resolves on the actor (e.g. a malformed/unsupported
    // actor schema). One target failing must not abort the whole effect —
    // skip it and keep processing the rest, same as the pre-refactor code
    // that inlined this update and did console.error + continue.
    const before = resource === "strife" ? getStrife(target) : getCurrentFatigue(target);
    let after;
    try {
      after = await apply(target, signed);
    } catch (e) {
      logWarn(`Could not apply ${resource} damage to ${target.name}:`, e);
      continue;
    }
    // Recovery is reported as what was actually removed (clamped at 0).
    const reported = mode === "remove" ? Math.max(0, before - after) : amount;
    results.push({ target: target.name, damage: reported, resource, mode });
  }
  return { type: "damage", resource, mode, results, ignoresArmor };
}

async function applyAssistanceEffect(effect, ctx, targets) {
  const applied = [];
  for (const target of targets) {
    await storeActiveKataEffect(target, {
      statusId: null,
      type: "assistance",
      expiresAfterCombatant: ctx.attacker.id,
    });
    applied.push(target.name);
  }
  return { type: "assistance", targets: applied, duration: effect.duration };
}

async function applyAttackTnReductionEffect(effect, ctx, targets) {
  const amount = effect.amount ?? 1;
  for (const target of targets) {
    await target.setFlag(MODULE_ID, "pendingTnReduction", {
      amount,
      expiresAfterCombatant: ctx.attacker.id,
    });
    await applyTnReductionActiveEffect(target, amount);
    if (effect.duration === "until_next_turn") {
      await storeActiveKataEffect(target, {
        type: "attack_tn_reduction",
        expiresAfterCombatant: ctx.attacker.id,
      });
    }
  }
  return { type: "attack_tn_reduction", amount, targets: targets.map((t) => t.name) };
}

/**
 * Stores pendingResistanceRoll flag on each target and creates chat request
 * cards. BUG #1 FIX: the difficulty formula is resolved *inside* the
 * per-target loop (so `target_silhouette`-based difficulties differ
 * correctly per target) instead of once, before the loop, with `target`
 * hardcoded to null.
 */
async function scheduleResistanceRolls(effect, ctx, targets) {
  const skillCatId = SKILL_CATEGORY_MAP[effect.skill] ?? "martial";
  const scheduled = [];
  // force_stance needs the stance the attacker picked on the card, which
  // the resistance-completion ctx no longer has.
  const onFailure = (effect.onFailure ?? []).map((e) =>
    e.type === "force_stance" && !e.stance ? { ...e, stance: ctx.chosenStance ?? null } : e,
  );
  for (const target of targets) {
    const difficulty = resolveFormula(effect.difficulty, ctx, target);
    await target.setFlag(MODULE_ID, "pendingResistanceRoll", {
      skill: effect.skill,
      skillCatId,
      difficulty,
      ringDifficulty: effect.ringDifficulty ?? null,
      failureNote: effect.failureNote ?? null,
      onFailure,
      attackerId: actorRef(ctx.attacker),
    });
    await createResistanceRollRequestMessage(
      target,
      ctx.attacker,
      effect.skill,
      skillCatId,
      difficulty,
      onFailure,
      effect.ringDifficulty ?? null,
      effect.failureNote ?? null,
    );
    scheduled.push({ target, difficulty });
  }
  return scheduled;
}

async function applyResistanceRollEffect(effect, ctx, targets) {
  const scheduled = await scheduleResistanceRolls(effect, ctx, targets);
  return {
    // Summary `type` matches the effect type verbatim (not an invented
    // "...scheduled" name) so EFFECT_SUMMARY_RENDERERS can be keyed 1:1 off
    // EFFECT_TYPES — the derived-vocabulary mechanism the whole plan relies
    // on to keep the chat renderer map from silently falling out of sync.
    type: "resistance_roll",
    targets,
    difficulty: scheduled[0]?.difficulty ?? null,
  };
}

/**
 * Reads `ctx.opportunitiesSpent` for its magnitude, falling back to
 * `effect.amount ?? 1` — so a call from an active (onSuccess/onOpportunity
 * bucket-agnostic) context that never set opportunitiesSpent still works.
 *
 * TASK 8 FIX: the opportunitiesSpent branch used to return
 * `ctx.opportunitiesSpent` verbatim, discarding `effect.amount`'s sign
 * entirely — a positive buff (Striking as Earth, no `amount` field, implicit
 * magnitude 1) happened to come out right by coincidence, but a *negative*
 * buff (Striking as Water, `amount: -1`) came out positive instead of more
 * negative when scaled by opportunities spent. Per-opportunity magnitude
 * stays 1 (unchanged, matching Striking as Earth's already-shipped
 * behavior) — only the sign now follows `effect.amount`.
 */
async function applyResistanceBuffEffect(effect, ctx, targets) {
  const sign = (effect.amount ?? 1) < 0 ? -1 : 1;
  const amount = ctx.opportunitiesSpent > 0 ? sign * ctx.opportunitiesSpent : (effect.amount ?? 1);
  for (const target of targets) {
    const current = target.getFlag(MODULE_ID, "resistanceBuff") || 0;
    await target.setFlag(MODULE_ID, "resistanceBuff", current + amount);
    const expiryField = DURATION_EXPIRY[effect.duration];
    if (expiryField) {
      await storeActiveKataEffect(target, {
        type: "resistance_buff",
        amount,
        [expiryField]: ctx.attacker.id,
        ring: ctx.kata?.activation?.ring,
      });
    }
    await applyKataTokenAura(target, ctx.kata?.activation?.ring, "kata");
    await applyResistanceActiveEffect(target, ctx.kata?.activation?.ring, amount);
  }
  return { type: "resistance_buff", amount, targets: targets.map((t) => t.name) };
}

async function applyCriticalSeverityBoostEffect(effect, ctx, targets) {
  const amount = ctx.opportunitiesSpent > 0 ? ctx.opportunitiesSpent : (effect.amount ?? 1);
  for (const target of targets) {
    const current = target.getFlag(MODULE_ID, "pendingCriticalSeverityBoost")?.amount || 0;
    await target.setFlag(MODULE_ID, "pendingCriticalSeverityBoost", {
      amount: current + amount,
      expiresEndOfTurnCombatant: ctx.attacker.id,
    });
    if (effect.duration === "until_end_of_next_turn") {
      await storeActiveKataEffect(target, {
        type: "critical_severity_boost",
        amount,
        expiresEndOfTurnCombatant: ctx.attacker.id,
      });
    }
    await applyCriticalSeverityBoostActiveEffect(target, current + amount);
  }
  return { type: "critical_severity_boost", amount, targets: targets.map((t) => t.name) };
}

async function applyConditionLockEffect(effect, ctx, targets) {
  const chosenCondition = ctx.chosenCondition;
  if (!chosenCondition) return null;
  const applied = [];
  for (const target of targets) {
    if (!hasCondition(target, chosenCondition)) {
      ui.notifications.warn(
        game.i18n.format("l5r5e-combat-helper.notifications.conditionNotPresent", {
          condition: game.i18n.localize(`l5r5e-combat-helper.conditions.${chosenCondition}`),
          target: target.name,
        }),
      );
      continue;
    }
    await applyConditionLockActiveEffect(target, chosenCondition);
    if (effect.duration === "until_end_of_next_turn") {
      await storeActiveKataEffect(target, {
        type: "condition_lock",
        conditionId: chosenCondition,
        expiresEndOfTurnCombatant: ctx.attacker.id,
      });
    }
    applied.push(target.name);
  }
  return { type: "condition_lock", conditionId: chosenCondition, targets: applied };
}

/**
 * Posts a critical strike card (the usual Fitness → mitigation chain) with a
 * kata-defined severity and, optionally, a special mitigation TN
 * (Heartpiercing Strike: TN 3, Air 4, Water 1).
 */
async function applyCriticalStrikeEffect(effect, ctx, targets) {
  const weapon = resolveWeaponSlot(ctx, effect.slot);
  const results = [];
  for (const target of targets) {
    const severity = Math.max(1, resolveFormula(effect.severity, ctx, target));
    await createCriticalStrikeMessage(target, ctx.attacker, weapon, null, "kata", {
      severity,
      mitigationTn: effect.mitigationTn ?? null,
      ringDifficulty: effect.ringDifficulty ?? null,
      kataName: ctx.kata?.names?.[0] ?? null,
    });
    results.push({ target: target.name, severity });
  }
  return { type: "critical_strike", results };
}

/** Changes the targets' stance to the one chosen by the attacker (Open-Hand Style). */
async function applyForceStanceEffect(effect, ctx, targets) {
  const stance = effect.stance ?? ctx.chosenStance;
  if (!stance) return null;
  const applied = [];
  for (const target of targets) {
    try {
      await target.update({ "system.stance": stance });
      applied.push(target.name);
    } catch (e) {
      logWarn(`Could not change the stance of ${target.name}:`, e);
    }
  }
  return { type: "force_stance", stance, targets: applied };
}

/**
 * Unified dispatcher. `resistance_buff`, `critical_severity_boost` and
 * `condition_lock` used to exist ONLY inside applyPassiveKataOpportunity's
 * own if/else chain — they are now real handlers here too, so EFFECT_TYPES
 * is honest and a truly-unknown effect type is the only thing that falls to
 * the `default` branch in applyEffect.
 */
export const EFFECT_HANDLERS = {
  condition: applyConditionEffect,
  damage: applyDamageEffect,
  assistance: applyAssistanceEffect,
  resistance_roll: applyResistanceRollEffect,
  attack_tn_reduction: applyAttackTnReductionEffect,
  resistance_buff: applyResistanceBuffEffect,
  critical_severity_boost: applyCriticalSeverityBoostEffect,
  condition_lock: applyConditionLockEffect,
  critical_strike: applyCriticalStrikeEffect,
  force_stance: applyForceStanceEffect,
};
export const EFFECT_TYPES = Object.keys(EFFECT_HANDLERS);

/** Which onX buckets each effect type is legal in. Data for Task 6's registry integrity test — not enforced at runtime here. */
export const EFFECT_BUCKETS = {
  condition: ["onSuccess", "onExtraSuccesses", "onOpportunity", "onFailure", "onActivationFailure"],
  damage: ["onSuccess", "onExtraSuccesses", "onOpportunity", "onFailure", "onUse"],
  assistance: ["onSuccess"],
  resistance_roll: ["onSuccess", "onExtraSuccesses", "onOpportunity"],
  attack_tn_reduction: ["onSuccess", "onOpportunity"],
  resistance_buff: ["onOpportunity"],
  critical_severity_boost: ["onOpportunity"],
  condition_lock: ["onOpportunity"],
  critical_strike: ["onSuccess", "onOpportunity"],
  force_stance: ["onOpportunity", "onFailure"],
};

export const DURATION_EXPIRY = {
  immediate: null,
  until_next_turn: "expiresAfterCombatant",
  until_end_of_next_turn: "expiresEndOfTurnCombatant",
  scene: null,
};
export const DURATIONS = Object.keys(DURATION_EXPIRY);

/**
 * Stores a timed kata effect on an actor's flags for later cleanup.
 */
export async function storeActiveKataEffect(actor, effectData) {
  const existing = actor.getFlag(MODULE_ID, "activeKataEffects") || [];
  await actor.setFlag(MODULE_ID, "activeKataEffects", [...existing, effectData]);
}

/**
 * Removes an effect's associated status (if any), shared by
 * processExpiredKataEffects and processEndOfTurnKataEffects (bug #10 fix:
 * previously only the "until_next_turn" path honored `statusId` at all, so a
 * timed condition keyed to "until_end_of_next_turn" was never removed).
 */
async function removeEffectStatus(actor, effect) {
  if (!effect.statusId) return;
  try {
    await actor.toggleStatusEffect(effect.statusId, { active: false });
  } catch (e) {
    logWarn(`Could not remove effect ${effect.statusId} from ${actor.name}:`, e);
  }
}

/**
 * Undoes one timed resistance_buff, from either expiry path. Sign-symmetric:
 * a negative buff (Striking as Water) must return to 0 from below.
 */
async function revertResistanceBuff(actor, effect) {
  if (!effect.amount) return;
  const current = actor.getFlag(MODULE_ID, "resistanceBuff") || 0;
  const newAmount = current - effect.amount;
  if (newAmount === 0) {
    await actor.unsetFlag(MODULE_ID, "resistanceBuff");
  } else {
    await actor.setFlag(MODULE_ID, "resistanceBuff", newAmount);
  }
  await removeKataTokenAura(actor);
  await removeResistanceActiveEffects(actor);
}

/**
 * Removes all activeKataEffects that expire when combatantActorId takes their turn.
 */
export async function processExpiredKataEffects(combatantActorId) {
  const expiryField = DURATION_EXPIRY.until_next_turn;
  for (const actor of kataEffectActors()) {
    const effects = actor.getFlag(MODULE_ID, "activeKataEffects") || [];
    const expiring = effects.filter((e) => e[expiryField] === combatantActorId);
    if (expiring.length === 0) continue;

    for (const effect of expiring) {
      await removeEffectStatus(actor, effect);
      // BUG #9 FIX: guard and arithmetic are sign-symmetric now — a negative
      // resistance_buff (e.g. Striking as Water) must be able to expire back
      // up to 0 from below, not just a positive buff decaying down to 0.
      if (effect.type === "resistance_buff") await revertResistanceBuff(actor, effect);
      if (effect.type === "attack_tn_reduction") {
        await actor.unsetFlag(MODULE_ID, "pendingTnReduction");
        await removeTnReductionActiveEffect(actor);
      }
    }

    const remaining = effects.filter((e) => e[expiryField] !== combatantActorId);
    await actor.setFlag(MODULE_ID, "activeKataEffects", remaining);
  }
}

/**
 * Removes all activeKataEffects that expire when combatantActorId ENDS their turn.
 * Called right after the next combatant starts (combat.previous).
 */
export async function processEndOfTurnKataEffects(combatantActorId) {
  const expiryField = DURATION_EXPIRY.until_end_of_next_turn;
  for (const actor of kataEffectActors()) {
    const effects = actor.getFlag(MODULE_ID, "activeKataEffects") || [];
    const expiring = effects.filter((e) => e[expiryField] === combatantActorId);
    if (expiring.length === 0) continue;

    for (const effect of expiring) {
      // BUG #10 FIX: honor statusId here too, same as processExpiredKataEffects.
      await removeEffectStatus(actor, effect);
      if (effect.type === "resistance_buff") await revertResistanceBuff(actor, effect);
      if (effect.type === "critical_severity_boost") {
        await actor.unsetFlag(MODULE_ID, "pendingCriticalSeverityBoost");
        await removeCriticalSeverityBoostActiveEffect(actor);
      }
      if (effect.type === "condition_lock") {
        await removeConditionLockActiveEffects(actor);
      }
    }

    const remaining = effects.filter((e) => e[expiryField] !== combatantActorId);
    await actor.setFlag(MODULE_ID, "activeKataEffects", remaining);
  }
}

/**
 * Removes ALL activeKataEffects from all actors (called on combat end).
 */
export async function clearAllKataEffects() {
  for (const actor of kataEffectActors()) {
    const effects = actor.getFlag(MODULE_ID, "activeKataEffects") || [];

    // BUG #11 FIX: these three cleanups must run for every actor regardless
    // of whether they have any `activeKataEffects` recorded — an actor whose
    // effect record was already gone (e.g. a stray flag left by an earlier
    // bug, or a flag set outside the activeKataEffects bookkeeping) must not
    // keep an orphaned resistanceBuff/pendingTnReduction/
    // pendingCriticalSeverityBoost flag past combat end. Moved above the
    // `effects.length === 0` early-continue below.
    const hasBuff = actor.getFlag(MODULE_ID, "resistanceBuff");
    if (hasBuff) await actor.unsetFlag(MODULE_ID, "resistanceBuff");
    const hasTnReduction = actor.getFlag(MODULE_ID, "pendingTnReduction");
    if (hasTnReduction) {
      await actor.unsetFlag(MODULE_ID, "pendingTnReduction");
      await removeTnReductionActiveEffect(actor);
    }
    const hasSeverityBoost = actor.getFlag(MODULE_ID, "pendingCriticalSeverityBoost");
    if (hasSeverityBoost) {
      await actor.unsetFlag(MODULE_ID, "pendingCriticalSeverityBoost");
      await removeCriticalSeverityBoostActiveEffect(actor);
    }

    if (effects.length === 0) continue;
    for (const effect of effects) {
      if (effect.statusId) {
        try {
          await actor.toggleStatusEffect(effect.statusId, { active: false });
        } catch (e) {
          logWarn("Could not remove effect on combat end:", e);
        }
      }
    }
    await actor.unsetFlag(MODULE_ID, "activeKataEffects");
    await removeConditionLockActiveEffects(actor);
  }
  await clearAllKataTokenAuras();
}

/**
 * Applies the opportunity effects of a passive kata (e.g. Striking as Earth).
 * Amount is determined by how many opportunities the player chose to spend.
 *
 * Thin adapter: builds a synthetic ctx and delegates every effect to
 * applyEffect, instead of re-implementing resistance_buff/critical_severity_
 * boost/condition_lock handling inline. Public signature is unchanged, so
 * kata-activation.ts's call site does not need to change.
 */
export async function applyPassiveKataOpportunity(
  kata,
  attacker,
  opportunitiesSpent,
  assignedTargets = [],
  chosenCondition = null,
  roll = {},
) {
  const oppDef = kata.onOpportunity?.[roll.oppIndex ?? 0];
  if (!oppDef) return null;

  // `roll` carries what the card persisted from the triggering roll
  // (weapon, skill, TN, successes, chosen stance), so formulas such as
  // weapon_base / attacker_roll_skill_rank resolve against the real attack.
  const ctx = {
    attacker,
    targets: assignedTargets,
    extraSuccesses: Math.max(0, (roll.totalSuccess ?? 0) - (roll.tn ?? 0)),
    opportunitiesSpent,
    tn: roll.tn ?? 0,
    totalSuccess: roll.totalSuccess ?? 0,
    weapon: roll.weapon ?? null,
    resistance: null,
    kata,
    chosenCondition,
    chosenStance: roll.chosenStance ?? null,
    rollSkillId: roll.skillId ?? null,
    costStep: oppDef.costStep ?? 1,
    sourceMessageId: null,
    l5rData: null,
  };

  const results = [];
  for (const effect of oppDef.effects) {
    const effectTargets = resolveTargets(effect.target ?? "target", ctx);
    const summary = await applyEffect(effect, ctx, effectTargets);
    if (summary) results.push(summary);
  }
  return results;
}

/**
 * Main entry point: executes a Kata after its roll is evaluated.
 *
 * BUG #2 FIX: no longer recomputes its own `tn` — it trusts `ctx.tn`, which
 * the caller (kata-activation.ts) already computed with any pending TN
 * reduction applied.
 */
export async function executeKata(kata, ctx) {
  const success = ctx.totalSuccess >= ctx.tn;

  if (!success) {
    // "Si fallas, ..." effects (Heartpiercing Strike: the attacker is Disoriented).
    const failureSummaries = [];
    for (const effect of kata.onFailure ?? []) {
      const effectTargets = resolveTargets(effect.target ?? "target", ctx);
      const summary = await applyEffect(effect, ctx, effectTargets);
      if (summary) failureSummaries.push(summary);
    }
    await createKataFailureMessage(kata, ctx.attacker, ctx.totalSuccess, ctx.tn, failureSummaries);
    return;
  }

  const effectSummaries = [];

  for (const effect of kata.onSuccess) {
    const effectTargets = resolveTargets(effect.target ?? "target", ctx);
    const summary = await applyEffect(effect, ctx, effectTargets);
    if (summary) effectSummaries.push(summary);
  }

  if (kata.onExtraSuccesses && ctx.extraSuccesses >= kata.onExtraSuccesses.threshold) {
    for (const effect of kata.onExtraSuccesses.effects) {
      const effectTargets = resolveTargets(effect.target ?? "target", ctx);
      const summary = await applyEffect(effect, ctx, effectTargets);
      if (summary) effectSummaries.push(summary);
    }
  }

  const opportunities = ctx.l5rData?.summary?.opportunity || 0;
  const hasOpportunity = opportunities > 0 && (kata.onOpportunity?.length ?? 0) > 0;

  await createKataSuccessMessage(
    kata,
    ctx.attacker,
    ctx.targets,
    ctx.totalSuccess,
    ctx.extraSuccesses,
    ctx.tn,
    effectSummaries,
    hasOpportunity ? kata.onOpportunity : null,
    ctx.sourceMessageId,
    opportunities,
    ctx.tnReduction ?? 0,
    ctx.weapon,
  );
}

/**
 * Executes the onOpportunity effects of a Kata (called from button handler).
 *
 * The caller (kata-activation.ts) builds `ctx` from persisted chat-message
 * flags, which don't carry the Kata definition itself or how many
 * opportunities this activation spends — so this function fills both in on
 * `ctx` once it resolves `kata`, mirroring how executeKata already has
 * `ctx.kata` available. Effects reached from this path (resistance_buff's
 * ring lookup, the opportunities_spent formula source, the
 * plusOpportunitiesSpent modifier, ...) depend on both being real instead of
 * null/0.
 */
export async function executeKataOpportunity(kataName, ctx, opportunityIndex = 0) {
  const kata = KATA_REGISTRY.find((k) => k.names.includes(kataName));
  if (!kata || !kata.onOpportunity?.[opportunityIndex]) return;

  const oppDef = kata.onOpportunity[opportunityIndex];
  ctx.kata = kata;
  // Active-kata onOpportunity buttons have a single fixed cost (unlike
  // passive katas, where the player picks how many to spend) — honor an
  // explicitly-set nonzero ctx.opportunitiesSpent first, for any future
  // caller that already knows the real spent amount.
  ctx.opportunitiesSpent = ctx.opportunitiesSpent || oppDef.cost || 0;

  const summaries = [];
  for (const effect of oppDef.effects) {
    const effectTargets = resolveTargets(effect.target ?? "target", ctx);
    const summary = await applyEffect(effect, ctx, effectTargets);
    if (summary) summaries.push(summary);
  }
  return summaries;
}
