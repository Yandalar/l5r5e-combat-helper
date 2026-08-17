// @ts-nocheck

import { KATA_REGISTRY, PASSIVE_KATA_REGISTRY } from "./kata-registry";
import {
  executeKata,
  executeKataOpportunity,
  applyEffect,
  resolveTargets,
  processExpiredKataEffects,
  processEndOfTurnKataEffects,
  clearAllKataEffects,
  applyPassiveKataOpportunity,
} from "./technique-engine";
import { removeTnReductionActiveEffect } from "./token-effects";
import {
  createResistanceResultMessage,
  createPassiveKataOpportunityCard,
} from "./technique-chat";

/**
 * Registers all kata-related hooks:
 * - createChatMessage: detect kata activation rolls + resistance roll completions
 * - renderChatMessage: attach button handlers (resistance, opportunity)
 * - updateCombat: expire until_next_turn effects
 * - deleteCombat: clear all kata effects on combat end
 */
export function registerKataActivationHandler() {
  // ── 1. Detect kata rolls and resistance roll completions ────────────────────
  Hooks.on("createChatMessage", async (message) => {
    if (!game.settings.get("l5r5e-combat-helper", "l5r5eCombatHelper")) return;
    try {
      if (!message.rolls || message.rolls.length === 0) return;
      const roll = message.rolls[0];
      if (!roll.l5r5e) return;
      const l5rData = roll.l5r5e;
      if (l5rData.rnkEnded !== true) return;

      const actor = message.speaker?.actor
        ? game.actors.get(message.speaker.actor)
        : null;
      if (!actor) return;

      // Check for pending resistance roll FIRST (before kata detection)
      const pending = actor.getFlag(
        "l5r5e-combat-helper",
        "pendingResistanceRoll",
      );
      if (pending && pending.skill === l5rData.skillId) {
        await handleResistanceRollResult(actor, l5rData, pending);
        return;
      }

      const isKataActivation = l5rData.item?.system?.technique_type === "kata";

      if (isKataActivation) {
        // ── Active kata: rolled directly from the technique card ──────────────
        const itemName = l5rData.item.name;
        const compendiumSource = l5rData.item._stats?.compendiumSource;

        const kata = KATA_REGISTRY.find(
          (k) =>
            k.names.includes(itemName) ||
            (compendiumSource && k.compendiumIds?.includes(compendiumSource)),
        );
        if (!kata) return; // not yet registered — silent ignore

        const targets = Array.from(game.user.targets)
          .map((t) => t.actor)
          .filter(Boolean);

        let tn;
        if (kata.activation.difficulty === "target.silhouette") {
          if (targets.length === 0) {
            ui.notifications.warn(
              game.i18n.localize("l5r5e-combat-helper.notifications.noTargets"),
            );
            return;
          }
          tn = Math.max(
            parseInt(targets[0].system?.silhouette) || 1,
            kata.activation.minDifficulty || 1,
          );
        } else {
          tn = kata.activation.difficulty;
        }

        const totalSuccess = l5rData.summary?.totalSuccess || 0;

        // Consume pending TN reduction from target (e.g. Soaring Slice opportunity effect)
        const firstTarget = targets[0] ?? null;
        const tnReductionData = firstTarget?.getFlag("l5r5e-combat-helper", "pendingTnReduction");
        const tnReduction = tnReductionData?.amount || 0;
        if (tnReductionData && firstTarget) {
          await firstTarget.unsetFlag("l5r5e-combat-helper", "pendingTnReduction");
          await removeTnReductionActiveEffect(firstTarget);
        }

        const effectiveTn = Math.max(1, tn - tnReduction);
        const success = totalSuccess >= effectiveTn;
        const extraSuccesses = Math.max(0, totalSuccess - effectiveTn);

        await executeKata(kata, actor, targets, success, extraSuccesses, l5rData, message);
      } else {
        // ── Passive katas: trigger on matching regular martial rolls ──────────
        const martialSkills = ["melee", "ranged", "unarmed"];
        if (!martialSkills.includes(l5rData.skillId)) return;

        // In l5r5e the ring used for a roll is the active stance
        const rollRing = l5rData.stance ?? null;
        if (!rollRing) return;

        const opportunities = l5rData.summary?.opportunity || 0;
        if (opportunities === 0) return;

        // Only the actor's owner (or GM) creates the opportunity card — prevents duplicates across clients
        if (!actor.isOwner) return;

        for (const kata of PASSIVE_KATA_REGISTRY) {
          if (!kata.activation) continue;
          if (!kata.activation.skills.includes(l5rData.skillId)) continue;
          const ringMatch = Array.isArray(kata.activation.ring)
            ? kata.activation.ring.includes(rollRing)
            : kata.activation.ring === rollRing;
          if (!ringMatch) continue;
          const hasKata = actor.items.some(
            (item) =>
              kata.names.includes(item.name) ||
              (kata.compendiumIds?.some(
                (id) => item._stats?.compendiumSource === id,
              )),
          );
          if (!hasKata) continue;
          const currentTargetIds = Array.from(game.user.targets)
            .map((t) => t.actor?.id)
            .filter(Boolean);
          await createPassiveKataOpportunityCard(kata, actor, opportunities, currentTargetIds, message.id);
        }
      }
    } catch (error) {
      console.error("L5R5e Combat Helper | Kata activation error:", error);
    }
  });

  // ── 2. Attach button handlers on chat message render ───────────────────────
  Hooks.on("renderChatMessage", (message, html) => {
    const el = html instanceof HTMLElement ? html : html[0];

    // Resistance roll button
    el.querySelectorAll(".kata-resistance-roll-button").forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        await handleResistanceRollButtonClick(event.currentTarget);
      });
    });

    // Opportunity button (active kata)
    el.querySelectorAll(".kata-opportunity-button").forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        await handleOpportunityButtonClick(message, event.currentTarget);
      });
    });

    // Passive kata opportunity buttons (e.g. Striking as Earth)
    el.querySelectorAll(".kata-passive-opportunity-btn").forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        await handlePassiveKataButtonClick(message, event.currentTarget);
      });
    });
  });

  // ── 3. Duration cleanup on turn change ─────────────────────────────────────
  Hooks.on("updateCombat", async (combat, changed) => {
    if (!("turn" in changed) && !("round" in changed)) return;
    // "until_start_of_next_turn" effects: expire when combatant starts their turn
    const combatant = combat.combatants.get(combat.current?.combatantId);
    if (combatant?.actorId) {
      await processExpiredKataEffects(combatant.actorId);
    }
    // "until_end_of_next_turn" effects: expire when the previous combatant's turn ends
    const previousCombatant = combat.combatants.get(combat.previous?.combatantId);
    if (previousCombatant?.actorId && previousCombatant.actorId !== combatant?.actorId) {
      await processEndOfTurnKataEffects(previousCombatant.actorId);
    }
  });

  // ── 4. Full cleanup on combat end ──────────────────────────────────────────
  Hooks.on("deleteCombat", async () => {
    await clearAllKataEffects();
  });
}

