/**
 * Critical Strike Mitigation Roll Handler
 *
 * Responsible for detecting when a character completes the Fitness roll
 * used to mitigate a Critical Strike in L5R5e and resolving the final
 * critical severity based on the roll result.
 *
 * Workflow:
 * 1. Listen for newly created chat messages containing L5R5e roll results
 * 2. Detect completed Fitness rolls
 * 3. Check if the rolling actor has a pending critical mitigation flag
 * 4. Calculate severity reduction from roll successes
 * 5. Determine the final severity of the critical strike
 * 6. Apply the corresponding critical effect
 * 7. Update the original critical strike message to mark it resolved
 */

import { applyCriticalEffect } from "./critical-effects-application.js";

/**
 * Registers the hook that listens for completed mitigation rolls.
 *
 * This hook monitors `createChatMessage` events and inspects messages
 * containing L5R5e roll data. When a completed Fitness roll is detected,
 * the system checks if the actor had a pending critical mitigation
 * stored via module flags. If so, the mitigation workflow is executed.
 *
 * @returns {void}
 */
export function registerCriticalMitigationHandler() {
  Hooks.on("createChatMessage", async (message) => {
    try {
      // Ensure the message contains roll data
      if (!message.rolls || message.rolls.length === 0) return;

      const roll = message.rolls[0];
      if (!roll.l5r5e) return;

      const l5rData = roll.l5r5e;

      const isFitnessRoll =
        l5rData.skillId === "fitness" && l5rData.skillCatId === "martial";
      if (!isFitnessRoll) return;

      const isFinished = l5rData.rnkEnded === true;
      if (!isFinished) return;

      const actorId = message.speaker?.actor;
      if (!actorId) return;

      const actor = game.actors.get(actorId);
      if (!actor) return;

      // Check if the actor has a pending mitigation request
      const mitigationData = actor.getFlag(
        "l5r5e-combat-helper",
        "pendingCriticalMitigation",
      );
      if (!mitigationData) return;

      await processCriticalMitigation(actor, l5rData, mitigationData, message);

      // Clear the pending mitigation flag
      await actor.unsetFlag("l5r5e-combat-helper", "pendingCriticalMitigation");
    } catch (error) {
      console.error(
        "L5R5e Combat Helper | Error in mitigation handler:",
        error,
      );
    }
  });
}

/**
 * Resolves the final critical strike severity after a mitigation roll.
 *
 * The severity reduction follows the official L5R5e rule:
 * If the roll succeeds, reduce the severity by **1 + bonus successes**,
 * to a minimum severity of 1.
 *
 * This function:
 * - Extracts roll successes
 * - Computes mitigation reduction
 * - Determines final severity
 * - Retrieves attacker and weapon information
 * - Applies the appropriate critical effect
 * - Updates the original critical strike message
 *
 * @param {Actor} actor The actor who rolled the Fitness mitigation check.
 * @param {Object} l5rData L5R5e-specific roll data extracted from the roll object.
 * @param {Object} mitigationData Metadata previously stored on the actor containing:
 * - weaponDeadliness
 * - criticalMessageId
 * @param {ChatMessage} rollMessage The chat message that contains the mitigation roll.
 * @returns {Promise<void>}
 */
async function processCriticalMitigation(
  actor,
  l5rData,
  mitigationData,
  rollMessage,
) {
  const { weaponDeadliness, criticalMessageId } = mitigationData;

  const totalSuccesses = l5rData.summary?.totalSuccess || 0;
  const tn = l5rData.difficulty || 1;

  const rollSucceeded = totalSuccesses >= tn;
  const bonusSuccesses = Math.max(0, totalSuccesses - tn);

  const severityReduction = rollSucceeded ? 1 + bonusSuccesses : 0;
  const finalSeverity = Math.max(1, weaponDeadliness - severityReduction);

  const ringUsed = l5rData.stance || "void";

  await createMitigationResultMessage(
    actor,
    weaponDeadliness,
    totalSuccesses,
    rollSucceeded,
    severityReduction,
    finalSeverity,
    l5rData,
  );

  const criticalMessage = game.messages.get(criticalMessageId);

  let attacker = null;
  let weapon = null;

  if (criticalMessage) {
    const criticalData = criticalMessage.getFlag(
      "l5r5e-combat-helper",
      "criticalStrike",
    );

    if (criticalData) {
      attacker = game.actors.get(criticalData.attackerId);

      if (criticalData.weaponId) {
        weapon = attacker?.items.get(criticalData.weaponId);
      }

      // Mark the critical strike as resolved
      await criticalMessage.setFlag("l5r5e-combat-helper", "criticalStrike", {
        ...criticalData,
        resolved: true,
      });
    }
  }

  // Fallback attacker detection
  if (!attacker && criticalMessage?.speaker?.actor) {
    attacker = game.actors.get(criticalMessage.speaker.actor);
  }

  await applyCriticalEffect(actor, finalSeverity, ringUsed, weapon, attacker);

  // Update the original message UI
  if (criticalMessage) {
    await updateCriticalMessageButton(criticalMessage);
  }
}

