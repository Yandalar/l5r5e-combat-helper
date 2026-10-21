// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { registerKataActivationHandler } from "../../src/techniques/kata-activation";
import { applyTechniqueChoice } from "../../src/techniques/technique-choice";
import { getHookCallbacks } from "../helpers/hooks";
import { createMockActor, createMockItem, createMockMessage, createMockRoll } from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";
const g = () => globalThis as any;

let monk: any;
let foe: any;

async function post(actor: any, roll: Record<string, any>) {
  const message = createMockMessage({ speaker: { actor: actor.id }, rolls: [createMockRoll(roll)] });
  for (const cb of getHookCallbacks("createChatMessage")) await cb(message);
}

/** Rolls kihō `name` with `totalSuccess` successes (a fresh activation: the previous kihō is ended first). */
async function kiho(name: string, totalSuccess: number, stance = "earth") {
  await monk.unsetFlag(NS, "activeKiho");
  await post(monk, {
    skillId: "unarmed", stance, totalSuccess,
    item: { name, type: "technique", system: { technique_type: "kiho" }, _stats: {} },
  });
}

/** The targeted actor rolls its resistance (NPC: flat martial skill). */
const resist = (actor: any, stance: string, totalSuccess: number) =>
  post(actor, { skillId: "martial", stance, totalSuccess });

const fatigue = (a: any) => a.system.fatigue.value;
const crits = () => g().game.messages.filter((m) => m.getFlag(NS, "criticalStrike"));
const lastContent = () => g().game.messages.at(-1).content;
const t = (key: string) => g().game.i18n.localize(`${NS}.${key}`);

beforeEach(() => {
  monk = createMockActor({
    id: "monk", name: "Monk",
    system: {
      rings: { earth: 3, air: 3, water: 3, fire: 3, void: 2 },
      skills: { martial: { fitness: 2, unarmed: 3 }, scholar: { medicine: 2 } },
      void_points: { max: 3, value: 0 },
    },
  });
  foe = createMockActor({
    id: "foe", name: "Bandit", type: "npc",
    system: { endurance: 20, fatigue: { max: 20, value: 0 } },
    items: [createMockItem({ type: "armor", system: { armor: { physical: 2, supernatural: 1 }, equipped: true } })],
  });
  g().game.actors.push(monk, foe);
  g().game.user.targets.add({ actor: foe });
  registerKataActivationHandler();
});

afterEach(() => {
  g().game.combat = null;
});

describe("Water kihō", () => {
  it("Freezing the Lifeblood 2+: supernatural Water damage ignoring resistance + Immobilized", async () => {
    await kiho("Congelar la sangre vital", 4);
    expect(fatigue(foe)).toBe(3);
    expect(foe.statuses.has("immobilized")).toBe(true);
    expect(crits()).toHaveLength(0);
  });

  it("Freezing the Lifeblood 4+: a critical strike of Water + Medicine instead", async () => {
    await kiho("Freezing the Lifeblood", 6);
    expect(fatigue(foe)).toBe(0);
    expect(foe.statuses.has("immobilized")).toBe(false);
    expect(crits()[0].getFlag(NS, "criticalStrike").weaponDeadliness).toBe(3 + 2);
  });

  it("Ride the Water Dragon 2+: clears the user's technique effects, keeping the kihō; 4+ also the targets'", async () => {
    await monk.setFlag(NS, "resistanceBuff", -1);
    await foe.setFlag(NS, "resistanceBuff", 2);
    await kiho("Ride the Water Dragon", 5);
    expect(monk.getFlag(NS, "resistanceBuff")).toBeUndefined();
    expect(monk.getFlag(NS, "activeKiho").name).toBe("Ride the Water Dragon");
    expect(foe.getFlag(NS, "resistanceBuff")).toBe(2);

    await kiho("Ride the Water Dragon", 7);
    expect(foe.getFlag(NS, "resistanceBuff")).toBeUndefined();
  });

  it("Ki Protection 2+: the target removes Medicine + bonus successes fatigue, once per combat", async () => {
    g().game.combat = { id: "c1" };
    foe.system.fatigue.value = 9;
    await kiho("Protección de ki", 3);
    expect(fatigue(foe)).toBe(9 - (2 + 2));
    await kiho("Protección de ki", 3);
    expect(fatigue(foe)).toBe(5);
  });

  it("Water Fist: any success deals Water damage", async () => {
    await kiho("Water Fist", 1);
    expect(fatigue(foe)).toBe(3 - 2);
  });

  it("Way of the Seafoam 2+: ends Immobilized and Prone and offers a stance", async () => {
    monk.statuses.add("prone");
    monk.statuses.add("immobilized");
    await kiho("La senda de la espuma marina", 3);
    expect(monk.statuses.has("prone")).toBe(false);
    expect(monk.statuses.has("immobilized")).toBe(false);

    const card = g().game.messages.find((m) => m.getFlag(NS, "techniqueChoice"));
    const options = card.getFlag(NS, "techniqueChoice").options;
    await applyTechniqueChoice({ messageId: card.id, index: options.findIndex((o) => o.labelArgs.ring === "fire") }, "gm");
    expect(monk.system.stance).toBe("fire");
  });
});

