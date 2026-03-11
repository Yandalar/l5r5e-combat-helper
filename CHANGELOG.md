# Changelog

All notable changes to this project will be documented in this file.

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
