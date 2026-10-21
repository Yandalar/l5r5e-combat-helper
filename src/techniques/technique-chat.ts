// @ts-nocheck

import { logWarn } from "../core/logger";
import { actorRef } from "../core/actor-refs";

/**
 * Per-effect-type chat summary renderers, keyed identically to
 * EFFECT_TYPES (technique-engine.ts) — every handler's summary now returns
 * `type: <the effect type verbatim>` (no invented "...scheduled"-style
 * names) specifically so this map can be validated as *total* over
 * EFFECT_TYPES: `Object.keys(EFFECT_SUMMARY_RENDERERS)` must equal
 * `EFFECT_TYPES` (technique-chat.test.ts asserts this directly; the Task 6
 * registry integrity test will do the same). That's the anti-drift
 * mechanism this map depends on — bug #4 was this map silently only
 * handling condition/damage/assistance while the dispatcher grew past it.
 *
 * Note: conditionApplied's i18n string already includes its own "✅" —
 * renderers must not add a second one.
 */
export const EFFECT_SUMMARY_RENDERERS = {
  condition: (e) =>
    e.remove
      ? (e.targets.length
        ? game.i18n.format("l5r5e-combat-helper.kata.chat.conditionRemoved", { targets: e.targets.join(", ") })
        : null)
      : game.i18n.format("l5r5e-combat-helper.kata.chat.conditionApplied", {
        statusId: e.statusId,
        targets: e.targets.join(", "),
      }),
  damage: (e) =>
    e.results
      .map((r) =>
        game.i18n.format(
          r.mode === "remove"
            ? (r.resource === "strife"
              ? "l5r5e-combat-helper.kata.chat.strifeRecovered"
              : "l5r5e-combat-helper.kata.chat.fatigueRecovered")
            : r.resource === "strife"
              ? "l5r5e-combat-helper.kata.chat.strifeApplied"
              : "l5r5e-combat-helper.kata.chat.damageApplied",
          { target: r.target, damage: r.damage },
        ),
      )
      .join("<br>"),
  assistance: (e) =>
    `💡 ${game.i18n.format("l5r5e-combat-helper.kata.chat.assistanceApplied", {
      targets: e.targets.join(", "),
    })}`,
  resistance_roll: (e) =>
    game.i18n.format("l5r5e-combat-helper.kata.chat.resistanceScheduled", {
      targets: e.targets.map((t) => t.name).join(", "),
    }),
  attack_tn_reduction: (e) =>
    game.i18n.format("l5r5e-combat-helper.kata.chat.tnReductionApplied", {
      amount: e.amount,
      targets: e.targets.join(", "),
    }),
  resistance_buff: (e) =>
    game.i18n.format("l5r5e-combat-helper.kata.chat.resistanceBuffApplied", {
      amount: e.amount,
      targets: e.targets.join(", "),
    }),
  critical_severity_boost: (e) =>
    game.i18n.format("l5r5e-combat-helper.kata.chat.severityBoostApplied", {
      amount: e.amount,
      targets: e.targets.join(", "),
    }),
  condition_lock: (e) =>
    game.i18n.format("l5r5e-combat-helper.kata.chat.conditionLockApplied", {
      condition: e.conditionId,
      targets: e.targets.join(", "),
    }),
  critical_strike: (e) =>
    e.results
      .map((r) =>
        game.i18n.format("l5r5e-combat-helper.kata.chat.criticalStrikeApplied", {
          target: r.target,
          severity: r.severity,
        }),
      )
      .join("<br>"),
  force_stance: (e) =>
    game.i18n.format("l5r5e-combat-helper.kata.chat.stanceForced", {
      stance: ringLabel(e.stance),
      targets: e.targets.join(", "),
    }),
};

/** Localized ring name ("earth" → "Tierra"). */
export function ringLabel(ring) {
  return game.i18n.localize(`l5r5e-combat-helper.rings.${ring}`);
}

