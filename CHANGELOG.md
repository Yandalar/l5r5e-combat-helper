# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Kihō base**:
  - Kihō rolled from the sheet are detected. A successful roll activates the kihō's enhancement (one per character; another kihō replaces it) and resolves its burst effect by bonus successes.
  - The card has an "End kihō" button, and combat end clears active kihō.
  - Individual kihō are added in the next tickets.
- Choice cards: a technique can let the attacker or the target pick an option, and the GM's client applies it.

- **16 more katas from the Core Rulebook**:
  - Active: Iaijutsu Cut: Crossing Blade, Iaijutsu Cut: Rising Blade, Flowing Water Strike, Crimson Leaves Strike, Heartpiercing Strike and Pin the Fan.
  - Passive (opportunity cards on a matching attack roll): Breath of Wind Style, Crashing Wave Style, Disappearing World Style, Iron in the Mountains Style, Rushing Avalanche Style, Spinning Blades Style, Pelting Hail Style, Open-Hand Style and Veiled Menace Style.
  - Warrior's Resolve: send the technique to chat from the sheet and press "Use" to spend a Void point and remove fatigue (once per combat).
  - Parts a kata can't automate (disarming, readying a sheathed weapon, moving, unchecked weapon properties) are shown as reminders on its card.
- Resistance rolls with ring-dependent TNs ("TN 3 (Earth 4, Fire 1)"); the TN is computed from the ring the target rolls with.
- Katas can trigger critical strikes with their own severity and, for Heartpiercing Strike, their own Fitness TN, through the usual critical strike card.
- Opportunity result cards list what each effect did.

### Changed

- Coiling Serpent Style: Immobilized costs 2 opportunities per target, and the spend button only appears when there are enough opportunities.

### Fixed

- Unarmed attacks dealt the equipped weapon's damage (e.g. a katana). They now use the roll's or an equipped unarmed weapon, or the punch profile (damage 1, deadliness 2).
- Critical strikes, mitigation, Shattering Parry, Void defense, opportunity criticals, difficulty changes and target reassignment now follow unlinked tokens instead of the sidebar actor that shares their id.

## [1.1.0] - 2026-10-21

### Added

- **Attitude (stance) effects**: Air raises the TN of attacks against the character, Fire adds the roll's strife symbols as bonus damage, and Earth protects against opportunity-based critical strikes.
- **Kata automation**: rolling a kata from the character sheet is detected and its mechanical effects are applied to the targeted tokens.
  - Activation, failure, resistance-roll and result chat cards.
  - Effects: conditions, damage (with or without armor), assistance, resistance rolls for the target, physical resistance modifiers, critical severity boosts, condition locks and attack TN reductions, scaled by bonus successes or opportunities spent.
  - Timed effects (until the start or the end of the user's next turn, or the whole scene) are cleaned up automatically as turns advance and when combat ends; affected tokens show a light aura while they last.
  - Supported katas: Soaring Slice, Lord Hida's Grip, Coiling Serpent Style (Immobilized half; the weapon lock is shown as a note), Striking as Earth, Striking as Fire, Striking as Water and Bear's Swipe Style. Other techniques are ignored and resolved by hand.
  - Katas are recognized by their English or Spanish name, regardless of a clan tag such as "(Crab)", typographic apostrophes, accents or case.
- **Players can spend kata opportunities** from the chat cards; the effect is applied by the connected GM through the module socket.

### Changed

- Foundry v14 compatibility: chat card buttons use the `renderChatMessageHTML` hook and chat context-menu entries use `label`/`visible`, removing the deprecation warnings.
- Lord Hida's Grip refuses targets below silhouette 3.
- Striking as Water now lasts until the end of the attacker's next turn and never lowers physical resistance below 0.
- **The world must be restarted once after updating** so Foundry enables the new module socket.

### Fixed

- With several users connected, every client processed each roll, duplicating chat cards and effects. Rolls, effect expiry and combat-end cleanup now run only on the active GM's client (or on the roller's when no GM is connected).
- Effects applied after a kata card (opportunity spends, resistance rolls) landed on the sidebar actor instead of the targeted unlinked token; cards now store each actor's UUID.
- Timed kata effects on unlinked tokens never expired.
- Attacking with several targets selected produces an independent damage message for each one.

### Internal

- Vitest suite with mocked Foundry globals (`npm test`).
- New helpers: `compat-utils` (`onRenderChatMessage`, `isResponsibleClient`, `rollTargetActors`, `contextMenuEntry`), `actor-refs` and `gm-relay`.
- Releases are built and published by GitHub Actions when a `vX.Y.Z` tag is pushed; the manifest URL now points to the latest release.

---

## [1.0.1] - 2026-06-05

### Added

- Implemented **GM Difficulty Change**: the GM can right-click any L5R5e roll message and retroactively change its Target Number (TN).
  - The system reverts the full downstream chain (fatigue, critical conditions, scars, weapon Damaged quality) before re-applying consequences under the new TN.
  - The original roll message stays in chat and receives an inline note showing old TN → new TN and the updated success/failure outcome.
  - Supports the complete chain: damage → critical strike → Fitness mitigation → critical effects → Shattering Parry reroll.
  - For non-attack rolls the module posts a summary message with the new success count; no state changes are reverted since none were triggered.
- Implemented **GM Target Assignment**: the GM can right-click any finished martial attack roll message and assign or reassign the target.
  - On first assignment the module applies damage to the selected token.
  - On reassignment it reverts fatigue from the previous target, deletes the old damage message, and applies damage to the new target.
- Added **Foundry v13/v14 compatibility layer** (`compat-utils.ts`) providing `confirmDialog` (wraps `DialogV2.confirm` with `Dialog.confirm` fallback) and `resolveMessageId` (handles both `HTMLElement` and jQuery `li` elements from context menus).

