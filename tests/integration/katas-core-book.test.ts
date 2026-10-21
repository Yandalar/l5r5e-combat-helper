// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/critical/critical-effects-application", () => ({
  applyCriticalEffect: vi.fn(async () => {}),
  reverseCriticalEffect: vi.fn(async () => {}),
}));

import {
  registerKataActivationHandler,
  applyKataOpportunity,
  applyPassiveKataOpportunityFromCard,
} from "../../src/techniques/kata-activation";
import { registerCriticalMitigationHandler } from "../../src/critical/critical-mitigation";
import { applyCriticalEffect } from "../../src/critical/critical-effects-application";
import { applyManualKata } from "../../src/techniques/manual-katas";
import { getHookCallbacks } from "../helpers/hooks";
import {
  createMockActor,
  createMockItem,
  createMockMessage,
  createMockRoll,
  createMockWeapon,
} from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";
const g = () => globalThis as any;

const kataItem = (name: string) => createMockItem({ name, type: "technique", system: { technique_type: "kata" } });
const armor = (physical: number) => createMockItem({ type: "armor", system: { armor: { physical }, equipped: true } });

/** Posts a roll and runs every registered createChatMessage hook, in order. */
async function fire(actor: any, roll: Record<string, any>, id = `msg-${Math.random().toString(36).slice(2, 8)}`) {
  const message = createMockMessage({ id, speaker: { actor: actor.id }, rolls: [createMockRoll(roll)] });
  for (const cb of getHookCallbacks("createChatMessage")) await cb(message);
}

/** An activation roll of the active kata `name`. */
function kataRoll(name: string, roll: Record<string, any>) {
  return { ...roll, item: { name, system: { technique_type: "kata" }, _stats: {} } };
}

const lastCard = () => g().game.messages.at(-1);
const fatigue = (a: any) => a.system.fatigue.value;

let attacker: any;
let foe: any;

beforeEach(() => {
  attacker = createMockActor({
    id: "att",
    name: "Bushi",
    system: { rings: { earth: 3, air: 2, water: 3, fire: 2, void: 2 }, void_points: { max: 3, value: 1 } },
    items: [createMockWeapon({ id: "katana", system: { damage: 4, deadliness: 5 } })],
  });
  foe = createMockActor({
    id: "foe",
    name: "Bandit",
    type: "npc",
    system: { endurance: 20, vigilance: 3, fatigue: { max: 20, value: 0 }, stance: "earth" },
    items: [armor(2)],
  });
  g().game.actors.push(attacker, foe);
  g().game.user.targets.add({ actor: foe });
  registerKataActivationHandler();
  vi.mocked(applyCriticalEffect).mockClear();
});

// ── Active katas ──────────────────────────────────────────────────────────────

describe("Iaijutsu Cut: Crossing Blade", () => {
  it("deals weapon deadliness + bonus successes, reduced by resistance", async () => {
    await fire(attacker, kataRoll("Corte de iaijutsu: Hoja cruzada", { totalSuccess: 3 }));
    expect(fatigue(foe)).toBe(5 + 1 - 2);
    expect(lastCard().content).toContain(g().game.i18n.localize(`${NS}.kata.note.iaijutsuReady`));
  });
});

describe("Iaijutsu Cut: Rising Blade", () => {
  it("uses the target's Vigilance as TN", async () => {
    await fire(attacker, kataRoll("Iaijutsu Cut: Rising Blade", { totalSuccess: 2 }));
    expect(fatigue(foe)).toBe(0);
    expect(lastCard().content).toContain("Failed");
  });

  it("deals deadliness (no bonus successes) minus resistance", async () => {
    await fire(attacker, kataRoll("Iaijutsu Cut: Rising Blade", { totalSuccess: 5 }));
    expect(fatigue(foe)).toBe(5 - 2);
  });

  it("ignores resistance against a Compromised target", async () => {
    foe.statuses.add("compromised");
    await fire(attacker, kataRoll("Iaijutsu Cut: Rising Blade", { totalSuccess: 3 }));
    expect(fatigue(foe)).toBe(5);
  });
});

