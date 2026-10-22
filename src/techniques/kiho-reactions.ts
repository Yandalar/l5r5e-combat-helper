// @ts-nocheck
/**
 * Kihō enhancements that need a decision or a moment the module can't detect
 * (ticket K3):
 * - "Use enhancement" button on the kihō card (Way of the Earthquake, Ki
 *   Protection), used on the user's targeted tokens;
 * - reaction buttons on damage cards, spending 1 Void (Death Touch defense,
 *   Grasp the Earth Dragon);
 * - choice cards after an unarmed hit (Freezing the Lifeblood, Breaking Blow).
 * Clicks are relayed to the GM, who re-checks `senderCanActFor`.
 */
import { MODULE_ID } from "../core/module-constants";
import { onRenderChatMessage } from "../core/compat-utils";
import { actorRef, resolveActor } from "../core/actor-refs";
import { runAsGM, registerGmRelay, senderCanActFor } from "../core/gm-relay";
import { getVoidPoints, spendVoidPoint, revertFatigueDamage, applyFatigue, getSkillRank } from "../core/actor-utils";
import { isEquippedWeapon } from "../core/weapon-utils";
import { activeKihoOf } from "./kiho-registry";
import { applyEffect } from "./technique-engine";
import { renderEffectLines } from "./technique-chat";

const KEY = "l5r5e-combat-helper.kiho";

/** Effects of the "Use enhancement" button, by enhancement id. */
const USE_EFFECTS = {
  // Libro Básico p. 187: Fitness TN 4 (Air 2, Water 5) or Earth Ring damage and Prone.
  earthquake: [
    {
      type: "resistance_roll",
      target: "target",
      skill: "fitness",
      difficulty: { source: "fixed", value: 4 },
      ringDifficulty: { air: -2, water: 1 },
      onFailure: [
        { type: "damage", target: "target", formula: { source: "attacker_ring", ring: "earth" } },
        { type: "condition", target: "target", statusId: "prone", duration: "immediate" },
      ],
    },
  ],
  // Libro Básico p. 183: 1 Void point, another character removes fatigue equal to Medicine.
  kiProtection: [
    {
      type: "damage",
      target: "target",
      mode: "remove",
      ignoresArmor: true,
      formula: { source: "attacker_skill_rank", skill: "medicine" },
    },
  ],
};
const VOID_COST = { kiProtection: 1 };

function context(attacker, targets, kiho, sourceMessageId = null) {
  return {
    attacker,
    targets,
    extraSuccesses: 0,
    opportunitiesSpent: 0,
    tn: 0,
    totalSuccess: 0,
    weapon: null,
    resistance: null,
    kata: kiho,
    chosenCondition: null,
    sourceMessageId,
    l5rData: null,
  };
}

function warn(key, data = {}) {
  ui.notifications.warn(game.i18n.format(key, data));
}

