/**
 * Damage Resolution Utilities
 *
 * Provides pure helper functions used during combat processing.
 * These utilities perform deterministic calculations based on
 * L5R5e roll data and actor equipment.
 *
 * Design principles:
 * - No document mutations
 * - No chat message creation
 * - No side effects
 *
 * Responsibilities:
 * - Determine if an attack roll succeeds
 * - Calculate attack damage output
 * - Retrieve armor mitigation values
 */

/**
 * Determines whether a martial attack roll succeeds.
 *
 * Success is evaluated by comparing the total number of rolled
 * successes against the Target Number (TN) of the attack.
 *
 * If roll data is incomplete, safe defaults are applied:
 * - totalSuccess defaults to 0
 * - TN defaults to 2
 *
 * @param {Object} l5rData - L5R5e roll metadata stored in the roll object
 * @param {Object} [l5rData.summary] - Roll summary data
 * @param {number} [l5rData.summary.totalSuccess] - Total successes rolled
 * @param {number} [l5rData.difficulty] - Target Number for the roll
 * @returns {boolean} True if the attack succeeds, false otherwise.
 */
export function checkAttackSuccess(l5rData) {
  const successes = l5rData.summary?.totalSuccess || 0;
  const tn = l5rData.difficulty || 2;

  return successes >= tn;
}

/**
 * Calculates the total damage dealt by a successful attack.
 *
 * Damage formula:
 *
 *   Total Damage = Weapon Base Damage + Bonus Successes
 *
 * Where:
 * - Weapon Base Damage is taken from the first equipped or readied weapon.
 * - Bonus Successes = max(0, totalSuccess - TN)
 *
 * Assumptions:
 * - Only the first valid weapon is considered.
 * - If no weapon is found, base damage defaults to 0.
 * - Weapon damage values are parsed as integers.
 *
 * This function does NOT apply armor mitigation.
 * Armor reduction is handled separately during damage resolution.
 *
 * @param {Object} l5rData - L5R5e roll metadata
 * @param {Actor} attacker - Actor performing the attack
 * @returns {number} Total calculated damage before armor mitigation.
 */
export function calculateDamage(l5rData, attacker) {
  let baseDamage = 0;

  if (attacker.items) {
    const equippedWeapons = attacker.items.filter(
      (item) =>
        item.type === "weapon" &&
        (item.system?.equipped === true || item.system?.readied === true),
    );

    if (equippedWeapons.length > 0) {
      const weapon = equippedWeapons[0];
      baseDamage = parseInt(weapon.system?.damage) || 0;
    }
  }

  const successes = l5rData.summary?.totalSuccess || 0;
  const tn = l5rData.difficulty || 2;

  const bonusSuccesses = Math.max(0, successes - tn);

  return baseDamage + bonusSuccesses;
}

/**
 * Retrieves the physical armor resistance value of a target actor.
 *
 * Resolution strategy:
 * 1. Search the actor inventory for equipped armor items.
 * 2. Select the first valid equipped armor.
 * 3. Extract its physical resistance value.
 *
 * If no equipped armor is present, the function safely returns 0.
 *
 * Only physical resistance is evaluated here. Other resistance
 * types supported by the system (e.g., supernatural) are ignored.
 *
 * @param {Actor} target - Actor receiving the attack
 * @returns {number}
 * Physical armor resistance value.
 */
export function getArmorResistance(target) {
  let resistance = 0;

  if (!target.items) {
    return resistance;
  }

  const equippedArmor = target.items.filter(
    (item) => item.type === "armor" && item.system?.equipped === true,
  );

  if (equippedArmor.length > 0) {
    const armor = equippedArmor[0];

    if (armor.system?.armor?.physical !== undefined) {
      resistance = parseInt(armor.system.armor.physical) || 0;
    }
  }

  return resistance;
}