describe("Flowing Water Strike", () => {
  async function hit() {
    await fire(attacker, kataRoll("Golpe del agua corriente", { stance: "water", totalSuccess: 3, opportunity: 1 }), "fw-roll");
  }

  it("deals Water ring damage, causes Bleeding and asks for a ring-dependent resistance roll", async () => {
    await hit();
    expect(fatigue(foe)).toBe(3 - 2);
    expect(foe.statuses.has("bleeding")).toBe(true);
    expect(foe.getFlag(NS, "pendingResistanceRoll")).toMatchObject({
      skill: "fitness", difficulty: 4, ringDifficulty: { earth: -2, fire: 1 },
    });
    const request = g().game.messages.find((m) => m.content.includes("kata-resistance-request"));
    expect(request.content).toContain("4 (Earth 2, Fire 5)");
  });

  it("a failed resistance adds the weapon's base damage without subtracting resistance twice", async () => {
    await hit();
    // Fire stance: TN 5. 4 successes → fail.
    await fire(foe, { skillId: "martial", stance: "fire", totalSuccess: 4 });
    // total = max(0, 3 + 4 − 2) = 5 → 1 already applied + 4
    expect(fatigue(foe)).toBe(5);
  });

  it("a resistance that beats the ring's TN adds nothing", async () => {
    await hit();
    // Earth stance: TN 2.
    await fire(foe, { skillId: "martial", stance: "earth", totalSuccess: 2 });
    expect(fatigue(foe)).toBe(1);
  });

  it("the Water opportunity ends the attacker's Prone and Dazed", async () => {
    attacker.statuses.add("prone");
    attacker.statuses.add("dazed");
    await hit();
    const card = g().game.messages.find((m) => m.getFlag(NS, "kataOpportunityData"));
    await applyKataOpportunity({ messageId: card.id }, "gm");
    expect(attacker.statuses.has("prone")).toBe(false);
    expect(attacker.statuses.has("dazed")).toBe(false);
  });
});

describe("Crimson Leaves Strike", () => {
  it("deals Earth ring + bonus successes; a failed resistance shows the disarm reminder", async () => {
    await fire(attacker, kataRoll("Crimson Leaves Strike", { stance: "earth", totalSuccess: 5 }));
    expect(fatigue(foe)).toBe(3 + 1 - 2);
    await fire(foe, { skillId: "martial", stance: "water", totalSuccess: 4 }); // TN 5
    expect(lastCard().content).toContain(g().game.i18n.localize(`${NS}.kata.note.crimsonLeavesDisarm`));
  });
});

describe("Heartpiercing Strike", () => {
  it("on success posts a critical strike with severity deadliness + bonus successes and its own mitigation TN", async () => {
    await fire(attacker, kataRoll("Golpe al corazón", { stance: "fire", totalSuccess: 6 }));
    const crit = g().game.messages.find((m) => m.getFlag(NS, "criticalStrike"));
    expect(crit.getFlag(NS, "criticalStrike")).toMatchObject({
      targetId: "foe", weaponDeadliness: 7, mitigationTn: 3, ringDifficulty: { air: 1, water: -2 },
    });
    expect(crit.content).toContain("3 (Air 4, Water 1)");
  });

  it("the Fitness roll is checked against the ring's TN", async () => {
    await fire(attacker, kataRoll("Golpe al corazón", { stance: "fire", totalSuccess: 4 }));
    const crit = g().game.messages.find((m) => m.getFlag(NS, "criticalStrike"));
    await foe.setFlag(NS, "pendingCriticalMitigation", {
      weaponDeadliness: 5, criticalMessageId: crit.id, mitigationTn: 3, ringDifficulty: { air: 1, water: -2 },
    });
    registerCriticalMitigationHandler();
    // Air: TN 4. 3 successes → fails, no reduction.
    await fire(foe, { skillId: "martial", stance: "air", difficulty: 3, totalSuccess: 3 });
    expect(applyCriticalEffect).toHaveBeenCalledWith(foe, 5, "air", expect.anything(), attacker);
  });

  it("on failure leaves the attacker Disoriented", async () => {
    await fire(attacker, kataRoll("Heartpiercing Strike", { stance: "fire", totalSuccess: 3 }));
    expect(attacker.statuses.has("disoriented")).toBe(true);
    expect(g().game.messages.some((m) => m.getFlag(NS, "criticalStrike"))).toBe(false);
  });
});

describe("Pin the Fan", () => {
  it("uses the dice picker's TN and deals twice the base damage + bonus successes", async () => {
    await fire(attacker, kataRoll("Clavar el abanico", { skillId: "ranged", difficulty: 5, totalSuccess: 4 }));
    expect(fatigue(foe)).toBe(0);
    await fire(attacker, kataRoll("Clavar el abanico", { skillId: "ranged", difficulty: 5, totalSuccess: 6, opportunity: 1 }));
    expect(fatigue(foe)).toBe(4 * 2 + 1 - 2);
  });

  it("the opportunity only strikes critically if the target was incapacitated", async () => {
    await fire(attacker, kataRoll("Pin the Fan", { skillId: "ranged", difficulty: 2, totalSuccess: 3, opportunity: 1 }));
    let card = g().game.messages.find((m) => m.getFlag(NS, "kataOpportunityData"));
    await applyKataOpportunity({ messageId: card.id }, "gm");
    expect(g().game.messages.some((m) => m.getFlag(NS, "criticalStrike"))).toBe(false);

    foe.statuses.add("incapacitated");
    await fire(attacker, kataRoll("Pin the Fan", { skillId: "ranged", difficulty: 2, totalSuccess: 4, opportunity: 1 }), "pin-2");
    card = g().game.messages.filter((m) => m.getFlag(NS, "kataOpportunityData")).at(-1);
    await applyKataOpportunity({ messageId: card.id }, "gm");
    const crit = g().game.messages.find((m) => m.getFlag(NS, "criticalStrike"));
    expect(crit.getFlag(NS, "criticalStrike").weaponDeadliness).toBe(5 + 2);
  });
});

