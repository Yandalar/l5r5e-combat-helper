/**
 * Void "Don't Defend" Reaction System
 *
 * Provides a combat reaction allowing a target to voluntarily spend
 * a Void Point to accept a Critical Strike instead of defending
 * against an incoming attack.
 *
 * Core responsibilities:
 * - Inject a contextual option into chat attack messages
 * - Validate whether the reaction can be used
 * - Spend a Void Point from the target actor
 * - Revert fatigue damage already applied
 * - Mark the attack as resolved
 * - Generate a Critical Strike notification
 */

import {
  getVoidPoints,
  spendVoidPoint,
  revertFatigueDamage,
  isIncapacitated,
} from "./actor-utils.js";
import { createVoidCriticalStrikeMessage } from "./chat-messages.js";

/**
 * Registers the hook responsible for extending the chat message
 * context menu with the Void reaction option.
 *
 * This hook runs whenever Foundry builds the contextual menu
 * for chat messages.
 */
export function registerVoidDefenseHook() {
  Hooks.on("getChatMessageContextOptions", addVoidOption);
}

/**
 * Injects the "Spend Void - Don't Defend" option into the chat
 * message context menu when the message represents a valid attack.
 *
 * The option will only appear if:
 * - The feature is enabled in module settings
 * - The chat message contains attack metadata
 * - The attack has not already been resolved
 * - The current user owns the target actor (or is GM)
 * - The target has at least one Void Point available
 * - The target is not incapacitated
 *
 * @param {HTMLElement|jQuery} html - Chat message HTML container
 * @param {Array} options - Context menu options array provided by Foundry
 */
function addVoidOption(html, options) {
  let voidChoiceEnabled = true;

  try {
    voidChoiceEnabled = game.settings?.get(
      "l5r5e-combat-helper",
      "enableVoidChoice",
    );
  } catch (e) {}

  if (!voidChoiceEnabled) return;

  // Normalize options array for compatibility between Foundry versions
  const optionsArray = Array.isArray(options)
    ? options
    : Array.isArray(html)
      ? html
      : null;

  if (!optionsArray) {
    console.warn(
      "l5r5e-combat-helper | Could not resolve context menu options array.",
    );
    return;
  }

  optionsArray.push({
    name: game.i18n.localize("l5r5e-combat-helper.contextMenu.spendVoid"),
    icon: '<i class="fas fa-yin-yang"></i>',

    /**
     * Determines whether the option should be visible for the
     * current chat message entry.
     *
     * @param {HTMLElement|jQuery} li - Chat message list element
     * @returns {boolean} True if the option should be displayed
     */
    condition: (li) => {
      let messageId;

      // Extract messageId in a version-tolerant way
      if (li instanceof HTMLElement) {
        messageId = li.dataset.messageId || li.getAttribute("data-message-id");
      } else if (li.jquery || li instanceof jQuery) {
        messageId = li.data("messageId") || li.attr("data-message-id");
      } else {
        messageId =
          li.dataset?.messageId || li.getAttribute?.("data-message-id");
      }

      if (!messageId) return false;

      const message = game.messages.get(messageId);
      if (!message) return false;

      const attackData = message.getFlag("l5r5e-combat-helper", "attackData");
      if (!attackData || attackData.resolved) return false;

      const target = game.actors.get(attackData.targetId);
      if (!target) return false;

      if (!(target.isOwner || game.user.isGM)) return false;

      const voidPoints = getVoidPoints(target);
      if (voidPoints <= 0) return false;

      if (isIncapacitated(target)) return false;

      return true;
    },

    /**
     * Executes when the user selects the Void reaction option.
     *
     * Displays a confirmation dialog and, if accepted,
     * resolves the reaction by delegating to `handleVoidNoDefense`.
     *
     * @param {HTMLElement|jQuery} li - Chat message list element
     */
    callback: async (li) => {
      let messageId;

      if (li instanceof HTMLElement) {
        messageId = li.dataset.messageId || li.getAttribute("data-message-id");
      } else if (li.jquery || li instanceof jQuery) {
        messageId = li.data("messageId") || li.attr("data-message-id");
      } else {
        messageId =
          li.dataset?.messageId || li.getAttribute?.("data-message-id");
      }

      const message = game.messages.get(messageId);
      const attackData = message.getFlag("l5r5e-combat-helper", "attackData");

      const target = game.actors.get(attackData.targetId);
      const attacker = game.actors.get(attackData.attackerId);

      const voidBefore = getVoidPoints(target);

      const confirmed = await Dialog.confirm({
        title: game.i18n.localize(
          "l5r5e-combat-helper.dialog.voidDefense.title",
        ),
        content: game.i18n.format(
          "l5r5e-combat-helper.dialog.voidDefense.content",
          {
            name: target.name,
            damage: attackData.finalDamage,
            void: voidBefore,
          },
        ),
        yes: () => true,
        no: () => false,
        defaultYes: false,
      });

      if (!confirmed) return;

      await handleVoidNoDefense(
        target,
        attacker,
        attackData,
        message,
        voidBefore,
      );
    },
  });
}

/**
 * Executes the Void "Don't Defend" reaction.
 *
 * This process:
 * 1. Spends one Void Point from the target actor
 * 2. Reverts fatigue damage already applied by the attack
 * 3. Marks the attack metadata as resolved
 * 4. Generates a chat notification for the resulting Critical Strike
 *
 * @param {Actor} target - Actor receiving the attack
 * @param {Actor} attacker - Actor who performed the attack
 * @param {Object} attackData - Stored metadata about the attack
 * @param {ChatMessage} message - Chat message containing the attack
 * @param {number} voidBefore - Void Points before spending
 */
async function handleVoidNoDefense(
  target,
  attacker,
  attackData,
  message,
  voidBefore,
) {
  try {
    await spendVoidPoint(target);

    if (attackData.finalDamage > 0) {
      await revertFatigueDamage(target, attackData.finalDamage);
    }

    await message.setFlag("l5r5e-combat-helper", "attackData", {
      ...attackData,
      resolved: true,
    });

    const voidAfter = getVoidPoints(target);

    const weapon = getEquippedWeapon(attacker);

    await createVoidCriticalStrikeMessage(
      target,
      attacker,
      voidBefore,
      voidAfter,
      weapon,
    );
  } catch (error) {
    console.error("❌ Error:", error);
    console.error("Stack:", error.stack);
    ui.notifications.error(
      game.i18n.format("l5r5e-combat-helper.notifications.errorVoid", {
        error: error.message,
      }),
    );
  }
}

/**
 * Retrieves the first equipped or readied weapon from an actor.
 *
 * Used to determine the weapon deadliness value when generating
 * the Critical Strike that replaces the defended attack.
 *
 * @param {Actor} actor - Actor whose inventory will be inspected
 * @returns {Item|null} Equipped weapon item or null if none found
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
