// @ts-nocheck

import { describe, it, expect, beforeEach } from "vitest";
import { registerKataActivationHandler } from "../../src/techniques/kata-activation";
import { PASSIVE_KATA_REGISTRY } from "../../src/techniques/kata-registry";
import {
  applyPassiveKataOpportunity,
  processExpiredKataEffects,
  processEndOfTurnKataEffects,
} from "../../src/techniques/technique-engine";
import { getArmorResistance } from "../../src/core/damage-calculator";
import { getHookCallback } from "../helpers/hooks";
import {
  createMockActor,
  createMockItem,
  createMockMessage,
  createMockRoll,
} from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";

function g(): any {
  return globalThis as any;
}

function target(actor: any): void {
  g().game.user.targets.add({ actor });
}

/**
 * Builds a finished, non-kata martial roll in Water stance, spoken by
 * `actor` — the real trigger for a passive kata (kata-activation.ts's
 * "else" branch, since `item` is null so `isKataActivation` is false).
 */
function waterRollMessage(actor: any, opts: Partial<Record<string, any>> = {}): any {
  return createMockMessage({
    id: opts.id ?? "roll-msg-1",
    speaker: { actor: actor.id },
    rolls: [
      createMockRoll({
        skillId: opts.skillId ?? "melee",
        stance: "water",
        totalSuccess: opts.totalSuccess ?? 3,
        opportunity: opts.opportunity ?? 2,
        item: null,
      }),
    ],
  });
}

/**
 * Striking as Water — passive kata end to end.
 *
 * Mirrors the shape of the Soaring Slice / Lord Hida's Grip active-kata
 * tests (kata-activation.active.test.ts, kata-activation.lord-hidas-grip.
 * test.ts): drive the real `createChatMessage` hook to produce the passive
 * opportunity card, then drive the real spend via `applyPassiveKataOpportunity`
 * — the exported function `handlePassiveKataButtonClick` (kata-activation.ts,
 * not itself exported/DOM-clickable in this Node test environment) calls
 * with exactly these arguments once a "spend N" button is clicked. Neither
 * step hand-seeds a flag the production code is responsible for setting.
 *
 * Also exercises the TASK 8 fix in technique-engine.ts's
 * applyResistanceBuffEffect: previously the opportunitiesSpent branch
 * returned `ctx.opportunitiesSpent` verbatim, discarding `effect.amount`'s
 * sign — a negative buff (amount: -1) would have come out positive instead
 * of more negative when scaled by opportunities spent.
 */
describe("Striking as Water — passive kata end to end", () => {
  let attacker: any;
  let foe: any;
  let onCreate: Function;

  beforeEach(() => {
    attacker = createMockActor({
      id: "att-water",
      name: "Water Bushi",
      items: [createMockItem({ id: "kata-item", name: "Striking as Water", type: "feature" })],
    });
    foe = createMockActor({
      id: "foe-water",
      name: "Target",
      system: { fatigue: { value: 0 } },
      items: [
        createMockItem({
          id: "armor-1",
          name: "Light Armor",
          type: "armor",
          system: { equipped: true, armor: { physical: 3 } },
        }),
      ],
    });
    g().game.actors.push(attacker, foe);

    registerKataActivationHandler();
    onCreate = getHookCallback("createChatMessage");
  });

  it("triggers the passive opportunity card on a melee roll in Water stance with opportunities available", async () => {
    target(foe);
    await onCreate(waterRollMessage(attacker, { opportunity: 2 }));

    const card = g().game.messages.at(-1);
    expect(card.getFlag(NS, "passiveKataData")).toMatchObject({
      kataName: "Striking as Water",
      attackerId: "att-water",
      targetIds: ["foe-water"],
      used: false,
    });
  });

  it("does not trigger when the roll produced no opportunities", async () => {
    target(foe);
    await onCreate(waterRollMessage(attacker, { opportunity: 0 }));
    expect(g().game.messages).toHaveLength(0);
  });

  it(
    "spending 2 opportunities lowers the target's effective armor resistance by 2, " +
      "and it returns to the original value once the attacker's next turn ends",
    async () => {
      target(foe);

      // Baseline: 3 physical armor, no buff applied yet.
      expect(getArmorResistance(foe)).toBe(3);

      // ── 1. Real trigger: melee roll in Water stance, 2 opportunities ──────
      await onCreate(waterRollMessage(attacker, { opportunity: 2 }));

      const card = g().game.messages.at(-1);
      const passiveData = card.getFlag(NS, "passiveKataData");
      expect(passiveData.used).toBe(false);

      const kata = PASSIVE_KATA_REGISTRY.find((k) => k.names.includes(passiveData.kataName));
      expect(kata).toBeDefined();
      const targetActors = passiveData.targetIds
        .map((id: string) => g().game.actors.get(id))
        .filter(Boolean);

      // ── 2. Real spend: applyPassiveKataOpportunity with the exact
      // arguments handlePassiveKataButtonClick (kata-activation.ts) would
      // pass for a "spend 2" button click, built from the real card's own
      // flag data rather than hand-seeded. This is the function that
      // actually sets the `resistanceBuff` flag. ─────────────────────────
      await applyPassiveKataOpportunity(kata, attacker, 2, targetActors, null);

      // ── 3. Real resulting armor resistance, via getArmorResistance ────────
      expect(getArmorResistance(foe)).toBe(1); // 3 - 2

      // ── 4. Real expiry: "until the end of your next turn". The start of
      // the attacker's next turn does not end it; the end of that turn does
      // (both via the functions the updateCombat hook calls). ─────────────
      await processExpiredKataEffects(attacker.id);
      expect(getArmorResistance(foe)).toBe(1);
      await processEndOfTurnKataEffects(attacker.id);

      expect(foe.getFlag(NS, "resistanceBuff")).toBeUndefined();
      expect(getArmorResistance(foe)).toBe(3); // back to original — not still reduced, not over-corrected
    },
  );

  it("spending only 1 opportunity lowers resistance by 1, not by the full amount available", async () => {
    target(foe);
    await onCreate(waterRollMessage(attacker, { opportunity: 2 }));

    const card = g().game.messages.at(-1);
    const passiveData = card.getFlag(NS, "passiveKataData");
    const kata = PASSIVE_KATA_REGISTRY.find((k) => k.names.includes(passiveData.kataName));
    const targetActors = passiveData.targetIds.map((id: string) => g().game.actors.get(id));

    await applyPassiveKataOpportunity(kata, attacker, 1, targetActors, null);

    expect(getArmorResistance(foe)).toBe(2); // 3 - 1

    await processEndOfTurnKataEffects(attacker.id);
    expect(getArmorResistance(foe)).toBe(3);
  });

  it("never lowers an unarmored target's resistance below 0 (no extra damage)", async () => {
    foe.items.length = 0;
    target(foe);
    await onCreate(waterRollMessage(attacker, { opportunity: 2 }));
    const kata = PASSIVE_KATA_REGISTRY.find((k) => k.names[0] === "Striking as Water");
    await applyPassiveKataOpportunity(kata, attacker, 2, [foe], null);
    expect(getArmorResistance(foe)).toBe(0);
  });
});
