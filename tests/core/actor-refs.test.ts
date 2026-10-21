import { describe, it, expect, vi } from "vitest";
import { actorRef, resolveActor, rollActor, kataEffectActors } from "../../src/core/actor-refs";
import { createMockActor } from "../helpers/foundry-mocks";

const g = () => globalThis as any;

describe("actorRef / resolveActor", () => {
  it("stores the uuid and resolves it with fromUuidSync (unlinked token actor)", () => {
    const tokenActor = createMockActor({ id: "ronin" });
    tokenActor.uuid = "Scene.s1.Token.t2.Actor.ronin";
    g().fromUuidSync = vi.fn(() => tokenActor);
    g().game.actors.push(createMockActor({ id: "ronin", name: "Base" }));

    expect(actorRef(tokenActor)).toBe("Scene.s1.Token.t2.Actor.ronin");
    expect(resolveActor("Scene.s1.Token.t2.Actor.ronin")).toBe(tokenActor);
    delete g().fromUuidSync;
  });

  it("still resolves plain ids from older cards", () => {
    const a = createMockActor({ id: "pc" });
    g().game.actors.push(a);
    expect(resolveActor("pc")).toBe(a);
    expect(resolveActor(null)).toBeNull();
  });
});

describe("rollActor", () => {
  it("prefers the actor the system restored on the roll", () => {
    const tokenActor = createMockActor({ id: "npc" });
    g().game.actors.push(createMockActor({ id: "npc", name: "Base" }));
    expect(rollActor({ speaker: { actor: "npc" } }, { actor: tokenActor })).toBe(tokenActor);
  });

  it("falls back to the speaker", () => {
    const base = createMockActor({ id: "npc" });
    g().game.actors.push(base);
    expect(rollActor({ speaker: { actor: "npc" } }, {})).toBe(base);
  });
});

describe("kataEffectActors", () => {
  it("adds unlinked token actors from every scene, without duplicates", () => {
    const world = createMockActor({ id: "w" });
    const synthetic = createMockActor({ id: "w" });
    g().game.actors.push(world);
    g().game.scenes = [
      { tokens: [{ actorLink: true, actor: world }, { actorLink: false, actor: synthetic }] },
      { tokens: [{ actorLink: false, actor: synthetic }] },
    ];
    const actors = kataEffectActors();
    expect(actors).toHaveLength(2);
    expect(actors).toContain(world);
    expect(actors).toContain(synthetic);
  });
});
