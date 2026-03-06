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
  const i18n = game.i18n;

  let armorInfo = "";
  if (armorResistance > 0) {
    const reducedText = i18n.format(
      "l5r5e-combat-helper.chat.damageApplied.reducedByArmor",
      {
        raw: rawDamage,
        armor: armorResistance,
        final: damage,
      },
    );
    armorInfo = `<p><em>${reducedText}</em></p>`;
  }

  let incapacitatedMessage = "";
  if (incapacitated) {
    incapacitatedMessage = `<p class="incapacitated-warning">${i18n.localize("l5r5e-combat-helper.chat.damageApplied.incapacitated")}</p>`;
  }

  const title = i18n.localize("l5r5e-combat-helper.chat.damageApplied.title");
  const dealsTo = i18n.format(
    "l5r5e-combat-helper.chat.damageApplied.dealsTo",
    {
      attacker: attacker.name,
      damage: damage,
      target: target.name,
    },
  );
  const fatigueText = i18n.format(
    "l5r5e-combat-helper.chat.damageApplied.fatigue",
    {
      current: currentFatigue,
      new: newFatigue,
      endurance: endurance,
    },
  );

  const content = `
    <div class="l5r5e-combat-helper">
      <h3>${title}</h3>
      <p>${dealsTo}</p>
      ${armorInfo}
      <p>${fatigueText}</p>
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
  const i18n = game.i18n;

  const title = i18n.localize("l5r5e-combat-helper.chat.damageBlocked.title");
  const attacks = i18n.format(
    "l5r5e-combat-helper.chat.damageBlocked.attacks",
    {
      attacker: attacker.name,
      target: target.name,
    },
  );
  const calculation = i18n.format(
    "l5r5e-combat-helper.chat.damageBlocked.calculation",
    {
      raw: rawDamage,
      armor: armorResistance,
    },
  );
  const absorbed = i18n.localize(
    "l5r5e-combat-helper.chat.damageBlocked.absorbed",
  );

  const content = `
    <div class="l5r5e-combat-helper armor-blocked">
      <h3>${title}</h3>
      <p>${attacks}</p>
      <p>${calculation}</p>
      <p><em>${absorbed}</em></p>
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
  const i18n = game.i18n;

  let deadliness = 5; // Default deadliness
  if (weapon && weapon.system?.deadliness !== undefined) {
    deadliness = parseInt(weapon.system.deadliness);
  }

  const title = i18n.localize("l5r5e-combat-helper.chat.criticalStrike.title");
  const delivers = i18n.format(
    "l5r5e-combat-helper.chat.criticalStrike.delivers",
    {
      attacker: attacker.name,
      target: target.name,
    },
  );
  const alreadyIncap = i18n.format(
    "l5r5e-combat-helper.chat.criticalStrike.alreadyIncapacitated",
    {
      target: target.name,
    },
  );
  const weaponDead = i18n.format(
    "l5r5e-combat-helper.chat.criticalStrike.weaponDeadliness",
    {
      deadliness: deadliness,
    },
  );
  const buttonText = i18n.localize(
    "l5r5e-combat-helper.chat.criticalStrike.rollButton",
  );

  const content = `
    <div class="l5r5e-combat-helper critical-strike">
      <h3>${title}</h3>
      <p>${delivers}</p>
      <p><em>${alreadyIncap}</em></p>
      <p>${weaponDead}</p>
      <button class="critical-strike-roll-button" data-action="roll-critical">
        ${buttonText}
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
  const i18n = game.i18n;

  let deadliness = 5; // Default deadliness
  if (weapon && weapon.system?.deadliness !== undefined) {
    deadliness = parseInt(weapon.system.deadliness) || 5;
  }

  const title = i18n.localize(
    "l5r5e-combat-helper.chat.criticalStrike.titleVoid",
  );
  const voidChoice = i18n.format(
    "l5r5e-combat-helper.chat.criticalStrike.voidChoice",
    {
      target: target.name,
    },
  );
  const delivers = i18n.format(
    "l5r5e-combat-helper.chat.criticalStrike.delivers",
    {
      attacker: attacker.name,
      target: target.name,
    },
  );
  const voidSpent = i18n.format(
    "l5r5e-combat-helper.chat.criticalStrike.voidSpent",
    {
      before: voidBefore,
      after: voidAfter,
    },
  );
  const weaponDead = i18n.format(
    "l5r5e-combat-helper.chat.criticalStrike.weaponDeadliness",
    {
      deadliness: deadliness,
    },
  );
  const buttonText = i18n.localize(
    "l5r5e-combat-helper.chat.criticalStrike.rollButton",
  );

  const content = `
    <div class="l5r5e-combat-helper critical-strike void-choice">
      <h3>${title}</h3>
      <p>${voidChoice}</p>
      <p>${delivers}</p>
      <p class="void-info">${voidSpent}</p>
      <p>${weaponDead}</p>
      <button class="critical-strike-roll-button" data-action="roll-critical">
        ${buttonText}
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
