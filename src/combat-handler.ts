// @ts-nocheck
/**
 * Combat roll interception and automatic damage resolution.
 *
 * This module listens for completed L5R5e martial attack rolls and,
 * when appropriate, applies fatigue damage automatically to the
 * selected target.
 *
 * Responsibilities:
 * - Detect valid finished attack rolls
 * - Resolve hit success
 * - Calculate damage and armor mitigation
 * - Apply fatigue updates to the target
 * - Generate appropriate chat feedback messages
 */

import { actorRef, rollActor } from "./core/actor-refs";
import {
  getCurrentFatigue,
  getEndurance,
  isAtCriticalState,
  applyFatigue,
} from "./core/actor-utils";
import {
  checkAttackSuccess,
  calculateDamage,
  getArmorResistance,
} from "./core/damage-calculator";
import { resolveAttackWeapon, getWeaponBaseDamage, getWeaponDeadliness } from "./core/weapon-utils";
import {
  createDamageMessage,
  createArmorBlockedMessage,
  createCriticalStrikeMessage,
  createAirDeflectMessage,
} from "./ui/chat-messages";
import {
  getAirTNBonus,
  getFireStrifeBonus,
} from "./stances/stance-effects";
import { removeTnReductionActiveEffect } from "./techniques/token-effects";
import {
  attackModifiers,
  defenseModifiers,
  incomingAttackTnBonus,
  anvilRetaliation,
  criticalSeverityFor,
} from "./techniques/kiho-enhancements";
import { kihoReactionsFor, kihoHitChoices } from "./techniques/kiho-reactions";
import { applyDamagedQualityToWeapon } from "./reactions/shattering-parry";
import { isResponsibleClient } from "./core/compat-utils";

/**
 * Registers the main combat handler hook.
 *
 * Hooks into the `createChatMessage` event to inspect newly created
 * chat messages. When a completed L5R5e martial attack roll is detected,
 * the handler automatically resolves damage and applies fatigue to
 * the appropriate target.
 *
 * Execution flow:
 * 1. Validate module setting is enabled.
 * 2. Ensure the message contains a valid L5R5e roll.
 * 3. Confirm it is a finished martial attack roll.
 * 4. Resolve attacker and target.
 * 5. Check for critical pre-state.
 * 6. Evaluate hit success.
 * 7. Calculate raw damage and armor mitigation.
 * 8. Store attack metadata for later interactions (Void choice).
 * 9. Apply damage.
 *
 * @returns {void}
 */
export function registerCombatHandler() {
  Hooks.on("createChatMessage", async (message) => {
    if (!game.settings.get("l5r5e-combat-helper", "l5r5eCombatHelper")) return;
    if (!isResponsibleClient(message)) return;

    try {
      if (!message.rolls || message.rolls.length === 0) return;

      const roll = message.rolls[0];
      if (!roll.l5r5e) return;

      const l5rData = roll.l5r5e;
      const attackSkills = ["melee", "ranged", "unarmed"];
      const isAttack =
        attackSkills.includes(l5rData.skillId) && l5rData.rnkEnded === true;
      const isFinished = l5rData.rnkEnded === true;
      // Kata and kihō activations handle their own damage — skip normal combat processing
      const isTechniqueActivation = ["kata", "kiho"].includes(l5rData.item?.system?.technique_type);

      if (!isAttack || !isFinished || isTechniqueActivation) return;

      const attacker = rollActor(message, l5rData);

      if (!attacker) return;

      if (l5rData.target?.actor) {
        await processAttack(message, attacker, l5rData.target.actor, l5rData);
      } else {
        const targets = Array.from(game.user.targets);
        if (targets.length === 0) {
          await message.setFlag("l5r5e-combat-helper", "pendingTarget", {
            attackerId: actorRef(attacker),
          });
          ui.notifications.warn(
            game.i18n.localize("l5r5e-combat-helper.notifications.noTargets"),
          );
          return;
        }
        for (const token of targets) {
          if (token.actor) await processAttack(message, attacker, token.actor, l5rData);
        }
      }
    } catch (error) {
      console.error("L5R5e Combat Helper | Error:", error);
    }
  });
}

/**
 * Resolves an attack roll against a specific target.
 *
 * Shared by the automatic `createChatMessage` hook and the GM's
 * retroactive target assignment flow.
 *
 * @param {ChatMessage} rollMessage - The attack roll chat message
 * @param {Actor} attacker - Actor performing the attack
 * @param {Actor} target - Actor receiving the attack
 * @param {Object} l5rData - L5R5e roll data from message.rolls[0].l5r5e
 * @returns {Promise<void>}
 */
