// @ts-nocheck

import { KATA_REGISTRY, PASSIVE_KATA_REGISTRY, kataMatchesItem } from "./kata-registry";
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
import { resolveAttackWeapon } from "../core/weapon-utils";
import { getSilhouette } from "../core/actor-utils";
import { buildResistanceDialogParams, matchesPendingResistance } from "./resistance-roll";
import {
  createResistanceResultMessage,
  createPassiveKataOpportunityCard,
} from "./technique-chat";
import { onRenderChatMessage, isResponsibleClient, rollTargetActors } from "../core/compat-utils";
import { actorRef, resolveActor, rollActor } from "../core/actor-refs";
import { runAsGM, registerGmRelay, senderCanActFor } from "../core/gm-relay";

/**
 * Registers all kata-related hooks:
 * - createChatMessage: detect kata activation rolls + resistance roll completions
 * - renderChatMessageHTML: attach button handlers (resistance, opportunity)
 * - updateCombat: expire until_next_turn effects
 * - deleteCombat: clear all kata effects on combat end
 */
export function registerKataActivationHandler() {
  registerGmRelay({
    kataOpportunity: applyKataOpportunity,
    passiveKataOpportunity: applyPassiveKataOpportunityFromCard,
  });

  // ── 1. Detect kata rolls and resistance roll completions ────────────────────
  Hooks.on("createChatMessage", async (message) => {
    if (!game.settings.get("l5r5e-combat-helper", "l5r5eCombatHelper")) return;
    if (!isResponsibleClient(message)) return;
    try {
      if (!message.rolls || message.rolls.length === 0) return;
      const roll = message.rolls[0];
      if (!roll.l5r5e) return;
      const l5rData = roll.l5r5e;
      if (l5rData.rnkEnded !== true) return;

      const actor = rollActor(message, l5rData);
      if (!actor) return;

      // Check for pending resistance roll FIRST (before kata detection)
      const pending = actor.getFlag(
        "l5r5e-combat-helper",
        "pendingResistanceRoll",
      );
      if (pending && matchesPendingResistance(l5rData, pending, actor.type)) {
        await handleResistanceRollResult(actor, l5rData, pending);
        return;
      }

      const isKataActivation = l5rData.item?.system?.technique_type === "kata";

      if (isKataActivation) {
        // ── Active kata: rolled directly from the technique card ──────────────
        const kata = KATA_REGISTRY.find((k) => kataMatchesItem(k, l5rData.item));
        if (!kata) return; // not yet registered — silent ignore

        const targets = rollTargetActors(message, l5rData);

        const minSilhouette = kata.activation.minTargetSilhouette;
        const tooSmall = minSilhouette ? targets.find((t) => getSilhouette(t) < minSilhouette) : null;
        if (tooSmall) {
          ui.notifications.warn(
            game.i18n.format("l5r5e-combat-helper.notifications.targetTooSmall", {
              kata: kata.names[0],
              target: tooSmall.name,
              silhouette: minSilhouette,
            }),
          );
          return;
        }

        let tn;
        if (kata.activation.difficulty === "target.silhouette") {
          if (targets.length === 0) {
            ui.notifications.warn(
              game.i18n.localize("l5r5e-combat-helper.notifications.noTargets"),
            );
            return;
          }
          // BUG #8 FIX: use getSilhouette's full resolution chain (actor
          // flag → system.silhouette → prototypeToken.width heuristic →
          // default 2) instead of a bare system.silhouette read that always
          // fell back to 1 for a real l5r5e actor.
          tn = Math.max(
            getSilhouette(targets[0]),
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
        const extraSuccesses = Math.max(0, totalSuccess - effectiveTn);

        const ctx = {
          attacker: actor,
          targets,
          extraSuccesses,
          opportunitiesSpent: 0,
          tn: effectiveTn,
          totalSuccess,
          weapon: resolveAttackWeapon(l5rData, actor),
          resistance: null,
          kata,
          chosenCondition: null,
          sourceMessageId: message.id,
          l5rData,
          tnReduction,
        };
        await executeKata(kata, ctx);
      } else {
        // ── Passive katas: trigger on matching regular martial rolls ──────────
        const martialSkills = ["melee", "ranged", "unarmed"];
        if (!martialSkills.includes(l5rData.skillId)) return;

        // In l5r5e the ring used for a roll is the active stance
        const rollRing = l5rData.stance ?? null;
        if (!rollRing) return;

        const opportunities = l5rData.summary?.opportunity || 0;
        if (opportunities === 0) return;

        for (const kata of PASSIVE_KATA_REGISTRY) {
          if (!kata.activation) continue;
          if (!kata.activation.skills.includes(l5rData.skillId)) continue;
          const ringMatch = Array.isArray(kata.activation.ring)
            ? kata.activation.ring.includes(rollRing)
            : kata.activation.ring === rollRing;
          if (!ringMatch) continue;
          const hasKata = actor.items.some((item) => kataMatchesItem(kata, item));
          if (!hasKata) continue;
          const currentTargetIds = rollTargetActors(message, l5rData).map((a) => actorRef(a));
          await createPassiveKataOpportunityCard(kata, actor, opportunities, currentTargetIds, message.id);
        }
      }
    } catch (error) {
      console.error("L5R5e Combat Helper | Kata activation error:", error);
    }
  });

  // ── 2. Attach button handlers on chat message render ───────────────────────
  onRenderChatMessage((message, el) => {

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
  Hooks.on("updateCombat", async (combat, changed, _options, userId) => {
    if (!("turn" in changed) && !("round" in changed)) return;
    // Every client gets this hook; only one may revert effects (see isResponsibleClient)
    if (!isResponsibleClient({ author: userId })) return;
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
  Hooks.on("deleteCombat", async (_combat, _options, userId) => {
    if (!isResponsibleClient({ author: userId })) return;
    await clearAllKataEffects();
  });
}

// ── Private handlers ────────────────────────────────────────────────────────

async function handleResistanceRollResult(actor, l5rData, pending) {
  await actor.unsetFlag("l5r5e-combat-helper", "pendingResistanceRoll");

  const totalSuccess = l5rData.summary?.totalSuccess || 0;
  const success = totalSuccess >= pending.difficulty;

  if (!success && pending.onFailure?.length) {
    const attacker = resolveActor(pending.attackerId);
    const ctx = {
      attacker,
      targets: [actor],
      extraSuccesses: 0,
      opportunitiesSpent: 0,
      tn: pending.difficulty,
      totalSuccess,
      weapon: null,
      resistance: {
        skill: pending.skill,
        difficulty: pending.difficulty,
        totalSuccess,
        success,
        shortfall: Math.max(0, pending.difficulty - totalSuccess),
      },
      kata: null,
      chosenCondition: null,
      sourceMessageId: null,
      l5rData,
    };
    for (const effect of pending.onFailure) {
      const effectTargets = resolveTargets(effect.target ?? "target", ctx);
      await applyEffect(effect, ctx, effectTargets);
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

  const target = resolveActor(targetId);
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
    const dialogParams = buildResistanceDialogParams(target, skill, skillCatId, difficulty);
    new game.l5r5e.DicePickerDialog(dialogParams).render(true);
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

  const attacker = resolveActor(passiveData.attackerId);
  if (!attacker) return;

  if (!attacker.isOwner && !game.user.isGM) {
    ui.notifications.warn(
      game.i18n.localize("l5r5e-combat-helper.notifications.noPermission"),
    );
    return;
  }

  // Disable all buttons on this card to prevent double-spend
  const card = button.closest(".kata-passive-opportunity");
  const buttons = card ? [...card.querySelectorAll("button")] : [button];
  buttons.forEach((b) => (b.disabled = true));

  const sent = await runAsGM("passiveKataOpportunity", {
    messageId: message.id,
    kataName: button.dataset.kataName,
    amount: parseInt(button.dataset.amount),
    condition: button.dataset.condition ?? null,
  });
  if (!sent) buttons.forEach((b) => (b.disabled = false));
}

/**
 * GM side of a passive kata opportunity button (relayed from the player's
 * client when needed): marks the card used, applies the effect, deducts the
 * spent opportunities from the linked damage message and posts the result.
 */
export async function applyPassiveKataOpportunityFromCard({ messageId, kataName, amount, condition }, senderId) {
  const message = game.messages.get(messageId);
  const passiveData = message?.getFlag("l5r5e-combat-helper", "passiveKataData");
  if (!passiveData || passiveData.used) return;

  const attacker = resolveActor(passiveData.attackerId);
  if (!attacker || !senderCanActFor(senderId, attacker)) return;

  const kata = PASSIVE_KATA_REGISTRY.find((k) => k.names.includes(kataName));
  if (!kata) return;

  await message.setFlag("l5r5e-combat-helper", "passiveKataData", {
    ...passiveData,
    used: true,
  });

  const chosenCondition = condition ?? null;
  const targetActors = (passiveData.targetIds || [])
    .map((ref) => resolveActor(ref))
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

  const attacker = resolveActor(oppData.attackerId);
  if (!game.user.isGM && !attacker?.isOwner) {
    ui.notifications.warn(
      game.i18n.localize("l5r5e-combat-helper.notifications.noPermission"),
    );
    return;
  }

  button.disabled = true;
  const sent = await runAsGM("kataOpportunity", { messageId: message.id });
  if (!sent) button.disabled = false;
}

/** GM side of the active kata "Spend" button (relayed from the player's client when needed). */
export async function applyKataOpportunity({ messageId }, senderId) {
  const message = game.messages.get(messageId);
  const oppData = message?.getFlag("l5r5e-combat-helper", "kataOpportunityData");
  if (!oppData || oppData.used) return;

  const attacker = resolveActor(oppData.attackerId);
  if (!attacker || !senderCanActFor(senderId, attacker)) return;

  await message.setFlag("l5r5e-combat-helper", "kataOpportunityData", {
    ...oppData,
    used: true,
  });

  const targets = (oppData.targetIds || [])
    .map((ref) => resolveActor(ref))
    .filter(Boolean);
  // kata and opportunitiesSpent are not known here (kataOpportunityData
  // doesn't persist either) — executeKataOpportunity fills both in once it
  // resolves the kata definition by name.
  const ctx = {
    attacker,
    targets,
    extraSuccesses: oppData.extraSuccesses,
    opportunitiesSpent: 0,
    tn: 0,
    totalSuccess: 0,
    weapon: null,
    resistance: null,
    kata: null,
    chosenCondition: null,
    sourceMessageId: message.id,
    l5rData: null,
  };
  await executeKataOpportunity(oppData.kataName, ctx, 0);

  // Optional fixed informational line (e.g. Coiling Serpent Style's
  // un-automated weapon-lock half) — a plain i18n key on the kata
  // definition, ignored by every kata that doesn't set it.
  const kata = KATA_REGISTRY.find((k) => k.names.includes(oppData.kataName));
  const noteLine = kata?.informationalNote
    ? `<p><em>${game.i18n.localize(kata.informationalNote)}</em></p>`
    : "";

  await ChatMessage.create({
    content: `<div class="l5r5e-combat-helper kata-opportunity-result">
      <p>⚡ <strong>${oppData.kataName}</strong>: ${game.i18n.localize("l5r5e-combat-helper.kata.chat.opportunityUsed")}</p>
      ${noteLine}
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
  });
}
