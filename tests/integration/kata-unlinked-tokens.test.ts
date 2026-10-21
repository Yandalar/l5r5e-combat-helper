import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerKataActivationHandler, applyKataOpportunity } from "../../src/techniques/kata-activation";
import { processExpiredKataEffects } from "../../src/techniques/technique-engine";
import { getHookCallback } from "../helpers/hooks";
import { createMockActor, createMockMessage, createMockRoll, createMockWeapon } from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";
const g = () => globalThis as any;

/**
 * Two unlinked "Ronin" tokens share the base actor's id. Effects applied
 * after the card (opportunity spend) must land on the token that was
 * targeted, and timed effects on token actors must expire.
 */
describe("katas against unlinked tokens", () => {
  let attacker: any;
  let base: any;
  let ronin1: any;
  let ronin2: any;

  beforeEach(() => {
    attacker = createMockActor({ id: "moji", name: "Moji", ownerUserIds: ["p1"], isOwner: false,
      items: [createMockWeapon({ system: { damage: 3 } })] });
    base = createMockActor({ id: "ronin", name: "Ronin (base)" });
    ronin1 = createMockActor({ id: "ronin", name: "Ronin 1" });
    ronin2 = createMockActor({ id: "ronin", name: "Ronin 2" });
    ronin1.uuid = "Scene.s.Token.t1.Actor.ronin";
    ronin2.uuid = "Scene.s.Token.t2.Actor.ronin";
    g().game.actors.push(attacker, base);
    const byUuid: Record<string, any> = { [ronin1.uuid]: ronin1, [ronin2.uuid]: ronin2 };
    g().fromUuidSync = vi.fn((uuid: string) => byUuid[uuid] ?? null);
    g().game.scenes = [{ tokens: [{ actorLink: false, actor: ronin1 }, { actorLink: false, actor: ronin2 }] }];
    g().game.users.push({ id: "p1", name: "Player One", isGM: false, active: true });
    registerKataActivationHandler();
  });

  async function soaringSliceAgainstRonin2(): Promise<any> {
    g().game.user.targets.add({ actor: ronin2 });
    await getHookCallback("createChatMessage")(createMockMessage({
      speaker: { actor: "moji" },
      rolls: [createMockRoll({ totalSuccess: 4, opportunity: 1, item: {
        name: "Soaring Slice", system: { technique_type: "kata" }, _stats: {} } })],
    }));
    return g().game.messages.at(-1);
  }

  it("a player's opportunity spend (relayed to the GM) hits the targeted token, not the base actor", async () => {
    const card = await soaringSliceAgainstRonin2();
    expect(card.getFlag(NS, "kataOpportunityData").targetIds).toEqual([ronin2.uuid]);

    await applyKataOpportunity({ messageId: card.id }, "p1");

    expect(ronin2.getFlag(NS, "pendingTnReduction")).toMatchObject({ amount: 1 });
    expect(ronin1.getFlag(NS, "pendingTnReduction")).toBeUndefined();
    expect(base.getFlag(NS, "pendingTnReduction")).toBeUndefined();
  });

  it("ignores a relayed spend from a user who doesn't own the attacker", async () => {
    const card = await soaringSliceAgainstRonin2();
    g().game.users.push({ id: "p2", isGM: false, active: true });
    await applyKataOpportunity({ messageId: card.id }, "p2");
    expect(ronin2.getFlag(NS, "pendingTnReduction")).toBeUndefined();
    expect(card.getFlag(NS, "kataOpportunityData").used).toBe(false);
  });

  it("expires timed effects on token actors", async () => {
    const card = await soaringSliceAgainstRonin2();
    await applyKataOpportunity({ messageId: card.id }, "gm");
    await processExpiredKataEffects("moji");
    expect(ronin2.getFlag(NS, "pendingTnReduction")).toBeUndefined();
  });

  it("updateCombat on a player's client does nothing", async () => {
    const card = await soaringSliceAgainstRonin2();
    await applyKataOpportunity({ messageId: card.id }, "gm");
    g().game.user = { id: "p1", isGM: false, active: true, targets: new Set() };
    const combat = {
      current: { combatantId: "c1" }, previous: {},
      combatants: { get: (id: string) => (id === "c1" ? { actorId: "moji" } : undefined) },
    };
    await getHookCallback("updateCombat")(combat, { turn: 1 }, {}, "gm");
    expect(ronin2.getFlag(NS, "pendingTnReduction")).toMatchObject({ amount: 1 });
  });
});
