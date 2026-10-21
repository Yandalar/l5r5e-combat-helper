// @ts-nocheck

/**
 * Formula sources are declared in FORMULA_RESOLVERS (technique-engine.ts);
 * FORMULA_SOURCES = Object.keys(FORMULA_RESOLVERS) is the authoritative list.
 * A Formula is `{ source: <one of FORMULA_SOURCES>, ...source-specific
 * fields (e.g. `ring`, `skill`, `slot`), ...composable modifiers }`.
 * Composable modifiers (any Formula may set these): `multiplier`, `bonus`,
 * `min`, `max`, `plusExtraSuccesses`, `plusOpportunitiesSpent`.
 * @typedef {Object} Formula
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
 *   onOpportunity?: Array<{ ring: string, cost: number, effects: TechniqueEffect[] }>,
 *   informationalNote?: string
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
        formula: { source: "weapon_base", plusExtraSuccesses: true },
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
  {
    names: ["Lord Hida's Grip", "El abrazo del Señor Hida"],
    activation: {
      skill: "fitness",
      ring: "void",
      difficulty: "target.silhouette",
      minDifficulty: 1,
      range: [0, 1],
      minTargetSilhouette: 3,
    },
    onSuccess: [
      {
        type: "condition",
        target: "target",
        statusId: "immobilized",
        duration: "until_next_turn",
      },
      {
        type: "assistance",
        target: "all_against_target",
        duration: "until_next_turn",
      },
    ],
    onOpportunity: [
      {
        ring: "void",
        cost: 1,
        effects: [
          {
            type: "resistance_roll",
            skill: "fitness",
            difficulty: { source: "attacker_school_rank" },
            onFailure: [
              {
                type: "damage",
                target: "target",
                formula: { source: "target_silhouette" },
                ignoresArmor: true,
              },
              {
                type: "condition",
                target: "target",
                statusId: "prone",
                duration: "immediate",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    // PARTIAL AUTOMATION: only the Immobilized-condition half of this Kata's
    // opportunity effect is automated. The weapon-lock half has no engine
    // support (no effect type models "lock the target's weapon") and stays
    // purely informational — surfaced via `informationalNote` (an i18n key,
    // optional field ignored by every other kata entry) on the opportunity
    // result chat card. See docs/katas-vault/ for the full design writeup of
    // the gap.
    names: ["Coiling Serpent Style", "Estilo de la serpiente enroscada"],
    activation: {
      skill: "melee",
      ring: ["earth", "air", "water", "fire", "void"],
      difficulty: 2,
    },
    onSuccess: [],
    onOpportunity: [
      {
        ring: ["earth", "air", "water", "fire", "void"],
        cost: 2,
        effects: [
          {
            type: "condition",
            target: "target",
            statusId: "immobilized",
            duration: "until_next_turn",
          },
        ],
      },
    ],
    informationalNote: "l5r5e-combat-helper.kata.chat.coilingSerpentWeaponLockNote",
  },
  {
    // Libro Básico p. 179. Readying another sheathed Razor-Edged weapon
    // (opportunity) is left to the players.
    names: ["Iaijutsu Cut: Crossing Blade", "Corte de iaijutsu: Hoja cruzada"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000023"],
    activation: {
      skill: "melee",
      ring: ["earth", "air", "water", "fire", "void"],
      difficulty: 2,
      range: [1, 2],
    },
    onSuccess: [
      {
        type: "damage",
        target: "target",
        formula: { source: "weapon_deadliness", plusExtraSuccesses: true },
      },
    ],
    cardNote: "l5r5e-combat-helper.kata.note.iaijutsuReady",
  },
  {
    // Libro Básico p. 179. TN = the target's Vigilance; a Compromised target
    // can't defend (resistance doesn't reduce the damage).
    names: ["Iaijutsu Cut: Rising Blade", "Corte de iaijutsu: Hoja ascendente"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000022"],
    activation: {
      skill: "melee",
      ring: ["earth", "air", "water", "fire", "void"],
      difficulty: "target.vigilance",
      minDifficulty: 1,
      range: [0, 1],
    },
    onSuccess: [
      {
        type: "damage",
        target: "target",
        formula: { source: "weapon_deadliness" },
        when: { target_lacks_condition: "compromised" },
      },
      {
        type: "damage",
        target: "target",
        formula: { source: "weapon_deadliness" },
        ignoresArmor: true,
        when: { target_has_condition: "compromised" },
      },
    ],
    cardNote: "l5r5e-combat-helper.kata.note.iaijutsuReady",
  },
  {
    // Libro Básico p. 177.
    names: ["Flowing Water Strike", "Golpe del agua corriente"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000001"],
    activation: {
      skill: "melee",
      ring: "water",
      difficulty: 3,
      range: [0, 2],
    },
    onSuccess: [
      {
        type: "damage",
        target: "target",
        formula: { source: "attacker_ring", ring: "water" },
      },
      {
        type: "condition",
        target: "target",
        statusId: "bleeding",
        duration: "immediate",
      },
      {
        type: "resistance_roll",
        skill: "fitness",
        difficulty: { source: "fixed", value: 4 },
        ringDifficulty: { earth: -2, fire: 1 },
        onFailure: [
          {
            type: "damage",
            target: "target",
            formula: { source: "weapon_base" },
            increasesPrior: { source: "attacker_ring", ring: "water" },
          },
        ],
      },
    ],
    onOpportunity: [
      {
        ring: "water",
        cost: 1,
        effects: [
          {
            type: "condition",
            target: "attacker",
            remove: true,
            statusIds: ["dazed", "disoriented", "immobilized", "prone"],
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 177. Disarming (and keeping the weapon, opportunity)
    // is resolved by hand: the module has no notion of dropped weapons.
    names: ["Crimson Leaves Strike", "Golpe de las hojas carmesíes"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000002"],
    activation: {
      skill: "melee",
      ring: "earth",
      difficulty: 4,
    },
    onSuccess: [
      {
        type: "damage",
        target: "target",
        formula: { source: "attacker_ring", ring: "earth", plusExtraSuccesses: true },
      },
      {
        type: "resistance_roll",
        skill: "fitness",
        difficulty: { source: "fixed", value: 4 },
        ringDifficulty: { air: -2, water: 1 },
        failureNote: "l5r5e-combat-helper.kata.note.crimsonLeavesDisarm",
        onFailure: [],
      },
    ],
    cardNote: "l5r5e-combat-helper.kata.note.crimsonLeavesKeep",
  },
  {
    // Libro Básico p. 176. Moving one range band (Fire opportunity) is manual.
    names: ["Heartpiercing Strike", "Golpe al corazón"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000003"],
    activation: {
      skill: "melee",
      ring: "fire",
      difficulty: 4,
    },
    onSuccess: [
      {
        type: "critical_strike",
        target: "target",
        severity: { source: "weapon_deadliness", plusExtraSuccesses: true },
        mitigationTn: 3,
        ringDifficulty: { air: 1, water: -2 },
      },
    ],
    onFailure: [
      {
        type: "condition",
        target: "attacker",
        statusId: "disoriented",
        duration: "immediate",
      },
    ],
    cardNote: "l5r5e-combat-helper.kata.note.heartpiercingMove",
  },
  {
    // Libro Básico p. 181. TN = Vigilance + the attack's range, which the
    // module can't measure: the TN set in the dice picker is used.
    names: ["Pin the Fan", "Clavar el abanico"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000030"],
    activation: {
      skill: "ranged",
      ring: ["earth", "air", "water", "fire", "void"],
      difficulty: "roll",
    },
    onSuccess: [
      {
        type: "damage",
        target: "target",
        formula: { source: "weapon_base", multiplier: 2, plusExtraSuccesses: true },
      },
    ],
    onOpportunity: [
      {
        ring: ["earth", "air", "water", "fire", "void"],
        cost: 1,
        effects: [
          {
            type: "critical_strike",
            target: "target",
            severity: { source: "weapon_deadliness", plusExtraSuccesses: true },
            when: { target_is_incapacitated: true },
          },
        ],
      },
    ],
    cardNote: "l5r5e-combat-helper.kata.note.pinTheFanTn",
  },
];

/**
 * Maps skill IDs to their category in the l5r5e system.
 * Used when launching DicePickerDialog for resistance rolls, and by
 * `attacker_skill_rank` formulas in technique-engine.ts.
 *
 * BUG #5 FIX: `sentiment` was wrongly mapped to "social" (it is a Scholar
 * skill), and `perform` doesn't exist as a skill id at all — the real one is
 * `performance`, under "social". Total over the real skill tree, verified
 * against systems/l5r5e/template.json.
 */
