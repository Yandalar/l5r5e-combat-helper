/**
 * Shattering Parry System
 *
 * Implements the "Shattering Parry" special action for L5R5e.
 *
 * Rule summary:
 *   Once per game session, after a player character rolls dice to resist
 *   a critical strike, they may parry the blow directly, putting the brunt
 *   of the impact on one of their readied weapons. They may reroll ALL of
 *   their dice for the check, and the weapon used gains the Damaged quality.
 *
 * Implementation flow:
 * 1. After a mitigation roll resolves, store the mitigation result data in
 *    the resulting chat message flags so it can be retrieved later.
 * 2. Register a context-menu option on mitigation result messages.
 * 3. When triggered: validate once-per-session usage, confirm with the user,
 *    revert any critical effects already applied, damage the parrying weapon,
 *    mark the session flag as used, and launch a new mitigation roll.
 */

import { reverseCriticalEffect } from "./critical-effects-application.js";

/**
 * Registers the context menu hook that injects the Shattering Parry option
 * into eligible mitigation result chat messages.
 *
 * @returns {void}
 */
export function registerShatteringParryHook() {
  Hooks.on("getChatMessageContextOptions", addShatteringParryOption);
}

/**
 * Injects the "Shattering Parry" context menu option into mitigation messages.
 *
 * The option appears only when ALL of the following conditions are met:
 * - The message contains mitigation result data (flag: shatteringParryData)
 * - Shattering Parry has NOT already been used this session by this actor
 * - The current user owns the target actor (or is GM)
 * - The target has at least one readied or equipped weapon
 * - The critical has not already been re-resolved via Shattering Parry
 *
 * @param {HTMLElement|jQuery} html - Chat message HTML container
 * @param {Array} options - Context menu options array
 */
function addShatteringParryOption(html, options) {
  const optionsArray = Array.isArray(options)
    ? options
    : Array.isArray(html)
      ? html
      : null;

  if (!optionsArray) return;

  optionsArray.push({
    name: game.i18n.localize("l5r5e-combat-helper.contextMenu.shatteringParry"),
    icon: '<i class="fas fa-shield-alt"></i>',

    condition: (li) => {
      const messageId = resolveMessageId(li);
      if (!messageId) return false;

      const message = game.messages.get(messageId);
      if (!message) return false;

      // Only show on mitigation result messages
      const parryData = message.getFlag(
        "l5r5e-combat-helper",
        "shatteringParryData",
      );
      if (!parryData) return false;

      // Already used Shattering Parry for this critical
      if (parryData.used) return false;

      const target = game.actors.get(parryData.targetId);
      if (!target) return false;

      // Only owner or GM
      if (!(target.isOwner || game.user.isGM)) return false;

      // Must have at least one readied/equipped weapon
      const weapon = getReadiedWeapon(target);
      if (!weapon) return false;

      return true;
    },

    callback: async (li) => {
      const messageId = resolveMessageId(li);
      if (!messageId) return;

      const message = game.messages.get(messageId);
      const parryData = message.getFlag(
        "l5r5e-combat-helper",
        "shatteringParryData",
      );

      if (!parryData) return;

      const target = game.actors.get(parryData.targetId);
      if (!target) return;

      const weapon = getReadiedWeapon(target);
      if (!weapon) {
        ui.notifications.warn(
          game.i18n.localize(
            "l5r5e-combat-helper.notifications.shatteringParryNoWeapon",
          ),
        );
        return;
      }

      const confirmed = await Dialog.confirm({
        title: game.i18n.localize(
          "l5r5e-combat-helper.dialog.shatteringParry.title",
        ),
        content: game.i18n.format(
          "l5r5e-combat-helper.dialog.shatteringParry.content",
          {
            name: target.name,
            weapon: weapon.name,
          },
        ),
        yes: () => true,
        no: () => false,
        defaultYes: false,
      });

      if (!confirmed) return;

      await handleShatteringParry(target, weapon, parryData, message);
    },
  });
}

/**
 * Executes the full Shattering Parry sequence:
 * 1. Reverts any critical effects applied by the original mitigation roll.
 * 2. Damages the parrying weapon.
 * 3. Marks the session flag so the ability cannot be reused.
 * 4. Marks the mitigation message as consumed.
 * 5. Launches a new mitigation roll (Fitness check).
 *
 * @param {Actor} target - Actor performing the Shattering Parry
 * @param {Item} weapon - Weapon being used to parry (will gain Damaged)
 * @param {Object} parryData - Stored mitigation context from the message flag
 * @param {ChatMessage} mitigationMessage - The original mitigation result message
 * @returns {Promise<void>}
 */
async function handleShatteringParry(
  target,
  weapon,
  parryData,
  mitigationMessage,
) {
  try {
    // Step 1 — Revert previously applied critical effects
    await reverseCriticalEffect(
      target,
      parryData.finalSeverity,
      parryData.ringUsed,
      parryData.wasWeaponSharp ?? false,
    );

    // Step 2 — Damage the parrying weapon
    await applyDamagedQualityToWeapon(weapon, target);

    // Step 3 — Mark this mitigation message as consumed (prevents re-use)
    await mitigationMessage.setFlag(
      "l5r5e-combat-helper",
      "shatteringParryData",
      {
        ...parryData,
        used: true,
      },
    );

    // Step 4 — Post announcement message and relaunch the Fitness check
    await createShatteringParryMessage(target, weapon, parryData);
    await launchNewMitigationRoll(
      target,
      parryData.weaponDeadliness,
      parryData.criticalMessageId,
    );
  } catch (error) {
    console.error("L5R5e Combat Helper | Shattering Parry error:", error);
    ui.notifications.error(
      game.i18n.format(
        "l5r5e-combat-helper.notifications.errorShatteringParry",
        { error: error.message },
      ),
    );
  }
}

