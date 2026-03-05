/**
 * Critical Effects Application
 *
 * Handles the application of critical strike effects to a target actor.
 *
 * This module resolves the mechanical consequences of a Critical Strike
 * after the final severity has been calculated.
 *
 * Responsibilities:
 * - Determine the correct critical effect from the severity table
 * - Apply status conditions to the target
 * - Handle armor damage
 * - Manage permanent scars and disadvantages
 * - Apply dying or death states
 * - Generate a chat message summarizing the result
 *
 * The behavior of each critical result is defined in the
 * `critical-effects-table`.
 */

import { getCriticalEffect, isWeaponSharp } from "./critical-effects-table.js";

/**
 * Applies a critical strike effect to a target actor.
 *
 * This function retrieves the correct entry from the critical effects table
 * using the final severity value, then applies the corresponding mechanical
 * consequences (conditions, armor damage, scars, dying state, or instant death).
 * After resolving the effect, it also generates a chat message summarizing
 * the outcome of the critical strike.
 *
 * @param {Actor} target The actor receiving the critical strike.
 * @param {number} finalSeverity The final severity of the critical strike after mitigation.
 * @param {string|null} ringUsed The ring used during the mitigation roll.
 * @param {Item|null} weapon The weapon that caused the critical strike. Used to check properties
 * @param {Actor|null} attacker The attacking actor.
 * @returns {Promise<void>}
 */
export async function applyCriticalEffect(
  target,
  finalSeverity,
  ringUsed,
  weapon,
  attacker,
) {
  const criticalEffect = getCriticalEffect(finalSeverity);

  if (!criticalEffect) {
    console.error(
      "L5R5e Combat Helper | Could not find critical effect for severity:",
      finalSeverity,
    );
    ui.notifications.error("Error applying critical effect");
    return;
  }

  const { mechanicalEffect } = criticalEffect;

  try {
    switch (mechanicalEffect.type) {
      case "armor_damaged":
        await applyArmorDamage(target);
        break;

      case "condition":
        await applyConditions(target, mechanicalEffect, ringUsed, weapon);
        break;

      case "permanent_scar":
        await applyPermanentScar(target, mechanicalEffect, ringUsed, weapon);
        break;

      case "dying":
        await applyDyingConditions(target, mechanicalEffect, ringUsed);
        break;

      case "instant_death":
        await applyInstantDeath(target);
        break;

      default:
        console.warn("Unknown mechanical effect type:", mechanicalEffect.type);
    }

    await createCriticalEffectMessage(
      target,
      attacker,
      finalSeverity,
      criticalEffect,
      ringUsed,
      weapon,
    );
  } catch (error) {
    console.error(
      "L5R5e Combat Helper | Error applying critical effect:",
      error,
    );
    ui.notifications.error("Error applying critical effect: " + error.message);
  }
}

/**
 * Applies armor damage to the equipped armor of the target.
 *
 * If the actor has armor equipped, this function adds the **Damaged**
 * quality to the item. If the armor is already damaged, no change is made.
 *
 * @param {Actor} target The actor whose armor may be damaged.
 * @returns {Promise<void>}
 */
