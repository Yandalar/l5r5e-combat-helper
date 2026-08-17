// @ts-nocheck
/**
 * Weapon Lookup Utilities
 *
 * Centralizes the "which weapon is this attack using" logic that was
 * previously duplicated (with subtle inconsistencies) across combat-handler,
 * the reaction modules, damage-calculator, and technique-engine.
 */

export function isEquippedWeapon(item) {
  return item?.type === "weapon" && (item.system?.equipped === true || item.system?.readied === true);
}

export function getEquippedWeapons(actor) {
  if (!actor?.items) return [];
  return actor.items.filter(isEquippedWeapon);
}

export function getEquippedWeapon(actor) {
  return getEquippedWeapons(actor)[0] ?? null;
}

/** The second distinct equipped/readied weapon, excluding `exclude` by id (for dual-wield kata). */
export function getSecondaryWeapon(actor, exclude = null) {
  const weapons = getEquippedWeapons(actor);
  return weapons.find((w) => w.id !== exclude?.id && w !== exclude) ?? null;
}

/** The weapon a roll's own item represents, if it's a weapon; otherwise the attacker's equipped weapon. */
export function resolveAttackWeapon(l5rData, attacker) {
  if (l5rData?.item?.type === "weapon") return l5rData.item;
  return getEquippedWeapon(attacker);
}

export function getWeaponBaseDamage(weapon, fallback = 0) {
  const v = parseInt(weapon?.system?.damage);
  return Number.isNaN(v) ? fallback : v;
}

/**
 * BUG #7 FIX: template.json defaults weapon deadliness to 0. Two call sites in
 * chat-messages.ts previously disagreed on the fallback (one used no `|| 5`
 * guard at all and returned a raw 0, the other did `parseInt(...) || 5`) —
 * this is now the single source of truth. A deadliness of 0 is treated the
 * same as "unset" (template.json's default, not a real 0-deadliness weapon),
 * so it falls back too, same as a non-numeric value. Both former call sites
 * now agree and return the fallback of 5 for a deadliness-0 weapon.
 */
export function getWeaponDeadliness(weapon, fallback = 5) {
  if (!weapon || weapon.system?.deadliness === undefined) return fallback;
  const v = parseInt(weapon.system.deadliness);
  return v || fallback;
}
