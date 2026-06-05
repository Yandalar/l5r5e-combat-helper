// @ts-nocheck
import { processAttack } from "./combat-handler";
import { reverseCriticalEffect } from "./critical/critical-effects-application";
import { revertFatigueDamage } from "./core/actor-utils";
import { resolveMessageId } from "./core/compat-utils";

const FLAG_NS = "l5r5e-combat-helper";

export function registerDifficultyChangeMenu() {
  Hooks.on("getChatMessageContextOptions", addDifficultyChangeOption);
}

function addDifficultyChangeOption(html, options) {
  const optionsArray = Array.isArray(options)
    ? options
    : Array.isArray(html)
      ? html
      : null;

  if (!optionsArray) return;

  optionsArray.push({
    name: game.i18n.localize("l5r5e-combat-helper.contextMenu.changeDifficulty"),
    icon: '<i class="fas fa-sliders-h"></i>',

    condition: (li) => {
      if (!game.user.isGM) return false;
      const messageId = resolveMessageId(li);
      if (!messageId) return false;
      const message = game.messages.get(messageId);
      if (!message) return false;
      if (!message.rolls?.[0]?.l5r5e) return false;
      // Hide if the attack was already converted to a critical via void defense
      const attackData = message.getFlag(FLAG_NS, "attackData");
      if (attackData?.resolved) return false;
      return true;
    },

    callback: async (li) => {
      const messageId = resolveMessageId(li);
      if (!messageId) return;
      const message = game.messages.get(messageId);
      if (!message) return;
      try {
        await handleDifficultyChange(message);
      } catch (error) {
        console.error("L5R5e Combat Helper | Error changing difficulty:", error);
        ui.notifications.error(
          game.i18n.format(
            "l5r5e-combat-helper.notifications.changeDifficulty.error",
            { error: error.message },
          ),
        );
      }
    },
  });
}

async function handleDifficultyChange(rollMessage) {
  const l5rData = rollMessage.rolls?.[0]?.l5r5e;
  if (!l5rData) return;

  const currentTN = l5rData.difficulty ?? 1;
  const newTN = await promptForNewTN(currentTN);
  if (newTN === null || newTN === undefined || isNaN(newTN) || newTN < 1) return;
  if (newTN === currentTN) return;

  // Collect downstream messages BEFORE deleting anything (we need their data)
  const chain = collectChain(rollMessage.id);

  // Capture target info from the chain before it's deleted
  const targetId = resolveTargetId(rollMessage, chain, l5rData);

  await revertChain(chain);
  await deleteChain(chain);
  await reprocessRoll(rollMessage, l5rData, newTN, targetId);
  await annotateRollMessage(rollMessage, l5rData, newTN);
}

async function promptForNewTN(currentTN) {
  const title = game.i18n.localize(
    "l5r5e-combat-helper.dialog.changeDifficulty.title",
  );
  const label = game.i18n.localize(
    "l5r5e-combat-helper.dialog.changeDifficulty.label",
  );
  const confirmLabel = game.i18n.localize(
    "l5r5e-combat-helper.dialog.changeDifficulty.confirm",
  );
  const cancelLabel = game.i18n.localize(
    "l5r5e-combat-helper.dialog.changeDifficulty.cancel",
  );
  const content = `<form><div class="form-group"><label>${label}</label><input type="number" name="tn" value="${currentTN}" min="1" max="20" style="width:60px;margin-left:8px" autofocus></div></form>`;

  if (foundry.applications?.api?.DialogV2) {
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title },
      content,
      ok: {
        label: confirmLabel,
        callback: (_event, button) => {
          const val = parseInt(button.form.elements.tn.value);
          return isNaN(val) ? null : val;
        },
      },
      rejectClose: false,
    });
    return result ?? null;
  }

  return new Promise((resolve) => {
    new Dialog({
      title,
      content,
      buttons: {
        ok: {
          label: confirmLabel,
          callback: (html) => {
            const val = parseInt(html.find('[name="tn"]').val());
            resolve(isNaN(val) ? null : val);
          },
        },
        cancel: {
          label: cancelLabel,
          callback: () => resolve(null),
        },
      },
      default: "ok",
      close: () => resolve(null),
    }).render(true);
  });
}

