// @ts-nocheck
/**
 * Actor Data Utilities
 *
 * Provides helper functions for safely reading and modifying Actor
 * data in a schema-tolerant way.
 *
 * These utilities attempt to resolve values from multiple possible
 * data paths in order to remain compatible with:
 *
 * - Variations of the L5R5e system schema
 * - Potential future system updates
 * - Legacy actor data structures
 *
 * Whenever possible, functions attempt resolution in a prioritized
 * order and gracefully fall back to alternate paths.
 */

/**
 * Retrieves the actor's Endurance value.
 *
 * Resolution order:
 * 1. system.endurance.value (structured modern format)
 * 2. system.endurance (numeric legacy format)
 * 3. system.attributes.endurance (alternate schema layout)
 * 4. Derived fallback: Earth ring + Fire ring
 *
 * The final fallback reflects the rules-based calculation of
 * Endurance when explicit values are unavailable.
 *
 * @param {Actor} target - Actor whose endurance should be resolved
 * @returns {number} Parsed endurance value. Returns 0 if no valid value can be determined.
 */
export function getEndurance(target) {
  let endurance = 0;

  if (target.system.endurance?.value !== undefined) {
    endurance = parseInt(target.system.endurance.value) || 0;
  } else if (
    target.system.endurance !== undefined &&
    typeof target.system.endurance === "number"
  ) {
    endurance = parseInt(target.system.endurance) || 0;
  } else if (target.system.attributes?.endurance !== undefined) {
    endurance = parseInt(target.system.attributes.endurance) || 0;
  } else if (target.system.rings?.earth !== undefined) {
    const earth = parseInt(target.system.rings.earth) || 0;
    const fire = parseInt(target.system.rings.fire) || 0;
    endurance = earth + fire;
  }

  return endurance;
}

/**
 * Retrieves the actor's current Fatigue value.
 *
 * Resolution order:
 * 1. system.fatigue.value
 * 2. system.fatigue (numeric legacy format)
 * 3. system.attributes.fatigue
 *
 * @param {Actor} target - Actor whose fatigue value should be resolved
 * @returns {number} Current fatigue value. Returns 0 if no valid field is found.
 */
export function getCurrentFatigue(target) {
  let currentFatigue = 0;

  if (target.system.fatigue?.value !== undefined) {
    currentFatigue = parseInt(target.system.fatigue.value) || 0;
  } else if (
    target.system.fatigue !== undefined &&
    typeof target.system.fatigue === "number"
  ) {
    currentFatigue = parseInt(target.system.fatigue) || 0;
  } else if (target.system.attributes?.fatigue !== undefined) {
    currentFatigue = parseInt(target.system.attributes.fatigue) || 0;
  }

  return currentFatigue;
}

/**
 * Determines whether the actor currently has the Incapacitated condition.
 *
 * Detection methods:
 * 1. Token status icons (status set)
 * 2. Active Effects containing "incapacitated" in name or label
 *
 * This dual detection ensures compatibility with systems that apply
 * conditions via status markers or Active Effects.
 *
 * @param {Actor} target - Actor to evaluate
 * @returns {boolean} True if the actor is incapacitated.
 */
export function isIncapacitated(target) {
  if (target.statuses && target.statuses.has("incapacitated")) {
    return true;
  }

  if (target.effects) {
    const hasIncapacitatedEffect = target.effects.find(
      (effect) =>
        effect.name?.toLowerCase().includes("incapacitated") ||
        effect.label?.toLowerCase().includes("incapacitated"),
    );

    if (hasIncapacitatedEffect) {
      return true;
    }
  }

  return false;
}

/**
 * Determines whether the actor has reached a critical state.
 *
 * An actor is considered in a critical state if:
 * - They are already Incapacitated, OR
 * - Their current Fatigue exceeds their Endurance.
 *
 * This mirrors the L5R5e escalation rule where exceeding endurance
 * places the character into a critical condition state.
 *
 * @param {Actor} target - Actor to evaluate
 * @returns {boolean} True if the actor is at a critical state.
 */
