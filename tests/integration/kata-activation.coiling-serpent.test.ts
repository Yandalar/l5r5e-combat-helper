// @ts-nocheck

import { describe, it, expect, beforeEach } from "vitest";
import { registerKataActivationHandler } from "../../src/techniques/kata-activation";
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
        skillId: opts.skillId ?? "melee",
        stance: opts.stance ?? "earth",
        difficulty: opts.difficulty ?? 2,
        totalSuccess: opts.totalSuccess ?? 0,
        opportunity: opts.opportunity ?? 0,
        item: {
          name: opts.kataName ?? "Coiling Serpent Style",
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
 * Coiling Serpent Style — active kata end to end.
 * - Activation: skill=melee, ring in [earth,air,water,fire,void], difficulty=2
 * - On success: no direct effects (onSuccess: [])
 * - On opportunity: cost=2 → Immobilized condition on target (until_next_turn)
 * - The weapon-lock half of the Kata has no engine support and is only
 *   surfaced as a fixed informational line — not asserted here since it
 *   requires driving the DOM button-click handler, which is not the pattern
 *   used elsewhere in this suite (executeKataOpportunity is driven directly).
 */
describe("Coiling Serpent Style — active kata end to end", () => {
  let attacker: any;
  let npc: any;
  let onCreate: Function;

  beforeEach(() => {
    attacker = createMockActor({
      id: "att-cs",
      name: "Scorpion Bushi",
      system: {
        rings: { earth: 3, air: 2, water: 2, fire: 2, void: 2 },
      },
    });
    npc = createMockActor({
      id: "npc-cs",
      name: "Bandit",
      type: "npc",
      system: {
        fatigue: { value: 0 },
        endurance: { value: 10 },
      },
    });
    g().game.actors.push(attacker, npc);

    registerKataActivationHandler();
    onCreate = getHookCallback("createChatMessage");
  });

  it("on success, posts an activation card and applies nothing directly (onSuccess is empty)", async () => {
    target(npc);

    // TN 2, 2 successes → success
    await onCreate(
      kataMessage(attacker, {
        skillId: "melee",
        stance: "earth",
        difficulty: 2,
        totalSuccess: 2,
      }),
    );

    expect(npc.toggleStatusEffect).not.toHaveBeenCalled();

    const card = g().game.messages.at(-1);
    expect(card.content).toContain("Coiling Serpent Style");
  });

  it("on failure, applies nothing and posts a failure card", async () => {
    target(npc);

    // TN 2, only 1 success → failure
    await onCreate(
      kataMessage(attacker, {
        skillId: "melee",
        stance: "earth",
        difficulty: 2,
        totalSuccess: 1,
      }),
    );

    expect(npc.toggleStatusEffect).not.toHaveBeenCalled();
    const card = g().game.messages.at(-1);
    expect(card.content).toContain("Failed");
  });

  it("attaches kataOpportunityData when opportunities are available", async () => {
    target(npc);

    await onCreate(
      kataMessage(attacker, {
        skillId: "melee",
        stance: "earth",
        difficulty: 2,
        totalSuccess: 2,
        opportunity: 2,
      }),
    );

    const card = g().game.messages.at(-1);
    expect(card.getFlag(NS, "kataOpportunityData")).toMatchObject({
      kataName: "Coiling Serpent Style",
      attackerId: "att-cs",
      targetIds: ["npc-cs"],
      used: false,
    });
  });

  it("omits the opportunity flag when there are fewer opportunities than the cost (2)", async () => {
    target(npc);

    await onCreate(
      kataMessage(attacker, {
        skillId: "melee",
        stance: "earth",
        difficulty: 2,
        totalSuccess: 2,
        opportunity: 1,
      }),
    );

    expect(g().game.messages.at(-1).getFlag(NS, "kataOpportunityData")).toBeUndefined();
  });

  it("omits the opportunity flag when no opportunities are available", async () => {
    target(npc);

    await onCreate(
      kataMessage(attacker, {
        skillId: "melee",
        stance: "earth",
        difficulty: 2,
        totalSuccess: 2,
        opportunity: 0,
      }),
    );

    expect(g().game.messages.at(-1).getFlag(NS, "kataOpportunityData")).toBeUndefined();
  });
});

/**
 * Opportunity spend → Immobilized applied to the real target state.
 * Mirrors the fixed pattern from kata-activation.lord-hidas-grip.test.ts:
 * builds the ctx exactly as handleOpportunityButtonClick would (see
 * kata-activation.ts:420-434) and drives executeKataOpportunity directly,
 * then asserts on the actor's real `statuses` Set — not just that a flag
 * was written.
 */
describe("Coiling Serpent Style — opportunity spend → Immobilized (real target state)", () => {
  let npc: any;
  let attacker: any;

  beforeEach(() => {
    npc = createMockActor({
      id: "npc-cs-opp",
      name: "Bandit",
      type: "npc",
      system: {
        fatigue: { value: 0 },
        endurance: { value: 10 },
      },
    });
    attacker = createMockActor({
      id: "att-cs-opp",
      name: "Scorpion Bushi",
      system: { rings: { earth: 3 } },
    });
    g().game.actors.push(npc, attacker);

    registerKataActivationHandler();
  });

  it("spends the opportunity and applies the Immobilized condition to the target", async () => {
    expect(npc.statuses.has("immobilized")).toBe(false);

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
      sourceMessageId: "msg-opp-cs",
      l5rData: null,
    };

    await executeKataOpportunity("Coiling Serpent Style", ctx, 0);

    // Real resulting state — not just that toggleStatusEffect was called,
    // but that the target's statuses Set actually reflects it.
    expect(npc.toggleStatusEffect).toHaveBeenCalledWith("immobilized", {
      active: true,
    });
    expect(npc.statuses.has("immobilized")).toBe(true);

    // "until_next_turn" duration is tracked for later expiry.
    const activeEffects = npc.getFlag(NS, "activeKataEffects");
    expect(activeEffects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statusId: "immobilized",
          type: "condition",
          expiresAfterCombatant: attacker.id,
        }),
      ]),
    );
  });
});
