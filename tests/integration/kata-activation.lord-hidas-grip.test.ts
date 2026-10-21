// @ts-nocheck

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { registerKataActivationHandler } from "../../src/techniques/kata-activation";
import { KATA_REGISTRY } from "../../src/techniques/kata-registry";
import { executeKataOpportunity } from "../../src/techniques/technique-engine";
import { getHookCallback } from "../helpers/hooks";
import {
  createMockActor,
  createMockMessage,
  createMockRoll,
} from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";

function g(): any {
  return globalThis as any;
}

/**
 * Builds a finished kata roll message spoken by `actor`.
 */
function kataMessage(actor: any, opts: Partial<Record<string, any>> = {}): any {
  return createMockMessage({
    id: opts.id ?? "msg-1",
    speaker: { actor: actor.id },
    rolls: [
      createMockRoll({
        skillId: opts.skillId ?? "fitness",
        stance: opts.stance ?? "void",
        difficulty: opts.difficulty ?? 3,
        totalSuccess: opts.totalSuccess ?? 0,
        opportunity: opts.opportunity ?? 0,
        item: {
          name: opts.kataName ?? "Lord Hida's Grip",
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

/**
 * Characterization — Lord Hida's Grip end-to-end:
 * - Activation: skill=fitness, ring=void, difficulty=target.silhouette (minDifficulty 1)
 * - On success: immobilized + assistance
 * - On opportunity: void cost=1 → resistance roll with onFailure effects
 */
describe("Lord Hida's Grip — active kata end to end", () => {
  let attacker: any;
  let npc: any;
  let onCreate: Function;

  beforeEach(() => {
    attacker = createMockActor({
      id: "att",
      name: "Hida Bushi",
      system: {
        rings: { void: 3 },
        schools: { rank: 2 },
      },
    });
    // NPC target with silhouette 3, high enough for the kata's minTargetSilhouette check
    npc = createMockActor({
      id: "npc",
      name: "Ogre",
      type: "npc",
      system: {
        fatigue: { value: 0 },
        endurance: { value: 20 },
      },
    });
    // Set silhouette via flag (as per getSilhouette's logic)
    g().game.actors.push(attacker, npc);

    registerKataActivationHandler();
    onCreate = getHookCallback("createChatMessage");
  });

  it("on success, applies Immobilized + Assistance to target", async () => {
    await npc.setFlag(NS, "silhouette", 3);
    target(npc);

    // TN 3 (target silhouette), 3 successes → success
    await onCreate(
      kataMessage(attacker, {
        skillId: "fitness",
        difficulty: 3,
        totalSuccess: 3,
      }),
    );

    // Immobilized condition applied
    expect(npc.toggleStatusEffect).toHaveBeenCalledWith("immobilized", {
      active: true,
    });

    // Success card posted
    const card = g().game.messages.at(-1);
    expect(card.content).toContain("Lord Hida's Grip");
    expect(card.content).toContain("Assistance");
  });

  it("on failure, applies nothing", async () => {
    await npc.setFlag(NS, "silhouette", 3);
    target(npc);

    // TN 3, only 1 success → failure
    await onCreate(
      kataMessage(attacker, {
        skillId: "fitness",
        difficulty: 3,
        totalSuccess: 1,
      }),
    );

    expect(npc.toggleStatusEffect).not.toHaveBeenCalled();
    expect(g().game.messages).toHaveLength(1);
  });

  it("attaches kataOpportunityData when opportunities are available", async () => {
    await npc.setFlag(NS, "silhouette", 3);
    target(npc);

    await onCreate(
      kataMessage(attacker, {
        skillId: "fitness",
        difficulty: 3,
        totalSuccess: 3,
        opportunity: 1,
      }),
    );

    const card = g().game.messages.at(-1);
    expect(card.getFlag(NS, "kataOpportunityData")).toMatchObject({
      kataName: "Lord Hida's Grip",
      attackerId: "att",
      targetIds: ["npc"],
      used: false,
    });
  });

  it("omits the opportunity flag when no opportunities are available", async () => {
    await npc.setFlag(NS, "silhouette", 3);
    target(npc);

    await onCreate(
      kataMessage(attacker, {
        skillId: "fitness",
        difficulty: 3,
        totalSuccess: 3,
        opportunity: 0,
      }),
    );

    expect(g().game.messages.at(-1).getFlag(NS, "kataOpportunityData")).toBeUndefined();
  });
});

/**
 * BUG #6 fix verification for Lord Hida's Grip:
 * When the Void opportunity is spent, executeKataOpportunity → scheduleResistanceRolls
 * must resolve skillCatId = SKILL_CATEGORY_MAP["fitness"] = "martial", NOT fall back
 * to the raw skill name. This test drives the full path, not seeding the flag manually.
 */
describe("Lord Hida's Grip — opportunity spend → resistance roll (BUG #6 fix)", () => {
  let npc: any;
  let attacker: any;

  beforeEach(() => {
    npc = createMockActor({
      id: "npc-grip",
      name: "Ogre",
      type: "npc",
      system: {
        fatigue: { value: 0 },
        endurance: { value: 20 },
      },
    });
    attacker = createMockActor({
      id: "att-grip",
      name: "Hida",
      system: { identity: { school_rank: 2 } },
    });
    g().game.actors.push(npc, attacker);

    registerKataActivationHandler();
  });

  it("spends the Void opportunity and schedules a resistance roll with correct skillCatId", async () => {
    // Set silhouette on NPC for the resistance roll difficulty formula
    await npc.setFlag(NS, "silhouette", 3);

    // Build the context as handleOpportunityButtonClick would (see kata-activation.ts:420-434)
    const ctx = {
      attacker,
      targets: [npc],
      extraSuccesses: 0,
      opportunitiesSpent: 0,
      tn: 0,
      totalSuccess: 0,
      weapon: null,
      resistance: null,
      kata: null,
      chosenCondition: null,
      sourceMessageId: "msg-opp",
      l5rData: null,
    };

    // Call executeKataOpportunity to actually drive scheduleResistanceRolls
    await executeKataOpportunity("Lord Hida's Grip", ctx, 0);

    // The pending flag should be set with skillCatId resolved via SKILL_CATEGORY_MAP
    const pending = npc.getFlag(NS, "pendingResistanceRoll");
    expect(pending).toBeDefined();
    expect(pending.skill).toBe("fitness");
    expect(pending.skillCatId).toBe("martial"); // SKILL_CATEGORY_MAP["fitness"]
    expect(pending.difficulty).toBe(2); // attacker_school_rank formula: rank 2

    // A resistance roll request card should have been created
    const lastMsg = g().game.messages.at(-1);
    expect(lastMsg.content).toContain("Roll Resistance");
    expect(lastMsg.content).toContain("Ogre");
  });
});

/**
 * Resistance roll completion — onFailure damage + condition verification.
 * Tests that when an NPC target fails a resistance roll spawned by the opportunity,
 * both the damage (target_silhouette, ignoresArmor) and the condition are applied.
 */
describe("Lord Hida's Grip — resistance roll completion with onFailure", () => {
  let npc: any;
  let attacker: any;
  let onCreate: Function;

  beforeEach(() => {
    npc = createMockActor({
      id: "npc-resist",
      name: "Ogre",
      type: "npc",
      system: {
        fatigue: { value: 0 },
        endurance: { value: 20 },
      },
    });
    attacker = createMockActor({
      id: "att-resist",
      name: "Hida",
      system: { identity: { school_rank: 2 } },
    });
    g().game.actors.push(npc, attacker);

    registerKataActivationHandler();
    onCreate = getHookCallback("createChatMessage");
  });

  it("applies damage (target_silhouette, ignoresArmor) and Prone condition when NPC fails", async () => {
    // Set silhouette explicitly so we can verify damage = silhouette
    await npc.setFlag(NS, "silhouette", 3);

    // Manually set the pending resistance roll (as if executeKataOpportunity just ran)
    await npc.setFlag(NS, "pendingResistanceRoll", {
      skill: "fitness",
      skillCatId: "martial",
      difficulty: 2,
      onFailure: [
        {
          type: "damage",
          target: "target",
          formula: { source: "target_silhouette" },
          ignoresArmor: true,
        },
        {
          type: "condition",
          target: "target",
          statusId: "prone",
          duration: "immediate",
        },
      ],
      attackerId: attacker.id,
    });

    const rollMessage = createMockMessage({
      id: "resist-msg-fail",
      speaker: { actor: npc.id },
      rolls: [
        createMockRoll({
          skillId: "martial", // NPC rolls report the category
          totalSuccess: 1, // below difficulty 2 → failure
        }),
      ],
    });

    await onCreate(rollMessage);

    // Pending flag consumed
    expect(npc.getFlag(NS, "pendingResistanceRoll")).toBeUndefined();

    // Prone condition applied
    expect(npc.toggleStatusEffect).toHaveBeenCalledWith("prone", { active: true });

    // Damage applied: silhouette 3, ignoresArmor, so fatigue increases by exactly 3
    expect(npc.system.fatigue.value).toBe(3);

    // Resistance result card was posted
    const card = g().game.messages.at(-1);
    expect(card.content).toContain("Ogre");
  });

  it("applies nothing when NPC succeeds at the resistance roll", async () => {
    await npc.setFlag(NS, "silhouette", 3);
    await npc.setFlag(NS, "pendingResistanceRoll", {
      skill: "fitness",
      skillCatId: "martial",
      difficulty: 1,
      onFailure: [
        {
          type: "damage",
          target: "target",
          formula: { source: "target_silhouette" },
          ignoresArmor: true,
        },
        {
          type: "condition",
          target: "target",
          statusId: "prone",
          duration: "immediate",
        },
      ],
      attackerId: attacker.id,
    });

    const rollMessage = createMockMessage({
      id: "resist-msg-success",
      speaker: { actor: npc.id },
      rolls: [
        createMockRoll({
          skillId: "martial",
          totalSuccess: 1, // meets difficulty 1 → success
        }),
      ],
    });

    await onCreate(rollMessage);

    expect(npc.getFlag(NS, "pendingResistanceRoll")).toBeUndefined();
    expect(npc.toggleStatusEffect).not.toHaveBeenCalled();
    // Fatigue unchanged
    expect(npc.system.fatigue.value).toBe(0);
  });
});

/**
 * Silhouette-based difficulty verification:
 * Ensures that `difficulty: "target.silhouette"` correctly uses getSilhouette
 * and respects minTargetSilhouette constraint.
 */
describe("Lord Hida's Grip — target.silhouette difficulty", () => {
  let attacker: any;
  let onCreate: Function;

  beforeEach(() => {
    attacker = createMockActor({
      id: "att-sil",
      name: "Hida",
      system: { rings: { void: 3 } },
    });
    g().game.actors.push(attacker);

    registerKataActivationHandler();
    onCreate = getHookCallback("createChatMessage");
  });

  it("refuses a target below minTargetSilhouette (default silhouette 2) and applies nothing", async () => {
    const foe = createMockActor({
      id: "foe-sil",
      name: "Small Enemy",
      system: { fatigue: { value: 0 } },
    });
    // Default prototypeToken.width = 1 (from createMockActor), which triggers
    // getSilhouette's fallback to 2 (Medium) — below the kata's minimum of 3
    g().game.actors.push(foe);
    target(foe);

    await onCreate(
      kataMessage(attacker, {
        skillId: "fitness",
        difficulty: 2,
        totalSuccess: 2,
      }),
    );

    expect(g().game.messages).toHaveLength(0);
    expect(foe.statuses.has("immobilized")).toBe(false);
    expect(g().ui.notifications.warn).toHaveBeenCalledWith(
      expect.stringContaining("Small Enemy"),
    );
  });

  it("respects silhouette flag override (silhouette 4)", async () => {
    const ogre = createMockActor({
      id: "foe-sil-og",
      name: "Ogre",
      system: { fatigue: { value: 0 } },
    });
    await ogre.setFlag(NS, "silhouette", 4);
    g().game.actors.push(ogre);
    target(ogre);

    // With TN 4 (silhouette override), 4 successes → success
    await onCreate(
      kataMessage(attacker, {
        skillId: "fitness",
        difficulty: 4,
        totalSuccess: 4,
      }),
    );

    const card = g().game.messages.at(-1);
    expect(card.content).toMatch(/TN:\s*4\b/);
  });
});
