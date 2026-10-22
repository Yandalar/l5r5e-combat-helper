// @ts-nocheck
import { describe, it, expect, beforeEach } from "vitest";
import { processAttack } from "../../src/combat-handler";
import { useKihoEnhancement, applyKihoReaction } from "../../src/techniques/kiho-reactions";
import { applyTechniqueChoice } from "../../src/techniques/technique-choice";
import { registerKataActivationHandler } from "../../src/techniques/kata-activation";
import { getHookCallbacks } from "../helpers/hooks";
import { createMockActor, createMockItem, createMockMessage, createMockRoll, createMockWeapon } from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";
const g = () => globalThis as any;

let monk: any;
let foe: any;
let ally: any;

const armor = (physical: number, extra: Record<string, any> = {}) =>
  createMockItem({ type: "armor", ...extra, system: { armor: { physical, supernatural: 0 }, equipped: true } });
const activate = (actor: any, name: string) => actor.setFlag(NS, "activeKiho", { name });
const fatigue = (a: any) => a.system.fatigue.value;
const voidOf = (a: any) => a.system.void_points.value;
const choiceCards = () => g().game.messages.filter((m) => m.getFlag(NS, "techniqueChoice"));
const reactionCard = () => g().game.messages.find((m) => m.getFlag(NS, "kihoReactions"));

/** `attacker` attacks `target`: TN 2, `totalSuccess` successes. */
async function attack(attacker: any, target: any, opts: Record<string, any> = {}) {
  const msg = createMockMessage({
    speaker: { actor: attacker.id },
    rolls: [createMockRoll({ skillId: opts.skillId ?? "unarmed", difficulty: 2, totalSuccess: opts.totalSuccess ?? 2 })],
  });
  await processAttack(msg, attacker, target, msg.rolls[0].l5r5e);
}

/** Picks option `index` of the last choice card as the GM. */
async function choose(index: number) {
  const card = choiceCards().at(-1);
  await applyTechniqueChoice({ messageId: card.id, index }, "gm");
}

beforeEach(() => {
  monk = createMockActor({
    id: "monk", name: "Monk", ownerUserIds: ["p1"],
    system: {
      rings: { earth: 3, air: 2, water: 2, fire: 2, void: 2 },
      skills: { martial: { unarmed: 3, meditation: 2, fitness: 2 }, scholar: { medicine: 3 } },
      endurance: 20, fatigue: { max: 20, value: 0 }, void_points: { max: 3, value: 2 },
    },
  });
  foe = createMockActor({
    id: "foe", name: "Bandit", type: "npc",
    system: { endurance: 20, fatigue: { max: 20, value: 0 }, void_points: { max: 2, value: 1 }, skills: { martial: 2 } },
  });
  ally = createMockActor({
    id: "ally", name: "Ally",
    system: { endurance: 20, fatigue: { max: 20, value: 6 }, void_points: { max: 2, value: 0 } },
  });
  g().game.actors.push(monk, foe, ally);
});

describe("Use enhancement button", () => {
  it("Way of the Earthquake: a player's click schedules the Fitness resistance with ring TNs; failing deals Earth damage and Prone", async () => {
    registerKataActivationHandler();
    await activate(monk, "Way of the Earthquake");
    await useKihoEnhancement({ actorId: "monk", kiho: "Way of the Earthquake", targetIds: ["foe"] }, "p1");
    expect(foe.getFlag(NS, "pendingResistanceRoll")).toMatchObject({ difficulty: 4, ringDifficulty: { air: -2, water: 1 } });

    const roll = createMockMessage({ speaker: { actor: "foe" }, rolls: [createMockRoll({ skillId: "martial", stance: "earth", totalSuccess: 1 })] });
    for (const cb of getHookCallbacks("createChatMessage")) await cb(roll);
    expect(fatigue(foe)).toBe(3);
    expect(foe.statuses.has("prone")).toBe(true);
  });

  it("is refused for a user who doesn't own the kihō user", async () => {
    g().game.users.push({ id: "p2", isGM: false, active: true });
    await activate(monk, "Way of the Earthquake");
    await useKihoEnhancement({ actorId: "monk", kiho: "Way of the Earthquake", targetIds: ["foe"] }, "p2");
    expect(foe.getFlag(NS, "pendingResistanceRoll")).toBeUndefined();
  });

  it("does nothing once the kihō is no longer active", async () => {
    await activate(monk, "Ki Protection");
    await useKihoEnhancement({ actorId: "monk", kiho: "Way of the Earthquake", targetIds: ["foe"] }, "gm");
    expect(foe.getFlag(NS, "pendingResistanceRoll")).toBeUndefined();
  });

  it("Ki Protection: spends 1 Void point and the target removes fatigue equal to Medicine", async () => {
    await activate(monk, "Ki Protection");
    await useKihoEnhancement({ actorId: "monk", kiho: "Ki Protection", targetIds: ["ally"] }, "p1");
    expect(voidOf(monk)).toBe(1);
    expect(fatigue(ally)).toBe(3);
  });

  it("Ki Protection without Void points changes nothing", async () => {
    monk.system.void_points.value = 0;
    await activate(monk, "Ki Protection");
    await useKihoEnhancement({ actorId: "monk", kiho: "Ki Protection", targetIds: ["ally"] }, "gm");
    expect(fatigue(ally)).toBe(6);
  });

  it("Ki Protection can't target the user itself", async () => {
    monk.system.fatigue.value = 5;
    await activate(monk, "Ki Protection");
    await useKihoEnhancement({ actorId: "monk", kiho: "Ki Protection", targetIds: ["monk"] }, "gm");
    expect(fatigue(monk)).toBe(5);
    expect(voidOf(monk)).toBe(2);
  });
});