export async function processAttack(rollMessage, attacker, target, l5rData) {
  const wasCritical = isAtCriticalState(target);
  const activeKataEffects =
    target.getFlag("l5r5e-combat-helper", "activeKataEffects") || [];
  const hasAssistance = activeKataEffects.some((e) => e.type === "assistance");

  // Kihō enhancements: the attacker's (unarmed attacks) and the target's.
  const atk = attackModifiers(attacker, target, l5rData);

  if (wasCritical) {
    const weapon = resolveAttackWeapon(l5rData, attacker);
    const severity = criticalSeverityFor(atk, getWeaponDeadliness(weapon));
    await createCriticalStrikeMessage(target, attacker, weapon, rollMessage.id, "incapacitated", {
      severity: severity ?? undefined,
      sharp: atk.sharp,
    });
    return;
  }

  const pendingTnReduction = target.getFlag("l5r5e-combat-helper", "pendingTnReduction");
  const tnReduction = pendingTnReduction?.amount || 0;
  if (pendingTnReduction) {
    await target.unsetFlag("l5r5e-combat-helper", "pendingTnReduction");
    await removeTnReductionActiveEffect(target);
  }

  // Air stance and Way of the Willow's burst raise the TN of attacks against the target.
  const airBonus = getAirTNBonus(target) + incomingAttackTnBonus(target);
  const success = checkAttackSuccess(l5rData, airBonus - tnReduction);
  const tnReductionDecisive =
    tnReduction > 0 && success && !checkAttackSuccess(l5rData, airBonus);

  if (!success) {
    if (airBonus > 0 && checkAttackSuccess(l5rData, 0)) {
      await createAirDeflectMessage(target, attacker, airBonus);
    }
    return;
  }

  const equippedWeapon = resolveAttackWeapon(l5rData, attacker);
  const def = defenseModifiers(target, attacker, l5rData);

  let rawDamage = calculateDamage(l5rData, attacker) + atk.damageBonus;
  if (atk.baseOverride !== null) rawDamage += atk.baseOverride - getWeaponBaseDamage(equippedWeapon);
  // The Body Is an Anvil (burst): damage from the marked opponent is reduced before defending.
  rawDamage = Math.max(0, rawDamage - def.preArmorReduction);
  const resistance = getArmorResistance(target, atk.damageType);
  const armorResistance = Math.max(0, resistance - atk.armorIgnored);
  const fireBonus = getFireStrifeBonus(attacker, l5rData);
  let finalDamage = Math.max(0, rawDamage + fireBonus - armorResistance - def.damageReduction);
  // Grasp the Earth Dragon (burst): physical damage suffered is reduced to the cap.
  const capped = def.damageCap !== null && atk.damageType === "physical" && finalDamage > def.damageCap;
  if (capped) finalDamage = def.damageCap;

  const kihoNotes = [...atk.notes, ...def.notes];
  if (capped) kihoNotes.push(game.i18n.format("l5r5e-combat-helper.kiho.combat.damageCapped", { cap: def.damageCap }));
  kihoNotes.push(...(await kihoDefenseSideEffects(target, attacker, equippedWeapon, armorResistance, finalDamage, def, atk)));

  const opportunities = l5rData.summary?.opportunity || 0;

  const originalTn = (l5rData.difficulty || 2) + airBonus;

  const attackData = {
    attackerId: actorRef(attacker),
    targetId: actorRef(target),
    weaponId: equippedWeapon?.id || null,
    rawDamage,
    armorResistance,
    fireBonus,
    finalDamage,
    opportunities,
    opportunityCriticalUsed: false,
    hasAssistance,
    tnReductionApplied: tnReductionDecisive ? { amount: tnReduction, originalTn, effectiveTn: originalTn - tnReduction } : null,
    kihoNotes,
    critSeverity: criticalSeverityFor(atk, getWeaponDeadliness(equippedWeapon)),
    critSharp: atk.sharp,
    // Buttons for Void-spending kihō reactions (Death Touch defense, Grasp the Earth Dragon).
    kihoReactions: kihoReactionsFor(attacker, target, l5rData, {
      ignoredResistance: resistance - armorResistance,
      finalDamage,
    }),
    timestamp: Date.now(),
    resolved: false,
    rollMessageId: rollMessage.id,
  };

  await rollMessage.setFlag("l5r5e-combat-helper", "attackData", attackData);

  await applyDamage(
    target,
    finalDamage,
    attacker,
    rawDamage,
    armorResistance,
    attackData,
    fireBonus,
  );

  // Freezing the Lifeblood and Breaking Blow: choice cards after the hit.
  await kihoHitChoices(attacker, target, l5rData, armorResistance);
}