// ── Passive katas ─────────────────────────────────────────────────────────────

async function passiveCard(roll: Record<string, any>) {
  const before = g().game.messages.length;
  await fire(attacker, roll, `roll-${before}`);
  return g().game.messages.slice(before).find((m) => m.getFlag(NS, "passiveKataData")) ?? null;
}

const spend = (card: any, amount: number, extra: Record<string, any> = {}) =>
  applyPassiveKataOpportunityFromCard({
    messageId: card.id, kataName: card.getFlag(NS, "passiveKataData").kataName, amount, condition: null, ...extra,
  }, "gm");

describe("rank-4 styles (Breath of Wind as the example)", () => {
  beforeEach(() => attacker.items.push(kataItem("Estilo del hálito de viento")));

  it("only triggers on Air rolls", async () => {
    expect(await passiveCard({ stance: "fire", totalSuccess: 3, opportunity: 2 })).toBeNull();
  });

  it("TN 3 +1 per extra opportunity, varying with the resisting ring; failure → Disoriented + fatigue = shortfall", async () => {
    const card = await passiveCard({ stance: "air", totalSuccess: 3, opportunity: 2 });
    await spend(card, 2);
    expect(foe.getFlag(NS, "pendingResistanceRoll")).toMatchObject({ difficulty: 4, ringDifficulty: { earth: 1, fire: -2 } });

    // Earth: TN 5. 1 success → shortfall 4.
    await fire(foe, { skillId: "martial", stance: "earth", totalSuccess: 1 });
    expect(foe.statuses.has("disoriented")).toBe(true);
    expect(fatigue(foe)).toBe(4);
  });

  it("succeeding with Fire (TN 1) avoids everything", async () => {
    const card = await passiveCard({ stance: "air", totalSuccess: 3, opportunity: 1 });
    await spend(card, 1);
    await fire(foe, { skillId: "martial", stance: "fire", totalSuccess: 1 });
    expect(foe.statuses.has("disoriented")).toBe(false);
    expect(fatigue(foe)).toBe(0);
  });
});

describe("Rushing Avalanche Style", () => {
  beforeEach(() => {
    attacker.items.push(kataItem("Rushing Avalanche Style"));
    attacker.system.skills.martial.fitness = 3;
  });

  it("a miss by 2 or less deals Fitness damage (resistance applies)", async () => {
    const card = await passiveCard({ difficulty: 3, totalSuccess: 1, opportunity: 1 });
    expect(card.getFlag(NS, "passiveKataData").oppIndex).toBe(0);
    await spend(card, 1);
    expect(fatigue(foe)).toBe(3 - 2);
  });

  it("a miss by 3 offers nothing", async () => {
    expect(await passiveCard({ difficulty: 4, totalSuccess: 1, opportunity: 1 })).toBeNull();
  });

  it("a hit on a Prone target adds Fitness damage, ignoring resistance", async () => {
    foe.statuses.add("prone");
    const card = await passiveCard({ difficulty: 2, totalSuccess: 3, opportunity: 1 });
    expect(card.getFlag(NS, "passiveKataData").oppIndex).toBe(1);
    await spend(card, 1);
    expect(fatigue(foe)).toBe(3);
  });

  it("a hit on a standing target offers nothing", async () => {
    expect(await passiveCard({ difficulty: 2, totalSuccess: 3, opportunity: 1 })).toBeNull();
  });
});

describe("Spinning Blades Style", () => {
  beforeEach(() => attacker.items.push(kataItem("Estilo de las hojas giratorias")));

  it("needs a second readied weapon", async () => {
    expect(await passiveCard({ totalSuccess: 3, opportunity: 3 })).toBeNull();
  });

  it("costs exactly the target's Vigilance and hits with the second weapon (+skill rank if Dazed)", async () => {
    attacker.items.push(createMockWeapon({ id: "wakizashi", system: { damage: 3, deadliness: 3 } }));
    attacker.system.skills.martial.melee = 2;
    expect(await passiveCard({ totalSuccess: 3, opportunity: 2 })).toBeNull();

    foe.statuses.add("dazed");
    const card = await passiveCard({ totalSuccess: 3, opportunity: 4 });
    expect(card.content.match(/kata-passive-opportunity-btn/g)).toHaveLength(1);
    expect(card.content).toContain('data-amount="3"');
    await spend(card, 3);
    // second weapon 3 + melee 2 − resistance 2
    expect(fatigue(foe)).toBe(3);
  });
});

