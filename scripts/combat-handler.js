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

import {
  getCurrentFatigue,
  getEndurance,
  isAtCriticalState,
} from "./actor-utils.js";
import {
  checkAttackSuccess,
  calculateDamage,
  getArmorResistance,
} from "./damage-calculator.js";
import {
  createDamageMessage,
  createArmorBlockedMessage,
  createCriticalStrikeMessage,
} from "./chat-messages.js";

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

    try {
      if (!message.rolls || message.rolls.length === 0) return;

      const roll = message.rolls[0];
      if (!roll.l5r5e) return;

      const l5rData = roll.l5r5e;
      const attackSkills = ["melee", "ranged", "unarmed"];
      const isAttack =
        attackSkills.includes(l5rData.skillId) && l5rData.rnkEnded === true;
      const isFinished = l5rData.rnkEnded === true;

      if (!isAttack || !isFinished) return;

      const attacker = message.speaker?.actor
        ? game.actors.get(message.speaker.actor)
        : null;

      if (!attacker) return;

      let target = null;

      if (l5rData.target?.actor) {
        target = l5rData.target.actor;
      } else {
        const targets = Array.from(game.user.targets);
        if (targets.length === 0) {
          ui.notifications.warn(
            game.i18n.localize("l5r5e-combat-helper.notifications.noTargets"),
          );
          return;
        }
        target = targets[0].actor;
      }

      if (!target) return;

      const wasCritical = isAtCriticalState(target);

      if (wasCritical) {
        const weapon = getEquippedWeapon(attacker);
        await createCriticalStrikeMessage(target, attacker, weapon);
        return;
      }

      const success = checkAttackSuccess(l5rData);
      if (!success) return;

      const rawDamage = calculateDamage(l5rData, attacker);
      const armorResistance = getArmorResistance(target);
      const finalDamage = Math.max(0, rawDamage - armorResistance);

      const attackData = {
        attackerId: attacker.id,
        targetId: target.id,
        rawDamage,
        armorResistance,
        finalDamage,
        timestamp: Date.now(),
        resolved: false,
      };

      await message.setFlag("l5r5e-combat-helper", "attackData", attackData);

      await applyDamage(
        target,
        finalDamage,
        attacker,
        rawDamage,
        armorResistance,
        attackData,
      );
    } catch (error) {
      console.error("L5R5e Combat Helper | Error:", error);
    }
  });
}

/**
 * Gets the first equipped or readied weapon from an actor.
 * Used to determine weapon deadliness for critical strikes.
 *
 * @param {Actor} actor
 * @returns {Item|null}
 */
function getEquippedWeapon(actor) {
  if (!actor || !actor.items) return null;

  const weapons = actor.items.filter(
    (item) =>
      item.type === "weapon" &&
      (item.system?.equipped === true || item.system?.readied === true),
  );

  return weapons.length > 0 ? weapons[0] : null;
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
