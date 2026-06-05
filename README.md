# L5R5e Combat Helper

An automation module for Foundry VTT that streamlines combat damage application in Legend of the Five Rings 5th Edition.

![Foundry Version](https://img.shields.io/badge/Foundry-v11--v14-green)
![System](https://img.shields.io/badge/System-L5R5e-red)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Automatic Damage Application**: Calculates and applies fatigue damage automatically when attacks succeed
- **Armor Reduction**: Automatically subtracts equipped armor's physical resistance from damage
- **Void Reaction – Don't Defend**: Targets may spend a Void Point to willingly suffer a Critical Strike instead of defending
- **Opportunity Critical Strike**: Attackers may spend 2 Opportunities from a successful attack to inflict a Critical Strike in addition to normal damage
- **Critical Strike Mitigation**: Characters can roll Fitness to reduce the severity of incoming critical strikes
- **Shattering Parry**: After rolling mitigation, characters may parry the blow with a readied weapon, rerolling all mitigation dice at the cost of that weapon gaining the Damaged quality
- **Automatic Critical Resolution**: Critical strike severity is calculated automatically based on weapon deadliness and mitigation
- **Incapacitated Detection**: Detects when a character becomes incapacitated
- **Smart Weapon Detection**: Automatically finds equipped/readied weapons and uses their damage values
- **Bonus Success Calculation**: Adds additional successes beyond TN as bonus damage
- **Rich Chat Messages**: Informative chat cards showing attack, damage, and critical calculations
- **GM Target Assignment**: The GM can retroactively assign or reassign the target of any attack roll — useful when a player forgot to select a target or the wrong token was targeted
- **GM Difficulty Change**: The GM can retroactively change the Target Number (TN) of any L5R5e roll — the system reverts all downstream effects, recalculates the result, and re-applies consequences with the new difficulty

## Installation

### Method 1: Manifest URL (Recommended when available)

1. Open Foundry VTT
2. Go to **Add-on Modules**
3. Click **Install Module**
4. Paste this URL in the **Manifest URL** field:

```
   https://raw.githubusercontent.com/Yandalar/l5r5e-combat-helper/main/module.json
```

5. Click **Install**

### Method 2: Manual Installation

1. Download the latest release ZIP from [Releases](https://github.com/Yandalar/l5r5e-combat-helper/releases)
2. Extract the ZIP file
3. Copy the `l5r5e-combat-helper` folder to your Foundry `Data/modules` directory
4. Restart Foundry VTT
5. Enable the module in your L5R5e world

**Usual Data Directory Locations:**

- **Windows**: `%localappdata%/FoundryVTT/Data/modules/`
- **Mac**: `~/Library/Application Support/FoundryVTT/Data/modules/`
- **Linux**: `~/.local/share/FoundryVTT/Data/modules/`

## Usage

### Basic Usage

1. Enable the module in your world's module settings
2. As GM, make sure **L5R5e Combat Helper** is enabled in Module Settings
3. Select a target token
4. Make an attack roll with a martial skill
5. Click "Roll & Keep" and select your dice
6. The module automatically:
   - Detects the attack
   - Checks if it succeeded
   - Calculates damage (weapon base + bonus successes)
   - Subtracts armor resistance
   - Applies damage to target's fatigue
   - Detects Critical Strikes on already incapacitated targets

### Configuration

Access module settings via **Game Settings → Configure Settings → Module Settings**

#### L5R5e Combat Helper

- **Default**: Enabled
- Toggles automatic damage application on/off

#### Enable Void Point Defense Choice

- **Default**: Enabled
- Allows players to spend Void to willingly accept a Critical Strike instead of defending

## Game Mechanics

### Damage Calculation

```
Raw Damage = Weapon Base Damage + Bonus Successes
Bonus Successes = Total Successes - TN
Final Damage = Max(0, Raw Damage - Armor Physical Resistance)
```

### Armor Blocking

If armor completely negates damage (resistance ≥ raw damage):

- No fatigue is applied
- A special "Damage Blocked" message appears
- Shows the calculation in chat

### Incapacitated Condition

When a character's fatigue exceeds their endurance:

- The module automatically applies the Incapacitated condition
- A warning message appears in chat
- Future attacks on this character become Critical Strikes

### Critical Strikes

If an attack targets a character who is already Incapacitated or has fatigue > endurance, the module will:

- Determine the **weapon deadliness**
- Prompt a **Fitness mitigation roll**
- Calculate the **final severity**
- Automatically apply the **critical effect**
- Display the full calculation in chat

### Opportunity Critical Strike

When a successful attack roll includes **2 or more Opportunities**, the damage message displays a button allowing the attacker to spend those Opportunities to inflict a **Critical Strike** in addition to the normal damage already applied.

To use this option:

1. Make a successful attack roll with **2+ Opportunities kept**
2. The damage message will show **"⚡ Spend 2 Opportunities — Critical Strike (N available)"**
3. Click the button to confirm

If confirmed:

- Normal fatigue damage remains applied
- A **Critical Strike** is triggered against the target using the weapon's Deadliness
- The target must roll **Fitness (TN 1)** to mitigate the critical severity
- The button becomes disabled after use — opportunities can only be spent once per attack

> **Note:** Only the attacker's owner (or the GM) can click this button.

### Void Reaction – Don't Defend

Targets may choose to **spend 1 Void Point** to willingly accept a **Critical Strike** instead of defending an attack.

To use this reaction:

1. Right-click the successful attack message in chat
2. Select **"Spend Void – Don't Defend"**
3. Confirm the action

If confirmed:

- The target spends **1 Void Point**
- Any fatigue damage from the attack is **reverted**
- A **Critical Strike** is triggered instead

### Critical Strike Mitigation

When a character suffers a Critical Strike, they may roll **Fitness (TN 1)** to reduce its severity.

The module automatically:

- Detects the completed **Fitness roll**
- Calculates the **severity reduction** (1 + bonus successes on success, 0 on failure)
- Determines the **final critical severity**
- Applies the corresponding **critical effect**
- Displays a **summary message in chat**

### Shattering Parry

Once per critical strike resolution, after rolling Fitness to mitigate, a character may invoke a **Shattering Parry** to reroll all mitigation dice, at the cost of their readied weapon gaining the **Damaged** quality.

To use Shattering Parry:

1. Complete the **Fitness mitigation roll** as normal
2. Right-click the **mitigation result message** in chat
3. Select **"Shattering Parry — Reroll Mitigation"**
4. Confirm the action

If confirmed:

- Any **critical effects already applied** from the original roll are **automatically reversed** (conditions removed, scar deleted)
- The **readied weapon gains the Damaged quality**
- A **new Fitness mitigation roll** is launched — only this result counts
- Effects that cannot be automatically reversed (armor damage from a Close Call, instant death) will show a **GM notification** for manual review

> **Note:** Shattering Parry can only be used once per mitigation result message. The option disappears from the context menu after it has been triggered.

### GM Target Assignment

The GM can assign or reassign the target of any finished martial attack roll directly from the chat log. This is useful when:

- A player forgot to select a target before rolling
- The wrong token was targeted and damage was already applied

To use this feature:

1. **Target a token** on the canvas (the new intended target)
2. **Right-click the attack roll message** in the chat log
3. Select **"Assign Target"** (GM-only option)
4. Review the confirmation dialog:
   - **First assignment**: Shows the estimated damage that will be applied to the new target
   - **Reassignment**: Shows how much fatigue will be reverted from the original target and how much will be applied to the new one
5. Confirm to apply

If reassigning after damage was already applied:

- The previous target's fatigue is **automatically reverted** to its pre-attack value
- The prior damage message is **deleted from the chat log**
- Damage is then calculated and applied to the **new target**

> **Note:** This option is only visible to the GM and only appears on finished martial attack roll messages (melee, ranged, or unarmed skills with a completed roll).

### GM Difficulty Change

The GM can retroactively change the **Target Number (TN)** of any completed L5R5e roll. The module reverts all downstream effects, recalculates the outcome, and re-applies consequences based on the new difficulty.

To use this feature:

1. **Right-click any L5R5e roll message** in the chat log
2. Select **"Change Difficulty (TN)"** (GM-only option)
3. Enter the new TN in the dialog
4. Confirm

What happens:

- The original roll message **stays in the chat** and gets a note at the bottom showing the old TN, new TN, and updated success/failure result
- All downstream messages (damage, critical strike prompt, mitigation result, critical effect) are **deleted**
- All state changes (fatigue, critical conditions, scars, weapon damage) are **automatically reverted**
- The module **re-runs the full downstream flow** with the new TN — applying damage, triggering critical strikes, or doing nothing if the roll now fails

**Reversal coverage:**

| Downstream effect | Reverted automatically |
|---|---|
| Fatigue damage | ✓ |
| Critical conditions (Lightly/Severely Wounded, Bleeding, Dying) | ✓ |
| Permanent scar | ✓ |
| Armor Damaged (Close Call critical) | ✓ |
| Weapon Damaged (Shattering Parry) | ✓ |

> **Note:** This option is visible to the GM on any message containing an L5R5e roll. For attack rolls on already-incapacitated targets, the GM must have the intended target token selected on the canvas when changing difficulty — so the module knows which actor to target.

## Chat Message Examples

### Normal Damage

```
💥 Damage Applied
Kakita Yoshi deals 3 damage to Hida Kisada
Damage reduced by armor: 5 - 2 = 3
Fatigue: 4 → 7 / 10
```

### Armor Blocks All Damage

```
🛡️ Damage Blocked
Kakita Yoshi attacks Hida Kisada
Raw damage: 3 - Armor: 5 = 0 damage
The armor completely absorbed the blow!
```

### Incapacitated

```
💥 Damage Applied
Kakita Yoshi deals 4 damage to Hida Kisada
Fatigue: 6 → 10 / 10
⚠️ INCAPACITATED!
```

### Critical Strike

```
💀 CRITICAL STRIKE!
Kakita Yoshi delivers a critical strike to Hida Kisada!
Hida Kisada was already Incapacitated when struck!
⚠️ Roll for Critical Strike consequences!
```

### Opportunity Critical Strike

```
💥 Damage Applied
Kakita Yoshi deals 3 damage to Hida Kisada
Fatigue: 4 → 7 / 12
[⚡ Spend 2 Opportunities — Critical Strike (2 available)]
```

### Shattering Parry

```
🛡️ SHATTERING PARRY!
Hida Kisada uses Shattering Parry!
⚔️ Kisada's Tetsubo takes the brunt of the blow and gains the Damaged quality.
Previous critical effects have been reversed.
⏩ Rerolling all Fitness dice for mitigation…
```

## Requirements

- **Foundry VTT**: Version 11–14
- **Game System**: Legend of the Five Rings 5th Edition (l5r5e)
- **Permissions**: GM user required for automatic damage application

## Compatibility

### Known Compatible

- L5R5e System v1.13.3+
- Foundry VTT v11, v12, v13, v14

### Data Structure Requirements

The module expects actors to have:

- `system.fatigue` or `system.fatigue.value` (for current fatigue)
- `system.endurance`, `system.endurance.value`, or calculable from rings (for max endurance)
- Weapons with `system.damage` (numeric value)
- Armor with `system.armor.physical` (numeric value)

## Roadmap

### Planned Features

- [ ] Support for supernatural damage and armor
- [ ] Technique damage modifications

## Credits

**Author**: Yandalar

**Special Thanks**:

- The L5R5e Foundry system developers
- The Foundry VTT community
- Playtesters and contributors

## License

This module is licensed under the MIT License. See [LICENSE](https://raw.githubusercontent.com/Yandalar/l5r5e-combat-helper/main/LICENSE) file for details.

This is an unofficial module and is not affiliated with or endorsed by Fantasy Flight Games or Edge Studio.

## Support

- **Issues**: [GitHub Issues](https://github.com/Yandalar/l5r5e-combat-helper/issues)
- **Discord**: [Foundry VTT Discord](https://discord.gg/foundryvtt) - #modules channel

## Links

- [Foundry VTT](https://foundryvtt.com/)
- [L5R5e System](https://foundryvtt.com/packages/l5r5e)
- [Legend of the Five Rings](https://www.legendofthefiverings.com/)