describe("Pelting Hail Style", () => {
  it("each picked extra character suffers strife equal to the weapon's base damage", async () => {
    attacker.items.push(kataItem("Pelting Hail Style"));
    const other = createMockActor({ id: "other", name: "Archer", type: "npc" });
    g().game.actors.push(other);
    const card = await passiveCard({ skillId: "ranged", totalSuccess: 3, opportunity: 2 });
    await spend(card, 1, { pickedTargetIds: ["other"] });
    expect(other.system.strife.value).toBe(4);
    expect(foe.system.strife.value).toBe(0);
  });
});

describe("Open-Hand Style", () => {
  beforeEach(() => attacker.items.push(kataItem("Estilo de la palma abierta")));

  it("offers the stances the target is not in, for 2 opportunities", async () => {
    expect(await passiveCard({ skillId: "unarmed", totalSuccess: 3, opportunity: 1 })).toBeNull();
    const card = await passiveCard({ skillId: "unarmed", totalSuccess: 3, opportunity: 2 });
    expect(card.content).not.toContain('data-stance="earth"');
    expect(card.content).toContain('data-stance="fire"');
    await spend(card, 2, { stance: "fire" });
    expect(foe.system.stance).toBe("fire");
  });

  it("a silhouette 3+ target resists with Fitness TN 3", async () => {
    await foe.setFlag(NS, "silhouette", 3);
    const card = await passiveCard({ skillId: "unarmed", totalSuccess: 3, opportunity: 2 });
    await spend(card, 2, { stance: "water" });
    expect(foe.system.stance).toBe("earth");
    expect(foe.getFlag(NS, "pendingResistanceRoll")).toMatchObject({ difficulty: 3 });
    await fire(foe, { skillId: "martial", stance: "earth", totalSuccess: 2 });
    expect(foe.system.stance).toBe("water");
  });
});

describe("Veiled Menace Style", () => {
  beforeEach(() => attacker.items.push(kataItem("Veiled Menace Style")));

  it("needs a hit", async () => {
    expect(await passiveCard({ difficulty: 3, totalSuccess: 2, opportunity: 3 })).toBeNull();
  });

  it("critical severity = deadliness + opportunities beyond the first", async () => {
    const card = await passiveCard({ difficulty: 2, totalSuccess: 3, opportunity: 3 });
    await spend(card, 3);
    const crit = g().game.messages.find((m) => m.getFlag(NS, "criticalStrike"));
    expect(crit.getFlag(NS, "criticalStrike")).toMatchObject({ targetId: "foe", weaponDeadliness: 5 + 2 });
  });
});

// ── Katas without a roll ──────────────────────────────────────────────────────

describe("Warrior's Resolve", () => {
  let card: any;
  beforeEach(async () => {
    attacker.items.push(kataItem("La determinación del guerrero"));
    attacker.system.social.honor = 45;
    attacker.system.fatigue = { max: 10, value: 6 };
    g().game.combat = { id: "combat-1" };
    card = createMockMessage({ id: "item-card", speaker: { actor: "att" },
      content: '<div class="l5r5e-chat-item"><h2>La determinación del guerrero</h2></div>' });
    g().game.messages.push(card);
  });

  it("spends a Void point and removes fatigue equal to the Honor rank", async () => {
    await applyManualKata({ messageId: "item-card", kataName: "Warrior's Resolve" }, "gm");
    expect(attacker.system.void_points.value).toBe(0);
    expect(fatigue(attacker)).toBe(2);
    expect(card.getFlag(NS, "manualKataUsed")).toBe(true);
  });

  it("only once per combat", async () => {
    await applyManualKata({ messageId: "item-card", kataName: "Warrior's Resolve" }, "gm");
    attacker.system.void_points.value = 1;
    const second = createMockMessage({ id: "item-card-2", speaker: { actor: "att" }, content: card.content });
    g().game.messages.push(second);
    await applyManualKata({ messageId: "item-card-2", kataName: "Warrior's Resolve" }, "gm");
    expect(attacker.system.void_points.value).toBe(1);
    expect(fatigue(attacker)).toBe(2);
  });

  it("does nothing without Void points", async () => {
    attacker.system.void_points.value = 0;
    await applyManualKata({ messageId: "item-card", kataName: "Warrior's Resolve" }, "gm");
    expect(fatigue(attacker)).toBe(6);
    expect(card.getFlag(NS, "manualKataUsed")).toBeUndefined();
  });
});
