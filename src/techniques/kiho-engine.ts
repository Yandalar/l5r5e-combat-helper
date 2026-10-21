// @ts-nocheck
/**
 * Kihō activation (Libro Básico p. 182): on a successful check the kihō's
 * enhancement becomes active — one per character, replacing any other, and
 * a kihō can't be reactivated while its enhancement is active — and its
 * burst effect resolves by bonus successes. The enhancement ends with the
 * card's "End kihō" button, another kihō, or combat end (clearAllKataEffects).
 */
import { MODULE_ID } from "../core/module-constants";
import { onRenderChatMessage } from "../core/compat-utils";
import { actorRef, resolveActor } from "../core/actor-refs";
import { runAsGM, registerGmRelay, senderCanActFor } from "../core/gm-relay";
import { KIHO_REGISTRY } from "./kiho-registry";
import { applyEffect, resolveTargets } from "./technique-engine";
import { renderEffectLines } from "./technique-chat";
import { applyKataTokenAura, removeKataTokenAura } from "./token-effects";

/** The registry entry of the actor's active kihō, or null. */
export function activeKihoOf(actor) {
  const active = actor?.getFlag?.(MODULE_ID, "activeKiho");
  if (!active) return null;
  return KIHO_REGISTRY.find((k) => k.names.includes(active.name)) ?? null;
}

/** Burst tiers met by `bonus` successes; a met tier with `replaces` drops the lower ones. */
export function burstTiersFor(kiho, bonus) {
  let selected = [];
  for (const tier of [...(kiho.burst ?? [])].sort((a, b) => a.threshold - b.threshold)) {
    if (bonus < tier.threshold) continue;
    selected = tier.replaces ? [tier] : [...selected, tier];
  }
  return selected;
}

async function endActiveKiho(actor) {
  if (!actor.getFlag(MODULE_ID, "activeKiho")) return;
  await actor.unsetFlag(MODULE_ID, "activeKiho");
  await removeKataTokenAura(actor);
}

function card(kiho, actor, body, extra = "") {
  return ChatMessage.create({
    content: `<div class="l5r5e-combat-helper kiho-activation-result">
      <h3>☯ ${kiho.names[0]}</h3>
      ${body}
      ${extra}
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
}

/**
 * Resolves a kihō activation roll. `ctx` is the kata execution context
 * (attacker, targets, totalSuccess, tn, l5rData, ...).
 */
export async function executeKiho(kiho, ctx) {
  const actor = ctx.attacker;
  const name = kiho.names[0];
  const i18n = game.i18n;
  const rollLine = (extra) =>
    `<p>${i18n.format("l5r5e-combat-helper.kata.chat.rollResult", { successes: ctx.totalSuccess, extra, tn: ctx.tn })}</p>`;

  if (actor.getFlag(MODULE_ID, "activeKiho")?.name === name) {
    await card(kiho, actor, `<p>${i18n.format("l5r5e-combat-helper.kiho.chat.alreadyActive", { name: actor.name })}</p>`);
    return;
  }

  if (ctx.totalSuccess < ctx.tn) {
    await card(kiho, actor, `<p>${i18n.format("l5r5e-combat-helper.kiho.chat.failed", { name: actor.name })}</p>${rollLine(0)}`);
    return;
  }

  // Only one enhancement at a time: the new kihō replaces the active one.
  await endActiveKiho(actor);
  await actor.setFlag(MODULE_ID, "activeKiho", {
    name,
    ring: kiho.activation.ring ?? null,
    combatId: game.combat?.id ?? null,
  });
  await applyKataTokenAura(actor, kiho.activation.ring ?? ctx.l5rData?.stance, "kiho");

  const bonus = Math.max(0, ctx.totalSuccess - ctx.tn);
  ctx.extraSuccesses = bonus;
  ctx.kata = kiho;
  const summaries = [];
  for (const tier of burstTiersFor(kiho, bonus)) {
    for (const effect of tier.effects) {
      const summary = await applyEffect(effect, ctx, resolveTargets(effect.target ?? "target", ctx));
      if (summary) summaries.push(summary);
    }
  }

  const lines = renderEffectLines(summaries);
  const note = kiho.enhancement?.note ? `<p><em>${i18n.localize(kiho.enhancement.note)}</em></p>` : "";
  const cardNote = kiho.cardNote ? `<p class="kata-card-note"><em>${i18n.localize(kiho.cardNote)}</em></p>` : "";
  await card(
    kiho,
    actor,
    `<p>${i18n.format("l5r5e-combat-helper.kiho.chat.activated", { name: actor.name })}</p>${rollLine(bonus)}
     <p><strong>${i18n.localize("l5r5e-combat-helper.kiho.chat.enhancement")}</strong></p>${note}
     ${lines ? `<p><strong>${i18n.localize("l5r5e-combat-helper.kiho.chat.burst")}</strong></p><div class="kata-effects">${lines}</div>` : ""}
     ${cardNote}`,
    `<button class="kiho-end-button" data-actor-id="${actorRef(actor)}" data-kiho="${name}">
      ${i18n.localize("l5r5e-combat-helper.kiho.chat.end")}
    </button>`,
  );
}

export function registerKihoHandlers() {
  registerGmRelay({ endKiho });

  onRenderChatMessage((message, el) => {
    el.querySelectorAll(".kiho-end-button").forEach((btn) => {
      const actor = resolveActor(btn.dataset.actorId);
      if (actor?.getFlag(MODULE_ID, "activeKiho")?.name !== btn.dataset.kiho) btn.disabled = true;
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        const button = event.currentTarget;
        if (button.disabled) return;
        if (!game.user.isGM && !actor?.isOwner) {
          ui.notifications.warn(game.i18n.localize("l5r5e-combat-helper.notifications.noPermission"));
          return;
        }
        button.disabled = true;
        const sent = await runAsGM("endKiho", { actorId: button.dataset.actorId, name: button.dataset.kiho });
        if (!sent) button.disabled = false;
      });
    });
  });
}

/** GM side of "End kihō": ends it only if that kihō is still the active one. */
export async function endKiho({ actorId, name }, senderId) {
  const actor = resolveActor(actorId);
  if (!actor || !senderCanActFor(senderId, actor)) return;
  if (actor.getFlag(MODULE_ID, "activeKiho")?.name !== name) return;
  await endActiveKiho(actor);
  await ChatMessage.create({
    content: `<div class="l5r5e-combat-helper kiho-end"><p>☯ ${game.i18n.format("l5r5e-combat-helper.kiho.chat.ended", {
      name: actor.name,
      kiho: name,
    })}</p></div>`,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
}
