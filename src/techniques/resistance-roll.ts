// @ts-nocheck

/**
 * Builds the DicePickerDialog params for a kata resistance roll, mirroring
 * critical-strike-roll.ts's launchFitnessCheck NPC/PC branch exactly (bug
 * #6 fix): an NPC actor has no per-skill entries, only flat skill
 * categories, so its roll must be launched against `skillCatId` (passed as
 * `skillId` to the dialog) instead of the named skill a PC would use.
 */
export function buildResistanceDialogParams(target, skill, skillCatId, difficulty) {
  if (target.type === "npc") {
    return { actor: target, skillId: skillCatId, difficulty, difficultyHidden: false };
  }
  return { actor: target, skillId: skill, skillCatId, difficulty, difficultyHidden: false };
}

/** True if a finished roll's l5rData matches a pending resistance roll, accounting for the NPC flat-skill case. */
export function matchesPendingResistance(l5rData, pending, actorType) {
  if (actorType === "npc") return l5rData.skillId === pending.skillCatId;
  return l5rData.skillId === pending.skill;
}
