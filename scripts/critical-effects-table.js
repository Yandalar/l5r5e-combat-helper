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
 * - Human-readable effect name
 * - Narrative description of the effect
 * - Mechanical instructions used by the module to apply conditions,
 *   armor damage, scars, or death.
 */

/**
 * Critical Effects Table
 *
 * The system will search this table to determine which effect applies
 * based on the final severity value produced by a critical strike.
 *
 * Structure of each entry:
 * {
 *   minSeverity: number,
 *   maxSeverity: number,
 *   name: string,
 *   effect: string,
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
export const CRITICAL_EFFECTS_TABLE = [
  {
    minSeverity: 0,
    maxSeverity: 2,
    name: "Close Call",
    effect:
      "If the character is wearing armor, the armor gains the Damaged quality (see page 240)",
    mechanicalEffect: {
      type: "armor_damaged",
      armorDamaged: true,
    },
  },
  {
    minSeverity: 3,
    maxSeverity: 4,
    name: "Flesh Wound",
    effect:
      "The character suffers the Lightly Wounded condition for the ring they used for their check to resist. If the attack had the Razor-Edged quality, the character also suffers the Bleeding condition.",
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
    name: "Debilitating Gash",
    effect:
      "The character suffers the Severely Wounded condition for the ring they used they used for their check to resist. If the attack had the Razor-Edged quality, the character also suffers the Bleeding condition.",
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
    name: "Permanent Injury",
    effect:
      "The character suffers the Bleeding condition, then chooses one scar of the following disadvantages for the ring they used for their check to resist.",
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
    name: "Maiming Blow",
    effect:
      "The character suffers the Bleeding condition, then chooses one scar disadvantage associated with the ring used for the mitigation check.",
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
    name: "Agonizing Death",
    effect:
      "The character suffers the Severely Wounded condition, Bleeding, and Dying (3 rounds).",
    mechanicalEffect: {
      type: "dying",
      conditions: ["severely_wounded", "bleeding", "dying_3"],
      dyingRounds: 3,
    },
  },
  {
    minSeverity: 14,
    maxSeverity: 15,
    name: "Swift Death",
    effect:
      "The character suffers the Severely Wounded condition, Bleeding, and Dying (1 round).",
    mechanicalEffect: {
      type: "dying",
      conditions: ["severely_wounded", "bleeding", "dying_1"],
      dyingRounds: 1,
    },
  },
  {
    minSeverity: 16,
    maxSeverity: 999,
    name: "Instant Death",
    effect: "The character dies immediately.",
    mechanicalEffect: {
      type: "instant_death",
      conditions: ["dead"],
    },
  },
];

/**
 * Retrieves the appropriate critical effect entry based on severity.
 *
 * The function iterates through the CRITICAL_EFFECTS_TABLE and returns
 * the first entry whose severity range includes the provided value.
 *
 * If the severity exceeds all defined ranges, the final table entry
 * (Instant Death) is returned as a fallback.
 *
 * @param {number} severity Final calculated severity after mitigation rolls.
 * @returns {Object} The critical effect table entry that matches the severity value.
 */
export function getCriticalEffect(severity) {
  for (let effect of CRITICAL_EFFECTS_TABLE) {
    if (severity >= effect.minSeverity && severity <= effect.maxSeverity) {
      return effect;
    }
  }

  return CRITICAL_EFFECTS_TABLE[CRITICAL_EFFECTS_TABLE.length - 1];
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
