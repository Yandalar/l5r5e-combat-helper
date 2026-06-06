// @ts-nocheck

/**
 * Calculates the target number bonus from Air stance.
 *
 * Returns a bonus of 0 if the target is not in Air stance, 1 if school rank is below 4, or 2 if rank is 4 or higher.
 *
 * @param {Object} target - The target actor object.
 * @returns {number} The TN bonus (0, 1, or 2).
 */
export function getAirTNBonus(target) {
  if (!target || target.system.stance !== "air") return 0;
  const rank = parseInt(target.system.identity?.school_rank) || 0;
  return rank >= 4 ? 2 : 1;
}

/**
 * Calculates the strife bonus from Fire stance.
 *
 * Returns the strife count from l5rData.summary.strife if the attacker is in Fire stance, otherwise returns 0.
 *
 * @param {Object} attacker - The attacker actor object.
 * @param {Object} l5rData - The l5r data object containing summary.strife.
 * @returns {number} The strife count bonus (0 or greater).
 */
export function getFireStrifeBonus(attacker, l5rData) {
  if (!attacker || attacker.system.stance !== "fire") return 0;
  return parseInt(l5rData?.summary?.strife) || 0;
}

/**
 * Checks if the target is protected by Earth stance.
 *
 * @param {Object} target - The target actor object.
 * @returns {boolean} True if the target is in Earth stance, false otherwise.
 */
export function isEarthStanceProtected(target) {
  if (!target) return false;
  return target.system.stance === "earth";
}