### Fixed

- Removed an unintentional dynamic `import()` of `critical-effects-table.ts` inside `critical-mitigation.ts` — a leftover from the original JS codebase. Converted to a static import, eliminating a Vite build warning.

### Internal

- Migrated entire codebase from JavaScript to **TypeScript + Vite** (Phase 1: all files carry `// @ts-nocheck`; type errors suppressed to allow incremental adoption).
- Build pipeline replaced with Vite; `dist/bundle.js` is the single output loaded by Foundry.
- Added `originRollId` tracking to every downstream chat message flag (`criticalStrike`, `shatteringParryData`, new `mitigationResult`) so the full effect chain can be walked in both directions from any roll.
- `shatteringParryData` flag now stores `shatteringParryAnnouncementId` and `fitnessRollMessageId` for complete chain deletion on difficulty change.
- `createShatteringParryMessage()` now returns the created `ChatMessage` so its ID can be recorded before marking the mitigation message as consumed.

---

## [0.9.0] - 2026-03-11

### Added

- Implemented **Opportunity-Based Critical Strike**.
- When a successful attack roll includes **2 or more Opportunities**, the damage message now shows a button: **"⚡ Spend 2 Opportunities — Critical Strike"**.
- Normal fatigue damage is applied as usual; the Critical Strike is an additional consequence.
- Clicking the button triggers the full **Critical Strike workflow** using the attacking weapon's Deadliness, identical to the existing incapacitation-based critical path.
- The button is only visible and clickable by the attacker's owner (or GM).
- The button can only be used once per attack message.

### Internal

- Added `opportunity-critical.js` module handling button click registration, permission validation, and critical strike dispatch.
- `attackData` flag now stores `weaponId`, `opportunities`, and `opportunityCriticalUsed` fields.
- `createDamageMessage()` conditionally renders the opportunity button based on `attackData.opportunities >= 2`.
- Damage messages now use `getCombatOwnership()` instead of `getTargetOwnership()`, granting OWNER permission to both the attacker's and target's owners so each can interact with their respective message buttons.
- Added `getCombatOwnership()` helper to `chat-messages.js`.

---

## [0.8.0] - 2026-03-09

### Added

- Implemented **Shattering Parry** reaction for Critical Strike mitigation.
- After rolling Fitness to mitigate a Critical Strike, right-clicking the mitigation result message now provides the option **"Shattering Parry — Reroll Mitigation"**.
- When confirmed:
  - Any **critical effects already applied** from the original mitigation roll are **automatically reversed** (conditions removed, scar item deleted from actor).
  - The **parrying weapon gains the Damaged quality**.
  - A **new Fitness mitigation roll** is launched, replacing the original result entirely.
- Reversal of non-automatable effects (armor damage from a Close Call, instant death) shows a **GM notification** prompting manual review.
- Added Spanish localization (`es.json`) for all new strings.

### Internal

- Added `shattering-parry.js` module handling context menu registration, effect reversal orchestration, weapon damage, and reroll launch.
- Added `reverseCriticalEffect()` export to `critical-effects-application.js`, symmetrically undoing conditions, scar items, and dying states.
- Added `removeScarFromActor()` helper that identifies the previously created scar item via actor flag (`shatteringParryScarItemId`) and deletes it via `deleteEmbeddedDocuments`.
- `addScarToActor()` now returns the created item `id`, stored in the actor flag for later reversal.
- `applyPermanentScar()` persists the created scar item id to the actor flag.
- `createMitigationResultMessage()` now returns the created `ChatMessage` so the mitigation handler can attach `shatteringParryData` flags to it.
- `shatteringParryData` flag on the mitigation message stores `wasWeaponSharp` (boolean snapshot at roll time) to correctly reverse conditional Bleeding on revert without needing to re-resolve the attacker's weapon.

---

## [0.7.0] - 2026-03-05

### Added

- Implemented **Critical Strike resolution workflow**.
- Added automatic **Fitness mitigation roll detection** for Critical Strikes.
- Implemented **severity reduction logic** based on the mitigation roll:
  - Successful Fitness checks reduce severity by **1 + bonus successes**.
- Added automatic calculation of **final critical severity** based on:
  - Weapon **Deadliness**
  - Mitigation result
- Implemented **Critical Strike effect resolution**, automatically applying the appropriate effect based on the final severity.
- Added **chat messages summarizing mitigation results**, including:
  - Ring used
  - Total successes rolled
  - Severity reduction
  - Final critical severity
- Added automatic **resolution tracking for Critical Strike chat messages** to prevent duplicate processing.
- Added **visual feedback in chat** indicating when a Critical Strike has been resolved.

### Improvements

- Improved internal combat utilities for:
  - Attack success detection
  - Damage calculation
  - Armor resistance evaluation
- Added schema-tolerant actor utilities for:
  - Endurance resolution
  - Fatigue management
  - Void Point consumption
  - Condition detection (e.g. Incapacitated)

### Internal

- Added modular utility layers:
  - `actor-utils`
  - `damage-utils`
  - `critical mitigation handler`
- Improved error handling during combat resolution.
- Refactored combat logic into **pure calculation helpers** and **document mutation utilities**.

---

## [0.6.0] - 2026-03-01

### Added

- Added the possibility to spend a Void Point to willingly **not defend an attack** and receive a **Critical Strike** instead.
- Right-clicking a successful attack message now provides the option **"Spend Void – Don't Defend"**.
- When confirmed:
  - The attack's previously applied **Fatigue damage is reverted**.
  - The actor **spends one Void Point**.
  - A **Critical Strike resolution message** is generated.

### Changes

- Removed unnecessary UI notifications.
- Removed function that automatically applied the **Incapacitated** state.