export function isAtCriticalState(target) {
  if (isIncapacitated(target)) {
    return true;
  }

  const currentFatigue = getCurrentFatigue(target);
  const endurance = getEndurance(target);

  return currentFatigue > endurance;
}

/**
 * Retrieves the actor's current Void Points.
 *
 * Currently resolved from:
 * - system.void_points.value
 *
 * @param {Actor} actor - Actor whose Void Points should be read
 * @returns {number} Current Void Points. Returns 0 if the actor or field is missing.
 */
export function getVoidPoints(actor) {
  if (!actor) return 0;

  let voidPoints = 0;

  if (actor.system.void_points?.value !== undefined) {
    voidPoints = parseInt(actor.system.void_points.value) || 0;
  }

  return voidPoints;
}

/**
 * Consumes one Void Point from the actor.
 *
 * Performs a safe actor document update by dynamically resolving
 * the correct data path before modifying the value.
 *
 * @param {Actor} actor - Actor spending the Void Point
 * @returns {Promise<void>}
 */
export async function spendVoidPoint(actor) {
  let voidField = null;
  const currentVoid = getVoidPoints(actor);

  if (currentVoid <= 0) {
    throw new Error(
      game.i18n.localize("l5r5e-combat-helper.notifications.noVoidPoints"),
    );
  }

  if (actor.system.void_points?.value !== undefined) {
    voidField = "system.void_points.value";
  }

  if (voidField === null) {
    throw new Error(
      game.i18n.localize("l5r5e-combat-helper.notifications.voidFieldNotFound"),
    );
  }

  const updateData = {};
  updateData[voidField] = Math.max(0, currentVoid - 1);

  await actor.update(updateData);
}

/**
 * Reverts previously applied Fatigue damage.
 *
 * This function is used when an effect (such as spending a Void Point
 * to accept a Critical Strike) cancels previously applied fatigue.
 *
 * The function dynamically resolves the fatigue data path and
 * subtracts the specified damage amount.
 *
 * Fatigue will never be reduced below zero.
 *
 * @param {Actor} actor - Actor whose fatigue should be restored
 * @param {number} damage - Amount of fatigue to revert
 * @returns {Promise<void>}
 */
export async function revertFatigueDamage(actor, damage) {
  const currentFatigue = getCurrentFatigue(actor);
  let fatigueField = null;

  if (actor.system.fatigue?.value !== undefined) {
    fatigueField = "system.fatigue.value";
  } else if (
    actor.system.fatigue !== undefined &&
    typeof actor.system.fatigue === "number"
  ) {
    fatigueField = "system.fatigue";
  } else if (actor.system.attributes?.fatigue !== undefined) {
    fatigueField = "system.attributes.fatigue";
  }

  if (fatigueField === null) {
    throw new Error(
      game.i18n.localize(
        "l5r5e-combat-helper.notifications.fatigueFieldNotFound",
      ),
    );
  }

  const newFatigue = Math.max(0, currentFatigue - damage);

  const updateData = {};
  updateData[fatigueField] = newFatigue;

  await actor.update(updateData);
}

/**
 * Silhouette — the l5r5e system does NOT define system.silhouette anywhere
 * (verified against the installed system's template.json; every module
 * read of it before this function existed always returned the fallback of 1).
 * Resolution order:
 *   1. actor flag "l5r5e-combat-helper"."silhouette" (GM-set, via a context
 *      menu — out of scope for this task, just read the flag)
 *   2. system.silhouette (future-proofing, in case the system adds it later)
 *   3. derived from prototypeToken.width — heuristic, not an official l5r5e
 *      rule: width>=4 → 5, width>=3 → 4, width>=2 → 3, else → 2
 *   4. default 2 (Medium/human)
 */