async function applyArmorDamage(target) {
  if (!target.items) return;

  const equippedArmor = target.items.find(
    (item) => item.type === "armor" && item.system?.equipped === true,
  );

  if (!equippedArmor) {
    ui.notifications.info(
      `${target.name} is not wearing armor - no damage to apply`,
    );
    return;
  }

  const currentProperties = equippedArmor.system?.properties || [];
  const alreadyDamaged = currentProperties.some(
    (prop) => prop.name === "Damaged" || prop.id === "L5RCorePro000003",
  );

  if (alreadyDamaged) {
    ui.notifications.info(`${equippedArmor.name} is already Damaged`);
    return;
  }

  try {
    const pack = game.packs.get("l5r5e.core-properties");

    if (!pack) {
      console.warn("L5R5e properties compendium not found, using fallback");
      // Fallback: add manually with known ID
      const updatedProperties = [
        ...currentProperties,
        { id: "L5RCorePro000003", name: "Damaged" },
      ];

      await equippedArmor.update({
        "system.properties": updatedProperties,
      });

      return;
    }

    // Get the Damaged property directly by ID
    const damagedProperty = await pack.getDocument("L5RCorePro000003");

    if (!damagedProperty) {
      console.warn("Damaged property not found in compendium, using fallback");
      // Fallback: add manually with known ID
      const updatedProperties = [
        ...currentProperties,
        { id: "L5RCorePro000003", name: "Damaged" },
      ];

      await equippedArmor.update({
        "system.properties": updatedProperties,
      });

      return;
    }

    // Add the Damaged property to the armor
    const updatedProperties = [
      ...currentProperties,
      {
        id: damagedProperty._id,
        name: damagedProperty.name,
      },
    ];

    await equippedArmor.update({
      "system.properties": updatedProperties,
    });
  } catch (error) {
    console.error("Error adding Damaged property to armor:", error);

    // Final fallback
    try {
      const updatedProperties = [
        ...currentProperties,
        { id: "L5RCorePro000003", name: "Damaged" },
      ];

      await equippedArmor.update({
        "system.properties": updatedProperties,
      });
    } catch (fallbackError) {
      console.error("Fallback also failed:", fallbackError);
      ui.notifications.error(`Error damaging armor: ${error.message}`);
    }
  }
}

/**
 * Applies a set of standard conditions defined in the critical effect.
 *
 * Some conditions are always applied, while others may depend on
 * additional factors such as weapon properties (e.g. Razor-Edged).
 *
 * @param {Actor} target The actor receiving the conditions.
 * @param {Object} mechanicalEffect The mechanical effect configuration from the critical table.
 * @param {string|null} ringUsed The ring used in the mitigation roll.
 * @param {Item|null} weapon The weapon that caused the critical strike.
 * @returns {Promise<void>}
 */
async function applyConditions(target, mechanicalEffect, ringUsed, weapon) {
  const { conditions, conditionalConditions } = mechanicalEffect;

  for (let condition of conditions) {
    await applyConditionToActor(target, condition, ringUsed);
  }

  if (conditionalConditions) {
    for (let conditional of conditionalConditions) {
      if (conditional.condition === "weapon_sharp" && isWeaponSharp(weapon)) {
        for (let extraCondition of conditional.applies) {
          await applyConditionToActor(target, extraCondition, ringUsed);
        }
      }
    }
  }
}

/**
 * Applies a permanent scar effect.
 *
 * The target first receives the base conditions defined by the critical
 * effect (typically Bleeding). Then the player must choose one permanent
 * disadvantage associated with the ring used in the mitigation roll.
 *
 * @param {Actor} target The actor receiving the scar.
 * @param {Object} mechanicalEffect The mechanical effect configuration from the critical table.
 * @param {string} ringUsed The ring used in the mitigation roll.
 * @param {Item|null} weapon The weapon causing the critical strike.
 * @returns {Promise<void>}
 */
async function applyPermanentScar(target, mechanicalEffect, ringUsed, weapon) {
  const { conditions, scarChoices } = mechanicalEffect;

  for (let condition of conditions) {
    await applyConditionToActor(target, condition, ringUsed);
  }

  const availableScars = scarChoices[ringUsed] || [];

  if (availableScars.length === 0) {
    ui.notifications.warn(`No scar choices available for ring: ${ringUsed}`);
    return;
  }

  const selectedScar = await showScarSelectionDialog(
    target,
    ringUsed,
    availableScars,
  );

  if (selectedScar) {
    await addScarToActor(target, selectedScar, ringUsed);
  }
}