export const SKILL_CATEGORY_MAP = {
  // martial
  fitness: "martial",
  melee: "martial",
  ranged: "martial",
  unarmed: "martial",
  meditation: "martial",
  tactics: "martial",
  // scholar
  culture: "scholar",
  government: "scholar",
  medicine: "scholar",
  sentiment: "scholar",
  theology: "scholar",
  // social
  command: "social",
  courtesy: "social",
  games: "social",
  performance: "social",
  // trade
  commerce: "trade",
  labor: "trade",
  seafaring: "trade",
  skulduggery: "trade",
  survival: "trade",
  // artisan
  aesthetics: "artisan",
  composition: "artisan",
  design: "artisan",
  smithing: "artisan",
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
    names: ["Striking as Water", "Golpe de Agua"],
    activation: {
      type: "passive_on_roll",
      skills: ["melee", "ranged", "unarmed"],
      ring: "water",
    },
    onOpportunity: [
      {
        ring: "water",
        costMin: 1,
        costMax: 5,
        effects: [
          {
            type: "resistance_buff",
            attribute: "physical",
            target: "target",
            amount: -1,
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
  {
    // Libro Básico p. 175-176: "air +" — one target resists Fitness TN 3
    // (+1 per extra opportunity) or suffers disoriented and fatigue = shortfall.
    names: ["Breath of Wind Style", "Estilo del hálito de viento"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000020"],
    activation: {
      type: "passive_on_roll",
      skills: ["melee", "ranged", "unarmed"],
      ring: "air",
    },
    onOpportunity: [
      {
        ring: "air",
        costMin: 1,
        costMax: 10,
        spendKey: "l5r5e-combat-helper.kata.chat.passiveSpendResistTn",
        effects: [
          {
            type: "resistance_roll",
            target: "first_target",
            skill: "fitness",
            difficulty: { source: "fixed", value: 2, plusOpportunitiesSpent: true },
            ringDifficulty: { earth: 1, fire: -2 },
            onFailure: [
              { type: "condition", target: "target", statusId: "disoriented", duration: "immediate" },
              { type: "damage", target: "target", formula: { source: "resistance_shortfall" }, ignoresArmor: true },
            ],
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 175-176: "water +" — one target resists Fitness TN 3
    // (+1 per extra opportunity) or suffers bleeding and fatigue = shortfall.
    names: ["Crashing Wave Style", "Estilo de la ola rompiente"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000017"],
    activation: {
      type: "passive_on_roll",
      skills: ["melee", "ranged", "unarmed"],
      ring: "water",
    },
    onOpportunity: [
      {
        ring: "water",
        costMin: 1,
        costMax: 10,
        spendKey: "l5r5e-combat-helper.kata.chat.passiveSpendResistTn",
        effects: [
          {
            type: "resistance_roll",
            target: "first_target",
            skill: "fitness",
            difficulty: { source: "fixed", value: 2, plusOpportunitiesSpent: true },
            ringDifficulty: { earth: -2, fire: 1 },
            onFailure: [
              { type: "condition", target: "target", statusId: "bleeding", duration: "immediate" },
              { type: "damage", target: "target", formula: { source: "resistance_shortfall" }, ignoresArmor: true },
            ],
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 175-176: "fire +" — one target resists Fitness TN 3
    // (+1 per extra opportunity) or suffers dazed and fatigue = shortfall.
    names: ["Disappearing World Style", "Estilo de la desaparición del mundo"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000016"],
    activation: {
      type: "passive_on_roll",
      skills: ["melee", "ranged", "unarmed"],
      ring: "fire",
    },
    onOpportunity: [
      {
        ring: "fire",
        costMin: 1,
        costMax: 10,
        spendKey: "l5r5e-combat-helper.kata.chat.passiveSpendResistTn",
        effects: [
          {
            type: "resistance_roll",
            target: "first_target",
            skill: "fitness",
            difficulty: { source: "fixed", value: 2, plusOpportunitiesSpent: true },
            ringDifficulty: { air: 1, water: -2 },
            onFailure: [
              { type: "condition", target: "target", statusId: "dazed", duration: "immediate" },
              { type: "damage", target: "target", formula: { source: "resistance_shortfall" }, ignoresArmor: true },
            ],
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 175-176: "earth +" — one target resists Fitness TN 3
    // (+1 per extra opportunity) or suffers prone and fatigue = shortfall.
    names: ["Iron in the Mountains Style", "Estilo del hierro en las montañas"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000019"],
    activation: {
      type: "passive_on_roll",
      skills: ["melee", "ranged", "unarmed"],
      ring: "earth",
    },
    onOpportunity: [
      {
        ring: "earth",
        costMin: 1,
        costMax: 10,
        spendKey: "l5r5e-combat-helper.kata.chat.passiveSpendResistTn",
        effects: [
          {
            type: "resistance_roll",
            target: "first_target",
            skill: "fitness",
            difficulty: { source: "fixed", value: 2, plusOpportunitiesSpent: true },
            ringDifficulty: { air: -2, water: 1 },
            onFailure: [
              { type: "condition", target: "target", statusId: "prone", duration: "immediate" },
              { type: "damage", target: "target", formula: { source: "resistance_shortfall" }, ignoresArmor: true },
            ],
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 180. One branch per roll: a near miss (shortfall ≤ 2)
    // or a hit on a Prone target. "Blunt weapon" is not checked.
    names: ["Rushing Avalanche Style", "Estilo de la avalancha precipitada"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000024"],
    activation: {
      type: "passive_on_roll",
      skills: ["melee"],
      ring: ["earth", "air", "water", "fire", "void"],
    },
    onOpportunity: [
      {
        ring: ["earth", "air", "water", "fire", "void"],
        costMin: 1,
        costMax: 1,
        when: { all: [{ activation_failed: true }, { activation_shortfall_lte: 2 }] },
        spendKey: "l5r5e-combat-helper.kata.chat.passiveSpendGeneric",
        hint: "l5r5e-combat-helper.kata.note.avalancheMiss",
        effects: [
          {
            type: "damage",
            target: "first_target",
            formula: { source: "attacker_skill_rank", skill: "fitness" },
          },
        ],
      },
      {
        ring: ["earth", "air", "water", "fire", "void"],
        costMin: 1,
        costMax: 1,
        when: { all: [{ activation_failed: false }, { target_has_condition: "prone" }] },
        spendKey: "l5r5e-combat-helper.kata.chat.passiveSpendGeneric",
        hint: "l5r5e-combat-helper.kata.note.avalancheProne",
        effects: [
          {
            type: "damage",
            target: "first_target",
            formula: { source: "attacker_skill_rank", skill: "fitness" },
            ignoresArmor: true,
          },
        ],
      },
    ],
    cardNote: "l5r5e-combat-helper.kata.note.avalancheBlunt",
  },
  {
    // Libro Básico p. 180. Costs exactly the target's Vigilance in
    // opportunities; needs a second readied weapon not used for the attack.
    names: ["Spinning Blades Style", "Estilo de las hojas giratorias"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000028"],
    requiresSecondaryWeapon: true,
    activation: {
      type: "passive_on_roll",
      skills: ["melee", "unarmed"],
      ring: ["earth", "air", "water", "fire", "void"],
    },
    onOpportunity: [
      {
        ring: ["earth", "air", "water", "fire", "void"],
        costMin: { source: "target_vigilance", min: 1 },
        costMax: { source: "target_vigilance", min: 1 },
        spendKey: "l5r5e-combat-helper.kata.chat.passiveSpendGeneric",
        effects: [
          {
            type: "damage",
            target: "first_target",
            formula: { source: "weapon_base", slot: "secondary" },
          },
          {
            type: "damage",
            target: "first_target",
            formula: { source: "attacker_roll_skill_rank" },
            increasesPrior: { source: "weapon_base", slot: "secondary" },
            when: { target_has_condition: "dazed" },
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 181. The extra characters (range 0-2 of the target)
    // are the tokens the player targets when pressing the button.
    names: ["Pelting Hail Style", "Estilo del vendaval de granizo"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000032"],
    activation: {
      type: "passive_on_roll",
      skills: ["ranged"],
      ring: ["earth", "air", "water", "fire", "void"],
    },
    onOpportunity: [
      {
        ring: ["earth", "air", "water", "fire", "void"],
        costMin: 1,
        targetMode: "picked",
        spendKey: "l5r5e-combat-helper.kata.chat.passiveSpendPickTargets",
        hint: "l5r5e-combat-helper.kata.note.peltingHailPick",
        effects: [
          {
            type: "damage",
            target: "target",
            resource: "strife",
            formula: { source: "weapon_base" },
          },
        ],
      },
    ],
  },
  {
    // Libro Básico p. 180. Two opportunities per target; silhouette 3+
    // may resist (Fitness TN 3). The Snaring weapon is not checked.
    names: ["Open-Hand Style", "Estilo de la palma abierta"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000026"],
    activation: {
      type: "passive_on_roll",
      skills: ["unarmed"],
      ring: ["earth", "air", "water", "fire", "void"],
    },
    onOpportunity: [
      {
        ring: ["earth", "air", "water", "fire", "void"],
        costMin: 2,
        costStep: 2,
        chooseStance: true,
        effects: [
          {
            type: "force_stance",
            target: "first_n_by_cost",
            when: { not: { target_silhouette_gte: 3 } },
          },
          {
            type: "resistance_roll",
            target: "first_n_by_cost",
            skill: "fitness",
            difficulty: { source: "fixed", value: 3 },
            when: { target_silhouette_gte: 3 },
            onFailure: [{ type: "force_stance", target: "target" }],
          },
        ],
      },
    ],
    cardNote: "l5r5e-combat-helper.kata.note.openHandSnaring",
  },
  {
    // Libro Básico p. 179. Needs a hit; the target must be Disoriented or
    // unaware of the action (not detectable — the card reminds it).
    names: ["Veiled Menace Style", "Estilo de la amenaza velada"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000027"],
    requiresSuccess: true,
    activation: {
      type: "passive_on_roll",
      skills: ["melee", "unarmed"],
      ring: ["earth", "air", "water", "fire", "void"],
    },
    onOpportunity: [
      {
        ring: ["earth", "air", "water", "fire", "void"],
        costMin: 1,
        spendKey: "l5r5e-combat-helper.kata.chat.passiveSpendCritical",
        effects: [
          {
            type: "critical_strike",
            target: "first_target",
            severity: { source: "weapon_deadliness", plusOpportunitiesSpent: true, bonus: -1 },
          },
        ],
      },
    ],
    cardNote: "l5r5e-combat-helper.kata.note.veiledMenaceTarget",
  },
];

/**
 * Katas without a roll, used from the technique's chat card (manual-katas.ts).
 * `activation.voidPoints` is spent before `onUse` runs; `oncePer: "scene"`
 * is enforced within a combat.
 */
export const MANUAL_KATA_REGISTRY = [
  {
    // Libro Básico p. 175: once per scene, Support action, 1 Void point →
    // remove fatigue equal to your Honor rank.
    names: ["Warrior's Resolve", "La determinación del guerrero"],
    compendiumIds: ["Compendium.l5r5e.core-techniques-kata.Item.L5RCoreKat000007"],
    activation: { type: "manual", voidPoints: 1, oncePer: "scene" },
    onUse: [
      {
        type: "damage",
        target: "attacker",
        mode: "remove",
        formula: { source: "attacker_honor_rank" },
        ignoresArmor: true,
      },
    ],
  },
];

/**
 * Item names vary between compendiums and translations: "Lord Hida's Grip (Crab)",
 * typographic apostrophes, accents, case. Compare on a normalized form without
 * a trailing parenthetical (clan / source tag).
 */
export function normalizeKataName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Whether `item` (an embedded technique or `roll.l5r5e.item`) is this kata. */
export function kataMatchesItem(kata, item) {
  const source = item?._stats?.compendiumSource;
  if (source && kata.compendiumIds?.includes(source)) return true;
  const name = normalizeKataName(item?.name);
  return !!name && kata.names.some((n) => normalizeKataName(n) === name);
}
