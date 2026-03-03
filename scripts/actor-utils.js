/**
 * Utility helpers for reading and modifying Actor data in a schema-tolerant way.
 *
 * These functions attempt to resolve values from multiple possible data paths
 * to remain compatible with variations of the L5R5e system structure or
 * potential future schema changes.
 */

/**
 * Returns the actor's Endurance value.
 *
 * Resolution order:
 * 1. system.endurance.value (primary structured format)
 * 2. system.endurance (numeric legacy format)
 * 3. system.attributes.endurance (alternate schema layout)
 * 4. Derived fallback: Earth ring + Fire ring (rules-based calculation)
 *
 * This layered lookup ensures compatibility across different
 * actor data shapes and future system updates.
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
 * Returns the actor's current Fatigue value.
 *
 * Attempts multiple resolution paths to support variations in
 * actor data structure across system versions:
 * 1. system.fatigue.value
 * 2. system.fatigue (numeric)
 * 3. system.attributes.fatigue
 *
 * Defaults to 0 if no valid field is found.
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
 * Checks:
 * 1. Token status icons (status set)
 * 2. Active effects with name or label containing "incapacitated"
 *
 * This dual check ensures detection whether the condition is applied
 * via status markers or Active Effects.
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
 * Determines whether the actor is in a critical state.
 *
 * An actor is considered critical if:
 * - They are already Incapacitated, OR
 * - Their current Fatigue exceeds their Endurance threshold.
 *
 * This reflects the L5R5e damage escalation logic.
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
 * Returns the actor's current Void Points.
 *
 * Currently resolves from:
 * - system.void_points.value
 *
 * Returns 0 if the actor is null or the field is not present.
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
 * Throws:
 * - Error if the actor has no Void Points remaining.
 * - Error if the Void field cannot be resolved.
 *
 * Updates the actor document safely using a dynamic data path.
 */
export async function spendVoidPoint(actor) {
  let voidField = null;
  let currentVoid = getVoidPoints(actor);

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
 * Resolves the appropriate Fatigue data path dynamically and
 * subtracts the provided damage amount, never dropping below 0.
 *
 * Throws an error if no valid Fatigue field can be found.
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
