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

  const ownership = {
    default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
  };

  for (let user of game.users) {
    if (target.testUserPermission(user, "OWNER")) {
      ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }
  }

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    flags: {
      "l5r5e-combat-helper": {
        attackData,
      },
    },
    ownership,
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
 */
export async function createCriticalStrikeMessage(target, attacker) {
  const content = `
    <div class="l5r5e-combat-helper critical-strike">
      <h3>💀 CRITICAL STRIKE!</h3>
      <p><strong>${attacker.name}</strong> delivers a critical strike to <strong>${target.name}</strong>!</p>
      <p><em>${target.name} was already Incapacitated when struck!</em></p>
      <p class="critical-warning">⚠️ Roll for Critical Strike consequences!</p>
    </div>
  `;

  await ChatMessage.create({
    content: content,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
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
 */
export async function createVoidCriticalStrikeMessage(
  target,
  attacker,
  voidBefore,
  voidAfter,
) {
  const content = `
    <div class="l5r5e-combat-helper critical-strike void-choice">
      <h3>💀 CRITICAL STRIKE! (Void Choice)</h3>
      <p><strong>${target.name}</strong> spent a Void Point and chose to suffer a Critical Strike instead of defending</p>
      <p><strong>${attacker.name}</strong> delivers a critical strike to <strong>${target.name}</strong>!</p>
      <p class="critical-warning">⚠️ Roll for Critical Strike consequences!</p>
      <p class="void-info">(void) Void Point spent: ${voidBefore} → ${voidAfter}</p>
    </div>
  `;

  await ChatMessage.create({
    content: content,
    speaker: ChatMessage.getSpeaker({ actor: target }),
  });
}
