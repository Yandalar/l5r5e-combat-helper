// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/critical/critical-effects-application", () => ({
  applyCriticalEffect: vi.fn(async () => {}),
  reverseCriticalEffect: vi.fn(async () => {}),
}));

import { processAttack } from "../../src/combat-handler";
import { registerCriticalMitigationHandler } from "../../src/critical/critical-mitigation";
import { applyCriticalEffect } from "../../src/critical/critical-effects-application";
import { processExpiredKataEffects, processEndOfTurnKataEffects, applyEffect } from "../../src/techniques/technique-engine";
import { KIHO_REGISTRY } from "../../src/techniques/kiho-registry";
import { getVigilance } from "../../src/core/actor-utils";
import { getArmorResistance } from "../../src/core/damage-calculator";
import { getHookCallback } from "../helpers/hooks";
import { createMockActor, createMockItem, createMockMessage, createMockRoll, createMockWeapon } from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";
const g = () => globalThis as any;

let monk: any;
let foe: any;

const armor = (physical: number, supernatural = 0) =>
  createMockItem({ type: "armor", system: { armor: { physical, supernatural }, equipped: true } });
const activate = (actor: any, name: string) => actor.setFlag(NS, "activeKiho", { name });
const fatigue = (a: any) => a.system.fatigue.value;

/** `attacker` attacks `target`: TN 2, `totalSuccess` successes. */
async function attack(attacker: any, target: any, opts: Record<string, any> = {}) {
  const msg = createMockMessage({
    id: opts.id ?? `roll-${Math.random().toString(36).slice(2, 8)}`,
    speaker: { actor: attacker.id },
    rolls: [createMockRoll({ skillId: opts.skillId ?? "unarmed", difficulty: 2, totalSuccess: opts.totalSuccess ?? 2, opportunity: opts.opportunity ?? 0 })],
  });
  await processAttack(msg, attacker, target, msg.rolls[0].l5r5e);
  return msg;
}

beforeEach(() => {
  monk = createMockActor({
    id: "monk", name: "Monk",
    system: {
      rings: { earth: 3, air: 2, water: 2, fire: 3, void: 2 },
      skills: { martial: { unarmed: 3, meditation: 2, fitness: 2 } },
      endurance: 20, fatigue: { max: 20, value: 0 },
    },
    items: [createMockWeapon({ id: "katana", system: { skill: "melee", damage: 4, deadliness: 5 } })],
  });
  foe = createMockActor({
    id: "foe", name: "Bandit", type: "npc",
    system: { endurance: 20, fatigue: { max: 20, value: 0 } },
  });
  g().game.actors.push(monk, foe);
  vi.mocked(applyCriticalEffect).mockClear();
});

describe("no active kihō", () => {
  it("unarmed attacks are unchanged (punch 1 + bonus successes − resistance)", async () => {
    foe.items.push(armor(1));
    await attack(monk, foe, { totalSuccess: 4 });
    expect(fatigue(foe)).toBe(1 + 2 - 1);
  });
});

describe("attacker enhancements (unarmed only)", () => {
  it("Earthen Fist: +Earth Ring damage", async () => {
    await activate(monk, "Earthen Fist");
    const msg = await attack(monk, foe);
    expect(fatigue(foe)).toBe(1 + 3);
    expect(msg.getFlag(NS, "attackData").kihoNotes[0]).toContain("Earthen Fist");
  });

  it("Earthen Fist does nothing for a katana attack", async () => {
    await activate(monk, "Earthen Fist");
    await attack(monk, foe, { skillId: "melee" });
    expect(fatigue(foe)).toBe(4);
  });

  it("Water Fist: ignores up to twice the Water Ring of resistance", async () => {
    foe.items.push(armor(5));
    await activate(monk, "Water Fist");
    await attack(monk, foe, { totalSuccess: 6 }); // 1 + 4 = 5; resistance 5 − 4 = 1
    expect(fatigue(foe)).toBe(4);
  });

  it("Flame Fist: supernatural damage uses supernatural resistance", async () => {
    foe.items.push(armor(5, 1));
    await activate(monk, "Flame Fist");
    await attack(monk, foe, { totalSuccess: 4 });
    expect(fatigue(foe)).toBe(3 - 1);
  });

  it("Flame Fist: a critical against an incapacitated target has punch deadliness + Fire Ring", async () => {
    foe.statuses.add("incapacitated");
    await activate(monk, "Flame Fist");
    await attack(monk, foe);
    const crit = g().game.messages.find((m) => m.getFlag(NS, "criticalStrike"));
    expect(crit.getFlag(NS, "criticalStrike").weaponDeadliness).toBe(2 + 3);
  });

  it("Way of the Falling Star: +Fire Ring against a Dazed target only", async () => {
    await activate(monk, "Way of the Falling Star");
    await attack(monk, foe);
    expect(fatigue(foe)).toBe(1);
    foe.statuses.add("dazed");
    await attack(monk, foe);
    expect(fatigue(foe)).toBe(1 + 1 + 3);
  });

  it("Way of the Edgeless Sword: base damage and deadliness = Unarmed + Void, Razor-Edged criticals", async () => {
    await activate(monk, "Way of the Edgeless Sword");
    const msg = await attack(monk, foe);
    expect(fatigue(foe)).toBe(3 + 2);
    expect(msg.getFlag(NS, "attackData")).toMatchObject({ critSeverity: 5, critSharp: true });
  });

  it("Death Touch: the target can't defend (resistance ignored)", async () => {
    foe.items.push(armor(4));
    await activate(monk, "Death Touch");
    await attack(monk, foe, { totalSuccess: 3 });
    expect(fatigue(foe)).toBe(2);
  });
});

