import { describe, it, expect } from "vitest";
import { EFFECT_SUMMARY_RENDERERS, createKataSuccessMessage } from "../../src/techniques/technique-chat";
import { EFFECT_TYPES } from "../../src/techniques/technique-engine";
import { createMockActor } from "../helpers/foundry-mocks";
import { expectModuleWarn } from "../helpers/setup";

function g(): any {
  return globalThis as any;
}

/**
 * Bug #4 fix: createKataSuccessMessage used to only render lines for
 * condition/damage/assistance via an if/else chain. EFFECT_SUMMARY_RENDERERS
 * is now a derived map covering every EFFECT_TYPE, with DEFAULT_RENDERER
 * logging a warning (instead of silently dropping the line) for anything
 * unmapped — Task 6's registry integrity test checks this map stays total.
 *
 * Every handler's summary `type` matches its EFFECT_TYPE verbatim (no
 * invented "...scheduled"-style names), so the totality check below can
 * compare key sets directly instead of hardcoding an expected list that
 * could silently drift out of sync with technique-engine.ts again.
 */

describe("EFFECT_SUMMARY_RENDERERS", () => {
  it("condition renders via conditionApplied — the i18n string already carries its own emoji", () => {
    const line = EFFECT_SUMMARY_RENDERERS.condition({ statusId: "prone", targets: ["Bandit"] });
    expect(line).toBe("✅ prone applied to Bandit");
  });

  it("damage renders fatigue results via damageApplied by default", () => {
    const line = EFFECT_SUMMARY_RENDERERS.damage({ results: [{ target: "Foe", damage: 3, resource: "fatigue" }] });
    expect(line).toBe("💥 3 damage → Foe");
  });

  it("damage renders strife results via strifeApplied", () => {
    const line = EFFECT_SUMMARY_RENDERERS.damage({ results: [{ target: "Foe", damage: 2, resource: "strife" }] });
    expect(line).toContain("Foe");
    expect(line).toContain("2");
    expect(line).not.toContain("damage →");
  });

  it("damage joins multiple results with <br>", () => {
    const line = EFFECT_SUMMARY_RENDERERS.damage({
      results: [
        { target: "A", damage: 1, resource: "fatigue" },
        { target: "B", damage: 2, resource: "strife" },
      ],
    });
    expect(line.split("<br>")).toHaveLength(2);
  });

  it("assistance renders with a 💡 prefix", () => {
    const line = EFFECT_SUMMARY_RENDERERS.assistance({ targets: ["Ally"] });
    expect(line).toBe("💡 Assistance active on Ally");
  });

  it("attack_tn_reduction renders via tnReductionApplied", () => {
    const line = EFFECT_SUMMARY_RENDERERS.attack_tn_reduction({ amount: 1, targets: ["Foe"] });
    expect(line).toContain("1");
    expect(line).toContain("Foe");
  });

  it("resistance_roll reads target .name (Actor objects, not strings)", () => {
    const line = EFFECT_SUMMARY_RENDERERS.resistance_roll({
      targets: [{ name: "Foe" }, { name: "Bandit" }],
    });
    expect(line).toContain("Foe");
    expect(line).toContain("Bandit");
  });

  it("resistance_buff renders amount + targets", () => {
    const line = EFFECT_SUMMARY_RENDERERS.resistance_buff({ amount: 2, targets: ["Ally"] });
    expect(line).toContain("2");
    expect(line).toContain("Ally");
  });

  it("critical_severity_boost renders amount + targets", () => {
    const line = EFFECT_SUMMARY_RENDERERS.critical_severity_boost({ amount: 3, targets: ["Foe"] });
    expect(line).toContain("3");
    expect(line).toContain("Foe");
  });

  it("condition_lock renders the locked condition + targets", () => {
    const line = EFFECT_SUMMARY_RENDERERS.condition_lock({ conditionId: "bleeding", targets: ["Foe"] });
    expect(line).toContain("bleeding");
    expect(line).toContain("Foe");
  });

  it("is total over EFFECT_TYPES — every effect type technique-engine.ts can dispatch has a renderer", () => {
    // Derived comparison (not a hardcoded literal list): if EFFECT_HANDLERS
    // grows a new effect type without a matching renderer being added here,
    // this test catches it instead of the chat card silently dropping the
    // line at runtime (bug #4).
    expect(new Set(Object.keys(EFFECT_SUMMARY_RENDERERS))).toEqual(new Set(EFFECT_TYPES));
  });
});

describe("createKataSuccessMessage — effect rendering", () => {
  it("skips an effect summary type with no renderer and logs a warning instead of throwing", async () => {
    expectModuleWarn(/No chat renderer for effect summary type/);
    const attacker = createMockActor({ id: "att", name: "Att" });

    await createKataSuccessMessage(
      { names: ["Test Kata"] },
      attacker,
      [],
      3,
      0,
      2,
      [{ type: "totally_unrendered_type" }],
      null,
      "msg-1",
      0,
      0,
    );

    const card = g().game.messages.at(-1);
    expect(card.content).not.toContain("totally_unrendered_type");
  });

  it("renders a known effect summary inline", async () => {
    const attacker = createMockActor({ id: "att", name: "Att" });
    await createKataSuccessMessage(
      { names: ["Test Kata"] },
      attacker,
      [],
      3,
      0,
      2,
      [{ type: "condition", statusId: "prone", targets: ["Bandit"] }],
      null,
      "msg-1",
      0,
      0,
    );
    const card = g().game.messages.at(-1);
    expect(card.content).toContain("prone applied to Bandit");
  });

  it("shows a TN-reduced line when tnReduction > 0", async () => {
    const attacker = createMockActor({ id: "att", name: "Att" });
    await createKataSuccessMessage(
      { names: ["Test Kata"] }, attacker, [], 1, 0, 1, [], null, "msg-1", 0, 1,
    );
    const card = g().game.messages.at(-1);
    expect(card.content).toMatch(/reduced/i);
  });

  it("omits the TN-reduced line when tnReduction is 0 (the default)", async () => {
    const attacker = createMockActor({ id: "att", name: "Att" });
    await createKataSuccessMessage(
      { names: ["Test Kata"] }, attacker, [], 4, 2, 2, [], null, "msg-1", 0,
    );
    const card = g().game.messages.at(-1);
    expect(card.content).not.toMatch(/reduced/i);
  });
});