describe("damage card reactions", () => {
  it("Death Touch: the target spends 1 Void point to defend, once", async () => {
    foe.items.push(armor(3));
    await activate(monk, "Death Touch");
    await attack(monk, foe, { totalSuccess: 4 }); // punch 1 + 2, resistance ignored
    expect(fatigue(foe)).toBe(3);
    const card = reactionCard();
    expect(card.getFlag(NS, "kihoReactions").deathTouch).toMatchObject({ refund: 3, used: false });
    expect(card.content).toContain("kiho-reaction-button");

    await applyKihoReaction({ messageId: card.id, reaction: "deathTouch" }, "gm");
    expect(fatigue(foe)).toBe(0);
    expect(voidOf(foe)).toBe(0);

    foe.system.void_points.value = 1;
    await applyKihoReaction({ messageId: card.id, reaction: "deathTouch" }, "gm");
    expect(voidOf(foe)).toBe(1);
  });

  it("Death Touch without Void points is refused", async () => {
    foe.items.push(armor(2));
    foe.system.void_points.value = 0;
    await activate(monk, "Death Touch");
    await attack(monk, foe, { totalSuccess: 4 });
    await applyKihoReaction({ messageId: reactionCard().id, reaction: "deathTouch" }, "gm");
    expect(fatigue(foe)).toBe(3);
  });

  it("no Death Touch reaction when the target has no resistance", async () => {
    await activate(monk, "Death Touch");
    await attack(monk, foe);
    expect(reactionCard()).toBeUndefined();
  });

  it("Grasp the Earth Dragon: 1 Void point, the attacker suffers fatigue equal to the user's Fitness, once", async () => {
    await activate(foe, "Grasp the Earth Dragon");
    await attack(monk, foe, { skillId: "melee", totalSuccess: 2 });
    const card = reactionCard();
    await applyKihoReaction({ messageId: card.id, reaction: "grasp" }, "gm");
    expect(fatigue(monk)).toBe(2);
    expect(voidOf(foe)).toBe(0);

    foe.system.void_points.value = 1;
    await applyKihoReaction({ messageId: card.id, reaction: "grasp" }, "gm");
    expect(fatigue(monk)).toBe(2);
  });

  it("Grasp the Earth Dragon: also offered when armor absorbs the whole attack", async () => {
    foe.items.push(armor(10));
    await activate(foe, "Grasp the Earth Dragon");
    await attack(monk, foe, { totalSuccess: 2 });
    expect(fatigue(foe)).toBe(0);
    const card = reactionCard();
    expect(card.getFlag(NS, "attackData")).toBeUndefined();
    await applyKihoReaction({ messageId: card.id, reaction: "grasp" }, "gm");
    expect(fatigue(monk)).toBe(2);
  });

  it("a user who doesn't own the target can't use the reaction", async () => {
    g().game.users.push({ id: "p2", isGM: false, active: true });
    await activate(foe, "Grasp the Earth Dragon");
    await attack(monk, foe, { skillId: "melee" });
    await applyKihoReaction({ messageId: reactionCard().id, reaction: "grasp" }, "p2");
    expect(fatigue(monk)).toBe(0);
    expect(voidOf(foe)).toBe(1);
  });
});

describe("choices after an unarmed hit", () => {
  it("Freezing the Lifeblood: a target that defended chooses Immobilized or 3 fatigue", async () => {
    foe.items.push(armor(1));
    await activate(monk, "Freezing the Lifeblood");
    await attack(monk, foe, { totalSuccess: 4 }); // 3 − 1 = 2
    expect(choiceCards()[0].getFlag(NS, "techniqueChoice").chooser).toBe("target");
    await choose(1);
    expect(fatigue(foe)).toBe(2 + 3);
    expect(foe.statuses.has("immobilized")).toBe(false);
  });

  it("Freezing the Lifeblood: no card when the target had no resistance", async () => {
    await activate(monk, "Freezing the Lifeblood");
    await attack(monk, foe);
    expect(choiceCards()).toHaveLength(0);
  });

  it("Breaking Blow: the attacker picks the item and the target chooses Damaged or 2 fatigue", async () => {
    const sword = createMockWeapon({ id: "sword", name: "Katana" });
    sword.update = async (data: Record<string, any>) => Object.assign(sword.system, { properties: data["system.properties"] });
    foe.items.push(sword, armor(0, { id: "robe", name: "Robe" }));
    await activate(monk, "Breaking Blow");
    await attack(monk, foe);

    const first = choiceCards()[0].getFlag(NS, "techniqueChoice");
    expect(first.chooser).toBe("attacker");
    expect(first.options.map((o) => o.labelArgs.item)).toEqual(["Katana", "Robe"]);
    await choose(0);

    expect(choiceCards()[1].getFlag(NS, "techniqueChoice").chooser).toBe("target");
    await choose(0);
    expect(sword.system.properties).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Damaged" })]));
  });

  it("Breaking Blow: choosing fatigue leaves the item intact", async () => {
    foe.items.push(createMockWeapon({ id: "sword", name: "Katana" }));
    await activate(monk, "Breaking Blow");
    await attack(monk, foe);
    await choose(0);
    await choose(1);
    expect(fatigue(foe)).toBe(1 + 2);
  });

  it("Breaking Blow does nothing for a weapon attack", async () => {
    foe.items.push(createMockWeapon({ id: "sword", name: "Katana" }));
    monk.items.push(createMockWeapon({ id: "katana", system: { skill: "melee", damage: 4, deadliness: 5 } }));
    await activate(monk, "Breaking Blow");
    await attack(monk, foe, { skillId: "melee" });
    expect(choiceCards()).toHaveLength(0);
  });
});
