# Changelog

All notable changes to this project will be documented in this file.

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