/** "3 (Tierra 4, Fuego 1)": a base TN plus its per-ring variants (offsets). */
export function tnWithRings(base, ringDifficulty) {
  const entries = Object.entries(ringDifficulty ?? {});
  if (!entries.length) return String(base);
  return `${base} (${entries.map(([ring, delta]) => `${ringLabel(ring)} ${Math.max(1, base + delta)}`).join(", ")})`;
}

/** Renders effect summaries as chat lines (unknown/empty summaries are dropped). */
export function renderEffectLines(summaries) {
  return (summaries ?? [])
    .filter(Boolean)
    .map((e) => (EFFECT_SUMMARY_RENDERERS[e.type] ?? DEFAULT_RENDERER)(e))
    .filter(Boolean)
    .join("<br>");
}

/** Optional fixed i18n line a kata shows on its activation card (manual parts of the kata). */
function cardNoteHtml(kata) {
  return kata?.cardNote ? `<p class="kata-card-note"><em>${game.i18n.localize(kata.cardNote)}</em></p>` : "";
}
const DEFAULT_RENDERER = (e) => {
  logWarn("No chat renderer for effect summary type:", e.type);
  return null;
};

/**
 * Creates the activation success chat card for a Kata.
 */
export async function createKataSuccessMessage(
  kata,
  attacker,
  targets,
  totalSuccess,
  extraSuccesses,
  tn,
  appliedEffects,
  opportunityDefs,
  sourceMessageId,
  opportunityCount,
  tnReduction = 0,
  weapon = null,
) {
  const targetNames = targets.map((t) => t.name).join(", ") || "—";

  const effectLines = renderEffectLines(appliedEffects);

  const hasOpportunityButton = opportunityDefs && opportunityCount >= (opportunityDefs[0]?.cost ?? 1);
  let opportunityButton = "";
  if (hasOpportunityButton) {
    opportunityButton = `
      <div class="kata-opportunity-section">
        <button class="kata-opportunity-button"
          data-kata-name="${kata.names[0]}"
          data-message-id="${sourceMessageId}">
          ${game.i18n.format("l5r5e-combat-helper.kata.chat.spendOpportunity", {
            cost: opportunityDefs[0].cost,
          })}
        </button>
      </div>`;
  }

  const content = `
    <div class="l5r5e-combat-helper kata-activation-result">
      <h3>⚡ ${kata.names[0]}</h3>
      <p>${game.i18n.format("l5r5e-combat-helper.kata.chat.activates", { attacker: attacker.name })}</p>
      <p>${game.i18n.format("l5r5e-combat-helper.kata.chat.rollResult", {
        successes: totalSuccess,
        extra: extraSuccesses,
        tn,
      })}</p>
      ${tnReduction > 0 ? `<p><em>${game.i18n.format("l5r5e-combat-helper.kata.chat.tnReduced", { amount: tnReduction })}</em></p>` : ""}
      ${targetNames !== "—" ? `<p><em>${game.i18n.format("l5r5e-combat-helper.kata.chat.targets", { targets: targetNames })}</em></p>` : ""}
      ${effectLines ? `<div class="kata-effects">${effectLines}</div>` : ""}
      ${cardNoteHtml(kata)}
      ${opportunityButton}
    </div>`;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    flags: hasOpportunityButton ? {
      "l5r5e-combat-helper": {
        kataOpportunityData: {
          kataName: kata.names[0],
          attackerId: actorRef(attacker),
          targetIds: targets.map((t) => actorRef(t)),
          extraSuccesses,
          weaponId: weapon?.id ?? null,
          used: false,
        },
      },
    } : {},
  });
}

/**
 * Creates the failure chat card for a Kata.
 */
export async function createKataFailureMessage(kata, attacker, totalSuccess, tn, appliedEffects = []) {
  const effectLines = renderEffectLines(appliedEffects);
  const effectiveTN = typeof tn === "number" ? tn : "?";
  const content = `
    <div class="l5r5e-combat-helper kata-activation-result kata-failure">
      <h3>✗ ${kata.names[0]} — ${game.i18n.localize("l5r5e-combat-helper.kata.chat.failed")}</h3>
      <p>${game.i18n.format("l5r5e-combat-helper.kata.chat.failedBody", { attacker: attacker.name })}</p>
      <p>${game.i18n.format("l5r5e-combat-helper.kata.chat.rollResult", {
        successes: totalSuccess,
        extra: 0,
        tn: effectiveTN,
      })}</p>
      ${effectLines ? `<div class="kata-effects">${effectLines}</div>` : ""}
      ${cardNoteHtml(kata)}
    </div>`;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
  });
}