export function getSilhouette(actor) {
  if (!actor) return 2;
  const flagged = actor.getFlag?.("l5r5e-combat-helper", "silhouette");
  if (typeof flagged === "number") return flagged;

  if (actor.system?.silhouette !== undefined) {
    const v = parseInt(actor.system.silhouette);
    if (!Number.isNaN(v)) return v;
  }

  const width = actor.prototypeToken?.width;
  if (typeof width === "number") {
    if (width >= 4) return 5;
    if (width >= 3) return 4;
    if (width >= 2) return 3;
  }

  return 2;
}

export function getStrife(actor) {
  if (!actor) return 0;
  if (actor.system?.strife?.value !== undefined) return parseInt(actor.system.strife.value) || 0;
  if (typeof actor.system?.strife === "number") return parseInt(actor.system.strife) || 0;
  return 0;
}

export function getMaxStrife(actor) {
  if (!actor) return 0;
  return parseInt(actor.system?.strife?.max) || 0;
}

/**
 * l5r5e has no explicit "honor rank" field — system.social.honor is a flat
 * 0-100 number. Rank is the tens digit, clamped to [0, 10].
 */
export function getHonorRank(actor) {
  if (!actor) return 0;
  const honor = parseInt(actor.system?.social?.honor) || 0;
  return Math.max(0, Math.min(10, Math.floor(honor / 10)));
}

export function getVigilance(actor) {
  if (!actor) return 0;
  if (actor.system?.vigilance?.value !== undefined) return parseInt(actor.system.vigilance.value) || 0;
  return parseInt(actor.system?.vigilance) || 0;
}

/**
 * PC actors: system.skills.<category>.<skillId> (needs SKILL_CATEGORY_MAP
 * from kata-registry.ts to find the category). NPC actors: system.skills.<category>
 * is a flat number — there is no per-skill rank, so the category's rank
 * stands in for every skill in it.
 */
export function getSkillRank(actor, skillId, skillCategoryMap) {
  if (!actor) return 0;
  const category = skillCategoryMap[skillId] ?? "martial";
  if (actor.type === "npc") {
    return parseInt(actor.system?.skills?.[category]) || 0;
  }
  return parseInt(actor.system?.skills?.[category]?.[skillId]) || 0;
}

/** The dot-path this actor's fatigue lives at, or null if none resolves. */
export function resolveFatigueField(actor) {
  if (actor.system.fatigue?.value !== undefined) return "system.fatigue.value";
  if (actor.system.fatigue !== undefined && typeof actor.system.fatigue === "number") return "system.fatigue";
  if (actor.system.attributes?.fatigue !== undefined) return "system.attributes.fatigue";
  return null;
}

/**
 * Adds `delta` to the actor's fatigue (negative delta reduces it), clamped
 * at 0, and returns the new value. Throws a localized Error if no fatigue
 * field can be resolved — same failure behavior as the pre-existing
 * revertFatigueDamage, now shared by every fatigue writer in the module.
 */
export async function applyFatigue(actor, delta) {
  const field = resolveFatigueField(actor);
  if (!field) {
    throw new Error(game.i18n.localize("l5r5e-combat-helper.notifications.fatigueFieldNotFound"));
  }
  const current = getCurrentFatigue(actor);
  const next = Math.max(0, current + delta);
  await actor.update({ [field]: next });
  return next;
}

export function resolveStrifeField(actor) {
  if (actor.system.strife?.value !== undefined) return "system.strife.value";
  if (typeof actor.system.strife === "number") return "system.strife";
  return null;
}

export async function applyStrife(actor, delta) {
  const field = resolveStrifeField(actor);
  if (!field) {
    throw new Error(game.i18n.localize("l5r5e-combat-helper.notifications.strifeFieldNotFound"));
  }
  const current = getStrife(actor);
  const next = Math.max(0, current + delta);
  await actor.update({ [field]: next });
  return next;
}
