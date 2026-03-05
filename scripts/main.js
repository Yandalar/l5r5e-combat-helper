/**
 * L5R5e Combat Helper
 * Main module bootstrap and lifecycle orchestration.
 *
 * This file coordinates module initialization, settings registration,
 * and hook activation within the Foundry VTT lifecycle.
 *
 * Responsibilities:
 * - Register world settings during the `init` phase
 * - Register context-based UI hooks
 * - Activate combat processing logic once the game is fully ready
 */

import { registerCombatHandler } from "./combat-handler.js";
import { registerVoidDefenseHook } from "./void-defense.js";
import { registerCriticalStrikeRollHandler } from "./critical-strike-roll.js";
import { registerCriticalMitigationHandler } from "./critical-mitigation.js";

Hooks.once("init", () => {
  /**
   * Primary module enable/disable switch.
   *
   * When disabled, combat interception logic will not execute.
   * This allows world-level control over automation behavior.
   */
  game.settings.register("l5r5e-combat-helper", "l5r5eCombatHelper", {
    name: "L5R5e Combat Helper",
    hint: "Automates several situations in combat for Legend of the Five Rings 5th Edition.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  /**
   * Enables the optional Void "Don't Defend" reaction.
   *
   * When enabled, eligible players can spend a Void Point
   * via chat context menu to accept a Critical Strike instead
   * of defending normally.
   */
  game.settings.register("l5r5e-combat-helper", "enableVoidChoice", {
    name: "Enable Void Point Defense Choice",
    hint: "Allows players to spend Void to choose not to defend, suffering a Critical Strike instead.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
});

// Register chat context hook early so it is available
// as soon as the chat log UI becomes interactive.
registerVoidDefenseHook();

// Register critical strike roll button handler
registerCriticalStrikeRollHandler();

Hooks.once("ready", () => {
  /**
   * Register combat processing after all game documents,
   * actors, and system data are fully initialized.
   *
   * The combat handler relies on complete roll data and
   * actor resolution, which are guaranteed at the `ready` stage.
   */
  registerCombatHandler();

  /**
   * Register critical mitigation handler to process Fitness rolls
   * for critical strike mitigation.
   */
  registerCriticalMitigationHandler();
});
