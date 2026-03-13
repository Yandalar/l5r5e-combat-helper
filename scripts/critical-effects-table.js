/**
 * Critical Effects Table for L5R5e
 *
 * The critical effects table is fixed. The GM may configure which compendium
 * items are used for permanent scars via Module Settings → "Configure Scars".
 */

/**
 * Default Critical Effects Table.
 * Exported for use by CustomCriticalConfig (reset) and getCriticalEffect (fallback).
 * @type {Array<Object>}
 */
export const DEFAULT_CRITICAL_TABLE = [
  {
    minSeverity: 0,
    maxSeverity: 2,
    nameKey: "closeCall",
    effectKey: "closeCallEffect",
    mechanicalEffect: { type: "armor_damaged", armorDamaged: true },
  },
  {
    minSeverity: 3,
    maxSeverity: 4,
    nameKey: "fleshWound",
    effectKey: "fleshWoundEffect",
    mechanicalEffect: {
      type: "condition",
      conditions: ["lightly_wounded"],
      conditionalConditions: [
        { condition: "weapon_sharp", applies: ["bleeding"] },
      ],
    },
  },
  {
    minSeverity: 5,
    maxSeverity: 6,
    nameKey: "debilitatingGash",
    effectKey: "debilitatingGashEffect",
    mechanicalEffect: {
      type: "condition",
      conditions: ["severely_wounded"],
      conditionalConditions: [
        { condition: "weapon_sharp", applies: ["bleeding"] },
      ],
    },
  },
  {
    minSeverity: 7,
    maxSeverity: 8,
    nameKey: "permanentInjury",
    effectKey: "permanentInjuryEffect",
    mechanicalEffect: {
      type: "permanent_scar",
      conditions: ["bleeding"],
      scarChoices: {
        air: ["Nerve Damage", "Maimed Visage"],
        earth: ["Fractured Spine", "Damaged Organ"],
        fire: ["Maimed Arm", "Lost Fingers"],
        water: ["Lost Eye", "Lost Foot"],
        void: ["Lost Memories"],
      },
    },
  },
  {
    minSeverity: 9,
    maxSeverity: 11,
    nameKey: "maimingBlow",
    effectKey: "maimingBlowEffect",
    mechanicalEffect: {
      type: "permanent_scar",
      conditions: ["bleeding"],
      scarChoices: {
        air: ["Muteness", "Deafness"],
        earth: ["Damaged Heart", "Damaged Organ"],
        fire: ["Lost Arm", "Lost Hand"],
        water: ["Lost Leg", "Blindness"],
        void: ["Cognitive Lapses"],
      },
    },
  },
  {
    minSeverity: 12,
    maxSeverity: 13,
    nameKey: "agonizingDeath",
    effectKey: "agonizingDeathEffect",
    mechanicalEffect: {
      type: "dying",
      conditions: ["severely_wounded", "bleeding", "dying_3"],
      dyingRounds: 3,
    },
  },
  {
    minSeverity: 14,
    maxSeverity: 15,
    nameKey: "swiftDeath",
    effectKey: "swiftDeathEffect",
    mechanicalEffect: {
      type: "dying",
      conditions: ["severely_wounded", "bleeding", "dying_1"],
      dyingRounds: 1,
    },
  },
  {
    minSeverity: 16,
    maxSeverity: 999,
    nameKey: "instantDeath",
    effectKey: "instantDeathEffect",
    mechanicalEffect: { type: "instant_death", conditions: ["dead"] },
  },
];

/**
 * Default scar configuration.
 * rings values are empty — scar item names come from scarChoices in each
 * DEFAULT_CRITICAL_TABLE entry. When the GM customizes this, the per-ring
 * lists here REPLACE the scarChoices in all permanent_scar entries.
 * @type {{ compendium: string, rings: Object<string, string[]> }}
 */
export const DEFAULT_SCAR_CONFIG = {
  compendium: "l5r5e.core-peculiarities-adversities",
  rings: {
    air: [],
    earth: [],
    fire: [],
    water: [],
    void: [],
  },
};

/**
 * Returns the active critical table (custom or default).
 * @returns {Array<Object>}
 */
/**
 * Returns the active scar config (custom or default).
 * @returns {{ compendium: string, rings: Object<string, string[]> }}
 */
export function getActiveScarConfig() {
  const custom = game.settings.get("l5r5e-combat-helper", "customScarConfig");
  return custom || DEFAULT_SCAR_CONFIG;
}

/**
 * Retrieves the critical effect entry for a given severity from the default
 * table, with localized name and effect strings.
 *
 * @param {number} severity
 * @returns {Object}
 */
export function getCriticalEffect(severity) {
  const i18n = game.i18n;

  const resolve = (entry) => ({
    ...entry,
    name: i18n.localize(`l5r5e-combat-helper.criticalEffects.${entry.nameKey}`),
    effect: i18n.localize(
      `l5r5e-combat-helper.criticalEffects.${entry.effectKey}`,
    ),
  });

  for (const entry of DEFAULT_CRITICAL_TABLE) {
    if (severity >= entry.minSeverity && severity <= entry.maxSeverity) {
      return resolve(entry);
    }
  }

  return resolve(DEFAULT_CRITICAL_TABLE[DEFAULT_CRITICAL_TABLE.length - 1]);
}

/**
 * Determines whether a weapon has the Razor-Edged (Sharp) quality.
 *
 * @param {Item|null} weapon
 * @returns {boolean}
 */
export function isWeaponSharp(weapon) {
  if (!weapon) return false;
  const properties = weapon.system?.properties;
  if (!Array.isArray(properties)) return false;
  return properties.some(
    (prop) =>
      prop.name?.toLowerCase() === "razor-edged" ||
      prop.id === "L5RCorePro000001",
  );
}
