import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerGmRelay, runAsGM, onSocketMessage, senderCanActFor } from "../../src/core/gm-relay";
import { createMockActor } from "../helpers/foundry-mocks";

const g = () => globalThis as any;
let handler: any;

beforeEach(() => {
  g().game.socket = { on: vi.fn(), emit: vi.fn() };
  handler = vi.fn(async () => {});
  registerGmRelay({ testAction: handler });
});

describe("runAsGM", () => {
  it("runs locally for a GM", async () => {
    expect(await runAsGM("testAction", { a: 1 })).toBe(true);
    expect(handler).toHaveBeenCalledWith({ a: 1 }, "gm");
    expect(g().game.socket.emit).not.toHaveBeenCalled();
  });

  it("sends a player's request to the active GM", async () => {
    g().game.user = { id: "p1", isGM: false, targets: new Set() };
    expect(await runAsGM("testAction", { a: 1 })).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(g().game.socket.emit).toHaveBeenCalledWith("module.l5r5e-combat-helper", {
      action: "testAction", payload: { a: 1 }, senderId: "p1", gmId: "gm",
    });
  });

  it("warns and reports failure when no GM is connected", async () => {
    g().game.users.find((u: any) => u.isGM).active = false;
    g().game.user = { id: "p1", isGM: false, targets: new Set() };
    expect(await runAsGM("testAction", {})).toBe(false);
    expect(g().ui.notifications.warn).toHaveBeenCalled();
    expect(g().game.socket.emit).not.toHaveBeenCalled();
  });
});

describe("onSocketMessage", () => {
  it("only the addressed GM executes", async () => {
    await onSocketMessage({ action: "testAction", payload: {}, senderId: "p1", gmId: "other" });
    expect(handler).not.toHaveBeenCalled();
    await onSocketMessage({ action: "testAction", payload: { x: 1 }, senderId: "p1", gmId: "gm" });
    expect(handler).toHaveBeenCalledWith({ x: 1 }, "p1");
  });
});

describe("senderCanActFor", () => {
  it("allows GMs and owners only", () => {
    const pc = createMockActor({ ownerUserIds: ["p1"], isOwner: false });
    expect(senderCanActFor("gm", pc)).toBe(true);
    expect(senderCanActFor("p1", pc)).toBe(true);
    g().game.users.push({ id: "p2", isGM: false, active: true });
    expect(senderCanActFor("p2", pc)).toBe(false);
    expect(senderCanActFor("ghost", pc)).toBe(false);
  });
});
