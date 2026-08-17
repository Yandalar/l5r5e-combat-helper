// @ts-nocheck

import { getCurrentFatigue } from "../core/actor-utils";
import { getArmorResistance } from "../core/damage-calculator";
import {
  createKataSuccessMessage,
  createKataFailureMessage,
  createResistanceRollRequestMessage,
} from "./technique-chat";
import { KATA_REGISTRY, SKILL_CATEGORY_MAP } from "./kata-registry";
import {
  applyKataTokenAura,
  removeKataTokenAura,
  clearAllKataTokenAuras,
  applyResistanceActiveEffect,
  removeResistanceActiveEffects,
  applyTnReductionActiveEffect,
  removeTnReductionActiveEffect,
  applyCriticalSeverityBoostActiveEffect,
  removeCriticalSeverityBoostActiveEffect,
  applyConditionLockActiveEffect,
  removeConditionLockActiveEffects,
} from "./token-effects";

/**
 * Resolves a Formula to a concrete number given execution context.
 */
export function resolveFormula(formula, attacker, target, extraSuccesses) {
  switch (formula.source) {
    case "fixed":
      return formula.value;
    case "attacker_ring":
      return parseInt(attacker.system.rings?.[formula.ring]) || 0;
    case "target_silhouette":
      return parseInt(target?.system?.silhouette) || 1;
    case "extra_successes":
      return extraSuccesses;
    case "attacker_school_rank":
      return parseInt(attacker.system.identity?.school_rank) || 0;
    case "attacker_ring_plus_extra":
      return (parseInt(attacker.system.rings?.[formula.ring]) || 0) + extraSuccesses;
    case "weapon_base_plus_extra": {
      const weapon = attacker?.items?.find(
        (i) => i.type === "weapon" && (i.system?.equipped === true || i.system?.readied === true),
      );
      return (parseInt(weapon?.system?.damage) || 0) + extraSuccesses;
    }
    default:
      console.warn("L5R5e Combat Helper | Unknown formula source:", formula.source);
      return 0;
  }
}

/**
 * Resolves which actors an effect targets.
 */
export function resolveTargets(effectTarget, attacker, assignedTargets) {
  switch (effectTarget) {
    case "attacker":
      return [attacker];
    case "target":
    case "all_against_target":
      return assignedTargets;
    default:
      return assignedTargets;
  }
}

/**
 * Applies a single TechniqueEffect. Returns a summary object for chat display, or null.
 * NOTE: "resistance_roll" type is NOT handled here — it is scheduled separately by executeKata.
 */
export async function applyEffect(effect, attacker, targets, extraSuccesses) {
  switch (effect.type) {
    case "condition":
      return applyConditionEffect(effect, attacker, targets);
    case "damage":
      return applyDamageEffect(effect, attacker, targets, extraSuccesses);
    case "assistance":
      return applyAssistanceEffect(effect, attacker, targets);
    case "resistance_roll":
      return null;
    case "resistance_buff":
      return null; // handled separately by applyPassiveKataOpportunity
    case "attack_tn_reduction":
      return applyAttackTnReductionEffect(effect, attacker, targets);
    case "critical_severity_boost":
      return null; // handled separately by applyPassiveKataOpportunity
    default:
      console.warn("L5R5e Combat Helper | Unknown effect type:", effect.type);
      return null;
  }
}

async function applyConditionEffect(effect, attacker, targets) {
  const applied = [];
  for (const target of targets) {
    try {
      await target.toggleStatusEffect(effect.statusId, { active: true });
      applied.push(target.name);
      if (effect.duration === "until_next_turn") {
        await storeActiveKataEffect(target, {
          statusId: effect.statusId,
          type: "condition",
          expiresAfterCombatant: attacker.id,
        });
      }
    } catch (e) {
      console.warn(
        `L5R5e Combat Helper | Could not apply condition ${effect.statusId} to ${target.name}:`,
        e,
      );
    }
  }
  return {
    type: "condition",
    statusId: effect.statusId,
    targets: applied,
    duration: effect.duration,
  };
}

