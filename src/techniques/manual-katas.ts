// @ts-nocheck
/**
 * Katas without a roll (Warrior's Resolve: "once per scene, as a Support
 * action, spend a Void point"). The system has no roll to detect, so the
 * trigger is the technique's own chat card: when a sheet sends the kata to
 * chat (`HelpersL5r5e.sendToChat`, `.l5r5e-chat-item`), its owner or the GM
 * gets a "Use" button. The effect runs on the GM through the socket relay.
 *
 * "Once per scene" is enforced within a combat (one use per combat id);
 * outside combat the GM judges what a scene is.
 */
import { MODULE_ID } from "../core/module-constants";
import { onRenderChatMessage } from "../core/compat-utils";
import { speakerActor } from "../core/actor-refs";
import { getVoidPoints, spendVoidPoint } from "../core/actor-utils";
import { runAsGM, registerGmRelay, senderCanActFor } from "../core/gm-relay";
import { MANUAL_KATA_REGISTRY, kataMatchesItem } from "./kata-registry";
import { applyEffect, resolveTargets } from "./technique-engine";
import { renderEffectLines } from "./technique-chat";

/** The manual kata a chat item card shows, if its speaker knows one. */
function manualKataOfCard(message, card) {
  const actor = speakerActor(message);
  if (!actor?.items) return null;
  const text = card.textContent ?? "";
  for (const kata of MANUAL_KATA_REGISTRY) {
    const item = actor.items.find((i) => kataMatchesItem(kata, i) && text.includes(i.name));
    if (item) return { kata, actor };
  }
  return null;
}

export function registerManualKataHandler() {
  registerGmRelay({ manualKata: applyManualKata });

  onRenderChatMessage((message, el) => {
    const card = el.querySelector?.(".l5r5e-chat-item");
    if (!card) return;
    const found = manualKataOfCard(message, card);
    if (!found) return;
    if (!game.user.isGM && !found.actor.isOwner) return;

    const used = message.getFlag(MODULE_ID, "manualKataUsed");
    const button = document.createElement("button");
    button.className = "kata-manual-use-button";
    button.disabled = Boolean(used);
    button.textContent = game.i18n.localize(
      used ? "l5r5e-combat-helper.kata.chat.manualUsed" : "l5r5e-combat-helper.kata.chat.manualUse",
    );
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (button.disabled) return;
      button.disabled = true;
      const sent = await runAsGM("manualKata", { messageId: message.id, kataName: found.kata.names[0] });
      if (!sent) button.disabled = false;
    });
    card.appendChild(button);
  });
}

/** Whispers a short notice to the user who pressed the button (and the GMs). */
async function notifySender(senderId, actor, text) {
  const gms = game.users.filter((u) => u.isGM).map((u) => u.id);
  await ChatMessage.create({
    content: `<div class="l5r5e-combat-helper kata-manual-result"><p>${text}</p></div>`,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: [...new Set([senderId, ...gms])],
  });
}

/** GM side of the "Use" button: checks once-per-combat and the Void cost, then applies the kata. */
export async function applyManualKata({ messageId, kataName }, senderId) {
  const message = game.messages.get(messageId);
  if (!message || message.getFlag(MODULE_ID, "manualKataUsed")) return;
  const kata = MANUAL_KATA_REGISTRY.find((k) => k.names.includes(kataName));
  const actor = speakerActor(message);
  if (!kata || !actor || !senderCanActFor(senderId, actor)) return;

  const combatId = game.combat?.id ?? null;
  const uses = actor.getFlag(MODULE_ID, "manualKataUses") ?? {};
  if (kata.activation.oncePer === "scene" && combatId && uses[kata.names[0]] === combatId) {
    await notifySender(senderId, actor, game.i18n.format("l5r5e-combat-helper.kata.chat.manualOncePerScene", { kata: kata.names[0] }));
    return;
  }

  const voidCost = kata.activation.voidPoints ?? 0;
  if (voidCost > getVoidPoints(actor)) {
    await notifySender(senderId, actor, game.i18n.format("l5r5e-combat-helper.kata.chat.manualNoVoid", { name: actor.name }));
    return;
  }
  for (let i = 0; i < voidCost; i++) await spendVoidPoint(actor);

  await message.setFlag(MODULE_ID, "manualKataUsed", true);
  if (combatId) await actor.setFlag(MODULE_ID, "manualKataUses", { ...uses, [kata.names[0]]: combatId });

  const ctx = {
    attacker: actor,
    targets: [],
    extraSuccesses: 0,
    opportunitiesSpent: 0,
    tn: 0,
    totalSuccess: 0,
    weapon: null,
    resistance: null,
    kata,
    chosenCondition: null,
    sourceMessageId: message.id,
    l5rData: null,
  };
  const summaries = [];
  for (const effect of kata.onUse) {
    const summary = await applyEffect(effect, ctx, resolveTargets(effect.target ?? "attacker", ctx));
    if (summary) summaries.push(summary);
  }

  const lines = renderEffectLines(summaries);
  await ChatMessage.create({
    content: `<div class="l5r5e-combat-helper kata-manual-result">
      <h3>⚡ ${kata.names[0]}</h3>
      <p>${game.i18n.format("l5r5e-combat-helper.kata.chat.manualActivated", { name: actor.name, void: voidCost })}</p>
      ${lines ? `<div class="kata-effects">${lines}</div>` : ""}
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
}