/**
 * Applies the conditions associated with a dying critical effect.
 *
 * This usually includes conditions such as **Severely Wounded**, **Bleeding**,
 * and **Dying**, along with a countdown of rounds before death.
 *
 * @param {Actor} target The actor entering the dying state.
 * @param {Object} mechanicalEffect The mechanical effect configuration from the critical table.
 * @param {string|null} ringUsed The ring used in the mitigation roll.
 * @returns {Promise<void>}
 */
async function applyDyingConditions(target, mechanicalEffect, ringUsed) {
  const { conditions, dyingRounds } = mechanicalEffect;

  for (let condition of conditions) {
    if (condition.startsWith("dying_")) {
      await applyConditionToActor(target, "dying", ringUsed, {
        rounds: dyingRounds,
      });
    } else {
      await applyConditionToActor(target, condition, ringUsed);
    }
  }

  ui.notifications.error(
    `${target.name} is Dying! They have ${dyingRounds} round(s) to receive aid.`,
  );
}

/**
 * Applies instant death to the target.
 *
 * This sets the **Dead/Unconscious** state depending on how the system
 * implements lethal conditions.
 *
 * @param {Actor} target The actor that dies instantly.
 * @returns {Promise<void>}
 */
async function applyInstantDeath(target) {
  await applyConditionToActor(target, "dead");
}

/**
 * Applies a single condition to an actor using the native L5R5e
 * status effect system.
 *
 * This helper converts internal condition identifiers used by the
 * module into the corresponding **status effect IDs** expected by
 * the L5R5e system.
 *
 * @param {Actor} target The actor receiving the condition.
 * @param {string} conditionName Internal name of the condition to apply.
 * @param {string|null} [ringUsed] Ring associated with the condition.
 * @param {Object} [extraData] Optional additional data for special conditions.
 * @param {number} [extraData.rounds] Number of rounds before death when applying the **Dying** condition.
 * @returns {Promise<void>}
 */
async function applyConditionToActor(
  target,
  conditionName,
  ringUsed = null,
  extraData = {},
) {
  try {
    let statusId = null;

    if (conditionName === "lightly_wounded" && ringUsed) {
      statusId = `lightly_wounded_${ringUsed}`;
    } else if (conditionName === "severely_wounded" && ringUsed) {
      statusId = `severely_wounded_${ringUsed}`;
    } else if (conditionName === "bleeding") {
      statusId = "bleeding";
    } else if (conditionName === "dying") {
      statusId = "dying";
    } else if (conditionName === "dead" || conditionName === "unconscious") {
      statusId = "unconscious";
    } else if (conditionName === "incapacitated") {
      statusId = "incapacitated";
    }

    if (statusId) {
      await target.toggleStatusEffect(statusId, { active: true });

      if (conditionName === "dying" && extraData.rounds) {
        ui.notifications.error(
          `${target.name} is Dying! They have ${extraData.rounds} round(s) to receive aid.`,
        );
      }
    } else {
      console.warn(`Unknown condition: ${conditionName}`);
    }
  } catch (error) {
    console.error(`Error applying condition ${conditionName}:`, error);
    ui.notifications.warn(`Could not apply condition: ${conditionName}`);
  }
}

/**
 * Displays a dialog that allows the player to select a permanent scar.
 *
 * The player must choose one disadvantage from the list associated with
 * the ring used during the mitigation roll.
 *
 * @param {Actor} target The actor receiving the scar.
 * @param {string} ringUsedThe ring associated with the injury.
 * @param {string[]} scarChoices Array of available scar names.
 * @returns {Promise<string|null>} The selected scar name, or `null` if the dialog was cancelled.
 */