/**
 * Finds all downstream chat messages linked to a given roll via originRollId.
 * Excludes the roll message itself (which stores attackData pointing to itself).
 */
function collectChain(rollMessageId) {
  const found = [];
  for (const msg of game.messages.contents) {
    if (msg.id === rollMessageId) continue;
    const flags = msg.flags?.[FLAG_NS];
    if (!flags) continue;
    if (
      flags.attackData?.rollMessageId === rollMessageId ||
      flags.criticalStrike?.originRollId === rollMessageId ||
      flags.mitigationResult?.originRollId === rollMessageId
    ) {
      found.push(msg);
    }
  }
  return found;
}

/**
 * Resolves the target actor ID from several sources, in priority order.
 * Must be called BEFORE deleting chain messages.
 */
function resolveTargetId(rollMessage, chain, l5rData) {
  // 1. attackData on the roll message (successful normal attack)
  const attackData = rollMessage.getFlag(FLAG_NS, "attackData");
  if (attackData?.targetId) return attackData.targetId;

  // 2. Target embedded in the roll data by the L5R5e system
  if (l5rData?.target?.actor?.id) return l5rData.target.actor.id;

  // 3. Critical strike message in chain (incapacitated-target path)
  for (const msg of chain) {
    const cData = msg.flags?.[FLAG_NS]?.criticalStrike;
    if (cData?.targetId) return cData.targetId;
  }

  // 4. Mitigation result in chain (critical chain already resolved)
  for (const msg of chain) {
    const mData = msg.flags?.[FLAG_NS]?.mitigationResult;
    if (mData?.targetId) return mData.targetId;
  }

  // 5. Currently targeted token on the canvas (covers failed-attack case)
  const targets = Array.from(game.user?.targets ?? []);
  if (targets.length > 0) return targets[0].actor?.id ?? null;

  return null;
}

/**
 * Reverts all game-state changes caused by the chained messages.
 */
async function revertChain(chain) {
  for (const msg of chain) {
    const flags = msg.flags?.[FLAG_NS];
    if (!flags) continue;

    // Damage message: revert fatigue applied to target
    if (flags.attackData && !flags.attackData.resolved) {
      const { targetId, finalDamage } = flags.attackData;
      if (finalDamage > 0) {
        const target = game.actors.get(targetId);
        if (target) await revertFatigueDamage(target, finalDamage);
      }
    }

    // Mitigation result: revert critical effects
    if (flags.mitigationResult) {
      const spData = flags.shatteringParryData;

      if (spData?.used === true) {
        // Shattering Parry was triggered from this message.
        // The critical effects of THIS result were already reversed by SP.
        // Only revert the weapon damage SP caused.
        const target = game.actors.get(spData.targetId);
        const weapon = target?.items?.get(spData.weaponId);
        if (weapon) await revertWeaponDamage(weapon);
      } else {
        // Normal mitigation result: critical effects are currently applied.
        const { targetId, finalSeverity, ringUsed, wasWeaponSharp } =
          flags.mitigationResult;
        const target = game.actors.get(targetId);
        if (target) {
          await reverseCriticalEffect(
            target,
            finalSeverity,
            ringUsed,
            wasWeaponSharp ?? false,
          );
        }
      }
    }
  }
}

/**
 * Deletes all chained messages, including fitness roll and SP announcement
 * messages referenced by flags.
 */
async function deleteChain(chain) {
  const idsToDelete = new Set(chain.map((m) => m.id));

  for (const msg of chain) {
    const flags = msg.flags?.[FLAG_NS];
    if (!flags) continue;

    if (flags.mitigationResult?.fitnessRollMessageId) {
      idsToDelete.add(flags.mitigationResult.fitnessRollMessageId);
    }

    if (flags.shatteringParryData?.shatteringParryAnnouncementId) {
      idsToDelete.add(flags.shatteringParryData.shatteringParryAnnouncementId);
    }
  }

  for (const id of idsToDelete) {
    try {
      const msg = game.messages.get(id);
      if (msg) await msg.delete();
    } catch (err) {
      console.warn(`L5R5e Combat Helper | Could not delete message ${id}:`, err);
    }
  }
}

/**
 * Re-runs the downstream flow with the new TN.
 * For attack rolls: calls processAttack with modified l5rData.
 * For other rolls: posts a summary message.
 */