/**
 * Applies the Damaged quality to the parrying weapon.
 *
 * Mirrors the same logic used for armor damage in critical-effects-application.js,
 * adapted for weapon items.
 *
 * @param {Item} weapon - The weapon receiving the Damaged quality
 * @param {Actor} owner - The actor who owns the weapon (for notifications)
 * @returns {Promise<void>}
 */
async function applyDamagedQualityToWeapon(weapon, owner) {
  const currentProperties = weapon.system?.properties || [];

  const alreadyDamaged = currentProperties.some(
    (prop) => prop.name === "Damaged" || prop.id === "L5RCorePro000003",
  );

  if (alreadyDamaged) {
    ui.notifications.info(
      game.i18n.format(
        "l5r5e-combat-helper.notifications.weaponAlreadyDamaged",
        { name: weapon.name },
      ),
    );
    return;
  }

  try {
    const pack = game.packs.get("l5r5e.core-properties");

    let damagedEntry = null;

    if (pack) {
      damagedEntry = await pack.getDocument("L5RCorePro000003");
    }

    const damagedProp = damagedEntry
      ? { id: damagedEntry._id, name: damagedEntry.name }
      : { id: "L5RCorePro000003", name: "Damaged" };

    await weapon.update({
      "system.properties": [...currentProperties, damagedProp],
    });
  } catch (error) {
    console.error("L5R5e Combat Helper | Error damaging weapon:", error);
    // Final fallback
    try {
      const currentProperties = weapon.system?.properties || [];
      await weapon.update({
        "system.properties": [
          ...currentProperties,
          { id: "L5RCorePro000003", name: "Damaged" },
        ],
      });
    } catch (fallbackError) {
      console.error(
        "L5R5e Combat Helper | Weapon damage fallback failed:",
        fallbackError,
      );
      ui.notifications.error(
        game.i18n.format(
          "l5r5e-combat-helper.notifications.errorDamagingWeapon",
          { error: error.message },
        ),
      );
    }
  }
}

/**
 * Launches a new L5R5e Fitness mitigation roll for the target.
 *
 * Before opening the dialog, the pending mitigation flag on the actor
 * is refreshed with the original weapon deadliness and critical message ID
 * so that the post-roll handler in critical-mitigation.js can process it.
 *
 * @param {Actor} target - Actor making the new roll
 * @param {number} weaponDeadliness - Deadliness value for severity calculation
 * @param {string} criticalMessageId - ID of the original critical strike message
 * @returns {Promise<void>}
 */
async function launchNewMitigationRoll(
  target,
  weaponDeadliness,
  criticalMessageId,
) {
  // Re-arm the pending mitigation flag so critical-mitigation.js can pick it up
  await target.setFlag("l5r5e-combat-helper", "pendingCriticalMitigation", {
    weaponDeadliness,
    criticalMessageId,
    isShatteringParryReroll: true,
  });

  try {
    new game.l5r5e.DicePickerDialog({
      actor: target,
      skillId: "fitness",
      skillCatId: "martial",
      difficulty: 1,
      difficultyHidden: false,
    }).render(true);
  } catch (error) {
    console.error(
      "L5R5e Combat Helper | Error launching Shattering Parry reroll:",
      error,
    );
    ui.notifications.error(
      game.i18n.format("l5r5e-combat-helper.notifications.errorLaunchingRoll", {
        error: error.message,
      }),
    );
  }
}

/**
 * Creates a chat message announcing that Shattering Parry was used.
 *
 * @param {Actor} target - Actor using the ability
 * @param {Item} weapon - Weapon that will be damaged
 * @param {Object} parryData - Stored mitigation context
 * @returns {Promise<void>}
 */
async function createShatteringParryMessage(target, weapon, parryData) {
  const i18n = game.i18n;

  const title = i18n.localize("l5r5e-combat-helper.chat.shatteringParry.title");
  const uses = i18n.format("l5r5e-combat-helper.chat.shatteringParry.uses", {
    name: target.name,
  });
  const weaponText = i18n.format(
    "l5r5e-combat-helper.chat.shatteringParry.weapon",
    { weapon: weapon.name },
  );
  const revertsText = i18n.localize(
    "l5r5e-combat-helper.chat.shatteringParry.reverts",
  );
  const rerollsText = i18n.localize(
    "l5r5e-combat-helper.chat.shatteringParry.rerolls",
  );

  const content = `
    <div class="l5r5e-combat-helper shattering-parry">
      <h3>${title}</h3>
      <p>${uses}</p>
      <p>${weaponText}</p>
      <p class="revert-notice"><em>${revertsText}</em></p>
      <p class="reroll-notice">${rerollsText}</p>
    </div>
  `;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: target }),
  });
}

/**
 * Safely extracts a message ID from various forms of the `li` element
 * passed by Foundry's context menu system across different versions.
 *
 * @param {HTMLElement|jQuery|Object} li
 * @returns {string|null}
 */
function resolveMessageId(li) {
  if (li instanceof HTMLElement) {
    return li.dataset.messageId || li.getAttribute("data-message-id");
  } else if (li?.jquery || li instanceof jQuery) {
    return li.data("messageId") || li.attr("data-message-id");
  }
  return (
    li?.dataset?.messageId || li?.getAttribute?.("data-message-id") || null
  );
}

/**
 * Returns the first readied or equipped weapon from the actor's inventory.
 *
 * @param {Actor} actor
 * @returns {Item|null}
 */
function getReadiedWeapon(actor) {
  if (!actor?.items) return null;

  const weapons = actor.items.filter(
    (item) =>
      item.type === "weapon" &&
      (item.system?.equipped === true || item.system?.readied === true),
  );

  return weapons.length > 0 ? weapons[0] : null;
}
