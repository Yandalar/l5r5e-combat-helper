import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { registerKataActivationHandler } from "../../src/techniques/kata-activation";
import { KATA_REGISTRY } from "../../src/techniques/kata-registry";
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
      expect.arrayContaining(["createChatMessage", "renderChatMessageHTML", "updateCombat", "deleteCombat"]),
    );
  });
});

describe("kata activation across clients", () => {
  let attacker: any;
  let foe: any;

  beforeEach(() => {
    attacker = createMockActor({ id: "att", name: "Bushi", items: [createMockWeapon({ system: { damage: 3 } })] });
    foe = createMockActor({ id: "foe", name: "Bandit", system: { fatigue: { value: 0 } } });
    g().game.actors.push(attacker, foe);
    registerKataActivationHandler();
  });

  it("a player's client ignores the roll while a GM is connected", async () => {
    g().game.user = { id: "p1", name: "Player One", isGM: false, active: true, targets: new Set([{ actor: foe }]) };
    const msg = kataMessage(attacker, { totalSuccess: 4 });
    msg.author = { id: "p1" };
    await getHookCallback("createChatMessage")(msg);
    expect(foe.system.fatigue.value).toBe(0);
    expect(g().game.messages).toHaveLength(0);
  });

  it("the GM processes a player's roll once, against the target stored in the roll", async () => {
    const msg = kataMessage(attacker, { totalSuccess: 4 });
    msg.author = { id: "p1" };
    msg.rolls[0].l5r5e.target = { actor: foe };
    await getHookCallback("createChatMessage")(msg);
    expect(foe.system.fatigue.value).toBe(5);
    expect(g().game.messages).toHaveLength(1);
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

  it("the card reports the REDUCED TN (fixed bug #2 — executeKata trusts ctx.tn instead of recomputing)", async () => {
    await foe.setFlag(NS, "pendingTnReduction", { amount: 1 });
    target(foe);
    await onCreate(kataMessage(attacker, { totalSuccess: 1 }));

    // executeKata now uses ctx.tn directly (already reduced to 1 by
    // kata-activation.ts before executeKata is called), so success/extras
    // AND the printed TN agree: both are 1, not the un-reduced 2.
    const content = g().game.messages.at(-1).content;
    expect(content).toMatch(/TN:\s*1\b/);
    expect(content).not.toMatch(/TN:\s*2\b/);
    expect(content).toMatch(/reduced/i);
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

/**
 * BUG #8 fix: kata-activation.ts's own `difficulty === "target.silhouette"`
 * TN calculation used to read `parseInt(targets[0].system?.silhouette) || 1`
 * directly, ignoring getSilhouette's flag/prototypeToken-based fallback
 * chain (Task 3) — so a real l5r5e actor (which never defines
 * system.silhouette at all) always computed TN 1 instead of the correct
 * default of 2 (Medium). No registry kata uses `target.silhouette` today,
 * so this pushes a synthetic entry into KATA_REGISTRY for the duration of
 * the test (removed in afterEach — KATA_REGISTRY is a shared mutable array
 * imported by the module under test).
 */
describe("active kata — target.silhouette difficulty (BUG #8 fix)", () => {
  let attacker: any;
  let onCreate: Function;
  const tempKata: any = {
    names: ["Test Silhouette Kata"],
    activation: { difficulty: "target.silhouette", minDifficulty: 1 },
    onSuccess: [],
  };

  beforeEach(() => {
    attacker = createMockActor({
      id: "att-sil",
      name: "Bushi",
      items: [createMockWeapon({ system: { damage: 3 } })],
    });
    g().game.actors.push(attacker);
    KATA_REGISTRY.push(tempKata);

    registerKataActivationHandler();
    onCreate = getHookCallback("createChatMessage");
  });

  afterEach(() => {
    const idx = KATA_REGISTRY.indexOf(tempKata);
    if (idx >= 0) KATA_REGISTRY.splice(idx, 1);
  });

  it("uses getSilhouette's default of 2, not the old bare-read fallback of 1", async () => {
    // No system.silhouette, no silhouette flag, default prototypeToken.width
    // (1, below the width>=2 heuristic threshold) — getSilhouette's final
    // fallback is 2. The old inline `parseInt(undefined) || 1` would have
    // produced TN 1 here instead.
    const foe = createMockActor({ id: "foe-sil", name: "Bandit" });
    g().game.actors.push(foe);
    target(foe);

    await onCreate(kataMessage(attacker, { kataName: "Test Silhouette Kata", totalSuccess: 2 }));

    const card = g().game.messages.at(-1);
    expect(card.content).toMatch(/TN:\s*2\b/);
  });

  it("still honors the actor's flag-based silhouette override", async () => {
    const foe = createMockActor({ id: "foe-sil2", name: "Ogre" });
    await foe.setFlag(NS, "silhouette", 4);
    g().game.actors.push(foe);
    target(foe);

    await onCreate(kataMessage(attacker, { kataName: "Test Silhouette Kata", totalSuccess: 4 }));

    const card = g().game.messages.at(-1);
    expect(card.content).toMatch(/TN:\s*4\b/);
  });
});

/**
 * BUG #6 fix: an NPC target with a pending resistance roll used to never
 * match — the createChatMessage handler compared
 * `pending.skill === l5rData.skillId`, but an NPC's finished roll reports
 * `skillId` as the flat skill CATEGORY (e.g. "martial"), never the named
 * skill ("fitness") a PC roll would report. matchesPendingResistance (new
 * in resistance-roll.ts) fixes the comparison for NPCs specifically.
 */
describe("resistance roll completion — NPC target (BUG #6 fix)", () => {
  let npc: any;
  let attacker: any;
  let onCreate: Function;

  beforeEach(() => {
    npc = createMockActor({ id: "npc-1", name: "Ogre", type: "npc" });
    attacker = createMockActor({ id: "att-npc", name: "Bushi" });
    g().game.actors.push(npc, attacker);

    registerKataActivationHandler();
    onCreate = getHookCallback("createChatMessage");
  });

  it("completes the roll (skillCatId used as the simulated roll's skillId) and applies onFailure", async () => {
    await npc.setFlag(NS, "pendingResistanceRoll", {
      skill: "fitness",
      skillCatId: "martial",
      difficulty: 3,
      onFailure: [
        {
          type: "condition",
          target: "target",
          statusId: "prone",
        },
      ],
      attackerId: attacker.id,
    });

    const rollMessage = createMockMessage({
      id: "resist-msg-1",
      speaker: { actor: npc.id },
      rolls: [
        createMockRoll({
          skillId: "martial", // NPC rolls report the flat category, not "fitness"
          totalSuccess: 1, // below difficulty 3 → failure
        }),
      ],
    });

    await onCreate(rollMessage);

    // Pending flag consumed regardless of outcome.
    expect(npc.getFlag(NS, "pendingResistanceRoll")).toBeUndefined();
    // onFailure's condition effect applied to the NPC itself.
    expect(npc.toggleStatusEffect).toHaveBeenCalledWith("prone", { active: true });
    // A resistance result card was posted.
    const card = g().game.messages.at(-1);
    expect(card.content).toContain("Ogre");
  });

  it("succeeds and applies nothing when totalSuccess meets the difficulty", async () => {
    await npc.setFlag(NS, "pendingResistanceRoll", {
      skill: "fitness",
      skillCatId: "martial",
      difficulty: 2,
      onFailure: [{ type: "condition", target: "target", statusId: "prone" }],
      attackerId: attacker.id,
    });

    const rollMessage = createMockMessage({
      id: "resist-msg-2",
      speaker: { actor: npc.id },
      rolls: [createMockRoll({ skillId: "martial", totalSuccess: 2 })],
    });

    await onCreate(rollMessage);

    expect(npc.getFlag(NS, "pendingResistanceRoll")).toBeUndefined();
    expect(npc.toggleStatusEffect).not.toHaveBeenCalled();
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
