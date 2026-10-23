# L5R5e Combat Helper

An automation module for Foundry VTT that streamlines combat for the Legend of the Five Rings 5th Edition system.

![Foundry Version](https://img.shields.io/badge/Foundry-v11--v14-green)
![System](https://img.shields.io/badge/System-L5R5e-red)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Automatic Damage Application** — Calculates and applies fatigue when attacks succeed, including armor reduction and bonus successes
- **Incapacitated Detection** — Automatically detects when a character crosses their endurance threshold
- **Critical Strikes** — Triggers the full critical strike workflow when an incapacitated character is hit
- **Critical Strike Mitigation** — Detects Fitness rolls and automatically applies the resulting critical effect
- **Opportunity Critical Strike** — Lets attackers spend 2 Opportunities from a successful attack to deal a Critical Strike alongside normal damage
- **Void Reaction – Don't Defend** — Targets may spend 1 Void Point to willingly accept a Critical Strike instead of defending
- **Shattering Parry** — After rolling Fitness, characters may reroll all mitigation dice at the cost of their weapon gaining the Damaged quality
- **Attitude Effects** — Automatically applies the mechanical effects of Air, Fire, and Earth stances: Air increases incoming attack TN, Fire adds strife symbols as bonus damage, Earth blocks opportunity-based critical strikes
- **Katas** — Detects kata rolls from the character sheet and applies their effects to the targets: conditions, damage, critical strikes, forced stances, resistance rolls (with ring-dependent TNs), timed buffs and debuffs that expire with the turn order. Covers every Core Rulebook kata the module can resolve (22 of 32) plus Bear's Swipe Style; manual parts are shown as reminders on the card
- **Kihō** — Covers all 23 Core Rulebook kihō: a successful roll activates the enhancement (one per character, shown as a "☯ Kihō" Active Effect with its ring's icon and aura) and resolves the burst effect by bonus successes. Enhancements modify unarmed attacks and attacks against the user, and add reaction buttons and choice cards where the rules need a decision
- **Unarmed attacks** — Punches use the roll's or an equipped unarmed weapon, or the punch profile (damage 1, deadliness 2), never the equipped katana
- **Ring-dependent TNs** — Resistance and mitigation rolls with TNs like "TN 3 (Earth 4, Fire 1)" are resolved with the ring rolled, and the dice picker the module opens updates its TN when the ring changes
- **Player-friendly technique cards** — Players spend their own kata opportunities, use kihō reactions and pick choice-card options from the chat; the GM's client applies the effect
- **GM Target Assignment** — Assign or reassign the target of any attack roll after the fact, reverting and reapplying damage automatically
- **GM Difficulty Change** — Retroactively change the TN of any roll; all downstream effects are reverted and recalculated

→ [Full documentation on the Wiki](../../wiki)

## Installation

### Manifest URL (Recommended)

1. Open Foundry VTT → **Add-on Modules** → **Install Module**
2. Paste the manifest URL:
   ```
   https://github.com/Yandalar/l5r5e-combat-helper/releases/latest/download/module.json
   ```
3. Click **Install**

After updating to a new version, restart the world (return to setup and launch it again) so Foundry picks up any manifest change.

### Manual

1. Download the latest release ZIP from [Releases](https://github.com/Yandalar/l5r5e-combat-helper/releases)
2. Extract it into a new `l5r5e-combat-helper` folder inside your Foundry `Data/modules/` directory (the ZIP contains `module.json` at its root)
3. Restart Foundry VTT and enable the module in your L5R5e world

**Data directory locations:**
- Windows: `%localappdata%/FoundryVTT/Data/modules/`
- Mac: `~/Library/Application Support/FoundryVTT/Data/modules/`
- Linux: `~/.local/share/FoundryVTT/Data/modules/`

## Requirements

- **Foundry VTT**: v11–v14
- **Game System**: Legend of the Five Rings 5th Edition (`l5r5e`) 1.13.3 or later
- **Permissions**: a GM must be connected for the automation to run (damage, kata and kihō effects, players' button clicks)

## Support

- **Issues**: [GitHub Issues](https://github.com/Yandalar/l5r5e-combat-helper/issues)
- **Discord**: [Foundry VTT Discord](https://discord.gg/foundryvtt) — #modules channel

## Credits

**Author**: Yandalar — Special thanks to the L5R5e system developers, the Foundry VTT community, and all playtesters.

## License

MIT License. See [LICENSE](LICENSE) for details. Unofficial module, not affiliated with Fantasy Flight Games or Edge Studio.
