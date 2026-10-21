// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerKataActivationHandler } from "../../src/techniques/kata-activation";
import { KIHO_REGISTRY } from "../../src/techniques/kiho-registry";
import { activeKihoOf, burstTiersFor, endKiho } from "../../src/techniques/kiho-engine";
import { applyEffect, clearKataEffectsFor } from "../../src/techniques/technique-engine";
import { applyTechniqueChoice } from "../../src/techniques/technique-choice";
import { getHookCallback, getHookCallbacks } from "../helpers/hooks";
import { createMockActor, createMockItem, createMockMessage, createMockRoll } from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";
const g = () => globalThis as any;
const NOTE = "l5r5e-combat-helper.kiho.chat.burst"; // any existing i18n key

const TEST_FIST = {
  names: ["Test Fist", "Puño de prueba"],
  activation: { skill: "unarmed", ring: "earth", difficulty: 2 },
  burst: [
    { threshold: 2, effects: [{ type: "damage", target: "target", formula: { source: "attacker_ring", ring: "earth" } }] },
    { threshold: 4, replaces: true, effects: [{ type: "condition", target: "target", statusId: "prone", duration: "immediate" }] },
  ],
  enhancement: { id: "test-fist", note: NOTE },
};
const TEST_BREATH = {
  names: ["Test Breath", "Aliento de prueba"],
  activation: { skill: "meditation", ring: "air", difficulty: 1 },
  burst: [],
  enhancement: { id: "test-breath", note: NOTE },
};

let monk: any;
let foe: any;

async function rollKiho(name: string, totalSuccess: number) {
  const message = createMockMessage({
    speaker: { actor: "monk" },
    rolls: [createMockRoll({
      skillId: "unarmed", stance: "earth", totalSuccess,
      item: { name, type: "technique", system: { technique_type: "kiho" }, _stats: {} },
    })],
  });
  for (const cb of getHookCallbacks("createChatMessage")) await cb(message);
  return g().game.messages.at(-1);
}

beforeEach(() => {
  KIHO_REGISTRY.push(TEST_FIST, TEST_BREATH);
  monk = createMockActor({ id: "monk", name: "Monk", ownerUserIds: ["p1"], isOwner: false,
    system: { rings: { earth: 3 }, void_points: { max: 3, value: 1 } } });
  foe = createMockActor({ id: "foe", name: "Bandit", type: "npc", isOwner: false, system: { endurance: 20, fatigue: { max: 20, value: 0 } } });
  g().game.actors.push(monk, foe);
  g().game.user.targets.add({ actor: foe });
  registerKataActivationHandler();
});

afterEach(() => {
  for (const entry of [TEST_FIST, TEST_BREATH]) KIHO_REGISTRY.splice(KIHO_REGISTRY.indexOf(entry), 1);
  g().game.combat = null;
});

describe("kihō activation", () => {
  it("a success activates the enhancement and posts a card with an End button", async () => {
    const card = await rollKiho("Puño de prueba", 2);
    expect(monk.getFlag(NS, "activeKiho")).toMatchObject({ name: "Test Fist", ring: "earth" });
    expect(activeKihoOf(monk)).toBe(TEST_FIST);
    expect(card.content).toContain("kiho-end-button");
    expect(fatigueOf(foe)).toBe(0); // no bonus successes → no burst
  });

  it("a failure activates nothing", async () => {
    await rollKiho("Test Fist", 1);
    expect(monk.getFlag(NS, "activeKiho")).toBeUndefined();
  });

  it("can't reactivate the kihō that is already active", async () => {
    await rollKiho("Test Fist", 2);
    await rollKiho("Test Fist", 4);
    expect(fatigueOf(foe)).toBe(0);
    expect(g().game.messages.at(-1).content).toContain("can't reactivate");
  });

  it("another kihō replaces the active one", async () => {
    await rollKiho("Test Fist", 2);
    await rollKiho("Test Breath", 1);
    expect(monk.getFlag(NS, "activeKiho").name).toBe("Test Breath");
  });

  it("burst tiers: 2+ deals damage, 4+ replaces it", async () => {
    await rollKiho("Test Fist", 4); // 2 bonus
    expect(fatigueOf(foe)).toBe(3);
    expect(foe.statuses.has("prone")).toBe(false);

    monk.unsetFlag(NS, "activeKiho");
    await rollKiho("Test Fist", 6); // 4 bonus
    expect(fatigueOf(foe)).toBe(3);
    expect(foe.statuses.has("prone")).toBe(true);
  });

  it("burstTiersFor keeps lower tiers unless a met tier replaces them", () => {
    const kiho = { burst: [{ threshold: 0, effects: ["a"] }, { threshold: 2, effects: ["b"] }, { threshold: 4, replaces: true, effects: ["c"] }] };
    expect(burstTiersFor(kiho, 3).map((t) => t.effects[0])).toEqual(["a", "b"]);
    expect(burstTiersFor(kiho, 5).map((t) => t.effects[0])).toEqual(["c"]);
  });

  it("unregistered kihō are ignored", async () => {
    const before = g().game.messages.length;
    await rollKiho("Some Other Kiho", 5);
    expect(g().game.messages.length).toBe(before);
  });

  it("an unarmed kihō roll is not processed as a punch attack", async () => {
    const { registerCombatHandler } = await import("../../src/combat-handler");
    registerCombatHandler();
    await rollKiho("Test Fist", 2);
    expect(fatigueOf(foe)).toBe(0);
  });
});

