import { describe, it, expect } from "vitest";
import {
  collectUndeclaredFailures,
  expectModuleError,
  expectMissingI18n,
  resetLogPolicy,
  withCanvasTokens,
} from "./setup";
import { getHookCallback, getRegisteredHookEvents, fireHook } from "./hooks";
import {
  createMockActor,
  createMockWeapon,
  createMockMessage,
  applyUpdatePayload,
  MockCollection,
} from "./foundry-mocks";

/**
 * Positive-control tests for the harness itself.
 *
 * If the failure detector or the mocks silently stop working, every other
 * test in the suite becomes meaningless — these are the tests that notice.
 */

describe("failure detector (positive control)", () => {
  it("detects a module-tagged console.error", () => {
    console.error("L5R5e Combat Helper | boom");
    const found = collectUndeclaredFailures();
    expect(found).toHaveLength(1);
    expect(found[0].channel).toBe("error");
    resetLogPolicy(); // consume it so afterEach does not fail this test
  });

  it("detects a thrown Error passed to console.warn", () => {
    console.warn("something", new Error("kaboom"));
    expect(collectUndeclaredFailures()).toHaveLength(1);
    resetLogPolicy();
  });

  it("detects ui.notifications.error", () => {
    (globalThis as any).ui.notifications.error("target not found");
    expect(collectUndeclaredFailures()).toHaveLength(1);
    resetLogPolicy();
  });

  it("ignores console noise that is not module-tagged", () => {
    console.warn("some unrelated library warning");
    expect(collectUndeclaredFailures()).toHaveLength(0);
    resetLogPolicy();
  });

  it("treats a declared failure as satisfied", () => {
    expectModuleError(/expected boom/);
    console.error("L5R5e Combat Helper | expected boom");
    expect(collectUndeclaredFailures()).toHaveLength(0);
    // left undeclared-free and declaration satisfied → afterEach passes
  });
});

describe("i18n mock", () => {
  it("resolves a real key from lang/en.json", () => {
    const s = (globalThis as any).game.i18n.localize(
      "l5r5e-combat-helper.conditions.bleeding",
    );
    expect(s).toBeTruthy();
    expect(s).not.toContain("l5r5e-combat-helper.");
  });

  it("interpolates format() parameters", () => {
    const g = (globalThis as any).game;
    // any key with a {param} placeholder round-trips
    expect(g.i18n.format("l5r5e-combat-helper.conditions.bleeding", {})).toBeTruthy();
  });

  it("records a missing key so afterEach can fail on it", () => {
    expectMissingI18n(/does\.not\.exist/);
    const out = (globalThis as any).game.i18n.localize("l5r5e-combat-helper.does.not.exist");
    // real Foundry returns the key itself — control flow must match production
    expect(out).toBe("l5r5e-combat-helper.does.not.exist");
  });
});

describe("hook capture", () => {
  it("captures callbacks and fires them sequentially in registration order", async () => {
    const order: string[] = [];
    (globalThis as any).Hooks.on("testEvent", async () => {
      await Promise.resolve();
      order.push("first");
    });
    (globalThis as any).Hooks.on("testEvent", () => {
      order.push("second");
    });

    expect(getRegisteredHookEvents()).toContain("testEvent");
    await fireHook("testEvent");
    expect(order).toEqual(["first", "second"]);
  });

  it("throws a helpful error for an unregistered event", () => {
    expect(() => getHookCallback("nope")).toThrow(/No callback registered for "nope"/);
  });
});

