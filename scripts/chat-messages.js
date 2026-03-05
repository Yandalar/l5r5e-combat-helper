/**
 * Chat message generation helpers.
 *
 * Centralizes the creation of combat-related chat messages used by the module.
 * These functions format and dispatch structured messages to the Foundry chat
 * log, providing feedback for damage resolution, armor mitigation, and
 * critical strike events.
 *
 * Some messages also embed metadata (via flags) used later by other module
 * features such as Void defense choices.
 */

/**
 * Creates a chat message reporting the result of a successful attack that
 * dealt Fatigue damage.
 *
 * The message includes:
 * - The attacker and target involved
 * - Final damage applied
 * - Optional armor mitigation details
 * - Updated fatigue values relative to the target's endurance
 * - Incapacitated warning if the threshold is reached
 *
 * The message also stores `attackData` in message flags. This metadata is
 * later used by other module features (such as the Void "Don't Defend" option)
 * to determine whether additional reactions can be triggered.
 *
 * Ownership is configured so that players who own the target actor receive
 * OWNER permission on the message, allowing them to interact with contextual
 * menu options tied to that message.
 *
 * @param {Actor} target - Actor receiving the damage
 * @param {number} damage - Final damage applied after armor reduction
 * @param {Actor} attacker - Actor dealing the damage
 * @param {number} rawDamage - Original damage before armor mitigation
 * @param {number} armorResistance - Armor resistance applied to the attack
 * @param {number} currentFatigue - Target's fatigue before the attack
 * @param {number} newFatigue - Target's fatigue after the attack
 * @param {number} endurance - Target's endurance threshold
 * @param {boolean} incapacitated - Whether the attack caused incapacitation
 * @param {object} attackData - Metadata describing the attack event
 * @returns {Promise<void>}
 */
export async function createDamageMessage(
  target,
  damage,
  attacker,
  rawDamage,
  armorResistance,
  currentFatigue,
  newFatigue,
  endurance,
  incapacitated,
  attackData,
) {
  let armorInfo = "";
  if (armorResistance > 0) {
    armorInfo = `<p><em>Damage reduced by armor: ${rawDamage} - ${armorResistance} = ${damage}</em></p>`;
  }

  let incapacitatedMessage = "";
  if (incapacitated) {
    incapacitatedMessage =
      '<p class="incapacitated-warning">⚠️ <strong>INCAPACITATED!</strong></p>';
  }

  const content = `
    <div class="l5r5e-combat-helper">
      <h3>💥 Damage Applied</h3>
      <p><strong>${attacker.name}</strong> deals <strong>${damage}</strong> damage to <strong>${target.name}</strong></p>
      ${armorInfo}
      <p>Fatigue: ${currentFatigue} → ${newFatigue} / ${endurance}</p>
      ${incapacitatedMessage}
    </div>
  `;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    flags: {
      "l5r5e-combat-helper": {
        attackData,
      },
    },
    ownership: getTargetOwnership(target),
  });
}

/**
 * Creates a chat message indicating that an attack was completely absorbed
 * by armor.
 *
 * This occurs when the target's armor resistance reduces the incoming damage
 * to zero or below, preventing any Fatigue from being applied.
 *
 * The message provides a breakdown of the damage calculation for clarity.
 *
 * @param {Actor} target - Actor who was attacked
 * @param {Actor} attacker - Actor performing the attack
 * @param {number} rawDamage - Damage before armor mitigation
 * @param {number} armorResistance - Armor resistance applied
 * @returns {Promise<void>}
 */
export async function createArmorBlockedMessage(
  target,
  attacker,
  rawDamage,
  armorResistance,
) {
  const content = `
    <div class="l5r5e-combat-helper armor-blocked">
      <h3>🛡️ Damage Blocked</h3>
      <p><strong>${attacker.name}</strong> attacks <strong>${target.name}</strong></p>
      <p>Raw damage: ${rawDamage} - Armor: ${armorResistance} = <strong>0 damage</strong></p>
      <p><em>The armor completely absorbed the blow!</em></p>
    </div>
  `;

  await ChatMessage.create({
    content: content,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
  });
}

