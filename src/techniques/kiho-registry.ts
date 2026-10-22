// @ts-nocheck
/**
 * Kihō registry. Design: docs/superpowers/specs/2026-10-21-kiho-design.md,
 * survey: docs/kihos-vault/. Kihō rolled from the sheet are matched by name
 * or compendium id (`kataMatchesItem`); unregistered kihō are ignored.
 *
 * A kihō has an enhancement effect (persistent while the kihō is active,
 * applied by the combat flow — ticket K2) and a burst effect resolved on
 * the activation roll according to the bonus successes.
 *
 * @typedef {{
 *   names: string[],                       // [English, Spanish]
 *   compendiumIds?: string[],              // "Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih0000NN"
 *   activation: { skill: string, ring: string | null, difficulty: number },
 *   burst: Array<{
 *     threshold: number,                   // bonus successes needed (0 = any success)
 *     replaces?: boolean,                  // drops the lower tiers ("instead")
 *     effects: TechniqueEffect[],
 *   }>,
 *   enhancement: { id: string, note: string },  // note: i18n key shown while active
 *   cardNote?: string,                     // i18n key: manual parts of the kihō
 * }} KihoDefinition
 */

/** @type {KihoDefinition[]} */
export const KIHO_REGISTRY = [
  {
    // Libro Básico p. 182
    names: ["Freezing the Lifeblood", "Congelar la sangre vital"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000016"],
    activation: { skill: "unarmed", ring: "water", difficulty: 2 },
    enhancement: { id: "freezingLifeblood", note: "l5r5e-combat-helper.kiho.enhancement.freezingLifeblood" },
    burst: [
      {
        threshold: 2,
        effects: [
          {
            type: "damage",
            target: "first_target",
            formula: { source: "attacker_ring", ring: "water" },
            damageType: "supernatural",
            ignoresArmor: true,
          },
          { type: "condition", target: "first_target", statusId: "immobilized", duration: "immediate" },
        ],
      },
      {
        threshold: 4,
        replaces: true,
        effects: [
          {
            type: "critical_strike",
            target: "first_target",
            severity: {
              source: "attacker_ring",
              ring: "water",
              plus: { source: "attacker_skill_rank", skill: "medicine" },
            },
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 182. Only effects tracked by the module are removed.
    names: ["Ride the Water Dragon", "Montar sobre el dragón de Agua"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000015"],
    activation: { skill: "meditation", ring: "water", difficulty: 3 },
    enhancement: { id: "rideWaterDragon", note: "l5r5e-combat-helper.kiho.enhancement.rideWaterDragon" },
    burst: [
      {
        threshold: 2,
        effects: [{ type: "clear_technique_effects", target: "attacker" }],
      },
      {
        threshold: 4,
        replaces: true,
        effects: [
          { type: "clear_technique_effects", target: "attacker" },
          { type: "clear_technique_effects", target: "target" },
        ],
      },
    ],
    cardNote: "l5r5e-combat-helper.kiho.note.rideWaterDragon",
  },
  {
    // Libro Básico p. 183. Calming Breath removing 2 fatigue stays manual.
    names: ["Ki Protection", "Protección de ki"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000017"],
    activation: { skill: "meditation", ring: "water", difficulty: 1 },
    enhancement: { id: "kiProtection", note: "l5r5e-combat-helper.kiho.enhancement.kiProtection" },
    burst: [
      {
        threshold: 2,
        effects: [
          {
            type: "damage",
            target: "first_target",
            mode: "remove",
            ignoresArmor: true,
            oncePerScene: true,
            formula: { source: "attacker_skill_rank", skill: "medicine", plusExtraSuccesses: true },
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 183. Attacking through surfaces is manual.
    names: ["Water Fist", "Puño de Agua"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000019"],
    activation: { skill: "unarmed", ring: "water", difficulty: 1 },
    enhancement: { id: "waterFist", note: "l5r5e-combat-helper.kiho.enhancement.waterFist" },
    burst: [
      {
        threshold: 0,
        effects: [{ type: "damage", target: "first_target", formula: { source: "attacker_ring", ring: "water" } }],
      },
    ],
    cardNote: "l5r5e-combat-helper.kiho.note.waterFist",
  },
  {
    // Libro Básico p. 183. Walking on water and the 2-band move are manual.
    names: ["Way of the Seafoam", "La senda de la espuma marina"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000018"],
    activation: { skill: "meditation", ring: "water", difficulty: 1 },
    enhancement: { id: "seafoam", note: "l5r5e-combat-helper.kiho.enhancement.seafoam" },
    burst: [
      {
        threshold: 2,
        effects: [
          { type: "condition", target: "attacker", remove: true, statusIds: ["immobilized", "prone"] },
          {
            type: "choice",
            target: "attacker",
            chooser: "attacker",
            prompt: "l5r5e-combat-helper.kiho.choice.stancePrompt",
            options: [
              {
                label: "l5r5e-combat-helper.kiho.choice.stance",
                labelArgs: { ring: "air" },
                effects: [{ type: "force_stance", target: "target", stance: "air" }],
              },
              {
                label: "l5r5e-combat-helper.kiho.choice.stance",
                labelArgs: { ring: "earth" },
                effects: [{ type: "force_stance", target: "target", stance: "earth" }],
              },
              {
                label: "l5r5e-combat-helper.kiho.choice.stance",
                labelArgs: { ring: "fire" },
                effects: [{ type: "force_stance", target: "target", stance: "fire" }],
              },
              {
                label: "l5r5e-combat-helper.kiho.choice.stance",
                labelArgs: { ring: "water" },
                effects: [{ type: "force_stance", target: "target", stance: "water" }],
              },
              {
                label: "l5r5e-combat-helper.kiho.choice.stance",
                labelArgs: { ring: "void" },
                effects: [{ type: "force_stance", target: "target", stance: "void" }],
              },
            ],
          },
        ],
      },
    ],
    cardNote: "l5r5e-combat-helper.kiho.note.seafoam",
  },
  {
    // Libro Básico p. 184. "Characters at range 0-3" are the targeted tokens.
    names: ["The Great Silence", "El gran silencio"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000009"],
    activation: { skill: "theology", ring: "air", difficulty: 1 },
    enhancement: { id: "greatSilence", note: "l5r5e-combat-helper.kiho.enhancement.greatSilence" },
    burst: [
      {
        threshold: 2,
        effects: [{ type: "condition", target: "target", statusId: "silenced", duration: "until_next_turn" }],
      },
    ],
    cardNote: "l5r5e-combat-helper.kiho.note.targetsInRange",
  },
  {
    // Libro Básico p. 184. All movement is manual.
    names: ["Riding the Clouds", "Montar sobre las nubes"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000006"],
    activation: { skill: "meditation", ring: "air", difficulty: 2 },
    enhancement: { id: "ridingClouds", note: "l5r5e-combat-helper.kiho.enhancement.ridingClouds" },
    burst: [],
    cardNote: "l5r5e-combat-helper.kiho.note.ridingClouds",
  },
  {
    // Libro Básico p. 184. The push is manual (failure note).
    names: ["Air Fist", "Puño de Aire"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000008"],
    activation: { skill: "unarmed", ring: "air", difficulty: 1 },
    enhancement: { id: "airFist", note: "l5r5e-combat-helper.kiho.enhancement.airFist" },
    burst: [
      {
        threshold: 2,
        effects: [
          { type: "damage", target: "first_target", formula: { source: "attacker_ring", ring: "air" } },
          {
            type: "resistance_roll",
            target: "first_target",
            skill: "fitness",
            difficulty: { source: "fixed", value: 4 },
            ringDifficulty: { earth: 1, fire: -2 },
            failureNote: "l5r5e-combat-helper.kiho.note.airFistPush",
            onFailure: [],
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 184. Enhancement: −2 damage per opportunity of the attack (kiho-enhancements.ts).
    names: ["Way of the Willow", "La senda del sauce"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000007"],
    activation: { skill: "meditation", ring: "air", difficulty: 3 },
    enhancement: { id: "willow", note: "l5r5e-combat-helper.kiho.enhancement.willow" },
    burst: [
      {
        threshold: 2,
        effects: [
          {
            type: "incoming_attack_tn",
            target: "attacker",
            amount: { source: "attacker_skill_rank", skill: "meditation" },
            duration: "until_next_turn",
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 185. "Each other character at range 0-1" are the targeted tokens.
    names: ["Channel the Fire Dragon", "Canalizar el dragón de Fuego"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000010"],
    activation: { skill: "meditation", ring: "fire", difficulty: 2 },
    enhancement: { id: "channelFireDragon", note: "l5r5e-combat-helper.kiho.enhancement.channelFireDragon" },
    burst: [
      {
        threshold: 2,
        effects: [
          {
            type: "resistance_roll",
            target: "target",
            skill: "fitness",
            difficulty: { source: "fixed", value: 4 },
            ringDifficulty: { air: 1, water: -2 },
            onFailure: [
              { type: "damage", target: "target", formula: { source: "attacker_ring", ring: "fire" } },
              { type: "condition", target: "target", statusId: "burning", duration: "immediate" },
            ],
          },
        ],
      },
    ],
    cardNote: "l5r5e-combat-helper.kiho.note.channelFireDragon",
  },
  {
    // Libro Básico p. 185. Enhancement: retaliation when defending (kiho-enhancements.ts).
    // Burst: marks the chosen target; its next attack is reduced by Fire Ring.
    names: ["The Body Is an Anvil", "El cuerpo es un yunque"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000013"],
    activation: { skill: "meditation", ring: "fire", difficulty: 3 },
    enhancement: { id: "bodyAnvil", note: "l5r5e-combat-helper.kiho.enhancement.bodyAnvil" },
    burst: [{ threshold: 2, effects: [{ type: "mark_target", target: "first_target", key: "anvil" }] }],
  },
  {
    // Libro Básico p. 185. The burst targets an object: manual.
    names: ["Breaking Blow", "Golpe rompedor"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000011"],
    activation: { skill: "unarmed", ring: "fire", difficulty: 1 },
    enhancement: { id: "breakingBlow", note: "l5r5e-combat-helper.kiho.enhancement.breakingBlow" },
    burst: [],
    cardNote: "l5r5e-combat-helper.kiho.note.breakingBlow",
  },
  {
    // Libro Básico p. 186.
    names: ["Flame Fist", "Puño de Fuego"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000014"],
    activation: { skill: "unarmed", ring: "fire", difficulty: 1 },
    enhancement: { id: "flameFist", note: "l5r5e-combat-helper.kiho.enhancement.flameFist" },
    burst: [
      {
        threshold: 2,
        effects: [
          { type: "damage", target: "first_target", formula: { source: "attacker_ring", ring: "fire" } },
          {
            type: "resistance_roll",
            target: "first_target",
            skill: "fitness",
            difficulty: { source: "fixed", value: 4 },
            ringDifficulty: { air: 1, water: -2 },
            onFailure: [{ type: "condition", target: "target", statusId: "dazed", duration: "immediate" }],
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 186.
    names: ["Way of the Falling Star", "La senda de la estrella fugaz"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000012"],
    activation: { skill: "unarmed", ring: "fire", difficulty: 3 },
    enhancement: { id: "fallingStar", note: "l5r5e-combat-helper.kiho.enhancement.fallingStar" },
    burst: [
      {
        threshold: 3,
        effects: [
          {
            type: "damage",
            target: "first_target",
            formula: {
              source: "attacker_ring",
              ring: "fire",
              plus: { source: "attacker_skill_rank", skill: "fitness" },
            },
            damageType: "supernatural",
          },
          {
            type: "resistance_roll",
            target: "first_target",
            skill: "fitness",
            difficulty: { source: "fixed", value: 5 },
            ringDifficulty: { air: 1, water: -2 },
            onFailure: [
              { type: "condition", target: "target", statusId: "burning", duration: "immediate" },
              { type: "condition", target: "target", statusId: "dazed", duration: "immediate" },
            ],
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 186. Enhancement: −Earth Ring critical severity (critical-mitigation.ts);
    // the Void spend against the attacker is ticket K3.
    names: ["Grasp the Earth Dragon", "El abrazo del dragón de Tierra"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000002"],
    activation: { skill: "meditation", ring: "earth", difficulty: 2 },
    enhancement: { id: "graspEarthDragon", note: "l5r5e-combat-helper.kiho.enhancement.graspEarthDragon" },
    burst: [
      {
        threshold: 3,
        effects: [
          { type: "damage_cap", target: "attacker", cap: 1, proneSource: true, duration: "until_end_of_next_turn" },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 187. "Fatigado" is the system's Exhausted condition.
    names: ["Cleansing Spirit", "Espíritu purificador"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000001"],
    activation: { skill: "theology", ring: "earth", difficulty: 1 },
    enhancement: { id: "cleansingSpirit", note: "l5r5e-combat-helper.kiho.enhancement.cleansingSpirit" },
    burst: [
      {
        threshold: 2,
        effects: [
          {
            type: "choice",
            target: "first_target",
            chooser: "attacker",
            prompt: "l5r5e-combat-helper.kiho.choice.cleansePrompt",
            options: [
              {
                label: "l5r5e-combat-helper.kiho.choice.removeCondition",
                labelArgs: { statusId: "afflicted" },
                when: { target_has_condition: "afflicted" },
                effects: [{ type: "condition", target: "target", remove: true, statusIds: ["afflicted"] }],
              },
              {
                label: "l5r5e-combat-helper.kiho.choice.removeCondition",
                labelArgs: { statusId: "bleeding" },
                when: { target_has_condition: "bleeding" },
                effects: [{ type: "condition", target: "target", remove: true, statusIds: ["bleeding"] }],
              },
              {
                label: "l5r5e-combat-helper.kiho.choice.removeCondition",
                labelArgs: { statusId: "dazed" },
                when: { target_has_condition: "dazed" },
                effects: [{ type: "condition", target: "target", remove: true, statusIds: ["dazed"] }],
              },
              {
                label: "l5r5e-combat-helper.kiho.choice.removeCondition",
                labelArgs: { statusId: "disoriented" },
                when: { target_has_condition: "disoriented" },
                effects: [{ type: "condition", target: "target", remove: true, statusIds: ["disoriented"] }],
              },
              {
                label: "l5r5e-combat-helper.kiho.choice.removeCondition",
                labelArgs: { statusId: "dying" },
                when: { target_has_condition: "dying" },
                effects: [{ type: "condition", target: "target", remove: true, statusIds: ["dying"] }],
              },
              {
                label: "l5r5e-combat-helper.kiho.choice.removeCondition",
                labelArgs: { statusId: "exhausted" },
                when: { target_has_condition: "exhausted" },
                effects: [{ type: "condition", target: "target", remove: true, statusIds: ["exhausted"] }],
              },
              {
                label: "l5r5e-combat-helper.kiho.choice.removeCondition",
                labelArgs: { statusId: "intoxicated" },
                when: { target_has_condition: "intoxicated" },
                effects: [{ type: "condition", target: "target", remove: true, statusIds: ["intoxicated"] }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 187.
    names: ["Earthen Fist", "Puño de Tierra"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000005"],
    activation: { skill: "unarmed", ring: "earth", difficulty: 1 },
    enhancement: { id: "earthenFist", note: "l5r5e-combat-helper.kiho.enhancement.earthenFist" },
    burst: [
      {
        threshold: 2,
        effects: [
          { type: "damage", target: "first_target", formula: { source: "attacker_ring", ring: "earth" } },
          {
            type: "resistance_roll",
            target: "first_target",
            skill: "fitness",
            difficulty: { source: "fixed", value: 4 },
            ringDifficulty: { air: -2, water: 1 },
            onFailure: [{ type: "condition", target: "target", statusId: "prone", duration: "immediate" }],
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 187. Prone targets take the stronger effect instead.
    names: ["Way of the Earthquake", "La senda del terremoto"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000004"],
    activation: { skill: "unarmed", ring: "earth", difficulty: 2 },
    enhancement: { id: "earthquake", note: "l5r5e-combat-helper.kiho.enhancement.earthquake" },
    burst: [
      {
        threshold: 2,
        effects: [
          {
            type: "damage",
            target: "target",
            formula: { source: "attacker_ring", ring: "earth" },
            when: { target_lacks_condition: "prone" },
          },
          {
            type: "damage",
            target: "target",
            formula: { source: "attacker_ring", ring: "earth", plusExtraSuccesses: true },
            when: { target_has_condition: "prone" },
          },
          {
            type: "condition",
            target: "target",
            statusId: "immobilized",
            duration: "immediate",
            when: { target_has_condition: "prone" },
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 187. Perception burst is manual; Vigilance in ticket K2.
    names: ["Earth Needs No Eyes", "La tierra no necesita ojos"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000003"],
    activation: { skill: "meditation", ring: "earth", difficulty: 1 },
    enhancement: { id: "earthNeedsNoEyes", note: "l5r5e-combat-helper.kiho.enhancement.earthNeedsNoEyes" },
    burst: [],
    cardNote: "l5r5e-combat-helper.kiho.note.earthNeedsNoEyes",
  },
  {
    // Libro Básico p. 188. Dice and terrain are manual.
    names: ["Still the Elements", "Acallar los elementos"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000022"],
    activation: { skill: "meditation", ring: "void", difficulty: 4 },
    enhancement: { id: "stillElements", note: "l5r5e-combat-helper.kiho.enhancement.stillElements" },
    burst: [],
    cardNote: "l5r5e-combat-helper.kiho.note.stillElements",
  },
  {
    // Libro Básico p. 188. Meditation with any ring.
    names: ["Way of the Edgeless Sword", "La senda de la espada sin filo"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000023"],
    activation: { skill: "meditation", ring: null, difficulty: 3 },
    enhancement: { id: "edgelessSword", note: "l5r5e-combat-helper.kiho.enhancement.edgelessSword" },
    burst: [
      {
        threshold: 2,
        effects: [
          {
            type: "critical_strike",
            target: "target",
            severity: {
              source: "attacker_ring",
              ring: "void",
              plus: { source: "attacker_skill_rank", skill: "unarmed" },
            },
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 188. Swapping opportunities between rings is manual.
    names: ["Touch the Void Dragon", "El toque del dragón de Vacío"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000021"],
    activation: { skill: "meditation", ring: "void", difficulty: 4 },
    enhancement: { id: "touchVoidDragon", note: "l5r5e-combat-helper.kiho.enhancement.touchVoidDragon" },
    burst: [
      {
        threshold: 2,
        effects: [{ type: "gain_void", target: "attacker", amount: 1, oncePerScene: true }],
      },
    ],
  },
  {
    // Libro Básico p. 188. With 4+ bonus successes a minion is slain instead.
    names: ["Death Touch", "El toque de la muerte"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kiho.Item.L5RCoreKih000020"],
    activation: { skill: "unarmed", ring: "void", difficulty: 3 },
    enhancement: { id: "deathTouch", note: "l5r5e-combat-helper.kiho.enhancement.deathTouch" },
    burst: [
      {
        threshold: 3,
        effects: [
          {
            type: "condition",
            target: "first_target",
            statusId: "dazed",
            duration: "immediate",
            when: { not: { all: [{ target_is_minion: true }, { extra_successes_gte: 4 }] } },
          },
          {
            type: "condition",
            target: "first_target",
            statusId: "disoriented",
            duration: "immediate",
            when: { not: { all: [{ target_is_minion: true }, { extra_successes_gte: 4 }] } },
          },
          {
            type: "resistance_roll",
            target: "first_target",
            skill: "fitness",
            difficulty: { source: "fixed", value: 4 },
            when: { not: { all: [{ target_is_minion: true }, { extra_successes_gte: 4 }] } },
            onFailure: [{ type: "condition", target: "target", statusId: "unconscious", duration: "immediate" }],
          },
        ],
      },
      {
        threshold: 4,
        effects: [
          {
            type: "condition",
            target: "first_target",
            statusId: "unconscious",
            duration: "immediate",
            when: { target_is_minion: true },
          },
        ],
      },
    ],
    cardNote: "l5r5e-combat-helper.kiho.note.deathTouch",
  },
];

/**
 * The registry entry of the actor's active kihō, or null. Lives here (not in
 * kiho-engine.ts) so the combat flow can read it without importing the engine.
 */
export function activeKihoOf(actor) {
  const active = actor?.getFlag?.("l5r5e-combat-helper", "activeKiho");
  if (!active) return null;
  return KIHO_REGISTRY.find((k) => k.names.includes(active.name)) ?? null;
}
