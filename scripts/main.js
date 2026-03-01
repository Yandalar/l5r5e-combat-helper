/**
 * Foundry "ready" hook.
 *
 * Standard module hook
 */
Hooks.once("ready", () => {
  console.log("L5R5e Combat Helper | Module loaded and ready");

  game.settings.register("l5r5e-combat-helper", "l5r5eCombatHelper", {
    name: "L5R5e Combat Helper",
    hint: "Automates several situations in combat for Legend of the Five Rings 5th Edition.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
});

/**
 * We'll use this hook to listen to the chat so we can intercept
 * combat rolls.
 *
 * Listens to newly created chat messages and intercepts completed
 * martial (for now) (attack) rolls. If the roll is valid and successful,
 * it automatically determines attacker and target, calculates
 * damage (including bonus successes and armor reduction),
 * applies fatigue, and handles incapacitation or critical strikes.
 */
Hooks.on("createChatMessage", async (message) => {
  if (!game.settings.get("l5r5e-combat-helper", "l5r5eCombatHelper")) return;

  try {
    if (!message.rolls || message.rolls.length === 0) return;

    const roll = message.rolls[0];

    if (!roll.l5r5e) {
      return;
    }

    const l5rData = roll.l5r5e;

    const isAttack = l5rData.skillCatId === "martial";

    const isFinished = l5rData.rnkEnded === true;

    if (!isAttack) {
      return;
    }

    if (!isFinished) {
      return;
    }

    const attacker = message.speaker?.actor
      ? game.actors.get(message.speaker.actor)
      : null;

    if (!attacker) {
      console.warn("L5R5e Combat Helper | No attacker found");
      return;
    }

    let target = null;

    if (l5rData.target?.actor) {
      target = l5rData.target.actor;
    } else {
      const targets = Array.from(game.user.targets);
      if (targets.length === 0) {
        ui.notifications.warn(
          "L5R5e Combat Helper: No targets in the roll or selected",
        );
        return;
      }
      target = targets[0].actor;
    }

    if (!target) {
      ui.notifications.warn("L5R5e Combat Helper: Could not identify target");
      return;
    }

    const wasCritical = isAtCriticalState(target);

    if (wasCritical) {
      await handleCriticalStrike(target, attacker);
      return;
    }

    const success = checkAttackSuccess(l5rData);

    if (!success) {
      return;
    }

    const rawDamage = calculateDamage(l5rData, attacker);

    const armorResistance = getArmorResistance(target);

    const finalDamage = Math.max(0, rawDamage - armorResistance);

    await applyDamage(
      target,
      finalDamage,
      attacker,
      rawDamage,
      armorResistance,
    );
  } catch (error) {
    console.error("L5R5e Combat Helper | Error:", error);
  }
});

/**
 * Determines whether an attack roll succeeds.
 *
 * Compares total rolled successes against the roll difficulty (TN)
 * and returns true if the attack meets or exceeds the required value.
 */
function checkAttackSuccess(l5rData) {
  const successes = l5rData.summary?.totalSuccess || 0;
  const tn = l5rData.difficulty || 2;
  const success = successes >= tn;

  return success;
}

/**
 * Calculates total damage dealt by the attacker.
 *
 * Retrieves the base damage from the first equipped/readied weapon.
 * Adds bonus damage equal to the number of successes exceeding
 * the attack's difficulty (TN).
 */
function calculateDamage(l5rData, attacker) {
  let baseDamage = 0;

  if (attacker.items) {
    const equippedWeapons = attacker.items.filter(
      (item) =>
        item.type === "weapon" &&
        (item.system?.equipped === true || item.system?.readied === true),
    );

    if (equippedWeapons.length > 0) {
      const weapon = equippedWeapons[0];
      baseDamage = parseInt(weapon.system?.damage) || 0;
    }
  }

  const successes = l5rData.summary?.totalSuccess || 0;
  const tn = l5rData.difficulty || 2;
  const bonusSuccesses = Math.max(0, successes - tn);

  const totalDamage = baseDamage + bonusSuccesses;

  return totalDamage;
}

/**
 * Retrieves the target's physical armor resistance.
 *
 * Looks for the first equipped armor item and extracts its
 * physical resistance value, which will later reduce incoming damage.
 */
function getArmorResistance(target) {
  let resistance = 0;

  if (!target.items) {
    return resistance;
  }

  const equippedArmor = target.items.filter(
    (item) => item.type === "armor" && item.system?.equipped === true,
  );

  if (equippedArmor.length > 0) {
    const armor = equippedArmor[0];

    if (armor.system?.armor?.physical !== undefined) {
      resistance = parseInt(armor.system.armor.physical) || 0;
    }
  }

  return resistance;
}

/**
 * Retrieves the target's endurance value.
 *
 * Attempts to resolve endurance from multiple possible system data paths
 * to maintain compatibility. If not explicitly defined, calculates it
 * from Earth + Fire rings as per L5R5e rules.
 */
function getEndurance(target) {
  let endurance = 0;

  if (target.system.endurance?.value !== undefined) {
    endurance = parseInt(target.system.endurance.value) || 0;
  } else if (
    target.system.endurance !== undefined &&
    typeof target.system.endurance === "number"
  ) {
    endurance = parseInt(target.system.endurance) || 0;
  } else if (target.system.attributes?.endurance !== undefined) {
    endurance = parseInt(target.system.attributes.endurance) || 0;
  } else if (target.system.rings?.earth !== undefined) {
    const earth = parseInt(target.system.rings.earth) || 0;
    const fire = parseInt(target.system.rings.fire) || 0;
    endurance = earth + fire;
  }

  return endurance;
}

/**
 * Checks whether the target is currently incapacitated.
 *
 * Verifies both status icons and active effects to determine
 * if the actor already has the Incapacitated condition applied.
 */
function isIncapacitated(target) {
  if (target.statuses && target.statuses.has("incapacitated")) {
    return true;
  }

  if (target.effects) {
    const hasIncapacitatedEffect = target.effects.find(
      (effect) =>
        effect.name?.toLowerCase().includes("incapacitated") ||
        effect.label?.toLowerCase().includes("incapacitated"),
    );
    if (hasIncapacitatedEffect) {
      return true;
    }
  }

  return false;
}

/**
 * Determines whether the target is in a critical state.
 *
 * A target is considered critical if it is already incapacitated
 * or if its current fatigue exceeds its endurance threshold.
 */
function isAtCriticalState(target) {
  if (isIncapacitated(target)) {
    return true;
  }

  const currentFatigue = getCurrentFatigue(target);
  const endurance = getEndurance(target);

  return currentFatigue > endurance;
}

/**
 * Retrieves the current fatigue value of the target.
 *
 * Resolves fatigue from multiple possible data structures
 * to ensure compatibility across different actor schemas.
 */
function getCurrentFatigue(target) {
  let currentFatigue = 0;

  if (target.system.fatigue?.value !== undefined) {
    currentFatigue = parseInt(target.system.fatigue.value) || 0;
  } else if (
    target.system.fatigue !== undefined &&
    typeof target.system.fatigue === "number"
  ) {
    currentFatigue = parseInt(target.system.fatigue) || 0;
  } else if (target.system.attributes?.fatigue !== undefined) {
    currentFatigue = parseInt(target.system.attributes.fatigue) || 0;
  }

  return currentFatigue;
}

/**
 * Handles a critical strike scenario.
 *
 * Triggered when an attack hits a target that is already
 * incapacitated or beyond its endurance threshold.
 * Posts a prominent chat message and notification indicating
 * that a Critical Strike consequence roll should occur.
 */
async function handleCriticalStrike(target, attacker) {
  const content = `
        <div class="l5r5e-combat-helper critical-strike">
            <h3>💀 CRITICAL STRIKE!</h3>
            <p><strong>${attacker.name}</strong> delivers a critical strike to <strong>${target.name}</strong>!</p>
            <p><em>${target.name} was already Incapacitated when struck!</em></p>
            <p class="critical-warning">⚠️ Roll for Critical Strike consequences!</p>
        </div>
    `;

  ChatMessage.create({
    content: content,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
  });
}

/**
 * Applies fatigue damage to the target.
 *
 * Updates the actor's fatigue value after armor reduction,
 * determines whether the damage causes incapacitation,
 * posts a detailed combat result message to chat,
 * and sends user notifications summarizing the outcome.
 */
async function applyDamage(
  target,
  damage,
  attacker,
  rawDamage,
  armorResistance,
) {
  if (!target) {
    console.warn("L5R5e Combat Helper | Invalid target");
    return;
  }

  if (damage <= 0) {
    const content = `
            <div class="l5r5e-combat-helper armor-blocked">
                <h3>🛡️ Damage Blocked</h3>
                <p><strong>${attacker.name}</strong> attacks <strong>${target.name}</strong></p>
                <p>Raw damage: ${rawDamage} - Armor: ${armorResistance} = <strong>0 damage</strong></p>
                <p><em>The armor completely absorbed the blow!</em></p>
            </div>
        `;

    ChatMessage.create({
      content: content,
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
    });

    return;
  }

  try {
    const currentFatigue = getCurrentFatigue(target);
    const endurance = getEndurance(target);

    let fatigueField = null;
    if (target.system.fatigue?.value !== undefined) {
      fatigueField = "system.fatigue.value";
    } else if (
      target.system.fatigue !== undefined &&
      typeof target.system.fatigue === "number"
    ) {
      fatigueField = "system.fatigue";
    } else if (target.system.attributes?.fatigue !== undefined) {
      fatigueField = "system.attributes.fatigue";
    }

    if (fatigueField === null) {
      console.error(
        "L5R5e Combat Helper | Fatigue field not found. System data:",
        target.system,
      );
      return;
    }

    const newFatigue = currentFatigue + damage;

    const updateData = {};
    updateData[fatigueField] = newFatigue;
    await target.update(updateData);

    let incapacitatedMessage = "";
    if (newFatigue > endurance && currentFatigue <= endurance) {
      incapacitatedMessage =
        '<p class="incapacitated-warning">⚠️ <strong>INCAPACITATED!</strong></p>';
    }

    let armorInfo = "";
    if (armorResistance > 0) {
      armorInfo = `<p><em>Damage reduced by armor: ${rawDamage} - ${armorResistance} = ${damage}</em></p>`;
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

    ChatMessage.create({
      content: content,
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
    });
  } catch (error) {
    console.error("L5R5e Combat Helper | Error applying damage:", error);
    ui.notifications.error("Error applying damage: " + error.message);
  }
}
