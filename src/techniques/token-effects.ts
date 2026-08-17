// @ts-nocheck

const RING_LIGHT_COLORS = {
  earth: "#4d7a2a",
  fire: "#e65c00",
  water: "#1a6699",
  air: "#c8d8e8",
  void: "#6b2fa0",
};

const TECHNIQUE_ANIMATIONS = {
  kata: { type: "pulse", speed: 2, intensity: 4 },
  kiho: { type: "wave", speed: 2, intensity: 4 },
  invocation: { type: "torch", speed: 5, intensity: 5 },
};

const AURA_FLAG = "kataAura";

/**
 * Applies a colored pulsing light aura to all actor tokens in the current scene.
 * Stores original light settings for later restoration. Stacks safely —
 * only the first application saves the original; subsequent calls increment a counter.
 */
export async function applyKataTokenAura(actor, ring, techniqueType = "kata") {
  if (!canvas?.tokens) return;

  const color = RING_LIGHT_COLORS[ring] ?? "#888888";
  const animation = TECHNIQUE_ANIMATIONS[techniqueType] ?? TECHNIQUE_ANIMATIONS.kata;
  const tokens = canvas.tokens.placeables.filter((t) => t.actor?.id === actor.id);
  if (tokens.length === 0) return;

  const existing = actor.getFlag("l5r5e-combat-helper", AURA_FLAG);

  if (!existing) {
    const token = tokens[0];
    const originalLight = {
      dim: token.document.light?.dim ?? 0,
      bright: token.document.light?.bright ?? 0,
      color: token.document.light?.color ?? "#ffffff",
      alpha: token.document.light?.alpha ?? 0.5,
      animation: token.document.light?.animation
        ? { ...token.document.light.animation }
        : { type: "none", speed: 5, intensity: 5 },
    };
    await actor.setFlag("l5r5e-combat-helper", AURA_FLAG, {
      originalLight,
      ring,
      techniqueType,
      count: 1,
    });
  } else {
    await actor.setFlag("l5r5e-combat-helper", AURA_FLAG, {
      ...existing,
      count: (existing.count ?? 1) + 1,
    });
  }

  for (const token of tokens) {
    await token.document.update({
      light: { dim: 1, bright: 0, color, alpha: 0.5, animation },
    });
  }
}

/**
 * Decrements the aura stack counter. Restores original light when counter reaches 0.
 */
export async function removeKataTokenAura(actor) {
  if (!canvas?.tokens) return;

  const auraData = actor.getFlag("l5r5e-combat-helper", AURA_FLAG);
  if (!auraData) return;

  const newCount = Math.max(0, (auraData.count ?? 1) - 1);

  if (newCount > 0) {
    await actor.setFlag("l5r5e-combat-helper", AURA_FLAG, { ...auraData, count: newCount });
    return;
  }

  const tokens = canvas.tokens.placeables.filter((t) => t.actor?.id === actor.id);
  const original = auraData.originalLight ?? {
    dim: 0,
    bright: 0,
    color: "#ffffff",
    alpha: 0.5,
    animation: { type: "none", speed: 5, intensity: 5 },
  };

  for (const token of tokens) {
    await token.document.update({ light: original });
  }

  await actor.unsetFlag("l5r5e-combat-helper", AURA_FLAG);
}

const RING_ICONS = {
  earth: "icons/magic/earth/stone-boulder-brown.webp",
  fire: "icons/magic/fire/flame-burning-orange.webp",
  water: "icons/magic/water/wave-foam-blue.webp",
  air: "icons/magic/air/wind-swirl-blue-gray.webp",
  void: "icons/magic/void/spiral-vortex-purple.webp",
};

const BUFF_EFFECT_FLAG = "resistanceActiveEffectIds";

/**
 * Creates a visible Active Effect on the actor displaying the resistance bonus.
 * Uses an empty changes array — purely cosmetic, does not modify actor data.
 */
export async function applyResistanceActiveEffect(actor, ring, amount) {
  const ringLabel =
    game.i18n.localize(`l5r5e-combat-helper.rings.${ring}`) || ring;
  const effectName = `🛡️ ${game.i18n.format(
    "l5r5e-combat-helper.kata.effect.resistanceBuff",
    { amount, ring: ringLabel },
  )}`;
  const icon = RING_ICONS[ring] ?? "icons/svg/shield.svg";

  const created = await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: effectName,
      icon,
      duration: { turns: 1 },
      changes: [],
      flags: { "l5r5e-combat-helper": { kataResistanceBuff: true, amount } },
    },
  ]);

  const effectId = created[0]?.id;
  if (effectId) {
    const existing =
      actor.getFlag("l5r5e-combat-helper", BUFF_EFFECT_FLAG) || [];
    await actor.setFlag("l5r5e-combat-helper", BUFF_EFFECT_FLAG, [
      ...existing,
      effectId,
    ]);
  }
}

/**
 * Removes all kata resistance Active Effects from the actor.
 */
export async function removeResistanceActiveEffects(actor) {
  const effectIds =
    actor.getFlag("l5r5e-combat-helper", BUFF_EFFECT_FLAG) || [];
  if (effectIds.length === 0) return;

  const toDelete = effectIds.filter((id) => actor.effects?.has(id));
  if (toDelete.length > 0) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  }
  await actor.unsetFlag("l5r5e-combat-helper", BUFF_EFFECT_FLAG);
}

