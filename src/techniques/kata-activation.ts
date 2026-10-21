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
import { resolveAttackWeapon, getSecondaryWeapon } from "../core/weapon-utils";
import { getSilhouette, getVigilance } from "../core/actor-utils";
import { checkAttackSuccess } from "../core/damage-calculator";
import { getAirTNBonus } from "../stances/stance-effects";
import { evaluatePredicate } from "./effect-predicates";
import { resolveFormula } from "./technique-engine";
import { buildResistanceDialogParams, matchesPendingResistance } from "./resistance-roll";
import {
  createResistanceResultMessage,
  createPassiveKataOpportunityCard,
  renderEffectLines,
} from "./technique-chat";
import { onRenderChatMessage, isResponsibleClient, rollTargetActors } from "../core/compat-utils";
import { actorRef, resolveActor, rollActor } from "../core/actor-refs";
import { runAsGM, registerGmRelay, senderCanActFor } from "../core/gm-relay";
import { registerManualKataHandler } from "./manual-katas";
import { registerTechniqueChoice } from "./technique-choice";
import { KIHO_REGISTRY } from "./kiho-registry";
import { executeKiho, registerKihoHandlers } from "./kiho-engine";

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
  registerManualKataHandler();
  registerTechniqueChoice();
  registerKihoHandlers();

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

      if (l5rData.item?.system?.technique_type === "kiho") {
        const kiho = KIHO_REGISTRY.find((k) => kataMatchesItem(k, l5rData.item));
        if (!kiho) return; // not registered — silent ignore
        await executeKiho(kiho, {
          attacker: actor,
          targets: rollTargetActors(message, l5rData),
          extraSuccesses: 0,
          opportunitiesSpent: 0,
          tn: kiho.activation.difficulty,
          totalSuccess: l5rData.summary?.totalSuccess || 0,
          weapon: resolveAttackWeapon(l5rData, actor),
          resistance: null,
          kata: kiho,
          chosenCondition: null,
          sourceMessageId: message.id,
          l5rData,
        });
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
        const needsTarget = ["target.silhouette", "target.vigilance"].includes(kata.activation.difficulty);
        if (needsTarget && targets.length === 0) {
          ui.notifications.warn(
            game.i18n.localize("l5r5e-combat-helper.notifications.noTargets"),
          );
          return;
        }
        if (kata.activation.difficulty === "target.vigilance") {
          // Iaijutsu Cut: Rising Blade — TN equals the target's Vigilance.
          tn = Math.max(getVigilance(targets[0]), kata.activation.minDifficulty || 1);
        } else if (kata.activation.difficulty === "roll") {
          // TN the module can't compute (Pin the Fan: Vigilance + range) —
          // trust the TN set in the dice picker.
          tn = l5rData.difficulty || 2;
        } else if (kata.activation.difficulty === "target.silhouette") {
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
          const roll = passiveRollContext(kata, actor, message, l5rData);
          if (!roll) continue;
          await createPassiveKataOpportunityCard(kata, actor, opportunities, roll.targetIds, message.id, roll);
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

/**
 * What a passive kata card needs from the roll that triggered it, or null
 * when the kata doesn't apply to this roll: no branch whose `when` holds,
 * `requiresSuccess` on a miss, `requiresSecondaryWeapon` without one.
 * The TN includes the first target's Air-stance bonus, as in combat-handler.
 */
function passiveRollContext(kata, actor, message, l5rData) {
  const targets = rollTargetActors(message, l5rData);
  const first = targets[0] ?? null;
  const airBonus = first ? getAirTNBonus(first) : 0;
  const weapon = resolveAttackWeapon(l5rData, actor);
  const tn = (l5rData.difficulty || 2) + airBonus;
  const totalSuccess = l5rData.summary?.totalSuccess || 0;

  if (kata.requiresSuccess && !checkAttackSuccess(l5rData, airBonus)) return null;
  if (kata.requiresSecondaryWeapon && !getSecondaryWeapon(actor, weapon)) return null;

  const ctx = {
    attacker: actor,
    targets,
    extraSuccesses: Math.max(0, totalSuccess - tn),
    opportunitiesSpent: 0,
    tn,
    totalSuccess,
    weapon,
    resistance: null,
    kata,
    chosenCondition: null,
    sourceMessageId: message.id,
    l5rData,
  };
  const oppIndex = kata.onOpportunity.findIndex((o) => evaluatePredicate(o.when, ctx, first));
  if (oppIndex < 0) return null;
  const oppDef = kata.onOpportunity[oppIndex];
  const cost = (v) => (v && typeof v === "object" ? resolveFormula(v, ctx, first) : v);

  return {
    targetIds: targets.map((a) => actorRef(a)),
    oppIndex,
    costMin: cost(oppDef.costMin),
    costMax: cost(oppDef.costMax),
    weaponId: weapon?.id ?? null,
    skillId: l5rData.skillId,
    tn,
    totalSuccess,
    targetStance: first?.system?.stance ?? null,
  };
}

async function handleResistanceRollResult(actor, l5rData, pending) {
  await actor.unsetFlag("l5r5e-combat-helper", "pendingResistanceRoll");

  const totalSuccess = l5rData.summary?.totalSuccess || 0;
  // "TN 3 (Earth 4, Fire 1)": the TN depends on the ring the target rolled with.
  const difficulty = Math.max(1, pending.difficulty + (pending.ringDifficulty?.[l5rData.stance] ?? 0));
  const success = totalSuccess >= difficulty;

  if (!success && pending.onFailure?.length) {
    const attacker = resolveActor(pending.attackerId);
    const ctx = {
      attacker,
      targets: [actor],
      extraSuccesses: 0,
      opportunitiesSpent: 0,
      tn: difficulty,
      totalSuccess,
      weapon: null,
      resistance: {
        skill: pending.skill,
        difficulty,
        totalSuccess,
        success,
        shortfall: Math.max(0, difficulty - totalSuccess),
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
    difficulty,
    success,
    pending.failureNote ?? null,
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

  // "Choose additional characters" (Pelting Hail Style): the clicker's
  // current targets, minus the attack's own, up to the amount spent.
  const kata = PASSIVE_KATA_REGISTRY.find((k) => k.names.includes(button.dataset.kataName));
  const oppDef = kata?.onOpportunity?.[passiveData.oppIndex ?? 0];
  let pickedTargetIds = null;
  if (oppDef?.targetMode === "picked") {
    const original = new Set(passiveData.targetIds ?? []);
    pickedTargetIds = [...(game.user.targets ?? [])]
      .map((t) => t.actor)
      .filter(Boolean)
      .map((a) => actorRef(a))
      .filter((ref) => !original.has(ref))
      .slice(0, parseInt(button.dataset.amount));
    if (pickedTargetIds.length === 0) {
      ui.notifications.warn(game.i18n.localize("l5r5e-combat-helper.notifications.pickExtraTargets"));
      return;
    }
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
    stance: button.dataset.stance ?? null,
    pickedTargetIds,
  });
  if (!sent) buttons.forEach((b) => (b.disabled = false));
}

/**
 * GM side of a passive kata opportunity button (relayed from the player's
 * client when needed): marks the card used, applies the effect, deducts the
 * spent opportunities from the linked damage message and posts the result.
 */
export async function applyPassiveKataOpportunityFromCard({ messageId, kataName, amount, condition, stance = null, pickedTargetIds = null }, senderId) {
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
  const targetActors = (pickedTargetIds ?? passiveData.targetIds ?? [])
    .map((ref) => resolveActor(ref))
    .filter(Boolean);

  const summaries = await applyPassiveKataOpportunity(kata, attacker, amount, targetActors, chosenCondition, {
    oppIndex: passiveData.oppIndex ?? 0,
    weapon: passiveData.weaponId ? attacker.items?.get(passiveData.weaponId) ?? null : null,
    skillId: passiveData.skillId ?? null,
    tn: passiveData.tn ?? 0,
    totalSuccess: passiveData.totalSuccess ?? 0,
    chosenStance: stance,
  });

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

  const effectType = kata.onOpportunity[passiveData.oppIndex ?? 0]?.effects[0]?.type ?? "resistance_buff";
  let activatedKey;
  let formatParams;
  if (!["resistance_buff", "critical_severity_boost", "condition_lock"].includes(effectType)) {
    // Generic result: what each effect actually did.
    const lines = renderEffectLines(summaries);
    await ChatMessage.create({
      content: `<div class="l5r5e-combat-helper kata-passive-result">
        <p>⚡ <strong>${kata.names[0]}</strong>: ${game.i18n.format("l5r5e-combat-helper.kata.chat.passiveSpent", { amount })}</p>
        ${lines ? `<div class="kata-effects">${lines}</div>` : ""}
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
    });
    return;
  }
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
    weapon: oppData.weaponId ? attacker.items?.get(oppData.weaponId) ?? null : null,
    resistance: null,
    kata: null,
    chosenCondition: null,
    sourceMessageId: message.id,
    l5rData: null,
  };
  const summaries = (await executeKataOpportunity(oppData.kataName, ctx, 0)) ?? [];

  // Optional fixed informational line (e.g. Coiling Serpent Style's
  // un-automated weapon-lock half) — a plain i18n key on the kata
  // definition, ignored by every kata that doesn't set it.
  const kata = KATA_REGISTRY.find((k) => k.names.includes(oppData.kataName));
  const effectLines = renderEffectLines(summaries);
  const noteLine = kata?.informationalNote
    ? `<p><em>${game.i18n.localize(kata.informationalNote)}</em></p>`
    : "";

  await ChatMessage.create({
    content: `<div class="l5r5e-combat-helper kata-opportunity-result">
      <p>⚡ <strong>${oppData.kataName}</strong>: ${game.i18n.localize("l5r5e-combat-helper.kata.chat.opportunityUsed")}</p>
      ${effectLines ? `<div class="kata-effects">${effectLines}</div>` : ""}
      ${noteLine}
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
  });
}
