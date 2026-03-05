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
    throw new Error("No void points available");
  }

  if (actor.system.void_points?.value !== undefined) {
    voidField = "system.void_points.value";
  }

  if (voidField === null) {
    throw new Error("Could not find void field in actor");
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
    throw new Error("Could not find fatigue field in actor");
  }

  const newFatigue = Math.max(0, currentFatigue - damage);

  const updateData = {};
  updateData[fatigueField] = newFatigue;

  await actor.update(updateData);
}