describe("defender enhancements", () => {
  it("Earthen Fist: +1 physical resistance (not supernatural)", async () => {
    foe.items.push(armor(2, 1));
    await activate(foe, "Earthen Fist");
    expect(getArmorResistance(foe)).toBe(3);
    expect(getArmorResistance(foe, "supernatural")).toBe(1);
  });

  it("Way of the Willow: −2 damage per opportunity of the attack", async () => {
    await activate(foe, "Way of the Willow");
    await attack(monk, foe, { skillId: "melee", totalSuccess: 5, opportunity: 1 }); // 4 + 3 − 2
    expect(fatigue(foe)).toBe(5);
  });

  it("Way of the Willow burst: +Meditation TN to attacks against the user until its next turn", async () => {
    const ctx = { attacker: foe, targets: [], extraSuccesses: 2, opportunitiesSpent: 0, tn: 0, totalSuccess: 0,
      weapon: null, resistance: null, kata: KIHO_REGISTRY.find((k) => k.names[0] === "Way of the Willow"),
      chosenCondition: null, sourceMessageId: null, l5rData: null };
    foe.system.skills = { martial: 2 };
    await applyEffect({ type: "incoming_attack_tn", target: "attacker", amount: { source: "fixed", value: 2 }, duration: "until_next_turn" }, ctx, [foe]);
    await attack(monk, foe, { skillId: "melee", totalSuccess: 3 }); // TN 2 + 2 = 4 → miss
    expect(fatigue(foe)).toBe(0);
    await processExpiredKataEffects("foe");
    expect(foe.getFlag(NS, "incomingAttackTnBonus")).toBeUndefined();
    await attack(monk, foe, { skillId: "melee", totalSuccess: 3 });
    expect(fatigue(foe)).toBe(5);
  });

  it("Grasp the Earth Dragon burst: damage reduced to 1 and the attacker becomes Prone, until the end of its next turn", async () => {
    const ctx = { attacker: foe, targets: [], extraSuccesses: 3, opportunitiesSpent: 0, tn: 0, totalSuccess: 0,
      weapon: null, resistance: null, kata: null, chosenCondition: null, sourceMessageId: null, l5rData: null };
    await applyEffect({ type: "damage_cap", target: "attacker", cap: 1, proneSource: true, duration: "until_end_of_next_turn" }, ctx, [foe]);
    await attack(monk, foe, { skillId: "melee", totalSuccess: 4 });
    expect(fatigue(foe)).toBe(1);
    expect(monk.statuses.has("prone")).toBe(true);
    await processEndOfTurnKataEffects("foe");
    expect(foe.getFlag(NS, "kihoDamageCap")).toBeUndefined();
  });

  it("Grasp the Earth Dragon: −Earth Ring severity on criticals the user suffers", async () => {
    foe.system.rings = { earth: 2 };
    await activate(foe, "Grasp the Earth Dragon");
    const card = createMockMessage({ id: "crit-1", flags: { [NS]: { criticalStrike: { targetId: "foe", attackerId: "monk", weaponDeadliness: 5 } } } });
    g().game.messages.push(card);
    await foe.setFlag(NS, "pendingCriticalMitigation", { weaponDeadliness: 5, criticalMessageId: "crit-1" });
    registerCriticalMitigationHandler();
    await getHookCallback("createChatMessage")(createMockMessage({
      speaker: { actor: "foe" }, rolls: [createMockRoll({ skillId: "martial", difficulty: 1, totalSuccess: 0, stance: "earth" })],
    }));
    expect(applyCriticalEffect).toHaveBeenCalledWith(foe, 3, "earth", null, monk);
  });

  it("The Body Is an Anvil: defending against an attack's damage hurts and dazes the attacker", async () => {
    foe.items.push(armor(2));
    foe.system.rings = { fire: 3 };
    await activate(foe, "The Body Is an Anvil");
    await attack(monk, foe, { skillId: "melee", totalSuccess: 2 });
    expect(fatigue(monk)).toBe(3);
    expect(monk.statuses.has("dazed")).toBe(true);
  });

  it("The Body Is an Anvil burst: the marked opponent's attack is reduced by Fire Ring; fully stopped → Burning", async () => {
    foe.items.push(armor(1));
    foe.system.rings = { fire: 3 };
    await activate(foe, "The Body Is an Anvil");
    await foe.setFlag(NS, "kihoMark", { key: "anvil", targetId: "monk" });
    await attack(monk, foe, { totalSuccess: 4 }); // punch 1 + 2 − 3 → 0 before resistance
    expect(fatigue(foe)).toBe(0);
    expect(monk.statuses.has("burning")).toBe(true);
    expect(foe.getFlag(NS, "kihoMark")).toBeUndefined();
  });

  it("Earth Needs No Eyes: +Earth Ring Vigilance", async () => {
    foe.system.vigilance = 2;
    foe.system.rings = { earth: 3 };
    expect(getVigilance(foe)).toBe(2);
    await activate(foe, "Earth Needs No Eyes");
    expect(getVigilance(foe)).toBe(5);
  });
});