async function showScarSelectionDialog(target, ringUsed, scarChoices) {
  return new Promise((resolve) => {
    const options = scarChoices
      .map((scar) => `<option value="${scar}">${scar}</option>`)
      .join("");

    const content = `
      <div class="critical-scar-selection">
        <p><strong>${target.name}</strong> must choose a permanent scar for ring: <strong>${ringUsed.toUpperCase()}</strong></p>
        <p>This disadvantage will be permanent.</p>
        <div class="form-group">
          <label>Select Scar:</label>
          <select id="scar-choice" style="width: 100%">
            ${options}
          </select>
        </div>
      </div>
    `;

    new Dialog({
      title: "Permanent Injury - Choose Scar",
      content: content,
      buttons: {
        confirm: {
          icon: '<i class="fas fa-check"></i>',
          label: "Confirm",
          callback: (html) => {
            const selected = html.find("#scar-choice").val();
            resolve(selected);
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => resolve(null),
        },
      },
      default: "confirm",
    }).render(true);
  });
}

/**
 * Adds a permanent scar item to the actor.
 *
 * The scar is retrieved from the **L5R5e peculiarities/adversities compendium**
 * and embedded into the actor's item collection. XP cost is set to 0 because
 * the disadvantage is gained through a critical strike rather than advancement.
 *
 * @param {Actor} target The actor receiving the scar.
 * @param {string} scarName Name of the disadvantage to add.
 * @param {string} ringUsed The ring associated with the injury.
 * @returns {Promise<void>}
 */
async function addScarToActor(target, scarName, ringUsed) {
  try {
    const pack = game.packs.get("l5r5e.core-peculiarities-adversities");

    if (!pack) {
      ui.notifications.error("Could not find L5R5e peculiarities compendium");
      return;
    }

    await pack.getIndex();

    const scarEntry = pack.index.find((entry) => entry.name === scarName);

    if (!scarEntry) {
      ui.notifications.warn(`Scar "${scarName}" not found in compendium`);
      return;
    }

    const scarItem = await pack.getDocument(scarEntry._id);

    if (!scarItem) {
      ui.notifications.error(`Could not load scar "${scarName}"`);
      return;
    }

    const itemData = scarItem.toObject();

    itemData.system.xp_cost = 0;
    itemData.system.bought_at_rank = 0;
    itemData.system.ring = ringUsed;

    await target.createEmbeddedDocuments("Item", [itemData]);
  } catch (error) {
    console.error("Error adding scar to actor:", error);
    ui.notifications.error(`Error applying scar: ${error.message}`);
  }
}

/**
 * Creates a chat message summarizing the critical strike effect.
 *
 * This message provides context about the attacker, target, weapon used,
 * final severity, and the narrative description of the critical result.
 *
 * @param {Actor|null} target The actor affected by the critical strike.
 * @param {Actor|null} attacker The attacking actor.
 * @param {number} severity Final critical severity after mitigation.
 * @param {Object} criticalEffect The resolved critical effect entry from the table.
 * @param {string|null} ringUsed The ring used in the mitigation roll.
 * @param {Item|null} weapon The weapon used in the attack.
 * @returns {Promise<void>}
 */
async function createCriticalEffectMessage(
  target,
  attacker,
  severity,
  criticalEffect,
  ringUsed,
  weapon,
) {
  const weaponSharp = isWeaponSharp(weapon);
  const weaponName = weapon?.name || "Unknown weapon";

  const content = `
    <div class="l5r5e-combat-helper critical-effect-result">
      <h3>💀 Critical Strike Effect</h3>
      <p><strong>${attacker.name}</strong> critically strikes <strong>${target.name}</strong></p>
      
      <div class="critical-info">
        <p><strong>Weapon:</strong> ${weaponName} ${weaponSharp ? "(Razor-Edged)" : ""}</p>
        <p><strong>Final Severity:</strong> ${severity}</p>
        <p><strong>Ring Used (Mitigation):</strong> ${ringUsed ? ringUsed.toUpperCase() : "N/A"}</p>
      </div>

      <div class="critical-result">
        <h4>⚠️ ${criticalEffect.name}</h4>
        <p>${criticalEffect.effect}</p>
      </div>

      <p class="effect-applied">Effects have been applied to ${target.name}</p>
    </div>
  `;

  await ChatMessage.create({
    content: content,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
  });
}