// ── Private handlers ────────────────────────────────────────────────────────

async function handleResistanceRollResult(actor, l5rData, pending) {
  await actor.unsetFlag("l5r5e-combat-helper", "pendingResistanceRoll");

  const totalSuccess = l5rData.summary?.totalSuccess || 0;
  const success = totalSuccess >= pending.difficulty;

  if (!success && pending.onFailure?.length) {
    const attacker = pending.attackerId
      ? game.actors.get(pending.attackerId)
      : null;
    for (const effect of pending.onFailure) {
      const effectTargets = resolveTargets(
        effect.target ?? "target",
        attacker,
        [actor],
      );
      await applyEffect(effect, attacker, effectTargets, 0);
    }
  }

  await createResistanceResultMessage(
    actor,
    totalSuccess,
    pending.difficulty,
    success,
  );
}

async function handleResistanceRollButtonClick(button) {
  if (button.disabled) return;

  const targetId = button.dataset.targetId;
  const skill = button.dataset.skill;
  const skillCatId = button.dataset.skillCat;
  const difficulty = parseInt(button.dataset.difficulty);

  const target = game.actors.get(targetId);
  if (!target) {
    ui.notifications.error(
      game.i18n.localize("l5r5e-combat-helper.notifications.targetNotFound"),
    );
    return;
  }

  if (!target.isOwner && !game.user.isGM) {
    ui.notifications.warn(
      game.i18n.localize("l5r5e-combat-helper.notifications.noPermission"),
    );
    return;
  }

  button.disabled = true;
  button.textContent = game.i18n.localize(
    "l5r5e-combat-helper.kata.chat.rolling",
  );

  try {
    new game.l5r5e.DicePickerDialog({
      actor: target,
      skillId: skill,
      skillCatId: skillCatId,
      difficulty,
      difficultyHidden: false,
    }).render(true);
  } catch (error) {
    console.error(
      "L5R5e Combat Helper | Error launching resistance roll:",
      error,
    );
    button.disabled = false;
    button.textContent = game.i18n.localize(
      "l5r5e-combat-helper.kata.chat.rollResistance",
    );
  }
}

