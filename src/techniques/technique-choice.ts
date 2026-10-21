// @ts-nocheck
/**
 * Choice cards (`choice` effect): a technique lets the attacker or the target
 * pick one option, e.g. which condition Cleansing Spirit removes or "suffer
 * Immobilized or 3 fatigue". The card stores each option's effects; the
 * click is relayed to the GM, who applies the chosen option.
 */
import { MODULE_ID } from "../core/module-constants";
import { onRenderChatMessage } from "../core/compat-utils";
import { resolveActor } from "../core/actor-refs";
import { runAsGM, registerGmRelay, senderCanActFor } from "../core/gm-relay";
import { applyEffect, resolveTargets } from "./technique-engine";
import { choiceLabel, renderEffectLines } from "./technique-chat";

function chooserOf(data) {
  return resolveActor(data.chooser === "target" ? data.targetId : data.attackerId);
}

export function registerTechniqueChoice() {
  registerGmRelay({ techniqueChoice: applyTechniqueChoice });

  onRenderChatMessage((message, el) => {
    const data = message.getFlag(MODULE_ID, "techniqueChoice");
    if (!data) return;
    el.querySelectorAll(".technique-choice-btn").forEach((btn) => {
      if (data.used) btn.disabled = true;
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        const button = event.currentTarget;
        if (button.disabled) return;
        const chooser = chooserOf(data);
        if (!game.user.isGM && !chooser?.isOwner) {
          ui.notifications.warn(game.i18n.localize("l5r5e-combat-helper.notifications.noPermission"));
          return;
        }
        const buttons = [...el.querySelectorAll(".technique-choice-btn")];
        buttons.forEach((b) => (b.disabled = true));
        const sent = await runAsGM("techniqueChoice", { messageId: message.id, index: parseInt(button.dataset.index) });
        if (!sent) buttons.forEach((b) => (b.disabled = false));
      });
    });
  });
}

/** GM side: applies the chosen option once, if the sender may choose for the chooser. */
export async function applyTechniqueChoice({ messageId, index }, senderId) {
  const message = game.messages.get(messageId);
  const data = message?.getFlag(MODULE_ID, "techniqueChoice");
  if (!data || data.used) return;
  const option = data.options?.[index];
  const chooser = chooserOf(data);
  if (!option || !chooser || !senderCanActFor(senderId, chooser)) return;

  await message.setFlag(MODULE_ID, "techniqueChoice", { ...data, used: true, chosen: index });

  const attacker = resolveActor(data.attackerId);
  const target = resolveActor(data.targetId);
  const ctx = {
    attacker,
    targets: target ? [target] : [],
    extraSuccesses: data.extraSuccesses ?? 0,
    opportunitiesSpent: 0,
    tn: 0,
    totalSuccess: 0,
    weapon: null,
    resistance: null,
    kata: { names: [data.techniqueName] },
    chosenCondition: null,
    sourceMessageId: messageId,
    l5rData: null,
  };
  const summaries = [];
  for (const effect of option.effects ?? []) {
    const summary = await applyEffect(effect, ctx, resolveTargets(effect.target ?? "target", ctx));
    if (summary) summaries.push(summary);
  }

  const lines = renderEffectLines(summaries);
  await ChatMessage.create({
    content: `<div class="l5r5e-combat-helper technique-choice-result">
      <p>⚖️ <strong>${data.techniqueName}</strong>: ${game.i18n.format("l5r5e-combat-helper.kata.chat.choiceMade", {
        chooser: chooser.name,
        option: choiceLabel(option),
      })}</p>
      ${lines ? `<div class="kata-effects">${lines}</div>` : ""}
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor: chooser }),
  });
}
