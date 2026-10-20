// @ts-nocheck

/**
 * Status IDs recognized by the l5r5e system.
 * Verified against systems/l5r5e/scripts/config.js and types.js.
 */
export const L5R5E_STATUS_IDS = Object.freeze([
  "afflicted",
  "bleeding",
  "burning",
  "centered",
  "compromised",
  "dazed",
  "disoriented",
  "dying",
  "emboldened",
  "enraged",
  "exhausted",
  "illness_coughing_illness",
  "illness_fire_rash",
  "illness_gut_sickness",
  "illness_oozing_sore_disease",
  "illness_unsteady_illness",
  "immobilized",
  "incapacitated",
  "intoxicated",
  "possessed",
  "prone",
  "silenced",
  "unconscious",
  "lightly_wounded_earth",
  "lightly_wounded_air",
  "lightly_wounded_water",
  "lightly_wounded_fire",
  "lightly_wounded_void",
  "severely_wounded_earth",
  "severely_wounded_air",
  "severely_wounded_water",
  "severely_wounded_fire",
  "severely_wounded_void",
]);

/**
 * Maps internal condition names (used by critical-effects table and kata definitions)
 * to their corresponding l5r5e status IDs.
 *
 * Note: "dead" is not a status ID in the l5r5e system; it maps to "unconscious".
 */
export const CONDITION_STATUS_IDS = {
  lightly_wounded: (ring) => (ring ? `lightly_wounded_${ring}` : null),
  severely_wounded: (ring) => (ring ? `severely_wounded_${ring}` : null),
  bleeding: () => "bleeding",
  dying: () => "dying",
  dead: () => "unconscious",
  unconscious: () => "unconscious",
  incapacitated: () => "incapacitated",
};

/**
 * Resolves an internal condition name to its corresponding l5r5e status ID.
 *
 * @param {string} name - The internal condition name (e.g. "lightly_wounded", "dead")
 * @param {string|null} [ring] - Optional ring name for ring-dependent conditions
 * @returns {string|null} The resolved status ID, or null if the name is unknown
 */
export function resolveConditionStatusId(name, ring = null) {
  const resolver = CONDITION_STATUS_IDS[name];
  if (!resolver) return null;
  return resolver(ring);
}

/**
 * Checks if a status ID is valid in the l5r5e system.
 *
 * @param {string} id - The status ID to validate
 * @returns {boolean} True if the ID is recognized by the system
 */
export function isValidStatusId(id) {
  return L5R5E_STATUS_IDS.includes(id);
}

/**
 * Checks if an actor currently carries a condition/status.
 *
 * Checks both `actor.statuses` (primary path) and `actor.effects[].statuses`
 * (fallback path for systems that model statuses as ActiveEffect collections).
 *
 * @param {Actor|null} actor - The actor to check
 * @param {string} statusId - The status ID to look for
 * @returns {boolean} True if the actor has the condition via either path
 */
export function hasCondition(actor, statusId) {
  if (!actor) return false;
  if (actor.statuses?.has(statusId)) return true;
  return actor.effects?.some((e) => e.statuses?.has(statusId)) ?? false;
}