async function reprocessRoll(rollMessage, l5rData, newTN, targetId) {
  const attackSkills = ["melee", "ranged", "unarmed"];
  const isAttack =
    attackSkills.includes(l5rData.skillId) && l5rData.rnkEnded === true;

  if (!isAttack) {
    await createDifficultyChangedMessage(rollMessage, l5rData, newTN);
    return;
  }

  const attacker = game.actors.get(rollMessage.speaker?.actor);
  if (!attacker) return;

  const targetActor = targetId ? game.actors.get(targetId) : null;
  if (!targetActor) {
    ui.notifications.warn(
      game.i18n.localize("l5r5e-combat-helper.notifications.targetNotFound"),
    );
    return;
  }

  const modifiedL5rData = { ...l5rData, difficulty: newTN };

  await processAttack(rollMessage, attacker, targetActor, modifiedL5rData);
}

/**
 * Posts a chat message summarising the result of a non-attack roll
 * after a difficulty change.
 */
async function createDifficultyChangedMessage(rollMessage, l5rData, newTN) {
  const i18n = game.i18n;
  const oldTN = l5rData.difficulty ?? 1;
  const totalSuccesses = l5rData.summary?.totalSuccess || 0;
  const succeeded = totalSuccesses >= newTN;
  const bonusSuccesses = Math.max(0, totalSuccesses - newTN);

  const title = i18n.localize(
    "l5r5e-combat-helper.chat.difficultyChanged.title",
  );
  const result = i18n.format(
    "l5r5e-combat-helper.chat.difficultyChanged.result",
    { oldTN, newTN, successes: totalSuccesses },
  );
  const outcome = succeeded
    ? i18n.format("l5r5e-combat-helper.chat.difficultyChanged.success", {
        bonus: bonusSuccesses,
      })
    : i18n.format("l5r5e-combat-helper.chat.difficultyChanged.failure", {
        tn: newTN,
        successes: totalSuccesses,
      });

  await ChatMessage.create({
    content: `
      <div class="l5r5e-combat-helper difficulty-changed">
        <h3>${title}</h3>
        <p>${result}</p>
        <p>${outcome}</p>
      </div>
    `,
    speaker: rollMessage.speaker,
  });
}

const BADGE_START = "<!-- l5r5e-difficulty-badge-start -->";
const BADGE_END = "<!-- l5r5e-difficulty-badge-end -->";

/**
 * Appends (or replaces) a difficulty-change badge on the original roll message.
 * Uses comment markers so repeated changes replace the previous badge cleanly.
 */
async function annotateRollMessage(rollMessage, l5rData, newTN) {
  const i18n = game.i18n;
  const oldTN = l5rData.difficulty ?? 1;
  const totalSuccesses = l5rData.summary?.totalSuccess || 0;
  const succeeded = totalSuccesses >= newTN;
  const bonusSuccesses = Math.max(0, totalSuccesses - newTN);

  const resultLine = succeeded
    ? i18n.format("l5r5e-combat-helper.chat.difficultyChanged.success", { bonus: bonusSuccesses })
    : i18n.format("l5r5e-combat-helper.chat.difficultyChanged.failure", { tn: newTN, successes: totalSuccesses });

  const badge = `${BADGE_START}<div class="l5r5e-combat-helper difficulty-changed-badge" style="margin-top:4px;border-top:1px solid #aaa;padding-top:4px;font-size:0.9em"><em>${i18n.format("l5r5e-combat-helper.chat.difficultyChanged.result", { oldTN, newTN, successes: totalSuccesses })}</em><br>${resultLine}</div>${BADGE_END}`;

  // Strip any previous badge before appending the new one
  const stripped = rollMessage.content.replace(
    new RegExp(`${BADGE_START}[\\s\\S]*?${BADGE_END}`),
    "",
  );

  await rollMessage.update({ content: stripped + badge });
}

/**
 * Removes the Damaged property from a weapon item.
 */
async function revertWeaponDamage(weapon) {
  const currentProperties = weapon.system?.properties || [];
  const filtered = currentProperties.filter(
    (prop) => prop.id !== "L5RCorePro000003" && prop.name !== "Damaged",
  );
  if (filtered.length < currentProperties.length) {
    await weapon.update({ "system.properties": filtered });
  }
}
