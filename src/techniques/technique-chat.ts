// @ts-nocheck

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
) {
  const targetNames = targets.map((t) => t.name).join(", ") || "—";

  const effectLines = appliedEffects
    .filter(Boolean)
    .map((e) => {
      if (e.type === "condition") {
        return `✅ ${game.i18n.format("l5r5e-combat-helper.kata.chat.conditionApplied", {
          statusId: e.statusId,
          targets: e.targets.join(", "),
        })}`;
      }
      if (e.type === "damage") {
        return e.results
          .map((r) =>
            game.i18n.format("l5r5e-combat-helper.kata.chat.damageApplied", {
              target: r.target,
              damage: r.damage,
            }),
          )
          .join("<br>");
      }
      if (e.type === "assistance") {
        return `💡 ${game.i18n.format("l5r5e-combat-helper.kata.chat.assistanceApplied", {
          targets: e.targets.join(", "),
        })}`;
      }
      return null;
    })
    .filter(Boolean)
    .join("<br>");

  const hasOpportunityButton = opportunityDefs && opportunityCount > 0;
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
      ${targetNames !== "—" ? `<p><em>${game.i18n.format("l5r5e-combat-helper.kata.chat.targets", { targets: targetNames })}</em></p>` : ""}
      ${effectLines ? `<div class="kata-effects">${effectLines}</div>` : ""}
      ${opportunityButton}
    </div>`;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    flags: hasOpportunityButton ? {
      "l5r5e-combat-helper": {
        kataOpportunityData: {
          kataName: kata.names[0],
          attackerId: attacker.id,
          targetIds: targets.map((t) => t.id),
          extraSuccesses,
          used: false,
        },
      },
    } : {},
  });
}

/**
 * Creates the failure chat card for a Kata.
 */
export async function createKataFailureMessage(kata, attacker, totalSuccess, tn) {
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
) {
  const failureDesc = onFailure
    .map((e) => {
      if (e.type === "damage")
        return game.i18n.localize("l5r5e-combat-helper.kata.chat.resistDamage");
      if (e.type === "condition")
        return `${game.i18n.localize("l5r5e-combat-helper.kata.chat.resistCondition")}: ${e.statusId}`;
      return e.type;
    })
    .join(", ");

  const content = `
    <div class="l5r5e-combat-helper kata-resistance-request">
      <h3>🎲 ${game.i18n.localize("l5r5e-combat-helper.kata.chat.resistanceRequired")}</h3>
      <p>${game.i18n.format("l5r5e-combat-helper.kata.chat.resistanceBody", {
        target: target.name,
        skill,
        tn: difficulty,
      })}</p>
      <p><em>${game.i18n.format("l5r5e-combat-helper.kata.chat.resistanceFailEffect", {
        effect: failureDesc,
      })}</em></p>
      <button class="kata-resistance-roll-button"
        data-target-id="${target.id}"
        data-attacker-id="${attacker.id}"
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
 */
export async function createPassiveKataOpportunityCard(kata, attacker, opportunities, targetIds = [], rollMessageId = null) {
  const oppDef = kata.onOpportunity[0];
  const maxSpend = Math.min(opportunities, oppDef.costMax ?? opportunities);

  const effectType = oppDef.effects[0]?.type ?? "resistance_buff";

  let buttons;
  if (effectType === "condition_lock") {
    const conditions = oppDef.effects[0].conditions ?? [];
    buttons = conditions.map((cond) => {
      const conditionName = game.i18n.localize(`l5r5e-combat-helper.conditions.${cond}`);
      return `<button class="kata-passive-opportunity-btn"
        data-kata-name="${kata.names[0]}"
        data-attacker-id="${attacker.id}"
        data-amount="1"
        data-condition="${cond}">
        ${game.i18n.format("l5r5e-combat-helper.kata.chat.passiveLockCondition", { condition: conditionName })}
      </button>`;
    }).join("");
  } else {
    const spendKey = effectType === "critical_severity_boost"
      ? "l5r5e-combat-helper.kata.chat.passiveSpendSeverityBoost"
      : "l5r5e-combat-helper.kata.chat.passiveSpend";
    buttons = Array.from({ length: maxSpend }, (_, i) => {
      const n = i + 1;
      return `<button class="kata-passive-opportunity-btn"
        data-kata-name="${kata.names[0]}"
        data-attacker-id="${attacker.id}"
        data-amount="${n}">
        ${game.i18n.format(spendKey, { amount: n })}
      </button>`;
    }).join("");
  }

  const content = `
    <div class="l5r5e-combat-helper kata-passive-opportunity">
      <h3>⚡ ${kata.names[0]}</h3>
      <p>${game.i18n.format("l5r5e-combat-helper.kata.chat.passiveAvailable", {
        attacker: attacker.name,
        opportunities,
      })}</p>
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
          attackerId: attacker.id,
          targetIds,
          rollMessageId,
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
    </div>`;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: target }),
  });
}