/**
 * Creates a resistance roll request card for one target.
 */
export async function createResistanceRollRequestMessage(
  target,
  attacker,
  skill,
  skillCatId,
  difficulty,
  onFailure,
  ringDifficulty = null,
  failureNote = null,
) {
  const failureDesc = [
    ...onFailure.map((e) => {
      if (e.type === "damage")
        return game.i18n.localize("l5r5e-combat-helper.kata.chat.resistDamage");
      if (e.type === "condition")
        return `${game.i18n.localize("l5r5e-combat-helper.kata.chat.resistCondition")}: ${game.i18n.localize(`l5r5e-combat-helper.conditions.${e.statusId}`)}`;
      if (e.type === "force_stance")
        return game.i18n.format("l5r5e-combat-helper.kata.chat.resistStance", { stance: e.stance ? ringLabel(e.stance) : "?" });
      return e.type;
    }),
    ...(failureNote ? [game.i18n.localize(failureNote)] : []),
  ].join(", ");

  const content = `
    <div class="l5r5e-combat-helper kata-resistance-request">
      <h3>🎲 ${game.i18n.localize("l5r5e-combat-helper.kata.chat.resistanceRequired")}</h3>
      <p>${game.i18n.format("l5r5e-combat-helper.kata.chat.resistanceBody", {
        target: target.name,
        skill,
        tn: tnWithRings(difficulty, ringDifficulty),
      })}</p>
      <p><em>${game.i18n.format("l5r5e-combat-helper.kata.chat.resistanceFailEffect", {
        effect: failureDesc,
      })}</em></p>
      <button class="kata-resistance-roll-button"
        data-target-id="${actorRef(target)}"
        data-attacker-id="${actorRef(attacker)}"
        data-skill="${skill}"
        data-skill-cat="${skillCatId}"
        data-difficulty="${difficulty}">
        ${game.i18n.localize("l5r5e-combat-helper.kata.chat.rollResistance")}
      </button>
    </div>`;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    whisper: [
      game.user.id,
      ...game.users.filter((u) => u.isGM).map((u) => u.id),
    ],
  });
}

/**
 * Creates a whispered opportunity-spending card for passive katas (e.g. Striking as Earth).
 * Shows one button per possible opportunity spend amount.
 *
 * `roll` describes the triggering roll and is persisted on the card so the
 * GM-side handler can rebuild the context: `oppIndex` (the branch chosen by
 * its `when`), resolved `costMin`/`costMax`, `weaponId`, `skillId`, `tn`,
 * `totalSuccess` and the first target's current stance.
 */