async function applyDamageEffect(effect, attacker, targets, extraSuccesses) {
  const results = [];
  for (const target of targets) {
    const rawDamage = resolveFormula(effect.formula, attacker, target, extraSuccesses);
    const armor = effect.ignoresArmor ? 0 : getArmorResistance(target);
    const finalDamage = Math.max(0, rawDamage - armor);

    if (finalDamage <= 0) continue;

    const currentFatigue = getCurrentFatigue(target);

    let fatigueField = null;
    if (target.system.fatigue?.value !== undefined) {
      fatigueField = "system.fatigue.value";
    } else if (typeof target.system.fatigue === "number") {
      fatigueField = "system.fatigue";
    } else if (target.system.attributes?.fatigue !== undefined) {
      fatigueField = "system.attributes.fatigue";
    }

    if (!fatigueField) {
      console.error("L5R5e Combat Helper | Fatigue field not found for", target.name);
      continue;
    }

    await target.update({ [fatigueField]: currentFatigue + finalDamage });
    results.push({ target: target.name, damage: finalDamage });
  }
  return { type: "damage", results, ignoresArmor: effect.ignoresArmor };
}

async function applyAssistanceEffect(effect, attacker, targets) {
  const applied = [];
  for (const target of targets) {
    await storeActiveKataEffect(target, {
      statusId: null,
      type: "assistance",
      expiresAfterCombatant: attacker.id,
    });
    applied.push(target.name);
  }
  return { type: "assistance", targets: applied, duration: effect.duration };
}

async function applyAttackTnReductionEffect(effect, attacker, targets) {
  const amount = effect.amount ?? 1;
  for (const target of targets) {
    await target.setFlag("l5r5e-combat-helper", "pendingTnReduction", {
      amount,
      expiresAfterCombatant: attacker.id,
    });
    await applyTnReductionActiveEffect(target, amount);
    if (effect.duration === "until_next_turn") {
      await storeActiveKataEffect(target, {
        type: "attack_tn_reduction",
        expiresAfterCombatant: attacker.id,
      });
    }
  }
  return { type: "attack_tn_reduction", amount, targets: targets.map((t) => t.name) };
}

/**
 * Stores a timed kata effect on an actor's flags for later cleanup.
 */
export async function storeActiveKataEffect(actor, effectData) {
  const existing =
    actor.getFlag("l5r5e-combat-helper", "activeKataEffects") || [];
  await actor.setFlag("l5r5e-combat-helper", "activeKataEffects", [
    ...existing,
    effectData,
  ]);
}

/**
 * Removes all activeKataEffects that expire when combatantActorId takes their turn.
 */
export async function processExpiredKataEffects(combatantActorId) {
  for (const actor of game.actors) {
    const effects =
      actor.getFlag("l5r5e-combat-helper", "activeKataEffects") || [];
    const expiring = effects.filter(
      (e) => e.expiresAfterCombatant === combatantActorId,
    );
    if (expiring.length === 0) continue;

    for (const effect of expiring) {
      if (effect.statusId) {
        try {
          await actor.toggleStatusEffect(effect.statusId, { active: false });
        } catch (e) {
          console.warn(
            `L5R5e Combat Helper | Could not remove effect ${effect.statusId} from ${actor.name}:`,
            e,
          );
        }
      }
      if (effect.type === "resistance_buff" && effect.amount > 0) {
        const current = actor.getFlag("l5r5e-combat-helper", "resistanceBuff") || 0;
        const newAmount = Math.max(0, current - effect.amount);
        if (newAmount === 0) {
          await actor.unsetFlag("l5r5e-combat-helper", "resistanceBuff");
        } else {
          await actor.setFlag("l5r5e-combat-helper", "resistanceBuff", newAmount);
        }
        await removeKataTokenAura(actor);
        await removeResistanceActiveEffects(actor);
      }
      if (effect.type === "attack_tn_reduction") {
        await actor.unsetFlag("l5r5e-combat-helper", "pendingTnReduction");
        await removeTnReductionActiveEffect(actor);
      }
    }

    const remaining = effects.filter(
      (e) => e.expiresAfterCombatant !== combatantActorId,
    );
    await actor.setFlag(
      "l5r5e-combat-helper",
      "activeKataEffects",
      remaining,
    );
  }
}

/**
 * Removes all activeKataEffects that expire when combatantActorId ENDS their turn.
 * Called right after the next combatant starts (combat.previous).
 */
export async function processEndOfTurnKataEffects(combatantActorId) {
  for (const actor of game.actors) {
    const effects =
      actor.getFlag("l5r5e-combat-helper", "activeKataEffects") || [];
    const expiring = effects.filter(
      (e) => e.expiresEndOfTurnCombatant === combatantActorId,
    );
    if (expiring.length === 0) continue;

    for (const effect of expiring) {
      if (effect.type === "critical_severity_boost") {
        await actor.unsetFlag("l5r5e-combat-helper", "pendingCriticalSeverityBoost");
        await removeCriticalSeverityBoostActiveEffect(actor);
      }
      if (effect.type === "condition_lock") {
        await removeConditionLockActiveEffects(actor);
      }
    }

    const remaining = effects.filter(
      (e) => e.expiresEndOfTurnCombatant !== combatantActorId,
    );
    await actor.setFlag("l5r5e-combat-helper", "activeKataEffects", remaining);
  }
}

