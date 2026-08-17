import { describe, it, expect, beforeEach } from "vitest";
import { registerKataActivationHandler } from "../../src/techniques/kata-activation";
import { getHookCallback, getRegisteredHookEvents } from "../helpers/hooks";
import {
  createMockActor,
  createMockMessage,
  createMockRoll,
  createMockWeapon,
} from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";

/**
 * CHARACTERIZATION — the full active-kata path, driven through the real
 * `createChatMessage` hook. Soaring Slice is the only registry entry today.
 *
 * Note: the handler wraps its body in a blanket try/catch, so an exception
 * surfaces as a console.error, which the setup policy turns into a failure.
 */

function g(): any {
  return globalThis as any;
}

/** Builds a finished kata roll message spoken by `actor`. */
function kataMessage(actor: any, opts: Partial<Record<string, any>> = {}): any {
  return createMockMessage({
    id: opts.id ?? "msg-1",
    speaker: { actor: actor.id },
    rolls: [
      createMockRoll({
        skillId: opts.skillId ?? "melee",
        stance: opts.stance ?? "fire",
        difficulty: opts.difficulty ?? 2,
        totalSuccess: opts.totalSuccess ?? 0,
        opportunity: opts.opportunity ?? 0,
        item: {
          name: opts.kataName ?? "Soaring Slice",
          system: { technique_type: "kata" },
          _stats: { compendiumSource: opts.compendiumSource ?? null },
        },
      }),
    ],
  });
}

function target(actor: any): void {
  g().game.user.targets.add({ actor });
}

describe("registerKataActivationHandler", () => {
  it("registers exactly the four expected hooks", () => {
    registerKataActivationHandler();
    const events = getRegisteredHookEvents();
    expect(events).toEqual(
      expect.arrayContaining(["createChatMessage", "renderChatMessage", "updateCombat", "deleteCombat"]),
    );
  });
});

describe("Soaring Slice — active kata end to end", () => {
  let attacker: any;
  let foe: any;
  let onCreate: Function;

  beforeEach(() => {
    attacker = createMockActor({
      id: "att",
      name: "Bushi",
      items: [createMockWeapon({ system: { damage: 3 } })],
    });
    foe = createMockActor({ id: "foe", name: "Bandit", system: { fatigue: { value: 0 } } });
    g().game.actors.push(attacker, foe);

    registerKataActivationHandler();
    onCreate = getHookCallback("createChatMessage");
  });

  it("on success, deals weapon base + extra successes and posts a success card", async () => {
    target(foe);
    // TN 2 (Soaring Slice), 4 successes → 2 extra → damage 3 + 2 = 5
    await onCreate(kataMessage(attacker, { totalSuccess: 4 }));

    expect(foe.system.fatigue.value).toBe(5);
    const card = g().game.messages.at(-1);
    expect(card.content).toContain("Soaring Slice");
  });

  it("on failure, applies nothing and posts a failure card", async () => {
    target(foe);
    await onCreate(kataMessage(attacker, { totalSuccess: 1 }));

    expect(foe.system.fatigue.value).toBe(0);
    expect(foe.update).not.toHaveBeenCalled();
    expect(g().game.messages).toHaveLength(1);
  });

  it("subtracts the target's armor from kata damage", async () => {
    foe.items.push(
      createMockActor().items && ({ id: "arm", type: "armor", system: { equipped: true, armor: { physical: 2 } } } as any),
    );
    target(foe);
    await onCreate(kataMessage(attacker, { totalSuccess: 4 }));
    expect(foe.system.fatigue.value).toBe(3); // 5 - 2
  });

  it("attaches kataOpportunityData when the roll produced opportunities", async () => {
    target(foe);
    await onCreate(kataMessage(attacker, { totalSuccess: 4, opportunity: 2 }));

    const card = g().game.messages.at(-1);
    expect(card.getFlag(NS, "kataOpportunityData")).toMatchObject({
      kataName: "Soaring Slice",
      attackerId: "att",
      targetIds: ["foe"],
      used: false,
    });
  });

  it("omits the opportunity flag when the roll produced none", async () => {
    target(foe);
    await onCreate(kataMessage(attacker, { totalSuccess: 4, opportunity: 0 }));
    expect(g().game.messages.at(-1).getFlag(NS, "kataOpportunityData")).toBeUndefined();
  });

  it("consumes the target's pendingTnReduction, lowering the effective TN", async () => {
    await foe.setFlag(NS, "pendingTnReduction", { amount: 1, expiresAfterCombatant: "att" });
    target(foe);

    // TN 2 - 1 = 1. With 1 success the kata now succeeds and gets 0 extras.
    await onCreate(kataMessage(attacker, { totalSuccess: 1 }));

    expect(foe.getFlag(NS, "pendingTnReduction")).toBeUndefined();
    expect(foe.system.fatigue.value).toBe(3); // weapon base only
  });

  it("BUG #2: the card still reports the un-reduced TN", async () => {
    await foe.setFlag(NS, "pendingTnReduction", { amount: 1 });
    target(foe);
    await onCreate(kataMessage(attacker, { totalSuccess: 1 }));

    // executeKata recomputes tn from the definition and never sees the
    // reduction, so success/extras used TN 1 while the card prints TN 2.
    expect(g().game.messages.at(-1).content).toMatch(/\b2\b/);
  });

  it("applies damage to every selected target, not just the first", async () => {
    const second = createMockActor({ id: "foe2", name: "Bandit B", system: { fatigue: { value: 0 } } });
    g().game.actors.push(second);
    target(foe);
    target(second);

    await onCreate(kataMessage(attacker, { totalSuccess: 4 }));

    expect(foe.system.fatigue.value).toBe(5);
    expect(second.system.fatigue.value).toBe(5);
  });
});