/**
 * Updates the original Critical Strike chat message to indicate that the
 * critical resolution has already been processed.
 *
 * This prevents players from triggering the resolution multiple times
 * and provides visual feedback in the chat log.
 *
 * @param {ChatMessage} message The original critical strike message containing the roll button.
 * @returns {Promise<void>}
 */
async function updateCriticalMessageButton(message) {
  try {
    let content = message.content;

    const newButton = `
      <button class="critical-strike-roll-button" disabled style="opacity: 0.6; cursor: not-allowed;">
        ✓ Critical Resolved
      </button>
    `;

    content = content.replace(
      /<button class="critical-strike-roll-button"[^>]*>[\s\S]*?<\/button>/,
      newButton,
    );

    await message.update({ content });
  } catch (error) {
    console.error("Error updating critical message button:", error);
  }
}

/**
 * Creates a chat message summarizing the mitigation roll result.
 *
 * This message provides a breakdown of:
 * - The ring used in the mitigation roll
 * - Total successes rolled
 * - Whether the mitigation succeeded
 * - The severity reduction applied
 * - The final severity that will be used to determine the critical effect
 *
 * @param {Actor} actor The actor performing the mitigation roll.
 * @param {number} baseSeverity The original severity of the critical strike (weapon deadliness).
 * @param {number} totalSuccesses Total successes rolled by the player.
 * @param {boolean} rollSucceeded Whether the roll met the TN requirement.
 * @param {number} severityReduction The total amount by which the severity was reduced.
 * @param {number} finalSeverity The final calculated severity after mitigation.
 * @param {Object} l5rData Raw roll metadata from the L5R5e system.
 * @returns {Promise<void>}
 */
async function createMitigationResultMessage(
  actor,
  baseSeverity,
  totalSuccesses,
  rollSucceeded,
  severityReduction,
  finalSeverity,
  l5rData,
) {
  const ringUsed = l5rData.ringId || "unknown";

  let mitigationText = "";

  if (rollSucceeded) {
    mitigationText = `
      <p class="mitigation-success">✓ Success! Severity reduced by ${severityReduction}</p>
      <p><strong>Total Successes:</strong> ${totalSuccesses} (1 base + ${totalSuccesses - 1} bonus)</p>
    `;
  } else {
    mitigationText = `
      <p class="mitigation-failure">✗ Failed to mitigate</p>
      <p><strong>Total Successes:</strong> ${totalSuccesses} (TN 1 not met)</p>
    `;
  }

  const content = `
    <div class="l5r5e-combat-helper critical-mitigation">
      <h3>🎲 Critical Strike Mitigation</h3>
      <p><strong>${actor.name}</strong> rolls Fitness to mitigate the critical strike</p>
      <p><strong>Ring Used:</strong> ${ringUsed.charAt(0).toUpperCase() + ringUsed.slice(1)}</p>
      ${mitigationText}
      <div class="severity-calculation">
        <p><strong>Base Severity (Weapon Deadliness):</strong> ${baseSeverity}</p>
        <p><strong>Mitigation:</strong> -${severityReduction}</p>
        <hr>
        <p><strong>Final Severity:</strong> ${finalSeverity}</p>
      </div>
      <p class="next-step">⏩ Consulting critical effects table...</p>
    </div>
  `;

  await ChatMessage.create({
    content: content,
    speaker: ChatMessage.getSpeaker({ actor: actor }),
  });
}
