/**
 * Damage resolution utilities.
 *
 * Contains pure calculation helpers used during combat processing.
 * These functions do not mutate documents or create chat messages.
 * They strictly evaluate attack success, damage output, and armor mitigation
 * based on L5R5e roll data and actor equipment.
 */

/**
 * Determines whether a martial attack roll succeeds.
 *
 * Success is calculated by comparing the total rolled successes
 * against the attack's Target Number (TN).
 *
 * Returns:
 * - true  → if totalSuccess ≥ TN
 * - false → otherwise
 *
 * Defaults:
 * - totalSuccess = 0 if not present
 * - TN = 2 if not specified in roll data
 */
export function checkAttackSuccess(l5rData) {
  const successes = l5rData.summary?.totalSuccess || 0;
  const tn = l5rData.difficulty || 2;
  const success = successes >= tn;

  return success;
}

/**
 * Calculates total damage dealt by a successful attack.
 *
 * Damage formula:
 *   Base Weapon Damage + Bonus Successes
 *
 * Where:
 * - Base Weapon Damage is taken from the first equipped or readied weapon.
 * - Bonus Successes = max(0, totalSuccess - TN)
 *
 * Assumptions & Limitations:
 * - Only the first valid equipped/readied weapon is considered.
 * - If no weapon is found, base damage defaults to 0.
 * - Damage value is parsed as integer.
 *
 * This function does not apply armor mitigation. That is handled separately.
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

  const totalDamage = baseDamage + bonusSuccesses;

  return totalDamage;
}

/**
 * Retrieves the target's physical armor resistance value.
 *
 * Resolution:
 * - Selects the first equipped armor item.
 * - Reads its physical resistance value.
 *
 * Returns:
 * - The parsed resistance value (integer)
 * - 0 if no equipped armor is found or no valid value exists
 *
 * Note:
 * Only physical resistance is considered. Other resistance types
 * (e.g., supernatural) are not evaluated here.
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
