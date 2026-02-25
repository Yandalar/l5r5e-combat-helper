# L5R5e Combat Helper

An automation module for Foundry VTT that streamlines combat damage application in Legend of the Five Rings 5th Edition.

![Foundry Version](https://img.shields.io/badge/Foundry-v11+-green)
![System](https://img.shields.io/badge/System-L5R5e-red)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Automatic Damage Application**: Calculates and applies fatigue damage automatically when attacks succeed
- **Armor Reduction**: Automatically subtracts equipped armor's physical resistance from damage
- **Incapacitated Detection**: Applies Incapacitated condition when fatigue reaches or exceeds endurance
- **Critical Strike Detection**: Identifies and announces critical strikes on already incapacitated targets
- **Smart Weapon Detection**: Automatically finds equipped/readied weapons and uses their damage values
- **Bonus Success Calculation**: Adds additional successes beyond TN as bonus damage
- **Rich Chat Messages**: Beautiful, informative chat cards showing damage calculations
- **Debug Mode**: Comprehensive logging for troubleshooting and development

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
   - Applies Incapacitated if fatigue > endurance
   - Detects Critical Strikes on already incapacitated targets

### Configuration

Access module settings via **Game Settings → Configure Settings → Module Settings**

#### L5R5e Combat Helper

- **Default**: Enabled
- Toggles automatic damage application on/off

## Game Mechanics

### Damage Calculation

```
Raw Damage = Weapon Base Damage + Bonus Successes
Bonus Successes = Total Successes - TN
Final Damage = Max(0, Raw Damage - Armor Physical Resistance)
```

### Incapacitated Condition

When a character's fatigue exceeds their endurance:

- The module automatically applies the Incapacitated condition
- A warning message appears in chat
- Future attacks on this character become Critical Strikes

### Critical Strikes

If an attack targets a character who is:

- Already Incapacitated, OR
- Has fatigue > endurance

The module will:

- Display a special Critical Strike message
- Alert the GM to roll for critical consequences
- NOT apply additional fatigue damage

### Armor Blocking

If armor completely negates damage (resistance ≥ raw damage):

- No fatigue is applied
- A special "Damage Blocked" message appears
- Shows the calculation in chat

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

## Requirements

- **Foundry VTT**: Version 11 or higher
- **Game System**: Legend of the Five Rings 5th Edition (l5r5e)
- **Permissions**: GM user required for automatic damage application

## Compatibility

### Known Compatible

- L5R5e System v1.13.3+
- Foundry VTT v11, v12, v13

### Data Structure Requirements

The module expects actors to have:

- `system.fatigue` or `system.fatigue.value` (for current fatigue)
- `system.endurance`, `system.endurance.value`, or calculable from rings (for max endurance)
- Weapons with `system.damage` (numeric value)
- Armor with `system.armor.physical` (numeric value)

## Roadmap

### Planned Features

- [ ] Support for supernatural damage and armor
- [ ] Critical strike table integration
- [ ] Technique damage modifications
- [ ] Multi-language support

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