/**
 * Removes ALL activeKataEffects from all actors (called on combat end).
 */
export async function clearAllKataEffects() {
  for (const actor of game.actors) {
    const effects =
      actor.getFlag("l5r5e-combat-helper", "activeKataEffects") || [];
    if (effects.length === 0) continue;
    for (const effect of effects) {
      if (effect.statusId) {
        try {
          await actor.toggleStatusEffect(effect.statusId, { active: false });
        } catch (e) {}
      }
    }
    await actor.unsetFlag("l5r5e-combat-helper", "activeKataEffects");
    const hasBuff = actor.getFlag("l5r5e-combat-helper", "resistanceBuff");
    if (hasBuff) await actor.unsetFlag("l5r5e-combat-helper", "resistanceBuff");
    const hasTnReduction = actor.getFlag("l5r5e-combat-helper", "pendingTnReduction");
    if (hasTnReduction) {
      await actor.unsetFlag("l5r5e-combat-helper", "pendingTnReduction");
      await removeTnReductionActiveEffect(actor);
    }
    const hasSeverityBoost = actor.getFlag("l5r5e-combat-helper", "pendingCriticalSeverityBoost");
    if (hasSeverityBoost) {
      await actor.unsetFlag("l5r5e-combat-helper", "pendingCriticalSeverityBoost");
      await removeCriticalSeverityBoostActiveEffect(actor);
    }
    await removeConditionLockActiveEffects(actor);
  }
  await clearAllKataTokenAuras();
}

/**
 * Applies the opportunity effects of a passive kata (e.g. Striking as Earth).
 * Amount is determined by how many opportunities the player chose to spend.
 */
export async function applyPassiveKataOpportunity(kata, attacker, opportunitiesSpent, assignedTargets = [], chosenCondition = null) {
  if (!kata.onOpportunity?.length) return null;
  const oppDef = kata.onOpportunity[0];
  const results = [];

  for (const effect of oppDef.effects) {
    if (effect.type === "resistance_buff") {
      const targets = resolveTargets(effect.target ?? "attacker", attacker, assignedTargets);
      for (const target of targets) {
        const current = target.getFlag("l5r5e-combat-helper", "resistanceBuff") || 0;
        await target.setFlag(
          "l5r5e-combat-helper",
          "resistanceBuff",
          current + opportunitiesSpent,
        );
        if (effect.duration === "until_next_turn") {
          await storeActiveKataEffect(target, {
            type: "resistance_buff",
            amount: opportunitiesSpent,
            expiresAfterCombatant: attacker.id,
            ring: kata.activation.ring,
          });
        }
        await applyKataTokenAura(target, kata.activation.ring, "kata");
        await applyResistanceActiveEffect(target, kata.activation.ring, opportunitiesSpent);
      }
      results.push({ type: "resistance_buff", amount: opportunitiesSpent });

    } else if (effect.type === "critical_severity_boost") {
      const targets = resolveTargets(effect.target ?? "target", attacker, assignedTargets);
      for (const target of targets) {
        const current = target.getFlag("l5r5e-combat-helper", "pendingCriticalSeverityBoost")?.amount || 0;
        await target.setFlag("l5r5e-combat-helper", "pendingCriticalSeverityBoost", {
          amount: current + opportunitiesSpent,
          expiresEndOfTurnCombatant: attacker.id,
        });
        if (effect.duration === "until_end_of_next_turn") {
          await storeActiveKataEffect(target, {
            type: "critical_severity_boost",
            amount: opportunitiesSpent,
            expiresEndOfTurnCombatant: attacker.id,
          });
        }
        await applyCriticalSeverityBoostActiveEffect(target, current + opportunitiesSpent);
      }
      results.push({ type: "critical_severity_boost", amount: opportunitiesSpent });

    } else if (effect.type === "condition_lock") {
      if (!chosenCondition) continue;
      const targets = resolveTargets(effect.target ?? "target", attacker, assignedTargets);
      for (const target of targets) {
        const hasCondition = target.effects?.some((e) => e.statuses?.has(chosenCondition));
        if (!hasCondition) {
          ui.notifications.warn(
            game.i18n.format("l5r5e-combat-helper.notifications.conditionNotPresent", {
              condition: game.i18n.localize(`l5r5e-combat-helper.conditions.${chosenCondition}`),
              target: target.name,
            }),
          );
          continue;
        }
        await applyConditionLockActiveEffect(target, chosenCondition);
        if (effect.duration === "until_end_of_next_turn") {
          await storeActiveKataEffect(target, {
            type: "condition_lock",
            conditionId: chosenCondition,
            expiresEndOfTurnCombatant: attacker.id,
          });
        }
      }
      results.push({ type: "condition_lock", conditionId: chosenCondition });
    }
  }

  return results;
}