/**
 * Creates a chat message announcing that a Critical Strike has occurred
 * because the target was already Incapacitated when struck.
 *
 * In L5R5e rules, attacks against an already incapacitated target trigger
 * a Critical Strike instead of normal fatigue damage escalation.
 *
 * This message acts as a narrative and mechanical prompt for players to
 * resolve the resulting Critical Strike roll.
 *
 * The message includes metadata about the attacker's weapon deadliness
 * and configures ownership so the target's owner can click the button.
 *
 * @param {Actor} target - Actor receiving the critical strike
 * @param {Actor} attacker - Actor delivering the attack
 * @param {Item|null} weapon - Weapon used for the attack
 * @returns {Promise<void>}
 */
export async function createCriticalStrikeMessage(target, attacker, weapon) {
  let deadliness = 5; // Default deadliness
  if (weapon && weapon.system?.deadliness !== undefined) {
    deadliness = parseInt(weapon.system.deadliness);
  }

  const content = `
    <div class="l5r5e-combat-helper critical-strike">
      <h3>💀 CRITICAL STRIKE!</h3>
      <p><strong>${attacker.name}</strong> delivers a critical strike to <strong>${target.name}</strong>!</p>
      <p><em>${target.name} was already Incapacitated when struck!</em></p>
      <p><strong>Weapon Deadliness:</strong> ${deadliness}</p>
      <button class="critical-strike-roll-button" data-action="roll-critical">
        ⚠️ Roll for Critical Strike consequences!
      </button>
    </div>
  `;

  await ChatMessage.create({
    content: content,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    flags: {
      "l5r5e-combat-helper": {
        criticalStrike: {
          targetId: target.id,
          attackerId: attacker.id,
          weaponDeadliness: deadliness,
          weaponId: weapon?.id || null,
        },
      },
    },
    ownership: getTargetOwnership(target),
  });
}

/**
 * Creates a chat message announcing a Critical Strike caused by the
 * "Void - Don't Defend" reaction.
 *
 * This occurs when a target spends a Void Point to intentionally accept
 * a Critical Strike instead of defending against an incoming attack.
 *
 * The message displays:
 * - The attacker and target
 * - Notification of the Void choice
 * - A reminder to roll for Critical Strike consequences
 * - The Void Point change (before → after)
 *
 * @param {Actor} target - Actor who spent the Void Point
 * @param {Actor} attacker - Actor delivering the attack
 * @param {number} voidBefore - Void points before spending
 * @param {number} voidAfter - Void points after spending
 * @param {Item|null} weapon - Weapon used for the attack
 * @returns {Promise<void>}
 */
export async function createVoidCriticalStrikeMessage(
  target,
  attacker,
  voidBefore,
  voidAfter,
  weapon,
) {
  let deadliness = 5; // Default deadliness
  if (weapon && weapon.system?.deadliness !== undefined) {
    deadliness = parseInt(weapon.system.deadliness) || 5;
  }

  const content = `
    <div class="l5r5e-combat-helper critical-strike void-choice">
      <h3>💀 CRITICAL STRIKE! (Void Choice)</h3>
      <p><strong>${target.name}</strong> spent a Void Point and chose to suffer a Critical Strike instead of defending</p>
      <p><strong>${attacker.name}</strong> delivers a critical strike to <strong>${target.name}</strong>!</p>
      <p class="void-info">Void Point spent: ${voidBefore} → ${voidAfter}</p>
      <p><strong>Weapon Deadliness:</strong> ${deadliness}</p>
      <button class="critical-strike-roll-button" data-action="roll-critical">
        ⚠️ Roll for Critical Strike consequences!
      </button>
    </div>
  `;

  await ChatMessage.create({
    content: content,
    speaker: ChatMessage.getSpeaker({ actor: target }),
    flags: {
      "l5r5e-combat-helper": {
        criticalStrike: {
          targetId: target.id,
          attackerId: attacker.id,
          weaponDeadliness: deadliness,
          weaponId: weapon?.id || null,
        },
      },
    },
    ownership: getTargetOwnership(target),
  });
}

/**
 * Builds an ownership configuration object for a given target actor.
 *
 * This helper inspects all users in the current game and grants OWNER
 * permission to those who already have owner-level access to the target.
 * All other users default to LIMITED permission.
 *
 * This structure is useful when creating temporary documents (such as
 * chat messages, effects, or other embedded documents) that should only
 * be fully visible or editable by users who control the affected actor.
 *
 * @param {Actor} target - The Target Actor
 * @returns {Object} Object mapping user IDs to permission levels.
 */
function getTargetOwnership(target) {
  const ownership = {
    default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
  };

  for (let user of game.users) {
    if (target.testUserPermission(user, "OWNER")) {
      ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }
  }

  return ownership;
}
