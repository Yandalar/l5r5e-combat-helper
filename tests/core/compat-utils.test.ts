import { describe, it, expect, vi, afterEach } from "vitest";
import { onRenderChatMessage, isResponsibleClient, rollTargetActors, contextMenuEntry } from "../../src/core/compat-utils";
import { getHookCallback, getRegisteredHookEvents } from "../helpers/hooks";

describe("onRenderChatMessage", () => {
  afterEach(() => {
    delete (globalThis as any).game.release;
  });

  it("uses renderChatMessageHTML on v13+ and passes the HTMLElement through", () => {
    (globalThis as any).game.release = { generation: 14 };
    const fn = vi.fn();
    onRenderChatMessage(fn);
    expect(getRegisteredHookEvents()).toContain("renderChatMessageHTML");
    expect(getRegisteredHookEvents()).not.toContain("renderChatMessage");
    const el = { tagName: "LI" };
    getHookCallback("renderChatMessageHTML")("msg", el, { x: 1 });
    expect(fn).toHaveBeenCalledWith("msg", el, { x: 1 });
  });

  it("falls back to renderChatMessage on v12 and unwraps jQuery", () => {
    (globalThis as any).game.release = { generation: 12 };
    const fn = vi.fn();
    onRenderChatMessage(fn);
    expect(getRegisteredHookEvents()).toContain("renderChatMessage");
    const el = { tagName: "LI" };
    getHookCallback("renderChatMessage")("msg", { 0: el, jquery: "3" }, {});
    expect(fn).toHaveBeenCalledWith("msg", el, {});
  });
});

describe("isResponsibleClient", () => {
  const g = () => (globalThis as any).game;
  const asPlayer = () => { g().user = { id: "p1", name: "Player One", isGM: false, active: true, targets: new Set() }; };

  it("is the active GM's client when a GM is connected", () => {
    expect(isResponsibleClient({ author: { id: "p1" } })).toBe(true);
    asPlayer();
    expect(isResponsibleClient({ author: { id: "p1" } })).toBe(false);
  });

  it("prefers game.users.activeGM when available", () => {
    g().users.activeGM = { id: "other-gm" };
    expect(isResponsibleClient({ author: { id: "gm" } })).toBe(false);
    delete g().users.activeGM;
  });

  it("falls back to the message author when no GM is connected", () => {
    g().users.find((u: any) => u.isGM).active = false;
    asPlayer();
    expect(isResponsibleClient({ author: { id: "p1" } })).toBe(true);
    expect(isResponsibleClient({ author: { id: "p2" } })).toBe(false);
    expect(isResponsibleClient({ user: "p1" })).toBe(true); // v11 field, raw id
  });
});

describe("rollTargetActors", () => {
  const g = () => (globalThis as any).game;
  const foe = { id: "foe" };
  const other = { id: "other" };

  it("uses the processing user's targets when it is the author", () => {
    g().user.targets.add({ actor: foe });
    g().user.targets.add({ actor: other });
    expect(rollTargetActors({ author: { id: "gm" } }, { target: { actor: other } })).toEqual([foe, other]);
  });

  it("uses the roll's stored target for someone else's roll", () => {
    g().user.targets.add({ actor: other });
    expect(rollTargetActors({ author: { id: "p1" } }, { target: { actor: foe } })).toEqual([foe]);
    expect(rollTargetActors({ author: { id: "p1" } }, {})).toEqual([]);
  });
});

describe("contextMenuEntry", () => {
  it("sets both the v14 keys and the legacy ones", () => {
    const condition = () => true;
    const callback = () => {};
    const e = contextMenuEntry({ name: "Assign", icon: "<i></i>", condition, callback });
    expect(e).toMatchObject({ name: "Assign", label: "Assign", condition, visible: condition, callback, icon: "<i></i>" });
  });

  it("omits visibility keys when there is no condition", () => {
    expect(contextMenuEntry({ name: "X" } as any)).not.toHaveProperty("visible");
  });
});
