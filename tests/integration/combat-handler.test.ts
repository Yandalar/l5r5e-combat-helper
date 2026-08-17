import { describe, it, expect, beforeEach } from "vitest";
import { registerCombatHandler, processAttack } from "../../src/combat-handler";
import { getHookCallback } from "../helpers/hooks";
import {
  createMockActor,
  createMockItem,
  createMockMessage,
  createMockRoll,
  createMockWeapon,
} from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";

/**
 * CHARACTERIZATION — the normal attack pipeline.
 *
 * This is the regression net for the highest-risk part of the Fase 0 refactor:
 * extracting the duplicated fatigue-write logic into applyFatigue(). Assertions
 * deliberately check the exact `update()` payload, not just the resulting
 * number, so a path change is visible.
 */

function g(): any {
  return globalThis as any;
}

function attackMessage(actor: any, opts: Record<string, any> = {}): any {
  return createMockMessage({
    id: opts.id ?? "roll-1",
    speaker: { actor: actor.id },
    rolls: [
      createMockRoll({
        skillId: opts.skillId ?? "melee",
        stance: opts.stance ?? "void",
        difficulty: opts.difficulty ?? 2,
        totalSuccess: opts.totalSuccess ?? 3,
        opportunity: opts.opportunity ?? 0,
        strife: opts.strife ?? 0,
        item: opts.item ?? null,
      }),
    ],
  });
}

describe("processAttack — damage pipeline", () => {
  let attacker: any;
  let target: any;
  let msg: any;

  beforeEach(() => {
    attacker = createMockActor({
      id: "att",
      name: "Bushi",
      items: [createMockWeapon({ system: { damage: 4, deadliness: 5 } })],
    });
    target = createMockActor({
      id: "tgt",
      name: "Bandit",
      system: { endurance: 10, fatigue: { value: 0 } },
    });
    g().game.actors.push(attacker, target);
    msg = attackMessage(attacker);
  });

  it("writes fatigue through system.fatigue.value with the exact payload", async () => {
    await processAttack(msg, attacker, target, msg.rolls[0].l5r5e);
    // 4 base + (3 successes - TN 2) = 5
    expect(target.update).toHaveBeenCalledWith({ "system.fatigue.value": 5 });
    expect(target.system.fatigue.value).toBe(5);
  });

  it("adds to existing fatigue rather than replacing it", async () => {
    target.system.fatigue.value = 2;
    await processAttack(msg, attacker, target, msg.rolls[0].l5r5e);
    expect(target.system.fatigue.value).toBe(7);
  });

  it("subtracts armor resistance", async () => {
    target.items.push(
      createMockItem({ type: "armor", system: { equipped: true, armor: { physical: 3 } } }),
    );
    await processAttack(msg, attacker, target, msg.rolls[0].l5r5e);
    expect(target.system.fatigue.value).toBe(2); // 5 - 3
  });

  it("posts an armor-blocked message and writes nothing when armor absorbs everything", async () => {
    target.items.push(
      createMockItem({ type: "armor", system: { equipped: true, armor: { physical: 99 } } }),
    );
    await processAttack(msg, attacker, target, msg.rolls[0].l5r5e);
    expect(target.update).not.toHaveBeenCalled();
    expect(g().game.messages).toHaveLength(1);
  });

  it("stores attackData on the roll message", async () => {
    await processAttack(msg, attacker, target, msg.rolls[0].l5r5e);
    expect(msg.getFlag(NS, "attackData")).toMatchObject({
      attackerId: "att",
      targetId: "tgt",
      rawDamage: 5,
      armorResistance: 0,
      finalDamage: 5,
      resolved: false,
      rollMessageId: "roll-1",
    });
  });

  it("adds the Fire-stance strife bonus to damage", async () => {
    attacker.system.stance = "fire";
    const fireMsg = attackMessage(attacker, { strife: 2 });
    await processAttack(fireMsg, attacker, target, fireMsg.rolls[0].l5r5e);
    expect(target.system.fatigue.value).toBe(7); // 5 + 2
  });

  it("does nothing on a missed attack", async () => {
    const miss = attackMessage(attacker, { totalSuccess: 1 });
    await processAttack(miss, attacker, target, miss.rolls[0].l5r5e);
    expect(target.update).not.toHaveBeenCalled();
  });

  it("flags assistance from an active kata effect", async () => {
    await target.setFlag(NS, "activeKataEffects", [
      { type: "assistance", statusId: null, expiresAfterCombatant: "x" },
    ]);
    await processAttack(msg, attacker, target, msg.rolls[0].l5r5e);
    expect(msg.getFlag(NS, "attackData").hasAssistance).toBe(true);
  });
});

describe("processAttack — Air stance", () => {
  it("raises the TN so a marginal hit becomes a deflect", async () => {
    const attacker = createMockActor({ id: "att", items: [createMockWeapon({ system: { damage: 4 } })] });
    const target = createMockActor({
      id: "tgt",
      system: { stance: "air", identity: { school_rank: 1 }, endurance: 10, fatigue: { value: 0 } },
    });
    g().game.actors.push(attacker, target);

    // 2 successes vs TN 2 would hit, but Air adds +1
    const msg = attackMessage(attacker, { totalSuccess: 2 });
    await processAttack(msg, attacker, target, msg.rolls[0].l5r5e);

    expect(target.update).not.toHaveBeenCalled();
    expect(g().game.messages).toHaveLength(1); // the deflect card
  });
});