async function resultCard(actor, title, text, summaries = []) {
  const lines = renderEffectLines(summaries);
  await ChatMessage.create({
    content: `<div class="l5r5e-combat-helper kiho-reaction-result">
      <h3>☯ ${title}</h3>
      <p>${text}</p>
      ${lines ? `<div class="kata-effects">${lines}</div>` : ""}
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
}

/** Whether the kihō card shows a "Use enhancement" button. */
export function hasUseButton(kiho) {
  return Boolean(USE_EFFECTS[kiho?.enhancement?.id]);
}

export function registerKihoReactions() {
  registerGmRelay({ kihoUseEnhancement: useKihoEnhancement, kihoDamageReaction: applyKihoReaction });

  onRenderChatMessage((message, el) => {
    el.querySelectorAll(".kiho-use-button").forEach((btn) => {
      const actor = resolveActor(btn.dataset.actorId);
      if (actor?.getFlag(MODULE_ID, "activeKiho")?.name !== btn.dataset.kiho) btn.disabled = true;
      btn.addEventListener("click", (event) => onUseClick(event, actor));
    });

    const reactions = message.getFlag(MODULE_ID, "kihoReactions");
    el.querySelectorAll(".kiho-reaction-button").forEach((btn) => {
      if (!reactions?.[btn.dataset.reaction] || reactions[btn.dataset.reaction].used) btn.disabled = true;
      btn.addEventListener("click", (event) => onReactionClick(event, message));
    });
  });
}

async function onUseClick(event, actor) {
  event.preventDefault();
  const button = event.currentTarget;
  if (button.disabled) return;
  if (!game.user.isGM && !actor?.isOwner) return warn("l5r5e-combat-helper.notifications.noPermission");
  const kiho = activeKihoOf(actor);
  if (kiho?.names[0] !== button.dataset.kiho) return;

  let targets = [...game.user.targets].map((t) => t.actor).filter(Boolean);
  if (kiho.enhancement.id === "kiProtection") targets = targets.filter((t) => t !== actor);
  if (targets.length === 0) return warn(`${KEY}.use.noTarget`);
  if ((VOID_COST[kiho.enhancement.id] ?? 0) > getVoidPoints(actor)) return warn("l5r5e-combat-helper.notifications.noVoidPoints");

  button.disabled = true;
  await runAsGM("kihoUseEnhancement", {
    actorId: button.dataset.actorId,
    kiho: button.dataset.kiho,
    targetIds: targets.map(actorRef),
  });
  button.disabled = false;
}

/** GM side of "Use enhancement": applies the enhancement to the sender's targets. */
export async function useKihoEnhancement({ actorId, kiho: name, targetIds }, senderId) {
  const actor = resolveActor(actorId);
  if (!actor || !senderCanActFor(senderId, actor)) return;
  const kiho = activeKihoOf(actor);
  if (kiho?.names[0] !== name) return;
  const id = kiho.enhancement.id;
  const effects = USE_EFFECTS[id];
  if (!effects) return;

  let targets = (targetIds ?? []).map(resolveActor).filter(Boolean);
  if (id === "kiProtection") targets = targets.filter((t) => t !== actor);
  if (targets.length === 0) return;
  const cost = VOID_COST[id] ?? 0;
  if (cost > getVoidPoints(actor)) return;
  for (let i = 0; i < cost; i++) await spendVoidPoint(actor);

  const ctx = context(actor, targets, kiho);
  const summaries = [];
  for (const effect of effects) {
    const summary = await applyEffect(effect, ctx, targets);
    if (summary) summaries.push(summary);
  }
  await resultCard(
    actor,
    name,
    game.i18n.format(`${KEY}.use.${cost ? "usedVoid" : "used"}`, { name: actor.name, void: cost }),
    summaries,
  );
}

/**
 * Reactions offered on the card of an attack's damage (stored in the card's
 * `kihoReactions` flag): Death Touch's Void defense when the attacker's kihō
 * ignored the target's resistance, and Grasp the Earth Dragon's Void spend
 * when the target has it active.
 */
export function kihoReactionsFor(attacker, target, l5rData, { ignoredResistance, finalDamage }) {
  const reactions = {};
  if (l5rData?.skillId === "unarmed" && activeKihoOf(attacker)?.enhancement.id === "deathTouch" && ignoredResistance > 0) {
    const refund = Math.min(ignoredResistance, finalDamage);
    if (refund > 0) reactions.deathTouch = { refund, used: false };
  }
  if (activeKihoOf(target)?.enhancement.id === "graspEarthDragon") reactions.grasp = { used: false };
  if (Object.keys(reactions).length === 0) return null;
  return { attackerId: actorRef(attacker), targetId: actorRef(target), ...reactions };
}

/** Buttons for the reactions of a damage card (the target's owner uses them). */
export function kihoReactionButtons(reactions) {
  if (!reactions) return "";
  const i18n = game.i18n;
  const buttons = [];
  if (reactions.deathTouch) {
    buttons.push(`<button class="kiho-reaction-button" data-reaction="deathTouch">
      ${i18n.format(`${KEY}.reaction.deathTouch`, { amount: reactions.deathTouch.refund })}</button>`);
  }
  if (reactions.grasp) {
    buttons.push(`<button class="kiho-reaction-button" data-reaction="grasp">${i18n.localize(`${KEY}.reaction.grasp`)}</button>`);
  }
  return buttons.join("");
}

async function onReactionClick(event, message) {
  event.preventDefault();
  const button = event.currentTarget;
  if (button.disabled) return;
  const reactions = message.getFlag(MODULE_ID, "kihoReactions");
  const entry = reactions?.[button.dataset.reaction];
  if (!entry || entry.used) {
    button.disabled = true;
    return warn(`${KEY}.reaction.alreadyUsed`);
  }
  const target = resolveActor(reactions.targetId);
  if (!game.user.isGM && !target?.isOwner) return warn("l5r5e-combat-helper.notifications.noPermission");
  if (getVoidPoints(target) <= 0) return warn("l5r5e-combat-helper.notifications.noVoidPoints");

  button.disabled = true;
  const sent = await runAsGM("kihoDamageReaction", { messageId: message.id, reaction: button.dataset.reaction });
  if (!sent) button.disabled = false;
}

/** GM side of a damage-card reaction: once per card, 1 Void point of the attacked character. */
export async function applyKihoReaction({ messageId, reaction }, senderId) {
  const message = game.messages.get(messageId);
  const reactions = message?.getFlag(MODULE_ID, "kihoReactions");
  const entry = reactions?.[reaction];
  if (!entry || entry.used) return;
  const target = resolveActor(reactions.targetId);
  const attacker = resolveActor(reactions.attackerId);
  if (!target || !attacker || !senderCanActFor(senderId, target)) return;
  if (reaction === "grasp" && activeKihoOf(target)?.enhancement.id !== "graspEarthDragon") return;
  if (getVoidPoints(target) <= 0) return;

  await message.setFlag(MODULE_ID, "kihoReactions", { ...reactions, [reaction]: { ...entry, used: true } });
  await spendVoidPoint(target);

  if (reaction === "deathTouch") {
    await revertFatigueDamage(target, entry.refund);
    await resultCard(
      target,
      activeKihoOf(attacker)?.names[0] ?? "Death Touch",
      game.i18n.format(`${KEY}.reaction.deathTouchDone`, { name: target.name, amount: entry.refund }),
    );
  } else if (reaction === "grasp") {
    const amount = getSkillRank(target, "fitness", { fitness: "martial" });
    if (amount > 0) await applyFatigue(attacker, amount);
    await resultCard(
      target,
      activeKihoOf(target).names[0],
      game.i18n.format(`${KEY}.reaction.graspDone`, { name: target.name, attacker: attacker.name, amount }),
    );
  }
}

/** Items Breaking Blow can damage: readied weapons and worn armor. */
function breakableItems(actor) {
  return (actor?.items ?? []).filter(
    (i) => isEquippedWeapon(i) || (i.type === "armor" && i.system?.equipped === true),
  );
}

/**
 * Choice cards after a successful unarmed attack: Freezing the Lifeblood
 * (the target defended against the damage: Immobilized or 3 fatigue) and
 * Breaking Blow (the attacker picks a readied weapon or worn armor; the
 * target: Damaged or 2 fatigue).
 */
export async function kihoHitChoices(attacker, target, l5rData, armorResistance) {
  if (l5rData?.skillId !== "unarmed") return;
  const kiho = activeKihoOf(attacker);
  const ctx = context(attacker, [target], kiho);

  if (kiho?.enhancement.id === "freezingLifeblood" && armorResistance > 0) {
    await applyEffect(
      {
        type: "choice",
        target: "target",
        chooser: "target",
        prompt: `${KEY}.choice.freezingPrompt`,
        options: [
          {
            label: `${KEY}.choice.freezingImmobilized`,
            effects: [{ type: "condition", target: "target", statusId: "immobilized", duration: "immediate" }],
          },
          {
            label: `${KEY}.choice.fatigue`,
            labelArgs: { amount: 3 },
            effects: [{ type: "damage", target: "target", ignoresArmor: true, formula: { source: "fixed", value: 3 } }],
          },
        ],
      },
      ctx,
      [target],
    );
  }

  if (kiho?.enhancement.id === "breakingBlow") {
    const items = breakableItems(target);
    if (items.length === 0) return;
    await applyEffect(
      {
        type: "choice",
        target: "target",
        chooser: "attacker",
        prompt: `${KEY}.choice.breakingPrompt`,
        options: items.map((item) => ({
          label: `${KEY}.choice.breakingItem`,
          labelArgs: { item: item.name },
          effects: [
            {
              type: "choice",
              target: "target",
              chooser: "target",
              prompt: `${KEY}.choice.breakingTargetPrompt`,
              options: [
                {
                  label: `${KEY}.choice.breakingDamaged`,
                  labelArgs: { item: item.name },
                  effects: [{ type: "damage_item", target: "target", itemId: item.id }],
                },
                {
                  label: `${KEY}.choice.fatigue`,
                  labelArgs: { amount: 2 },
                  effects: [{ type: "damage", target: "target", ignoresArmor: true, formula: { source: "fixed", value: 2 } }],
                },
              ],
            },
          ],
        })),
      },
      ctx,
      [target],
    );
  }
}