describe("ending a kihō", () => {
  it("the owner can end it through the GM relay", async () => {
    g().game.users.push({ id: "p1", name: "Player One", isGM: false, active: true });
    await rollKiho("Test Fist", 2);
    await endKiho({ actorId: "monk", name: "Test Fist" }, "p1");
    expect(monk.getFlag(NS, "activeKiho")).toBeUndefined();
  });

  it("a user who doesn't own the monk can't end it", async () => {
    g().game.users.push({ id: "p2", isGM: false, active: true });
    await rollKiho("Test Fist", 2);
    await endKiho({ actorId: "monk", name: "Test Fist" }, "p2");
    expect(monk.getFlag(NS, "activeKiho").name).toBe("Test Fist");
  });

  it("combat end clears it", async () => {
    await rollKiho("Test Fist", 2);
    await getHookCallback("deleteCombat")({}, {}, "gm");
    expect(monk.getFlag(NS, "activeKiho")).toBeUndefined();
  });
});

const fatigueOf = (a: any) => a.system.fatigue.value;
const ctxFor = (attacker: any, targets: any[]) => ({
  attacker, targets, extraSuccesses: 2, opportunitiesSpent: 0, tn: 0, totalSuccess: 0, weapon: null,
  resistance: null, kata: { names: ["Test Fist"] }, chosenCondition: null, sourceMessageId: null, l5rData: null,
});

describe("engine additions", () => {
  it("gain_void stops at the maximum", async () => {
    monk.system.void_points = { max: 2, value: 1 };
    const summary = await applyEffect({ type: "gain_void", amount: 3 }, ctxFor(monk, []), [monk]);
    expect(monk.system.void_points.value).toBe(2);
    expect(summary.results[0].amount).toBe(1);
  });

  it("oncePerScene: once per target per combat, unrestricted outside combat", async () => {
    const effect = { type: "gain_void", oncePerScene: true };
    monk.system.void_points = { max: 9, value: 0 };
    await applyEffect(effect, ctxFor(monk, []), [monk]);
    await applyEffect(effect, ctxFor(monk, []), [monk]);
    expect(monk.system.void_points.value).toBe(2);

    g().game.combat = { id: "c1" };
    await applyEffect(effect, ctxFor(monk, []), [monk]);
    await applyEffect(effect, ctxFor(monk, []), [monk]);
    expect(monk.system.void_points.value).toBe(3);

    g().game.combat = { id: "c2" };
    await applyEffect(effect, ctxFor(monk, []), [monk]);
    expect(monk.system.void_points.value).toBe(4);
  });

  it("supernatural damage uses the armor's supernatural resistance", async () => {
    foe.items.push(createMockItem({ type: "armor", system: { armor: { physical: 3, supernatural: 1 }, equipped: true } }));
    await applyEffect(
      { type: "damage", target: "target", damageType: "supernatural", formula: { source: "fixed", value: 4 } },
      ctxFor(monk, [foe]), [foe],
    );
    expect(fatigueOf(foe)).toBe(3);
  });

  it("clear_technique_effects clears kata flags and other kihō, keeping the user's own", async () => {
    await rollKiho("Test Fist", 2);
    await foe.setFlag(NS, "resistanceBuff", 2);
    await foe.setFlag(NS, "activeKiho", { name: "Test Breath" });
    await applyEffect({ type: "clear_technique_effects" }, ctxFor(monk, [monk, foe]), [monk, foe]);
    expect(foe.getFlag(NS, "resistanceBuff")).toBeUndefined();
    expect(foe.getFlag(NS, "activeKiho")).toBeUndefined();
    expect(monk.getFlag(NS, "activeKiho").name).toBe("Test Fist");
  });

  it("clearKataEffectsFor ends the actor's kihō", async () => {
    await rollKiho("Test Fist", 2);
    await clearKataEffectsFor(monk);
    expect(monk.getFlag(NS, "activeKiho")).toBeUndefined();
  });
});

describe("choice cards", () => {
  const effect = {
    type: "choice",
    chooser: "target",
    options: [
      { label: "l5r5e-combat-helper.kata.chat.resistCondition", effects: [{ type: "condition", target: "target", statusId: "immobilized", duration: "immediate" }] },
      { label: "l5r5e-combat-helper.kata.chat.resistDamage", effects: [{ type: "damage", target: "target", formula: { source: "fixed", value: 3 }, ignoresArmor: true }] },
      { label: "l5r5e-combat-helper.kata.chat.resistDamage", when: { target_has_condition: "prone" }, effects: [] },
    ],
  };

  it("posts a card with the options whose `when` holds", async () => {
    await applyEffect(effect, ctxFor(monk, [foe]), [foe]);
    const card = g().game.messages.at(-1);
    expect(card.getFlag(NS, "techniqueChoice").options).toHaveLength(2);
    expect(card.content.match(/technique-choice-btn/g)).toHaveLength(2);
  });

  it("the chooser's pick is applied once, through the relay", async () => {
    g().game.users.push({ id: "p2", isGM: false, active: true });
    await applyEffect(effect, ctxFor(monk, [foe]), [foe]);
    const card = g().game.messages.at(-1);

    await applyTechniqueChoice({ messageId: card.id, index: 1 }, "p2"); // doesn't own the target
    expect(fatigueOf(foe)).toBe(0);

    await applyTechniqueChoice({ messageId: card.id, index: 1 }, "gm");
    expect(fatigueOf(foe)).toBe(3);
    await applyTechniqueChoice({ messageId: card.id, index: 0 }, "gm");
    expect(foe.statuses.has("immobilized")).toBe(false);
  });
});
