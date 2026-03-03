/**
 * Void "Don't Defend" reaction system.
 *
 * Adds a contextual chat menu option that allows a target to spend
 * a Void Point to willingly suffer a Critical Strike instead of
 * defending against an incoming attack.
 *
 * This system:
 * - Reads attack metadata stored on chat messages
 * - Validates eligibility conditions
 * - Reverts previously applied fatigue damage
 * - Consumes a Void Point
 * - Triggers a Critical Strike notification
 */

import {
  getVoidPoints,
  spendVoidPoint,
  revertFatigueDamage,
  isIncapacitated,
} from "./actor-utils.js";
import { createVoidCriticalStrikeMessage } from "./chat-messages.js";

/**
 * Registers the chat context menu hook responsible for injecting
 * the Void reaction option into eligible combat messages.
 *
 * Uses the Foundry VTT context menu extension system to dynamically
 * append an option to chat entries that contain valid attack metadata.
 */
export function registerVoidDefenseHook() {
  Hooks.on("getChatMessageContextOptions", addVoidOption);
}

/**
 * Injects the "Spend Void - Don't Defend" option into the chat
 * message context menu when appropriate.
 *
 * The option will only appear if:
 * - The feature is enabled in world settings
 * - The message contains unresolved attack metadata
 * - The current user owns the target actor (or is GM)
 * - The target has available Void Points
 * - The target is not already incapacitated
 *
 * This function is intentionally defensive, performing multiple
 * validation checks to prevent invalid state manipulation.
 */
function addVoidOption(options) {
  // Safe check for setting
  let voidChoiceEnabled = true;
  try {
    voidChoiceEnabled = game.settings?.get(
      "l5r5e-combat-helper",
      "enableVoidChoice",
    );
  } catch (e) {}

  if (!voidChoiceEnabled) {
    return;
  }

  options.push({
    name: "Spend Void - Don't Defend",
    icon: '<i class="fas fa-yin-yang"></i>',
    condition: (li) => {
      let messageId;

      // Extract messageId in a version-tolerant way.
      // Depending on Foundry version or rendering context,
      // `li` may be a native HTMLElement or a jQuery wrapper.
      if (li instanceof HTMLElement) {
        messageId = li.dataset.messageId || li.getAttribute("data-message-id");
      } else if (li.jquery || li instanceof jQuery) {
        messageId = li.data("messageId") || li.attr("data-message-id");
      } else {
        messageId =
          li.dataset?.messageId || li.getAttribute?.("data-message-id");
      }

      if (!messageId) {
        return false;
      }

      const message = game.messages.get(messageId);
      if (!message) {
        return false;
      }

      const attackData = message.getFlag("l5r5e-combat-helper", "attackData");

      if (!attackData || attackData.resolved) {
        return false;
      }

      const target = game.actors.get(attackData.targetId);
      if (!target) {
        return false;
      }

      if (!(target.isOwner || game.user.isGM)) {
        return false;
      }

      const voidPoints = getVoidPoints(target);

      if (voidPoints <= 0) {
        return false;
      }

      if (isIncapacitated(target)) {
        return false;
      }

      return true;
    },
    /**
     * Executes when the user selects the Void reaction option.
     *
     * Workflow:
     * 1. Resolve message and associated attack metadata.
     * 2. Confirm user intent via dialog.
     * 3. If confirmed, delegate to `handleVoidNoDefense`.
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
        title: "Spend Void Point - Don't Defend",
        content: `
          <p><strong>${target.name}</strong>, spend 1 Void Point to NOT defend?</p>
          <p><em>You will suffer a <strong>Critical Strike</strong> instead of ${attackData.finalDamage} fatigue damage.</em></p>
          <p>Current Void: ${voidBefore}</p>
        `,
        yes: () => true,
        no: () => false,
        defaultYes: false,
      });

      if (!confirmed) {
        return;
      }

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
 * Resolves the Void "Don't Defend" reaction.
 *
 * Effects:
 * - Spends one Void Point from the target.
 * - Reverts previously applied fatigue damage (if any).
 * - Marks the attack metadata as resolved to prevent reuse.
 * - Generates a Critical Strike chat notification.
 *
 * This function ensures state consistency by:
 * - Preventing double resolution
 * - Updating actor and message documents atomically
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
    await createVoidCriticalStrikeMessage(
      target,
      attacker,
      voidBefore,
      voidAfter,
    );
  } catch (error) {
    console.error("❌ Error:", error);
    console.error("Stack:", error.stack);
    ui.notifications.error("Error: " + error.message);
  }
}
