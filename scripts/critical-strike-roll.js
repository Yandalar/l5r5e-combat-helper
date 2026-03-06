/**
 * Critical Strike Roll Handler
 *
 * Handles the interaction when a player clicks the "Roll for Critical Strike"
 * button in a critical strike chat message.
 *
 * Responsibilities:
 * - Listen for button clicks on critical strike messages
 * - Retrieve stored metadata (target, attacker, weapon deadliness)
 * - Launch the L5R5e roll system for Fitness check
 * - Prepare the roll with appropriate parameters
 */

/**
 * Registers the click event listener for critical strike roll buttons.
 *
 * This hook attaches to the chat log and intercepts clicks on buttons
 * with the data-action="roll-critical" attribute.
 */
export function registerCriticalStrikeRollHandler() {
  Hooks.on("renderChatMessage", (message, html) => {
    // Find all critical strike roll buttons in this message
    html.find(".critical-strike-roll-button").click(async (event) => {
      event.preventDefault();
      await handleCriticalStrikeRollClick(message, event.currentTarget);
    });
  });
}

/**
 * Handles the click event on a critical strike roll button.
 *
 * Workflow:
 * 1. Extract metadata from message flags
 * 2. Check if already resolved
 * 3. Verify the current user can roll (owns target or is GM)
 * 4. Retrieve target actor
 * 5. Launch L5R5e Fitness roll with TN 1
 * 6. Button stays disabled until critical is fully resolved
 *
 * @param {ChatMessage} message - The chat message containing the button
 * @param {HTMLElement} button - The button element that was clicked
 */
async function handleCriticalStrikeRollClick(message, button) {
  try {
    // Check if already processing
    if (button.disabled) {
      return;
    }

    // Retrieve critical strike metadata from message flags
    const criticalData = message.getFlag(
      "l5r5e-combat-helper",
      "criticalStrike",
    );

    if (!criticalData) {
      ui.notifications.error(
        game.i18n.localize(
          "l5r5e-combat-helper.notifications.criticalDataNotFound",
        ),
      );
      return;
    }

    // Check if already resolved
    if (criticalData.resolved) {
      ui.notifications.info(
        game.i18n.localize(
          "l5r5e-combat-helper.notifications.criticalAlreadyResolved",
        ),
      );
      button.disabled = true;
      button.textContent = game.i18n.localize(
        "l5r5e-combat-helper.chat.criticalStrike.resolvedButton",
      );
      return;
    }

    const { targetId, attackerId, weaponDeadliness } = criticalData;

    // Get the target actor
    const target = game.actors.get(targetId);
    if (!target) {
      ui.notifications.error(
        game.i18n.localize("l5r5e-combat-helper.notifications.targetNotFound"),
      );
      return;
    }

    // Verify permission: user must own the target or be GM
    if (!target.isOwner && !game.user.isGM) {
      ui.notifications.warn(
        game.i18n.localize("l5r5e-combat-helper.notifications.noPermission"),
      );
      return;
    }

    // Disable the button to prevent multiple clicks
    button.disabled = true;
    button.textContent = game.i18n.localize(
      "l5r5e-combat-helper.chat.criticalStrike.rollingButton",
    );

    await launchFitnessCheck(target, weaponDeadliness, message.id);

    // Update button text but keep it disabled
    // It will only be re-enabled if there's an error, or permanently disabled when resolved
    button.textContent = game.i18n.localize(
      "l5r5e-combat-helper.chat.criticalStrike.waitingButton",
    );
  } catch (error) {
    console.error(
      "L5R5e Combat Helper | Error handling critical strike roll:",
      error,
    );
    ui.notifications.error(
      game.i18n.format(
        "l5r5e-combat-helper.notifications.errorRollingCritical",
        {
          error: error.message,
        },
      ),
    );

    // Re-enable button on error
    button.disabled = false;
    button.textContent = game.i18n.localize(
      "l5r5e-combat-helper.chat.criticalStrike.rollButton",
    );
  }
}

/**
 * Launches the L5R5e Fitness check roll for critical strike mitigation.
 *
 * The player needs to:
 * - Roll Fitness skill
 * - TN = 1
 * - Use any ring of their choice (narrative scene) or attitude ring (dramatic scene)
 * - Success reduces severity by 1 + bonus successes (minimum severity 1)
 *
 * @param {Actor} target - The target actor making the roll
 * @param {number} weaponDeadliness - The deadliness of the attacking weapon
 * @param {string} messageId - The ID of the critical strike message
 */
async function launchFitnessCheck(target, weaponDeadliness, messageId) {
  const fitnessSkill = target.system?.skills?.martial?.fitness;

  if (fitnessSkill === null || fitnessSkill === undefined) {
    ui.notifications.warn(
      game.i18n.format("l5r5e-combat-helper.notifications.noFitnessSkill", {
        name: target.name,
      }),
    );
    return;
  }

  try {
    // Store metadata in actor flag for post-roll processing
    await target.setFlag("l5r5e-combat-helper", "pendingCriticalMitigation", {
      weaponDeadliness,
      criticalMessageId: messageId,
    });

    // Launch official L5R5e Dice Picker Dialog
    new game.l5r5e.DicePickerDialog({
      actor: target,
      skillId: "fitness",
      skillCatId: "martial",
      difficulty: 1,
      difficultyHidden: false,
    }).render(true);
  } catch (error) {
    console.error(
      "L5R5e Combat Helper | Error launching Fitness check:",
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
 * Calculates the final critical severity based on weapon deadliness
 * and mitigation roll results.
 *
 * Formula:
 * - Base Severity = Weapon Deadliness
 * - Mitigation = (Roll succeeded?) ? 1 + Bonus Successes : 0
 * - Final Severity = max(1, Base Severity - Mitigation)
 *
 * @param {number} weaponDeadliness - Base severity from weapon
 * @param {boolean} rollSuccess - Whether the mitigation roll succeeded
 * @param {number} bonusSuccesses - Extra successes beyond TN
 * @returns {number} Final severity (minimum 1)
 */
export function calculateCriticalSeverity(
  weaponDeadliness,
  rollSuccess,
  bonusSuccesses,
) {
  const baseSeverity = weaponDeadliness;
  const mitigation = rollSuccess ? 1 + bonusSuccesses : 0;
  const finalSeverity = Math.max(1, baseSeverity - mitigation);

  return finalSeverity;
}