const TN_REDUCTION_FLAG = "tnReductionActiveEffectId";
const SEVERITY_BOOST_FLAG = "criticalSeverityBoostActiveEffectId";
const CONDITION_LOCK_FLAG = "conditionLockActiveEffectIds";

/**
 * Creates a visible Active Effect on the target showing the pending critical severity boost.
 */
export async function applyCriticalSeverityBoostActiveEffect(target, amount) {
  const effectName = `🔥 ${game.i18n.format(
    "l5r5e-combat-helper.kata.effect.criticalSeverityBoost",
    { amount },
  )}`;

  const created = await target.createEmbeddedDocuments("ActiveEffect", [
    {
      name: effectName,
      icon: "icons/magic/fire/explosion-fireball-medium-red-orange.webp",
      duration: { turns: 1 },
      changes: [],
      flags: { "l5r5e-combat-helper": { kataSeverityBoost: true, amount } },
    },
  ]);

  const effectId = created[0]?.id;
  if (effectId) {
    await target.setFlag("l5r5e-combat-helper", SEVERITY_BOOST_FLAG, effectId);
  }
}

/**
 * Removes the critical severity boost Active Effect from the target.
 */
export async function removeCriticalSeverityBoostActiveEffect(target) {
  const effectId = target.getFlag("l5r5e-combat-helper", SEVERITY_BOOST_FLAG);
  if (!effectId) return;

  if (target.effects?.has(effectId)) {
    await target.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
  }
  await target.unsetFlag("l5r5e-combat-helper", SEVERITY_BOOST_FLAG);
}

/**
 * Creates a visible Active Effect on the target showing the pending TN reduction.
 * Cosmetic only — actual TN math is applied in code when the next attack fires.
 */
export async function applyTnReductionActiveEffect(target, amount) {
  const effectName = `⚔️ ${game.i18n.format(
    "l5r5e-combat-helper.kata.effect.tnReduction",
    { amount },
  )}`;

  const created = await target.createEmbeddedDocuments("ActiveEffect", [
    {
      name: effectName,
      icon: "icons/skills/melee/strike-sword-slashing-red.webp",
      duration: { turns: 1 },
      changes: [],
      flags: { "l5r5e-combat-helper": { kataTnReduction: true, amount } },
    },
  ]);

  const effectId = created[0]?.id;
  if (effectId) {
    await target.setFlag("l5r5e-combat-helper", TN_REDUCTION_FLAG, effectId);
  }
}

/**
 * Removes the TN reduction Active Effect from the target and clears its flag.
 */
export async function removeTnReductionActiveEffect(target) {
  const effectId = target.getFlag("l5r5e-combat-helper", TN_REDUCTION_FLAG);
  if (!effectId) return;

  if (target.effects?.has(effectId)) {
    await target.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
  }
  await target.unsetFlag("l5r5e-combat-helper", TN_REDUCTION_FLAG);
}

/**
 * Creates a visible Active Effect on the target marking a condition as locked.
 */
export async function applyConditionLockActiveEffect(target, conditionId) {
  const conditionName = game.i18n.localize(`l5r5e-combat-helper.conditions.${conditionId}`);
  const effectName = `🐻 ${game.i18n.format("l5r5e-combat-helper.kata.effect.conditionLock", { condition: conditionName })}`;

  const created = await target.createEmbeddedDocuments("ActiveEffect", [
    {
      name: effectName,
      icon: "icons/magic/earth/stone-boulder-brown.webp",
      duration: { turns: 1 },
      changes: [],
      flags: { "l5r5e-combat-helper": { kataConditionLock: true, conditionId } },
    },
  ]);

  const effectId = created[0]?.id;
  if (effectId) {
    const existing = target.getFlag("l5r5e-combat-helper", CONDITION_LOCK_FLAG) || [];
    await target.setFlag("l5r5e-combat-helper", CONDITION_LOCK_FLAG, [...existing, effectId]);
  }
}

/**
 * Removes all condition lock Active Effects from the target.
 */
export async function removeConditionLockActiveEffects(target) {
  const effectIds = target.getFlag("l5r5e-combat-helper", CONDITION_LOCK_FLAG) || [];
  if (effectIds.length === 0) return;
  const toDelete = effectIds.filter((id) => target.effects?.has(id));
  if (toDelete.length > 0) {
    await target.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  }
  await target.unsetFlag("l5r5e-combat-helper", CONDITION_LOCK_FLAG);
}

/**
 * Forcibly removes all kata auras from all actors (called on combat end).
 */
export async function clearAllKataTokenAuras() {
  if (!canvas?.tokens) return;
  for (const actor of game.actors) {
    const auraData = actor.getFlag("l5r5e-combat-helper", AURA_FLAG);
    if (auraData) {
      const tokens = canvas.tokens.placeables.filter((t) => t.actor?.id === actor.id);
      const original = auraData.originalLight ?? {
        dim: 0,
        bright: 0,
        color: "#ffffff",
        alpha: 0.5,
        animation: { type: "none", speed: 5, intensity: 5 },
      };
      for (const token of tokens) {
        await token.document.update({ light: original });
      }
      await actor.unsetFlag("l5r5e-combat-helper", AURA_FLAG);
    }
    await removeResistanceActiveEffects(actor);
    await removeTnReductionActiveEffect(actor);
    await removeCriticalSeverityBoostActiveEffect(actor);
    await removeConditionLockActiveEffects(actor);
  }
}
