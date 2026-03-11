/**
 * Opportunity-Based Critical Strike Handler
 *
 * In L5R5e, a successful attack with 2 or more Opportunities allows the
 * attacker to spend those Opportunities to inflict a Critical Strike on
 * the target in addition to the normal damage already applied.
 *
 * This module:
 * - Registers a click handler for the "Use Opportunities" button embedded
 *   in attack damage messages.
 * - Validates that the opportunity critical has not already been triggered.
 * - Verifies the current user has permission to act as the attacker.
 * - Generates a Critical Strike message and launches the target's Fitness
 *   mitigation roll, reusing the existing critical strike infrastructure.
 */

import { createCriticalStrikeMessage } from "./chat-messages.js";

/**
 * Registers the renderChatMessage hook that attaches click listeners
 * to opportunity critical buttons in damage messages.
 *
 * @returns {void}
 */
export function registerOpportunityCriticalHandler() {
  Hooks.on("renderChatMessage", (message, html) => {
    html.find(".opportunity-critical-button").click(async (event) => {
      event.preventDefault();
      await handleOpportunityCriticalClick(message, event.currentTarget);
    });
  });
}

/**
 * Handles a click on the "Use Opportunities — Critical Strike" button.
 *
 * Workflow:
 * 1. Retrieve stored attack metadata from message flags.
 * 2. Verify the button has not already been used.
 * 3. Check that the current user owns the attacker (or is GM).
 * 4. Disable the button immediately to prevent double-triggering.
 * 5. Resolve attacker, target, and weapon from stored IDs.
 * 6. Mark the opportunity critical as used in the message flag.
 * 7. Generate the Critical Strike message and launch the Fitness check.
 *
 * @param {ChatMessage} message - The damage message containing the button
 * @param {HTMLElement} button - The button element that was clicked
 * @returns {Promise<void>}
 */
async function handleOpportunityCriticalClick(message, button) {
  try {
    if (button.disabled) return;

    const attackData = message.getFlag("l5r5e-combat-helper", "attackData");

    if (!attackData) {
      ui.notifications.error(
        game.i18n.localize(
          "l5r5e-combat-helper.notifications.criticalDataNotFound",
        ),
      );
      return;
    }

    if (attackData.opportunityCriticalUsed) {
      ui.notifications.info(
        game.i18n.localize(
          "l5r5e-combat-helper.notifications.opportunityCriticalAlreadyUsed",
        ),
      );
      button.disabled = true;
      button.textContent = game.i18n.localize(
        "l5r5e-combat-helper.chat.opportunityCritical.usedButton",
      );
      return;
    }

    const attacker = game.actors.get(attackData.attackerId);
    if (!attacker) {
      ui.notifications.error(
        game.i18n.localize(
          "l5r5e-combat-helper.notifications.attackerNotFound",
        ),
      );
      return;
    }

    // Only the attacker's owner (or GM) may spend their opportunities
    if (!attacker.isOwner && !game.user.isGM) {
      ui.notifications.warn(
        game.i18n.localize("l5r5e-combat-helper.notifications.noPermission"),
      );
      return;
    }

    const target = game.actors.get(attackData.targetId);
    if (!target) {
      ui.notifications.error(
        game.i18n.localize("l5r5e-combat-helper.notifications.targetNotFound"),
      );
      return;
    }

    button.disabled = true;
    button.textContent = game.i18n.localize(
      "l5r5e-combat-helper.chat.opportunityCritical.processingButton",
    );

    // Retrieve the weapon used in the attack
    const weapon = attackData.weaponId
      ? attacker.items.get(attackData.weaponId)
      : getEquippedWeapon(attacker);

    // Mark as used before any async work to prevent race conditions
    await message.setFlag("l5r5e-combat-helper", "attackData", {
      ...attackData,
      opportunityCriticalUsed: true,
    });

    await createCriticalStrikeMessage(target, attacker, weapon);

    button.textContent = game.i18n.localize(
      "l5r5e-combat-helper.chat.opportunityCritical.usedButton",
    );
  } catch (error) {
    console.error(
      "L5R5e Combat Helper | Error handling opportunity critical:",
      error,
    );
    ui.notifications.error(
      game.i18n.format(
        "l5r5e-combat-helper.notifications.errorOpportunityCritical",
        { error: error.message },
      ),
    );
    button.disabled = false;
    button.textContent = game.i18n.localize(
      "l5r5e-combat-helper.chat.opportunityCritical.button",
    );
  }
}

/**
 * Returns the first equipped or readied weapon from an actor.
 * Fallback used when no weaponId was stored in the attack metadata.
 *
 * @param {Actor} actor
 * @returns {Item|null}
 */
function getEquippedWeapon(actor) {
  if (!actor?.items) return null;
  return (
    actor.items.find(
      (item) =>
        item.type === "weapon" &&
        (item.system?.equipped === true || item.system?.readied === true),
    ) || null
  );
}
