/**
 * Critical Effects Table for L5R5e
 *
 * Defines the possible results of a Critical Strike based on the final
 * calculated severity after mitigation. Each entry represents a severity
 * range and describes the narrative and mechanical effects that must be
 * applied to the target.
 *
 * Based on: "Table 6–6: Critical Strike Results by Severity"
 *
 * Each table entry contains:
 * - Severity range (minSeverity / maxSeverity)
 * - Effect key for localization
 * - Mechanical instructions used by the module to apply conditions,
 *   armor damage, scars, or death.
 */

/**
 * Critical Effects Table (Raw Data)
 *
 * The system will search this table to determine which effect applies
 * based on the final severity value produced by a critical strike.
 *
 * Structure of each entry:
 * {
 *   minSeverity: number,
 *   maxSeverity: number,
 *   nameKey: string,        // Localization key for effect name
 *   effectKey: string,      // Localization key for effect description
 *   mechanicalEffect: {
 *     type: string,
 *     ...additional fields depending on type
 *   }
 * }
 *
 * Supported mechanicalEffect types:
 * - "armor_damaged"
 * - "condition"
 * - "permanent_scar"
 * - "dying"
 * - "instant_death"
 *
 * @type {Array<Object>}
 */
const CRITICAL_EFFECTS_TABLE_RAW = [
  {
    minSeverity: 0,
    maxSeverity: 2,
    nameKey: "closeCall",
    effectKey: "closeCallEffect",
    mechanicalEffect: {
      type: "armor_damaged",
      armorDamaged: true,
    },
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
        {
          condition: "weapon_sharp",
          applies: ["bleeding"],
        },
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
        {
          condition: "weapon_sharp",
          applies: ["bleeding"],
        },
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
    mechanicalEffect: {
      type: "instant_death",
      conditions: ["dead"],
    },
  },
];

/**
 * Retrieves the appropriate critical effect entry based on severity.
 *
 * The function iterates through the CRITICAL_EFFECTS_TABLE_RAW and returns
 * the first entry whose severity range includes the provided value.
 * The returned object includes localized name and effect description.
 *
 * If the severity exceeds all defined ranges, the final table entry
 * (Instant Death) is returned as a fallback.
 *
 * @param {number} severity Final calculated severity after mitigation rolls.
 * @returns {Object} The critical effect table entry with localized name and effect.
 */
export function getCriticalEffect(severity) {
  const i18n = game.i18n;

  for (let effect of CRITICAL_EFFECTS_TABLE_RAW) {
    if (severity >= effect.minSeverity && severity <= effect.maxSeverity) {
      return {
        ...effect,
        name: i18n.localize(
          `l5r5e-combat-helper.criticalEffects.${effect.nameKey}`,
        ),
        effect: i18n.localize(
          `l5r5e-combat-helper.criticalEffects.${effect.effectKey}`,
        ),
      };
    }
  }

  const fallback =
    CRITICAL_EFFECTS_TABLE_RAW[CRITICAL_EFFECTS_TABLE_RAW.length - 1];
  return {
    ...fallback,
    name: i18n.localize(
      `l5r5e-combat-helper.criticalEffects.${fallback.nameKey}`,
    ),
    effect: i18n.localize(
      `l5r5e-combat-helper.criticalEffects.${fallback.effectKey}`,
    ),
  };
}

/**
 * Determines whether a weapon has the Razor-Edged (Sharp) quality.
 *
 * Certain critical effects apply additional conditions (such as Bleeding)
 * if the attacking weapon possesses the Razor-Edged property. This helper
 * inspects the weapon's property list to determine whether that quality
 * is present.
 *
 * @param {Item|null} weapon The weapon used in the attack.
 * @returns {boolean} True if the weapon has the Razor-Edged property.
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