describe("mock actor", () => {
  it("uses the real l5r5e schema shape", () => {
    const a = createMockActor();
    // flat numbers, per template.json
    expect(a.system.endurance).toBe(0);
    expect(a.system.vigilance).toBe(0);
    // {max,value} objects
    expect(a.system.fatigue).toEqual({ max: 1, value: 0 });
    expect(a.system.strife).toEqual({ max: 1, value: 0 });
    expect(a.system.social.honor).toBe(0);
    expect(a.system.stance).toBe("void");
  });

  it("does NOT define system.silhouette (the system genuinely lacks it)", () => {
    expect(createMockActor().system.silhouette).toBeUndefined();
  });

  it("gives characters a nested skill tree and NPCs flat category numbers", () => {
    expect(createMockActor({ type: "character" }).system.skills.martial.fitness).toBe(0);
    expect(createMockActor({ type: "npc" }).system.skills.martial).toBe(0);
  });

  it("applies dot-path updates", async () => {
    const a = createMockActor();
    await a.update({ "system.fatigue.value": 4 });
    expect(a.system.fatigue.value).toBe(4);
    expect(a.system.fatigue.max).toBe(1); // sibling untouched
  });

  it("stores flags and clones on read", async () => {
    const a = createMockActor();
    await a.setFlag("l5r5e-combat-helper", "activeKataEffects", [{ type: "condition" }]);
    const read = a.getFlag("l5r5e-combat-helper", "activeKataEffects");
    read.push({ type: "mutated" });
    expect(a.getFlag("l5r5e-combat-helper", "activeKataEffects")).toHaveLength(1);
  });

  it("unsets flags", async () => {
    const a = createMockActor();
    await a.setFlag("l5r5e-combat-helper", "resistanceBuff", 2);
    await a.unsetFlag("l5r5e-combat-helper", "resistanceBuff");
    expect(a.getFlag("l5r5e-combat-helper", "resistanceBuff")).toBeUndefined();
  });

  it("toggleStatusEffect mutates both statuses and effects", async () => {
    const a = createMockActor();
    await a.toggleStatusEffect("prone", { active: true });
    expect(a.statuses.has("prone")).toBe(true);
    expect(a.effects.some((e: any) => e.statuses.has("prone"))).toBe(true);

    await a.toggleStatusEffect("prone", { active: false });
    expect(a.statuses.has("prone")).toBe(false);
    expect(a.effects.some((e: any) => e.statuses.has("prone"))).toBe(false);
  });

  it("creates and deletes embedded ActiveEffects", async () => {
    const a = createMockActor();
    const [ae] = await a.createEmbeddedDocuments("ActiveEffect", [{ name: "Buff" }]);
    expect(a.effects.get(ae.id)).toBeTruthy();
    await a.deleteEmbeddedDocuments("ActiveEffect", [ae.id]);
    expect(a.effects.get(ae.id)).toBeUndefined();
  });
});

describe("mock item / collection", () => {
  it("builds a weapon with the l5r5e weapon defaults", () => {
    const w = createMockWeapon({ system: { damage: 4, deadliness: 5 } });
    expect(w.type).toBe("weapon");
    expect(w.system.damage).toBe(4);
    expect(w.system.equipped).toBe(true);
    expect(w.system.properties).toEqual([]);
  });

  it("defaults weapon deadliness to 0, like template.json", () => {
    expect(createMockWeapon().system.deadliness).toBe(0);
  });

  it("MockCollection supports get/has and array methods", () => {
    const c = new MockCollection<any>({ id: "a" }, { id: "b" });
    expect(c.get("b")).toEqual({ id: "b" });
    expect(c.has("z")).toBe(false);
    expect(c.filter((x) => x.id === "a")).toHaveLength(1);
    expect(c.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("mock message + ChatMessage.create", () => {
  it("records created messages on game.messages", async () => {
    const g = globalThis as any;
    await g.ChatMessage.create({ content: "<p>hi</p>" });
    expect(g.game.messages).toHaveLength(1);
    expect(g.game.messages[0].content).toBe("<p>hi</p>");
  });

  it("supports flags on messages", async () => {
    const m = createMockMessage();
    await m.setFlag("l5r5e-combat-helper", "attackData", { opportunities: 2 });
    expect(m.getFlag("l5r5e-combat-helper", "attackData").opportunities).toBe(2);
  });
});

describe("global isolation between tests", () => {
  it("starts with empty collections (part 1: dirty them)", () => {
    const g = globalThis as any;
    g.game.actors.push(createMockActor());
    g.game.user.targets.add({ actor: createMockActor() });
    expect(g.game.actors).toHaveLength(1);
  });

  it("starts with empty collections (part 2: verify reset)", () => {
    const g = globalThis as any;
    expect(g.game.actors).toHaveLength(0);
    expect(g.game.messages).toHaveLength(0);
    expect(g.game.user.targets.size).toBe(0);
  });
});

describe("canvas opt-in", () => {
  it("has no tokens by default", () => {
    expect((globalThis as any).canvas.tokens).toBeUndefined();
  });

  it("exposes tokens after withCanvasTokens()", () => {
    withCanvasTokens([{ actor: { id: "x" } }]);
    expect((globalThis as any).canvas.tokens.placeables).toHaveLength(1);
  });
});

describe("applyUpdatePayload", () => {
  it("creates intermediate objects for deep paths", () => {
    const doc: any = {};
    applyUpdatePayload(doc, { "system.attributes.fatigue": 3 });
    expect(doc.system.attributes.fatigue).toBe(3);
  });

  it("merges nested object payloads instead of replacing wholesale", () => {
    const doc: any = { system: { fatigue: { max: 5, value: 1 } } };
    applyUpdatePayload(doc, { system: { fatigue: { value: 2 } } });
    expect(doc.system.fatigue).toEqual({ max: 5, value: 2 });
  });
});