export async function createPassiveKataOpportunityCard(kata, attacker, opportunities, targetIds = [], rollMessageId = null, roll = {}) {
  const oppIndex = roll.oppIndex ?? 0;
  const oppDef = kata.onOpportunity[oppIndex];
  const costMin = roll.costMin ?? oppDef.costMin ?? 1;
  const costStep = oppDef.costStep ?? 1;
  const maxSpend = Math.min(opportunities, roll.costMax ?? oppDef.costMax ?? opportunities);

  // BUG #3 FIX: the player must have at least `costMin` opportunities to
  // spend before the card is worth showing at all — previously the button
  // range always started at 1 regardless of costMin, letting a player spend
  // fewer opportunities than the kata requires.
  if (opportunities < costMin) return;

  const effectType = oppDef.effects[0]?.type ?? "resistance_buff";
  const baseData = `data-kata-name="${kata.names[0]}" data-attacker-id="${actorRef(attacker)}"`;

  let buttons;
  if (effectType === "condition_lock") {
    const conditions = oppDef.effects[0].conditions ?? [];
    buttons = conditions.map((cond) => {
      const conditionName = game.i18n.localize(`l5r5e-combat-helper.conditions.${cond}`);
      return `<button class="kata-passive-opportunity-btn" ${baseData}
        data-amount="1"
        data-condition="${cond}">
        ${game.i18n.format("l5r5e-combat-helper.kata.chat.passiveLockCondition", { condition: conditionName })}
      </button>`;
    }).join("");
  } else if (oppDef.chooseStance) {
    // One button per stance the target is not already in (Open-Hand Style).
    const stances = ["air", "earth", "fire", "water", "void"].filter((r) => r !== roll.targetStance);
    buttons = stances.map((stance) => `<button class="kata-passive-opportunity-btn" ${baseData}
        data-amount="${costMin}"
        data-stance="${stance}">
        ${game.i18n.format("l5r5e-combat-helper.kata.chat.passiveForceStance", { amount: costMin, stance: ringLabel(stance) })}
      </button>`).join("");
  } else {
    const spendKey = oppDef.spendKey
      ?? (effectType === "critical_severity_boost"
        ? "l5r5e-combat-helper.kata.chat.passiveSpendSeverityBoost"
        : "l5r5e-combat-helper.kata.chat.passiveSpend");
    const amounts = [];
    for (let n = costMin; n <= maxSpend; n += costStep) amounts.push(n);
    buttons = amounts.map((n) => `<button class="kata-passive-opportunity-btn" ${baseData}
        data-amount="${n}">
        ${game.i18n.format(spendKey, { amount: n })}
      </button>`).join("");
  }

  const content = `
    <div class="l5r5e-combat-helper kata-passive-opportunity">
      <h3>⚡ ${kata.names[0]}</h3>
      <p>${game.i18n.format("l5r5e-combat-helper.kata.chat.passiveAvailable", {
        attacker: attacker.name,
        opportunities,
      })}</p>
      ${oppDef.hint ? `<p><em>${game.i18n.localize(oppDef.hint)}</em></p>` : ""}
      ${cardNoteHtml(kata)}
      <div class="kata-passive-buttons">${buttons}</div>
    </div>`;

  // Deduplicate: attacker owner (if not GM) + all active GMs
  const ownerUser = game.users.find((u) => !u.isGM && attacker.testUserPermission(u, "OWNER") && u.active);
  const gmUsers = game.users.filter((u) => u.isGM && u.active).map((u) => u.id);
  const whisperRecipients = [...new Set([
    ...(ownerUser ? [ownerUser.id] : []),
    ...gmUsers,
  ])];

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    whisper: whisperRecipients,
    flags: {
      "l5r5e-combat-helper": {
        passiveKataData: {
          kataName: kata.names[0],
          attackerId: actorRef(attacker),
          targetIds,
          rollMessageId,
          oppIndex,
          weaponId: roll.weaponId ?? null,
          skillId: roll.skillId ?? null,
          tn: roll.tn ?? 0,
          totalSuccess: roll.totalSuccess ?? 0,
          used: false,
        },
      },
    },
  });
}

/**
 * Creates the resistance roll result card.
 */
export async function createResistanceResultMessage(
  target,
  totalSuccess,
  difficulty,
  success,
  failureNote = null,
) {
  const resultIcon = success ? "🛡️" : "💥";
  const resultText = success
    ? game.i18n.localize("l5r5e-combat-helper.kata.chat.resistSuccess")
    : game.i18n.localize("l5r5e-combat-helper.kata.chat.resistFail");

  const content = `
    <div class="l5r5e-combat-helper kata-resistance-result">
      <h3>${resultIcon} ${target.name} — ${resultText}</h3>
      <p>${game.i18n.format("l5r5e-combat-helper.kata.chat.resistResultDetail", {
        successes: totalSuccess,
        tn: difficulty,
      })}</p>
      ${!success && failureNote ? `<p><em>${game.i18n.localize(failureNote)}</em></p>` : ""}
    </div>`;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: target }),
  });
}