describe("active-path early returns", () => {
  let attacker: any;
  let onCreate: Function;

  beforeEach(() => {
    attacker = createMockActor({ id: "att", items: [createMockWeapon({ system: { damage: 3 } })] });
    g().game.actors.push(attacker);
    registerKataActivationHandler();
    onCreate = getHookCallback("createChatMessage");
  });

  it("ignores messages with no rolls", async () => {
    await onCreate(createMockMessage({ speaker: { actor: "att" } }));
    expect(g().game.messages).toHaveLength(0);
  });

  it("ignores rolls that are not finished (rnkEnded !== true)", async () => {
    const msg = kataMessage(attacker, { totalSuccess: 4 });
    msg.rolls[0].l5r5e.rnkEnded = false;
    await onCreate(msg);
    expect(g().game.messages).toHaveLength(0);
  });

  it("ignores a kata that is not in the registry", async () => {
    await onCreate(kataMessage(attacker, { kataName: "Totally Unknown Kata", totalSuccess: 5 }));
    expect(g().game.messages).toHaveLength(0);
  });

  it("ignores non-kata rolls on the active path", async () => {
    const msg = createMockMessage({
      speaker: { actor: "att" },
      rolls: [createMockRoll({ skillId: "melee", totalSuccess: 3, item: null })],
    });
    await onCreate(msg);
    expect(g().game.messages).toHaveLength(0);
  });

  it("does nothing when the module master switch is off", async () => {
    g().game.settings.get = () => false;
    await onCreate(kataMessage(attacker, { totalSuccess: 4 }));
    expect(g().game.messages).toHaveLength(0);
  });

  it("ignores a message whose speaker is not a known actor", async () => {
    const msg = kataMessage(attacker, { totalSuccess: 4 });
    msg.speaker = { actor: "ghost" };
    await onCreate(msg);
    expect(g().game.messages).toHaveLength(0);
  });

  it("runs with no targets selected (Soaring Slice has a fixed TN)", async () => {
    await onCreate(kataMessage(attacker, { totalSuccess: 4 }));
    expect(g().game.messages).toHaveLength(1);
  });
});