describe("Air kihō", () => {
  it("The Great Silence 2+: targets are Silenced until the start of the user's next turn", async () => {
    await kiho("The Great Silence", 3);
    expect(foe.statuses.has("silenced")).toBe(true);
    expect(foe.getFlag(NS, "activeKataEffects")).toEqual(
      expect.arrayContaining([expect.objectContaining({ statusId: "silenced", expiresAfterCombatant: "monk" })]),
    );
  });

  it("Air Fist 2+: Air damage, and a failed resistance shows the push", async () => {
    await kiho("Puño de Aire", 3);
    expect(fatigue(foe)).toBe(1);
    expect(foe.getFlag(NS, "pendingResistanceRoll")).toMatchObject({ difficulty: 4, ringDifficulty: { earth: 1, fire: -2 } });
    await resist(foe, "earth", 4); // TN 5
    expect(lastContent()).toContain(t("kiho.note.airFistPush"));
  });

  it("Riding the Clouds only activates and shows its manual burst", async () => {
    await kiho("Riding the Clouds", 5);
    expect(monk.getFlag(NS, "activeKiho").name).toBe("Riding the Clouds");
    expect(lastContent()).toContain(t("kiho.note.ridingClouds"));
  });
});

describe("Fire kihō", () => {
  it("Channel the Fire Dragon 2+: each target resists or suffers Fire damage and Burning", async () => {
    await kiho("Canalizar el dragón de Fuego", 4);
    expect(fatigue(foe)).toBe(0);
    await resist(foe, "water", 1); // TN 2
    expect(fatigue(foe)).toBe(3 - 2);
    expect(foe.statuses.has("burning")).toBe(true);
  });

  it("Flame Fist 2+: Fire damage; Fitness TN 4 (Air 5, Water 2) or Dazed", async () => {
    await kiho("Flame Fist", 3);
    expect(fatigue(foe)).toBe(1);
    await resist(foe, "water", 2);
    expect(foe.statuses.has("dazed")).toBe(false);
  });

  it("Way of the Falling Star 3+: supernatural Fire + Fitness damage; resists TN 5 (Air 6) or Burning + Dazed", async () => {
    await kiho("Way of the Falling Star", 5);
    expect(fatigue(foe)).toBe(0);
    await kiho("Way of the Falling Star", 6);
    expect(fatigue(foe)).toBe(3 + 2 - 1);
    await resist(foe, "air", 5);
    expect(foe.statuses.has("burning")).toBe(true);
    expect(foe.statuses.has("dazed")).toBe(true);
  });
});

describe("Earth kihō", () => {
  it("Cleansing Spirit 2+: offers only the conditions the target has and removes the chosen one", async () => {
    foe.statuses.add("bleeding");
    foe.statuses.add("dazed");
    await kiho("Espíritu purificador", 3);
    const card = g().game.messages.find((m) => m.getFlag(NS, "techniqueChoice"));
    const options = card.getFlag(NS, "techniqueChoice").options;
    expect(options.map((o) => o.labelArgs.statusId)).toEqual(["bleeding", "dazed"]);
    await applyTechniqueChoice({ messageId: card.id, index: 0 }, "gm");
    expect(foe.statuses.has("bleeding")).toBe(false);
    expect(foe.statuses.has("dazed")).toBe(true);
  });

  it("Earthen Fist 2+: Earth damage; Fitness TN 4 (Air 2, Water 5) or Prone", async () => {
    await kiho("Puño de Tierra", 3);
    expect(fatigue(foe)).toBe(1);
    await resist(foe, "water", 4);
    expect(foe.statuses.has("prone")).toBe(true);
  });

  it("Way of the Earthquake 2+: Earth damage; Prone targets take Earth + bonus successes and Immobilized instead", async () => {
    const prone = createMockActor({ id: "prone", name: "Fallen", type: "npc", statuses: ["prone"],
      system: { endurance: 20, fatigue: { max: 20, value: 0 } } });
    g().game.actors.push(prone);
    g().game.user.targets.add({ actor: prone });
    await kiho("La senda del terremoto", 4);
    expect(fatigue(foe)).toBe(1);
    expect(foe.statuses.has("immobilized")).toBe(false);
    expect(fatigue(prone)).toBe(3 + 2);
    expect(prone.statuses.has("immobilized")).toBe(true);
  });
});

describe("Void kihō", () => {
  it("Way of the Edgeless Sword 2+: each target suffers a critical of Void + Unarmed", async () => {
    await kiho("Way of the Edgeless Sword", 5);
    expect(crits()[0].getFlag(NS, "criticalStrike").weaponDeadliness).toBe(2 + 3);
  });

  it("Touch the Void Dragon 2+: gains 1 Void point, once per combat", async () => {
    g().game.combat = { id: "c1" };
    await kiho("El toque del dragón de Vacío", 6);
    expect(monk.system.void_points.value).toBe(1);
    await kiho("El toque del dragón de Vacío", 6);
    expect(monk.system.void_points.value).toBe(1);
  });

  it("Death Touch 3+: Dazed + Disoriented and a TN 4 resistance against Unconscious", async () => {
    await kiho("Death Touch", 6);
    expect(foe.statuses.has("dazed")).toBe(true);
    expect(foe.statuses.has("disoriented")).toBe(true);
    await resist(foe, "earth", 3);
    expect(foe.statuses.has("unconscious")).toBe(true);
  });

  it("Death Touch 4+ against a minion: slain instead", async () => {
    foe.system.type = "minion";
    await kiho("Death Touch", 7);
    expect(foe.statuses.has("unconscious")).toBe(true);
    expect(foe.statuses.has("dazed")).toBe(false);
    expect(foe.getFlag(NS, "pendingResistanceRoll")).toBeUndefined();
  });

  it("Death Touch 3 bonus against a minion: the regular effect", async () => {
    foe.system.type = "minion";
    await kiho("Death Touch", 6);
    expect(foe.statuses.has("dazed")).toBe(true);
    expect(foe.statuses.has("unconscious")).toBe(false);
  });
});