/**
 * Kihō effects triggered by the target defending against this attack's damage
 * (its resistance reduced it): The Body Is an Anvil retaliates; its burst
 * mark damages the opponent's weapon and sets it Burning when the damage is
 * fully stopped; Grasp the Earth Dragon's burst knocks the attacker Prone.
 * Returns the chat lines for the damage card.
 */
async function kihoDefenseSideEffects(target, attacker, weapon, armorResistance, finalDamage, def, atk) {
  const notes = [];
  const defended = armorResistance > 0;

  const anvil = anvilRetaliation(target);
  if (anvil && defended) {
    const damage = Math.max(0, anvil.damage - getArmorResistance(attacker, "supernatural"));
    if (damage > 0) await applyFatigue(attacker, damage);
    await attacker.toggleStatusEffect("dazed", { active: true });
    notes.push(game.i18n.format("l5r5e-combat-helper.kiho.combat.anvilRetaliation", { kiho: anvil.kiho, attacker: attacker.name, damage }));
  }

  if (def.anvilMark && defended) {
    await target.unsetFlag("l5r5e-combat-helper", "kihoMark");
    if (finalDamage === 0) {
      if (weapon?.id && attacker.items?.get(weapon.id)) await applyDamagedQualityToWeapon(weapon, attacker);
      await attacker.toggleStatusEffect("burning", { active: true });
      notes.push(game.i18n.format("l5r5e-combat-helper.kiho.combat.anvilBurst", { attacker: attacker.name }));
    }
  }

  if (def.proneSource && finalDamage > 0 && atk.damageType === "physical") {
    await attacker.toggleStatusEffect("prone", { active: true });
    notes.push(game.i18n.format("l5r5e-combat-helper.kiho.combat.proneSource", { attacker: attacker.name }));
  }
  return notes;
}

/**
 * Applies fatigue damage to the target actor.
 *
 * Behavior:
 * - If damage is 0 or below, generates an armor-blocked message.
 * - Dynamically resolves the fatigue data path.
 * - Updates the actor's fatigue value.
 * - Detects whether the target has just crossed the Endurance threshold.
 * - Generates a damage result message.
 *
 * This function is intentionally schema-tolerant and does not assume
 * a single fatigue data structure.
 *
 * @param {Actor} target - Actor receiving the damage
 * @param {number} damage - Final damage after armor reduction
 * @param {Actor} attacker - Actor dealing the damage
 * @param {number} rawDamage - Original damage before armor
 * @param {number} armorResistance - Armor value applied to reduce damage
 * @param {object} attackData - Metadata describing the attack event
 * @returns {Promise<void>}
 */
async function applyDamage(
  target,
  damage,
  attacker,
  rawDamage,
  armorResistance,
  attackData,
  fireBonus = 0,
) {
  if (!target) {
    console.warn("L5R5e Combat Helper | Invalid target");
    return;
  }

  if (damage <= 0) {
    await createArmorBlockedMessage(
      target,
      attacker,
      rawDamage,
      armorResistance,
      fireBonus,
      attackData?.kihoReactions ?? null,
    );

    return;
  }

  try {
    const currentFatigue = getCurrentFatigue(target);
    const endurance = getEndurance(target);

    let fatigueField = null;
    if (target.system.fatigue?.value !== undefined) {
      fatigueField = "system.fatigue.value";
    } else if (
      target.system.fatigue !== undefined &&
      typeof target.system.fatigue === "number"
    ) {
      fatigueField = "system.fatigue";
    } else if (target.system.attributes?.fatigue !== undefined) {
      fatigueField = "system.attributes.fatigue";
    }

    if (fatigueField === null) {
      console.error(
        "L5R5e Combat Helper | Fatigue field not found. System data:",
        target.system,
      );
      return;
    }

    const newFatigue = currentFatigue + damage;

    const updateData = {};
    updateData[fatigueField] = newFatigue;
    await target.update(updateData);

    const wasIncapacitated =
      newFatigue > endurance && currentFatigue <= endurance;

    await createDamageMessage(
      target,
      damage,
      attacker,
      rawDamage,
      armorResistance,
      currentFatigue,
      newFatigue,
      endurance,
      wasIncapacitated,
      attackData,
      fireBonus,
    );
  } catch (error) {
    console.error("L5R5e Combat Helper | Error applying damage:", error);
    ui.notifications.error(
      game.i18n.format(
        "l5r5e-combat-helper.notifications.errorApplyingDamage",
        {
          error: error.message,
        },
      ),
    );
  }
}
