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
export const KIHO_REGISTRY = [];
