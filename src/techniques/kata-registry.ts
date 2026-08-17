// @ts-nocheck

/**
 * @typedef {{
 *   source: "fixed", value: number
 * } | {
 *   source: "attacker_ring", ring: string
 * } | {
 *   source: "target_silhouette"
 * } | {
 *   source: "extra_successes"
 * } | {
 *   source: "attacker_school_rank"
 * } | {
 *   source: "attacker_ring_plus_extra", ring: string
 * } | {
 *   source: "weapon_base_plus_extra"
 * }} Formula
 */

/**
 * @typedef {"target" | "attacker" | "all_against_target"} EffectTarget
 * @typedef {"immediate" | "until_next_turn" | "until_end_of_next_turn" | "scene"} Duration
 */

/**
 * @typedef {{
 *   type: "condition",
 *   target: EffectTarget,
 *   statusId: string,
 *   duration: Duration
 * } | {
 *   type: "damage",
 *   target: EffectTarget,
 *   formula: Formula,
 *   ignoresArmor: boolean
 * } | {
 *   type: "assistance",
 *   target: EffectTarget,
 *   duration: Duration
 * } | {
 *   type: "resistance_roll",
 *   skill: string,
 *   skillCatId: string,
 *   difficulty: Formula,
 *   onFailure: TechniqueEffect[]
 * } | {
 *   type: "resistance_buff",
 *   attribute: "physical",
 *   target: EffectTarget,
 *   duration: Duration
 * } | {
 *   type: "attack_tn_reduction",
 *   target: EffectTarget,
 *   amount: number,
 *   duration: Duration
 * } | {
 *   type: "critical_severity_boost",
 *   target: EffectTarget,
 *   duration: Duration
 * } | {
 *   type: "condition_lock",
 *   target: EffectTarget,
 *   conditions: string[],
 *   duration: Duration
 * }} TechniqueEffect
 */

/**
 * @typedef {{
 *   names: string[],
 *   compendiumIds?: string[],
 *   activation: {
 *     skill: string,
 *     skillCatId: string,
 *     ring: string | string[],
 *     difficulty: number | "target.silhouette",
 *     minDifficulty?: number,
 *     range?: [number, number],
 *     minTargetSilhouette?: number
 *   },
 *   onSuccess: TechniqueEffect[],
 *   onExtraSuccesses?: { threshold: number, effects: TechniqueEffect[] },
 *   onOpportunity?: Array<{ ring: string, cost: number, effects: TechniqueEffect[] }>
 * }} KataDefinition
 */

/**
 * @typedef {{
 *   names: string[],
 *   compendiumIds?: string[],
 *   activation: {
 *     type: "passive_on_roll",
 *     skills: string[],
 *     ring: string | string[]
 *   },
 *   onOpportunity: Array<{
 *     ring: string,
 *     costMin: number,
 *     costMax: number,
 *     effects: TechniqueEffect[]
 *   }>
 * }} PassiveKataDefinition
 */

/** @type {KataDefinition[]} */
export const KATA_REGISTRY = [
  {
    names: ["Soaring Slice", "Corte ascendente"],
    activation: {
      skill: "melee",
      ring: ["earth", "fire", "air", "water", "void"],
      difficulty: 2,
      range: [2, 3],
    },
    onSuccess: [
      {
        type: "damage",
        target: "target",
        formula: { source: "weapon_base_plus_extra" },
        ignoresArmor: false,
      },
    ],
    onOpportunity: [
      {
        ring: ["earth", "fire", "air", "water", "void"],
        cost: 1,
        effects: [
          {
            type: "attack_tn_reduction",
            target: "target",
            amount: 1,
            duration: "until_next_turn",
          },
        ],
      },
    ],
  },
];

/**
 * Maps skill IDs to their category in the l5r5e system.
 * Used when launching DicePickerDialog for resistance rolls.
 */
export const SKILL_CATEGORY_MAP = {
  fitness: "martial",
  unarmed: "martial",
  melee: "martial",
  ranged: "martial",
  theology: "scholar",
  medicine: "scholar",
  command: "social",
  courtesy: "social",
  sentiment: "social",
  perform: "social",
  labor: "trade",
  seafaring: "trade",
  skulduggery: "trade",
  survival: "trade",
};

/** @type {PassiveKataDefinition[]} */
export const PASSIVE_KATA_REGISTRY = [
  {
    names: ["Striking as Earth", "Golpe de Tierra"],
    activation: {
      type: "passive_on_roll",
      skills: ["melee", "ranged", "unarmed"],
      ring: "earth",
    },
    onOpportunity: [
      {
        ring: "earth",
        costMin: 1,
        costMax: 5,
        effects: [
          {
            type: "resistance_buff",
            attribute: "physical",
            target: "attacker",
            duration: "until_next_turn",
          },
        ],
      },
    ],
  },
  {
    names: ["Striking as Fire", "Golpe de Fuego"],
    activation: {
      type: "passive_on_roll",
      skills: ["melee", "ranged", "unarmed"],
      ring: "fire",
    },
    onOpportunity: [
      {
        ring: "fire",
        costMin: 1,
        costMax: 20,
        effects: [
          {
            type: "critical_severity_boost",
            target: "target",
            duration: "until_end_of_next_turn",
          },
        ],
      },
    ],
  },
  {
    names: ["Bear's Swipe Style", "Estilo de zarpazo del oso"],
    compendiumIds: ["Compendium.world.katas-generales.Item.CxYboNz5zjBgyKh9"],
    activation: {
      type: "passive_on_roll",
      skills: ["melee", "ranged", "unarmed"],
      ring: "earth",
    },
    onOpportunity: [
      {
        ring: "earth",
        costMin: 1,
        costMax: 1,
        effects: [
          {
            type: "condition_lock",
            target: "target",
            conditions: ["bleeding", "dazed", "disoriented", "prone"],
            duration: "until_end_of_next_turn",
          },
        ],
      },
    ],
  },
];
