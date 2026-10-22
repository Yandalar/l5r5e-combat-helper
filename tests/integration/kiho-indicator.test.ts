// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerKataActivationHandler } from "../../src/techniques/kata-activation";
import { KIHO_REGISTRY } from "../../src/techniques/kiho-registry";
import { endKiho } from "../../src/techniques/kiho-engine";
import { applyEffect } from "../../src/techniques/technique-engine";
import { getHookCallback, getHookCallbacks } from "../helpers/hooks";
import { withCanvasTokens } from "../helpers/setup";
import { createMockActor, createMockActiveEffect, createMockMessage, createMockRoll } from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";
const g = () => globalThis as any;
const NOTE = "l5r5e-combat-helper.kiho.chat.burst"; // any existing i18n key

const EARTH_KIHO = {
  names: ["Test Fist", "Puño de prueba"],
  activation: { skill: "unarmed", ring: "earth", difficulty: 2 },
  burst: [],
  enhancement: { id: "test-fist", note: NOTE },
};
const ANY_RING_KIHO = {
  names: ["Test Sword", "Espada de prueba"],
  activation: { skill: "meditation", difficulty: 2 },
  burst: [],
  enhancement: { id: "test-sword", note: NOTE },
};

let monk: any;
let foe: any;

async function rollKiho(name: string, stance = "earth") {
  const message = createMockMessage({
    speaker: { actor: "monk" },
    rolls: [createMockRoll({
      skillId: "unarmed", stance, totalSuccess: 2,
      item: { name, type: "technique", system: { technique_type: "kiho" }, _stats: {} },
    })],
  });
  for (const cb of getHookCallbacks("createChatMessage")) await cb(message);
  return g().game.messages.at(-1);
}

const kihoEffects = (actor: any) => actor.effects.filter((e) => e.getFlag(NS, "kihoActiveEffect"));

/** Deletes `effect` from the actor the way Foundry does: removed, then the hook fires. */
async function deleteByHand(actor: any, effect: any) {
  effect.parent = actor;
  actor.effects.splice(actor.effects.indexOf(effect), 1);
  for (const cb of getHookCallbacks("deleteActiveEffect")) await cb(effect, {}, "p1");
}

beforeEach(() => {
  KIHO_REGISTRY.push(EARTH_KIHO, ANY_RING_KIHO);
  monk = createMockActor({ id: "monk", name: "Monk", ownerUserIds: ["p1"],
    system: { rings: { earth: 3, water: 2 }, void_points: { max: 3, value: 1 } } });
  foe = createMockActor({ id: "foe", name: "Bandit", type: "npc", system: { endurance: 20, fatigue: { max: 20, value: 0 } } });
  g().game.actors.push(monk, foe);
  g().game.user.targets.add({ actor: foe });
  withCanvasTokens([{ actor: monk, document: { actorLink: true, light: {}, update: vi.fn() } }]);
  registerKataActivationHandler();
});

afterEach(() => {
  for (const entry of [EARTH_KIHO, ANY_RING_KIHO]) KIHO_REGISTRY.splice(KIHO_REGISTRY.indexOf(entry), 1);
});

describe("active kihō indicator", () => {
  it("activation creates the ☯ Kihō effect with the ring's icon and stores its id", async () => {
    const card = await rollKiho("Test Fist");
    const [effect] = kihoEffects(monk);
    expect(effect.name).toBe("☯ Kihō: Test Fist");
    expect(effect.img).toContain("earth");
    expect(monk.createEmbeddedDocuments.mock.calls[0][1][0].showIcon).toBe(2);
    expect(monk.getFlag(NS, "activeKiho")).toMatchObject({ name: "Test Fist", ring: "earth", effectId: effect.id });
    expect(card.content).toContain("Active with Earth");
  });

  it("a kihō without a fixed ring takes the roll's ring for the effect and the aura", async () => {
    await rollKiho("Test Sword", "water");
    expect(monk.getFlag(NS, "activeKiho").ring).toBe("water");
    expect(kihoEffects(monk)[0].img).toContain("water");
    expect(monk.getFlag(NS, "kataAura").ring).toBe("water");
  });

  it("the End button deletes the effect", async () => {
    await rollKiho("Test Fist");
    await endKiho({ actorId: "monk", name: "Test Fist" }, "gm");
    expect(kihoEffects(monk)).toHaveLength(0);
  });

  it("another kihō replaces the effect", async () => {
    await rollKiho("Test Fist");
    await rollKiho("Test Sword");
    expect(kihoEffects(monk).map((e) => e.name)).toEqual(["☯ Kihō: Test Sword"]);
  });

  it("combat end deletes the effect", async () => {
    await rollKiho("Test Fist");
    await getHookCallback("deleteCombat")({}, {}, "gm");
    expect(kihoEffects(monk)).toHaveLength(0);
  });

  it("clear_technique_effects deletes another actor's kihō effect", async () => {
    await rollKiho("Test Fist");
    const ctx = { attacker: foe, targets: [monk], extraSuccesses: 0, kata: { names: ["X"] }, l5rData: null };
    await applyEffect({ type: "clear_technique_effects" }, ctx, [monk]);
    expect(monk.getFlag(NS, "activeKiho")).toBeUndefined();
    expect(kihoEffects(monk)).toHaveLength(0);
  });
});

describe("deleting the effect by hand", () => {
  it("ends the kihō, its aura, and posts the end card", async () => {
    await rollKiho("Test Fist");
    await deleteByHand(monk, kihoEffects(monk)[0]);
    expect(monk.getFlag(NS, "activeKiho")).toBeUndefined();
    expect(monk.getFlag(NS, "kataAura")).toBeUndefined();
    expect(g().game.messages.at(-1).content).toContain("Monk ends Test Fist");
  });

  it("ignores other effects", async () => {
    await rollKiho("Test Fist");
    const other = createMockActiveEffect({ name: "Other" });
    monk.effects.push(other);
    await deleteByHand(monk, other);
    expect(monk.getFlag(NS, "activeKiho").name).toBe("Test Fist");
  });

  it("ignores the effect of a kihō that was already replaced", async () => {
    await rollKiho("Test Fist");
    const stale = createMockActiveEffect({ name: "☯ Kihō: Old", flags: { [NS]: { kihoActiveEffect: true } } });
    monk.effects.push(stale);
    await deleteByHand(monk, stale);
    expect(monk.getFlag(NS, "activeKiho").name).toBe("Test Fist");
  });
});
