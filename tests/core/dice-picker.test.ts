// @ts-nocheck
import { describe, it, expect, beforeEach } from "vitest";
import { applyRingDifficulty, openDicePicker } from "../../src/core/dice-picker";
import { registerKataActivationHandler } from "../../src/techniques/kata-activation";
import { getHookCallbacks } from "../helpers/hooks";
import { createMockActor } from "../helpers/foundry-mocks";

const NS = "l5r5e-combat-helper";
const g = () => globalThis as any;

/** Same shape as the system's DicePickerDialog (dice-picker-dialog.js, l5r5e 1.14.1). */
class MockDicePicker {
  _difficultyHiddenIsLock = { gm: false, option: false };
  object = { ring: { id: "void", value: 1 }, difficulty: { value: 2, hidden: false } };
  _actor = null;
  render = () => this;

  constructor(options: Record<string, any> = {}) {
    if (options.actor) this.actor = options.actor;
    if (options.ringId) this.ringId = options.ringId;
    if (options.difficultyHidden) this._difficultyHiddenIsLock.option = true;
    if (options.difficulty) this.difficulty = options.difficulty;
  }

  set actor(actor) {
    this._actor = actor;
    this.ringId = actor.system.stance;
  }

  set ringId(ringId) {
    this.object.ring.id = ringId;
    this.object.ring.value = this._actor?.system.rings?.[ringId] || 1;
  }

  set difficulty(difficulty) {
    if (this._difficultyHiddenIsLock.option) return;
    this.object.difficulty.value = parseInt(difficulty);
  }
}

const RINGS = { earth: 1, fire: -2 }; // TN 4 (Earth 5, Fire 2)
const actor = (stance = "earth") => ({ system: { stance, rings: { earth: 3, fire: 2, water: 2 } } });
const tn = (d: any) => d.object.difficulty.value;

describe("applyRingDifficulty", () => {
  it("the initial TN follows the actor's stance", () => {
    const dialog = applyRingDifficulty(new MockDicePicker({ actor: actor("earth"), difficulty: 4 }), 4, RINGS);
    expect(tn(dialog)).toBe(5);
  });

  it("choosing another ring updates the TN; a ring without a variant goes back to the base TN", () => {
    const dialog = applyRingDifficulty(new MockDicePicker({ actor: actor("earth"), difficulty: 4 }), 4, RINGS);
    dialog.ringId = "fire"; // what the ring click does
    expect(tn(dialog)).toBe(2);
    expect(dialog.object.ring).toEqual({ id: "fire", value: 2 });
    dialog.ringId = "water";
    expect(tn(dialog)).toBe(4);
  });

  it("the TN is at least 1", () => {
    const dialog = applyRingDifficulty(new MockDicePicker({ actor: actor("fire"), difficulty: 1 }), 1, RINGS);
    expect(tn(dialog)).toBe(1);
  });

  it("a locked hidden TN is left untouched", () => {
    const dialog = applyRingDifficulty(
      new MockDicePicker({ actor: actor("earth"), difficulty: 4, difficultyHidden: true }),
      4,
      RINGS,
    );
    dialog.ringId = "fire";
    expect(tn(dialog)).toBe(2); // the constructor's default, never changed
    expect(dialog.object.ring.id).toBe("fire");
  });

  it("does nothing without ring variants", () => {
    const dialog = applyRingDifficulty(new MockDicePicker({ actor: actor("earth"), difficulty: 4 }), 4, null);
    dialog.ringId = "fire";
    expect(tn(dialog)).toBe(4);
    expect(Object.getOwnPropertyDescriptor(dialog, "ringId")).toBeUndefined();
  });

  it("only changes that dialog instance", () => {
    applyRingDifficulty(new MockDicePicker({ actor: actor("earth"), difficulty: 4 }), 4, RINGS);
    const other = new MockDicePicker({ actor: actor("earth"), difficulty: 4 });
    other.ringId = "fire";
    expect(tn(other)).toBe(4);
  });

  it("leaves a dialog without a ringId setter alone", () => {
    const dialog = { object: { ring: { id: "earth" }, difficulty: { value: 4 } } };
    expect(() => applyRingDifficulty(dialog, 4, RINGS)).not.toThrow();
    expect(dialog.object.difficulty.value).toBe(4);
  });
});

describe("dialogs opened by the module", () => {
  let realPicker: any;

  beforeEach(() => {
    realPicker = g().game.l5r5e.DicePickerDialog;
  });

  it("openDicePicker builds, adjusts and renders the system dialog", () => {
    const rendered: boolean[] = [];
    g().game.l5r5e.DicePickerDialog = class extends MockDicePicker {
      render = () => rendered.push(true);
    };
    const dialog = openDicePicker({ actor: actor("fire"), difficulty: 4 }, RINGS);
    expect(tn(dialog)).toBe(2);
    expect(rendered).toEqual([true]);
    g().game.l5r5e.DicePickerDialog = realPicker;
  });

  it("the kata resistance button opens the dialog with the TN of the target's stance", async () => {
    let opened: any = null;
    g().game.l5r5e.DicePickerDialog = class extends MockDicePicker {
      render = () => (opened = this);
    };
    const target = createMockActor({ id: "foe", name: "Bandit", type: "npc", isOwner: true,
      system: { stance: "earth", rings: { earth: 3, fire: 2 } } });
    g().game.actors.push(target);
    await target.setFlag(NS, "pendingResistanceRoll", { difficulty: 4, ringDifficulty: RINGS });

    registerKataActivationHandler();
    const button: any = {
      dataset: { targetId: "foe", skill: "fitness", skillCat: "martial", difficulty: "4" },
      disabled: false,
      textContent: "",
      addEventListener(_type: string, fn: Function) { this.onClick = fn; },
    };
    const el = { querySelectorAll: (sel: string) => (sel === ".kata-resistance-roll-button" ? [button] : []) };
    for (const cb of getHookCallbacks("renderChatMessageHTML")) await cb({ getFlag: () => undefined }, el);
    await button.onClick({ preventDefault() {}, currentTarget: button });

    expect(tn(opened)).toBe(5);
    opened.ringId = "fire";
    expect(tn(opened)).toBe(2);
    g().game.l5r5e.DicePickerDialog = realPicker;
  });
});