/**
 * Stores pendingResistanceRoll flag on each target and creates chat request cards.
 */
async function scheduleResistanceRolls(effect, attacker, targets, extraSuccesses) {
  const difficulty = resolveFormula(effect.difficulty, attacker, null, extraSuccesses);
  const skillCatId = SKILL_CATEGORY_MAP[effect.skill] ?? "martial";
  for (const target of targets) {
    await target.setFlag("l5r5e-combat-helper", "pendingResistanceRoll", {
      skill: effect.skill,
      skillCatId,
      difficulty,
      onFailure: effect.onFailure,
      attackerId: attacker.id,
    });
    await createResistanceRollRequestMessage(
      target,
      attacker,
      effect.skill,
      skillCatId,
      difficulty,
      effect.onFailure,
    );
  }
}

/**
 * Main entry point: executes a Kata after its roll is evaluated.
 */
export async function executeKata(
  kata,
  attacker,
  targets,
  success,
  extraSuccesses,
  l5rData,
  sourceMessage,
) {
  const tn =
    typeof kata.activation.difficulty === "number"
      ? kata.activation.difficulty
      : Math.max(
          parseInt(targets[0]?.system?.silhouette) || 1,
          kata.activation.minDifficulty || 1,
        );

  if (!success) {
    await createKataFailureMessage(
      kata,
      attacker,
      l5rData.summary?.totalSuccess || 0,
      tn,
    );
    return;
  }

  const effectSummaries = [];

  for (const effect of kata.onSuccess) {
    const effectTargets = resolveTargets(effect.target ?? "target", attacker, targets);
    if (effect.type === "resistance_roll") {
      await scheduleResistanceRolls(effect, attacker, effectTargets, extraSuccesses);
    } else {
      const summary = await applyEffect(effect, attacker, effectTargets, extraSuccesses);
      if (summary) effectSummaries.push(summary);
    }
  }

  if (
    kata.onExtraSuccesses &&
    extraSuccesses >= kata.onExtraSuccesses.threshold
  ) {
    for (const effect of kata.onExtraSuccesses.effects) {
      const effectTargets = resolveTargets(effect.target ?? "target", attacker, targets);
      if (effect.type === "resistance_roll") {
        await scheduleResistanceRolls(effect, attacker, effectTargets, extraSuccesses);
      } else {
        const summary = await applyEffect(effect, attacker, effectTargets, extraSuccesses);
        if (summary) effectSummaries.push(summary);
      }
    }
  }

  const opportunities = l5rData.summary?.opportunity || 0;
  const hasOpportunity =
    opportunities > 0 && (kata.onOpportunity?.length ?? 0) > 0;

  await createKataSuccessMessage(
    kata,
    attacker,
    targets,
    l5rData.summary?.totalSuccess || 0,
    extraSuccesses,
    tn,
    effectSummaries,
    hasOpportunity ? kata.onOpportunity : null,
    sourceMessage.id,
    opportunities,
  );
}

/**
 * Executes the onOpportunity effects of a Kata (called from button handler).
 */
export async function executeKataOpportunity(
  kataName,
  attackerId,
  targetIds,
  extraSuccesses,
  opportunityIndex = 0,
) {
  const kata = KATA_REGISTRY.find((k) => k.names.includes(kataName));
  if (!kata || !kata.onOpportunity?.[opportunityIndex]) return;

  const attacker = game.actors.get(attackerId);
  if (!attacker) return;
  const targets = targetIds.map((id) => game.actors.get(id)).filter(Boolean);

  for (const effect of kata.onOpportunity[opportunityIndex].effects) {
    const effectTargets = resolveTargets(effect.target ?? "target", attacker, targets);
    if (effect.type === "resistance_roll") {
      await scheduleResistanceRolls(effect, attacker, effectTargets, extraSuccesses);
    } else {
      await applyEffect(effect, attacker, effectTargets, extraSuccesses);
    }
  }
}
