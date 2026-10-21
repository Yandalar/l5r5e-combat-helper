import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/critical/critical-effects-application", () => ({
  applyCriticalEffect: vi.fn(async () => {}),
  reverseCriticalEffect: vi.fn(async () => {}),
}));

import { processAttack } from "../../src/combat-handler";
import { registerCriticalMitigationHandler } from "../../src/critical/critical-mitigation";
import { applyCriticalEffect } from "../../src/critical/critical-effects-application";
import { getHookCallback } from "../helpers/hooks";
import { createMockActor, createMockMessage, createMockRoll, createMockWeapon } from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";
const g = () => globalThis as any;

/**
 * The critical chain (strike card → Fitness roll → mitigation) must follow
 * the targeted unlinked token, not the base actor that shares its id.
 */
describe("critical strikes against unlinked tokens", () => {
  let attacker: any;
  let base: any;
  let ronin1: any;
  let ronin2: any;

  beforeEach(() => {
    attacker = createMockActor({ id: "moji", name: "Moji",
      items: [createMockWeapon({ system: { damage: 3, deadliness: 5 } })] });
    base = createMockActor({ id: "ronin", name: "Ronin (base)", type: "npc" });
    ronin1 = createMockActor({ id: "ronin", name: "Ronin 1", type: "npc" });
    ronin2 = createMockActor({ id: "ronin", name: "Ronin 2", type: "npc",
      system: { endurance: 5, fatigue: { value: 9 } } });
    ronin1.uuid = "Scene.s.Token.t1.Actor.ronin";
    ronin2.uuid = "Scene.s.Token.t2.Actor.ronin";
    g().game.actors.push(attacker, base);
    const byUuid: Record<string, any> = { [ronin1.uuid]: ronin1, [ronin2.uuid]: ronin2 };
    g().fromUuidSync = vi.fn((uuid: string) => byUuid[uuid] ?? null);
    vi.mocked(applyCriticalEffect).mockClear();
  });

  it("stores the token's uuid on the critical strike card", async () => {
    const roll = createMockMessage({ id: "roll-1", speaker: { actor: "moji" },
      rolls: [createMockRoll({ totalSuccess: 3 })] });
    await processAttack(roll, attacker, ronin2, roll.rolls[0].l5r5e);

    const card = g().game.messages.at(-1);
    expect(card.getFlag(NS, "criticalStrike")).toMatchObject({
      targetId: ronin2.uuid,
      attackerId: "moji",
    });
  });

  it("applies the mitigated critical to the token that rolled Fitness", async () => {
    const card = createMockMessage({ id: "crit-1", flags: { [NS]: { criticalStrike: {
      targetId: ronin2.uuid, attackerId: "moji", weaponDeadliness: 5, weaponId: null } } } });
    g().game.messages.push(card);
    await ronin2.setFlag(NS, "pendingCriticalMitigation", { weaponDeadliness: 5, criticalMessageId: "crit-1" });

    registerCriticalMitigationHandler();
    const fitness = createMockRoll({ skillId: "martial", difficulty: 1, totalSuccess: 0, stance: "earth" });
    fitness.l5r5e.actor = ronin2;
    await getHookCallback("createChatMessage")(createMockMessage({ speaker: { actor: "ronin" }, rolls: [fitness] }));

    expect(applyCriticalEffect).toHaveBeenCalledWith(ronin2, 5, "earth", null, attacker);
    expect(ronin2.getFlag(NS, "pendingCriticalMitigation")).toBeUndefined();
    expect(base.getFlag).not.toHaveBeenCalledWith(NS, "pendingCriticalMitigation");
    const mitigation = g().game.messages.at(-1);
    expect(mitigation.getFlag(NS, "mitigationResult")).toMatchObject({ targetId: ronin2.uuid });
  });
});