async function handlePassiveKataButtonClick(message, button) {
  if (button.disabled) return;

  const passiveData = message.getFlag("l5r5e-combat-helper", "passiveKataData");
  if (!passiveData || passiveData.used) {
    button.disabled = true;
    return;
  }

  const attacker = game.actors.get(passiveData.attackerId);
  if (!attacker) return;

  if (!attacker.isOwner && !game.user.isGM) {
    ui.notifications.warn(
      game.i18n.localize("l5r5e-combat-helper.notifications.noPermission"),
    );
    return;
  }

  // Disable all buttons on this card to prevent double-spend
  const card = button.closest(".kata-passive-opportunity");
  if (card) card.querySelectorAll("button").forEach((b) => (b.disabled = true));

  await message.setFlag("l5r5e-combat-helper", "passiveKataData", {
    ...passiveData,
    used: true,
  });

  const kataName = button.dataset.kataName;
  const amount = parseInt(button.dataset.amount);
  const chosenCondition = button.dataset.condition ?? null;
  const kata = PASSIVE_KATA_REGISTRY.find((k) => k.names.includes(kataName));
  if (!kata) return;

  const targetActors = (passiveData.targetIds || [])
    .map((id) => game.actors.get(id))
    .filter(Boolean);

  await applyPassiveKataOpportunity(kata, attacker, amount, targetActors, chosenCondition);

  // Deduct spent opportunities from the linked damage message(s) so the
  // critical strike button can gate on remaining opportunities.
  if (passiveData.rollMessageId) {
    for (const msg of game.messages) {
      const ad = msg.getFlag("l5r5e-combat-helper", "attackData");
      if (ad?.rollMessageId !== passiveData.rollMessageId) continue;
      await msg.setFlag("l5r5e-combat-helper", "attackData", {
        ...ad,
        opportunities: Math.max(0, (ad.opportunities || 0) - amount),
      });
    }
  }

  const effectType = kata.onOpportunity[0]?.effects[0]?.type ?? "resistance_buff";
  let activatedKey;
  let formatParams;
  if (effectType === "critical_severity_boost") {
    activatedKey = "l5r5e-combat-helper.kata.chat.passiveActivatedSeverityBoost";
    formatParams = { amount };
  } else if (effectType === "condition_lock") {
    activatedKey = "l5r5e-combat-helper.kata.chat.passiveActivatedConditionLock";
    const conditionName = chosenCondition
      ? game.i18n.localize(`l5r5e-combat-helper.conditions.${chosenCondition}`)
      : "?";
    formatParams = { condition: conditionName };
  } else {
    activatedKey = "l5r5e-combat-helper.kata.chat.passiveActivated";
    formatParams = { amount };
  }

  await ChatMessage.create({
    content: `<div class="l5r5e-combat-helper kata-passive-result">
      <p>⚡ <strong>${kata.names[0]}</strong>: ${game.i18n.format(activatedKey, formatParams)}</p>
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
  });
}

async function handleOpportunityButtonClick(message, button) {
  if (button.disabled) return;

  const oppData = message.getFlag(
    "l5r5e-combat-helper",
    "kataOpportunityData",
  );
  if (!oppData) {
    console.error("L5R5e Combat Helper | kataOpportunityData flag not found on message", message.id, message.flags);
    button.disabled = true;
    return;
  }
  if (oppData.used) {
    button.disabled = true;
    return;
  }

  const attacker = game.actors.get(oppData.attackerId);
  if (!game.user.isGM && !attacker?.isOwner) {
    ui.notifications.warn(
      game.i18n.localize("l5r5e-combat-helper.notifications.noPermission"),
    );
    return;
  }

  button.disabled = true;

  await message.setFlag("l5r5e-combat-helper", "kataOpportunityData", {
    ...oppData,
    used: true,
  });

  await executeKataOpportunity(
    oppData.kataName,
    oppData.attackerId,
    oppData.targetIds,
    oppData.extraSuccesses,
    0,
  );

  await ChatMessage.create({
    content: `<div class="l5r5e-combat-helper kata-opportunity-result">
      <p>⚡ <strong>${oppData.kataName}</strong>: ${game.i18n.localize("l5r5e-combat-helper.kata.chat.opportunityUsed")}</p>
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
  });
}