describe("processAttack — target already at critical state", () => {
  it("posts a critical strike prompt and applies no fatigue", async () => {
    const attacker = createMockActor({
      id: "att",
      items: [createMockWeapon({ system: { damage: 4, deadliness: 5 } })],
    });
    const target = createMockActor({
      id: "tgt",
      system: { endurance: 2, fatigue: { value: 5 } }, // over endurance
    });
    g().game.actors.push(attacker, target);
    const msg = attackMessage(attacker);

    await processAttack(msg, attacker, target, msg.rolls[0].l5r5e);

    expect(target.update).not.toHaveBeenCalled();
    const card = g().game.messages.at(-1);
    expect(card.getFlag(NS, "criticalStrike")).toMatchObject({
      targetId: "tgt",
      attackerId: "att",
      weaponDeadliness: 5,
    });
  });

  it("BUG #7: a deadliness-0 weapon yields severity 0 here, but 5 on the Void path", async () => {
    // template.json defaults weapon deadliness to 0, and this path lacks the
    // `|| 5` guard that createVoidCriticalStrikeMessage has.
    const attacker = createMockActor({ id: "att", items: [createMockWeapon({ system: { damage: 4 } })] });
    const target = createMockActor({ id: "tgt", system: { endurance: 1, fatigue: { value: 5 } } });
    g().game.actors.push(attacker, target);
    const msg = attackMessage(attacker);

    await processAttack(msg, attacker, target, msg.rolls[0].l5r5e);
    expect(g().game.messages.at(-1).getFlag(NS, "criticalStrike").weaponDeadliness).toBe(0);
  });
});

describe("processAttack — TN reduction", () => {
  it("consumes pendingTnReduction and records it when it decided the hit", async () => {
    const attacker = createMockActor({ id: "att", items: [createMockWeapon({ system: { damage: 4 } })] });
    const target = createMockActor({
      id: "tgt",
      system: { endurance: 10, fatigue: { value: 0 } },
    });
    await target.setFlag(NS, "pendingTnReduction", { amount: 1, expiresAfterCombatant: "x" });
    g().game.actors.push(attacker, target);

    // 1 success vs TN 2 misses, but the -1 reduction makes it a hit
    const msg = attackMessage(attacker, { totalSuccess: 1 });
    await processAttack(msg, attacker, target, msg.rolls[0].l5r5e);

    expect(target.getFlag(NS, "pendingTnReduction")).toBeUndefined();
    expect(msg.getFlag(NS, "attackData").tnReductionApplied).toMatchObject({
      amount: 1,
      originalTn: 2,
      effectiveTn: 1,
    });
  });
});

describe("registerCombatHandler — hook routing", () => {
  let attacker: any;
  let target: any;
  let onCreate: Function;

  beforeEach(() => {
    attacker = createMockActor({ id: "att", items: [createMockWeapon({ system: { damage: 4 } })] });
    target = createMockActor({ id: "tgt", system: { endurance: 10, fatigue: { value: 0 } } });
    g().game.actors.push(attacker, target);
    registerCombatHandler();
    onCreate = getHookCallback("createChatMessage");
  });

  it("processes every selected target (multi-target fix)", async () => {
    const second = createMockActor({ id: "tgt2", system: { endurance: 10, fatigue: { value: 0 } } });
    g().game.actors.push(second);
    g().game.user.targets.add({ actor: target });
    g().game.user.targets.add({ actor: second });

    await onCreate(attackMessage(attacker));

    expect(target.system.fatigue.value).toBe(5);
    expect(second.system.fatigue.value).toBe(5);
  });

  it("warns and flags pendingTarget when nothing is targeted", async () => {
    const msg = attackMessage(attacker);
    await onCreate(msg);
    expect(msg.getFlag(NS, "pendingTarget")).toEqual({ attackerId: "att" });
    expect(g().ui.notifications.warn).toHaveBeenCalled();
  });

  it("skips kata activations so the kata engine owns them", async () => {
    g().game.user.targets.add({ actor: target });
    const msg = attackMessage(attacker, {
      item: { name: "Soaring Slice", system: { technique_type: "kata" }, _stats: {} },
    });
    await onCreate(msg);
    expect(target.update).not.toHaveBeenCalled();
  });

  it("ignores non-attack skills", async () => {
    g().game.user.targets.add({ actor: target });
    await onCreate(attackMessage(attacker, { skillId: "courtesy" }));
    expect(target.update).not.toHaveBeenCalled();
  });

  it("ignores unfinished rolls", async () => {
    g().game.user.targets.add({ actor: target });
    const msg = attackMessage(attacker);
    msg.rolls[0].l5r5e.rnkEnded = false;
    await onCreate(msg);
    expect(target.update).not.toHaveBeenCalled();
  });
});
