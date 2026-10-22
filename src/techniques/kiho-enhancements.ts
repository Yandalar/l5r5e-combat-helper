// @ts-nocheck
/**
 * Kihō enhancement effects in the combat flow (ticket K2). Read by
 * combat-handler.processAttack and critical-mitigation; each modifier comes
 * from the active kihō of the attacker (unarmed attacks only) or of the
 * defender. Resistance (+1, Earthen Fist) and Vigilance (Earth Needs No
 * Eyes) are added where those values are read: damage-calculator and
 * actor-utils.
 */
import { MODULE_ID } from "../core/module-constants";
import { hasCondition } from "../core/conditions";
import { getSkillRank } from "../core/actor-utils";
import { resolveActor } from "../core/actor-refs";
import { activeKihoOf } from "./kiho-registry";

const SKILL_CATEGORIES = { unarmed: "martial", meditation: "martial", fitness: "martial" };

const ring = (actor, r) => parseInt(actor?.system?.rings?.[r]) || 0;
const skill = (actor, id) => getSkillRank(actor, id, SKILL_CATEGORIES);
const kihoId = (actor) => activeKihoOf(actor)?.enhancement?.id ?? null;
const note = (key, data) => game.i18n.format(`l5r5e-combat-helper.kiho.combat.${key}`, data);

/**
 * Attacker-side modifiers for an unarmed attack (punch or kick).
 * @returns {{ baseOverride: number|null, damageBonus: number, armorIgnored: number,
 *   damageType: "physical"|"supernatural", deadlinessBonus: number, deadlinessOverride: number|null,
 *   sharp: boolean, notes: string[] }}
 */
export function attackModifiers(attacker, target, l5rData) {
  const mods = {
    baseOverride: null,
    damageBonus: 0,
    armorIgnored: 0,
    damageType: "physical",
    deadlinessBonus: 0,
    deadlinessOverride: null,
    sharp: false,
    notes: [],
  };
  if (l5rData?.skillId !== "unarmed") return mods;
  const kiho = activeKihoOf(attacker);
  if (!kiho) return mods;
  const name = kiho.names[0];

  switch (kiho.enhancement.id) {
    case "earthenFist":
      mods.damageBonus += ring(attacker, "earth");
      mods.notes.push(note("damageBonus", { kiho: name, amount: ring(attacker, "earth") }));
      break;
    case "waterFist":
      mods.armorIgnored = 2 * ring(attacker, "water");
      mods.notes.push(note("armorIgnored", { kiho: name, amount: mods.armorIgnored }));
      break;
    case "flameFist":
      mods.deadlinessBonus += ring(attacker, "fire");
      mods.damageType = "supernatural";
      mods.notes.push(note("supernatural", { kiho: name, amount: ring(attacker, "fire") }));
      break;
    case "fallingStar":
      if (hasCondition(target, "dazed")) {
        mods.damageBonus += ring(attacker, "fire");
        mods.notes.push(note("damageBonus", { kiho: name, amount: ring(attacker, "fire") }));
      }
      break;
    case "edgelessSword": {
      const value = skill(attacker, "unarmed") + ring(attacker, "void");
      mods.baseOverride = value;
      mods.deadlinessOverride = value;
      mods.sharp = true;
      mods.notes.push(note("edgelessSword", { kiho: name, amount: value }));
      break;
    }
    case "deathTouch":
      mods.armorIgnored = Infinity;
      mods.notes.push(note("deathTouch", { kiho: name }));
      break;
  }
  return mods;
}

/** Critical severity for an unarmed critical under the attacker's kihō, or null when no kihō changes it. */
export function criticalSeverityFor(mods, baseDeadliness) {
  if (mods.deadlinessOverride === null && mods.deadlinessBonus === 0) return null;
  return (mods.deadlinessOverride ?? baseDeadliness) + mods.deadlinessBonus;
}

/** +TN to Attack checks targeting `target` (Way of the Willow burst). */
export function incomingAttackTnBonus(target) {
  return target?.getFlag?.(MODULE_ID, "incomingAttackTnBonus")?.amount ?? 0;
}

/**
 * Defender-side modifiers to the damage of one attack.
 * @returns {{ damageReduction: number, preArmorReduction: number, damageCap: number|null,
 *   proneSource: boolean, anvilMark: boolean, notes: string[] }}
 */
export function defenseModifiers(target, attacker, l5rData) {
  const mods = { damageReduction: 0, preArmorReduction: 0, damageCap: null, proneSource: false, anvilMark: false, notes: [] };
  const kiho = activeKihoOf(target);
  const name = kiho?.names[0];

  if (kiho?.enhancement.id === "willow") {
    const opportunities = parseInt(l5rData?.summary?.opportunity) || 0;
    if (opportunities > 0) {
      mods.damageReduction = 2 * opportunities;
      mods.notes.push(note("damageReduced", { kiho: name, amount: mods.damageReduction }));
    }
  }

  if (kiho?.enhancement.id === "bodyAnvil") {
    const mark = target.getFlag(MODULE_ID, "kihoMark");
    if (mark?.key === "anvil" && resolveActor(mark.targetId) === attacker) {
      mods.anvilMark = true;
      mods.preArmorReduction = ring(target, "fire");
      mods.notes.push(note("damageReduced", { kiho: name, amount: mods.preArmorReduction }));
    }
  }

  const cap = target?.getFlag?.(MODULE_ID, "kihoDamageCap");
  if (cap) {
    mods.damageCap = cap.cap;
    mods.proneSource = cap.proneSource;
  }
  return mods;
}

/** Whether `target`'s kihō retaliates when it defends against an attack's damage (The Body Is an Anvil). */
export function anvilRetaliation(target) {
  if (kihoId(target) !== "bodyAnvil") return null;
  return { kiho: activeKihoOf(target).names[0], damage: ring(target, "fire") };
}

/** Severity reduction for critical strikes the actor suffers from physical sources (Grasp the Earth Dragon). */
export function criticalSeverityReduction(actor) {
  return kihoId(actor) === "graspEarthDragon" ? ring(actor, "earth") : 0;
}
