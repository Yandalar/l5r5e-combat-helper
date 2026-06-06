// @ts-nocheck
/**
 * GM Target Assignment
 *
 * Allows the GM to retroactively assign or reassign the target of a
 * finished martial attack roll via the chat message context menu.
 *
 * Covers two cases:
 * - No target at roll time (player forgot to select one)
 * - Wrong target (damage already applied to the wrong actor)
 *
 * Flow:
 * 1. GM targets a token on the canvas.
 * 2. GM right-clicks the attack roll message.
 * 3. Selects "Asignar Target".
 * 4. Confirmation dialog shows predicted damage (and reversal details if reassigning).
 * 5. On confirm: prior fatigue is reverted, new damage is processed.
 */

import { resolveMessageId, confirmDialog } from "./core/compat-utils";
import { revertFatigueDamage } from "./core/actor-utils";
import {
  checkAttackSuccess,
  calculateDamage,
  getArmorResistance,
} from "./core/damage-calculator";
import { getAirTNBonus, getFireStrifeBonus } from "./stances/stance-effects";
import { processAttack } from "./combat-handler";

/**
 * Registers the context menu hook that injects the "Asignar Target"
 * option into eligible attack roll chat messages.
 *
 * @returns {void}
 */
export function registerTargetAssignmentMenu() {
  Hooks.on("getChatMessageContextOptions", addAssignTargetOption);
}

/**
 * Injects the "Asignar Target" option into the chat message context menu.
 *
 * The option appears only when ALL of the following are true:
 * - The current user is the GM
 * - The message contains a finished martial attack roll
 *   (skillId ∈ [melee, ranged, unarmed] with rnkEnded = true)
 *
 * @param {HTMLElement|jQuery} html - Chat message HTML container
 * @param {Array} options - Context menu options array
 */
function addAssignTargetOption(html, options) {
  const optionsArray = Array.isArray(options)
    ? options
    : Array.isArray(html)
      ? html
      : null;

  if (!optionsArray) return;

  optionsArray.push({
    name: game.i18n.localize("l5r5e-combat-helper.contextMenu.assignTarget"),
    icon: '<i class="fas fa-crosshairs"></i>',

    condition: (li) => {
      if (!game.user.isGM) return false;

      const messageId = resolveMessageId(li);
      if (!messageId) return false;

      const message = game.messages.get(messageId);
      if (!message) return false;

      if (!message.rolls || message.rolls.length === 0) return false;
      const roll = message.rolls[0];
      if (!roll.l5r5e) return false;

      const l5rData = roll.l5r5e;
      const attackSkills = ["melee", "ranged", "unarmed"];
      if (!attackSkills.includes(l5rData.skillId) || !l5rData.rnkEnded) {
        return false;
      }

      return true;
    },

    callback: async (li) => {
      const messageId = resolveMessageId(li);
      if (!messageId) return;

      const message = game.messages.get(messageId);
      if (!message) return;

      // 1. Validate a target token is currently selected on the canvas
      const targets = Array.from(game.user.targets);
      if (targets.length === 0) {
        ui.notifications.warn(
          game.i18n.localize(
            "l5r5e-combat-helper.notifications.assignTarget.noTarget",
          ),
        );
        return;
      }

      const newTarget = targets[0].actor;
      if (!newTarget) return;

      // 2. Resolve the attacker from message flags or speaker
      const attackData = message.getFlag(
        "l5r5e-combat-helper",
        "attackData",
      );
      const pendingTarget = message.getFlag(
        "l5r5e-combat-helper",
        "pendingTarget",
      );
      const attackerId =
        attackData?.attackerId ||
        pendingTarget?.attackerId ||
        message.speaker?.actor;
      const attacker = attackerId ? game.actors.get(attackerId) : null;

      if (!attacker) {
        ui.notifications.warn(
          game.i18n.localize(
            "l5r5e-combat-helper.notifications.assignTarget.noAttacker",
          ),
        );
        return;
      }

      // 3. Read roll data from the message
      const l5rData = message.rolls?.[0]?.l5r5e;
      if (!l5rData) return;

      try {
        // 4. Compute predicted damage on the new target
        const airBonus = getAirTNBonus(newTarget);
        const success = checkAttackSuccess(l5rData, airBonus);
        const rawDamage = calculateDamage(l5rData, attacker);
        const armorResistance = getArmorResistance(newTarget);
        const fireBonus = getFireStrifeBonus(attacker, l5rData);
        const finalDamage = success
          ? Math.max(0, rawDamage + fireBonus - armorResistance)
          : 0;

        // 5. Show confirmation dialog — content varies based on whether
        //    prior damage was already applied
        let confirmed = false;

        if (attackData?.targetId) {
          const oldTarget = game.actors.get(attackData.targetId);
          confirmed = await confirmDialog({
            title: game.i18n.localize(
              "l5r5e-combat-helper.dialog.assignTarget.title",
            ),
            content: game.i18n.format(
              "l5r5e-combat-helper.dialog.assignTarget.contentReassign",
              {
                attacker: attacker.name,
                oldTarget: oldTarget?.name ?? "???",
                newTarget: newTarget.name,
                revertDamage: attackData.finalDamage,
                finalDamage,
                rawDamage,
                armor: armorResistance,
              },
            ),
          });
        } else {
          confirmed = await confirmDialog({
            title: game.i18n.localize(
              "l5r5e-combat-helper.dialog.assignTarget.title",
            ),
            content: game.i18n.format(
              "l5r5e-combat-helper.dialog.assignTarget.contentSimple",
              {
                attacker: attacker.name,
                newTarget: newTarget.name,
                finalDamage,
                rawDamage,
                armor: armorResistance,
              },
            ),
          });
        }

        if (!confirmed) return;

        // 6. Revert prior damage if this is a reassignment
        if (attackData?.targetId) {
          // Find the active (unresolved) damage message linked to this roll
          const oldDamageMessage = game.messages.find((m) => {
            const ad = m.getFlag("l5r5e-combat-helper", "attackData");
            return ad?.rollMessageId === messageId && !ad?.resolved;
          });

          if (oldDamageMessage) {
            await oldDamageMessage.delete();
          }

          // Revert fatigue from the previous target
          if (attackData.finalDamage > 0) {
            const oldTarget = game.actors.get(attackData.targetId);
            if (oldTarget) {
              await revertFatigueDamage(oldTarget, attackData.finalDamage);
            }
          }
        }

        // Clear pending flag now that the attack is being processed
        await message.unsetFlag("l5r5e-combat-helper", "pendingTarget");

        // 7. Process the attack with the new target
        await processAttack(message, attacker, newTarget, l5rData);
      } catch (error) {
        console.error("L5R5e Combat Helper | Target Assignment error:", error);
        ui.notifications.error(
          game.i18n.format(
            "l5r5e-combat-helper.notifications.assignTarget.error",
            { error: error.message },
          ),
        );
      }
    },
  });
}
