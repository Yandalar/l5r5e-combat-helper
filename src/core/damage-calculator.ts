// @ts-nocheck
import { activeKihoOf } from "../techniques/kiho-registry";
import { resolveAttackWeapon, getWeaponBaseDamage } from "./weapon-utils";

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
 * @param {number} [tnBonus=0] - Optional modifier to add to the Target Number (e.g. from stance effects)
 * @returns {boolean} True if the attack succeeds, false otherwise.
 */
export function checkAttackSuccess(l5rData, tnBonus = 0) {
  const successes = l5rData.summary?.totalSuccess || 0;
  const tn = (l5rData.difficulty || 2) + tnBonus;

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
  const weapon = resolveAttackWeapon(l5rData, attacker);
  const baseDamage = getWeaponBaseDamage(weapon);

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
 * Physical by default; `type: "supernatural"` reads the armor's
 * supernatural resistance (kihō supernatural damage). Kata resistance buffs
 * only apply to physical resistance.
 *
 * @param {Actor} target - Actor receiving the attack
 * @param {"physical"|"supernatural"} [type] - Which armor resistance to read
 * @returns {number}
 * Armor resistance value of that type.
 */
export function getArmorResistance(target, type = "physical") {
  let resistance = 0;

  if (!target.items) {
    return resistance;
  }

  const equippedArmor = target.items.filter(
    (item) => item.type === "armor" && item.system?.equipped === true,
  );

  if (equippedArmor.length > 0) {
    const armor = equippedArmor[0];

    if (armor.system?.armor?.[type] !== undefined) {
      resistance = parseInt(armor.system.armor[type]) || 0;
    }
  }

  // Kata resistance buffs (Striking as Earth/Water) only affect physical resistance.
  if (type !== "physical") return resistance;

  const kataResistanceBuff =
    typeof target.getFlag === "function"
      ? target.getFlag("l5r5e-combat-helper", "resistanceBuff") || 0
      : 0;

  // Earthen Fist (kihō): +1 physical resistance while active.
  const kihoBonus = activeKihoOf(target)?.enhancement?.id === "earthenFist" ? 1 : 0;

  // A negative buff (Striking as Water) lowers armor, never below 0
  return Math.max(0, resistance + kataResistanceBuff + kihoBonus);
}
