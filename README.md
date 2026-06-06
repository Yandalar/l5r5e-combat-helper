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
- **GM Target Assignment** — Assign or reassign the target of any attack roll after the fact, reverting and reapplying damage automatically
- **GM Difficulty Change** — Retroactively change the TN of any roll; all downstream effects are reverted and recalculated

→ [Full documentation on the Wiki](../../wiki)

## Installation

### Manifest URL (Recommended)

1. Open Foundry VTT → **Add-on Modules** → **Install Module**
2. Paste the manifest URL:
   ```
   https://raw.githubusercontent.com/Yandalar/l5r5e-combat-helper/main/module.json
   ```
3. Click **Install**

### Manual

1. Download the latest release ZIP from [Releases](https://github.com/Yandalar/l5r5e-combat-helper/releases)
2. Extract and copy the `l5r5e-combat-helper` folder to your Foundry `Data/modules/` directory
3. Restart Foundry VTT and enable the module in your L5R5e world

**Data directory locations:**
- Windows: `%localappdata%/FoundryVTT/Data/modules/`
- Mac: `~/Library/Application Support/FoundryVTT/Data/modules/`
- Linux: `~/.local/share/FoundryVTT/Data/modules/`

## Requirements

- **Foundry VTT**: v11–v14
- **Game System**: Legend of the Five Rings 5th Edition (`l5r5e`)
- **Permissions**: GM required for automatic damage application

## Support

- **Issues**: [GitHub Issues](https://github.com/Yandalar/l5r5e-combat-helper/issues)
- **Discord**: [Foundry VTT Discord](https://discord.gg/foundryvtt) — #modules channel

## Credits

**Author**: Yandalar — Special thanks to the L5R5e system developers, the Foundry VTT community, and all playtesters.

## License

MIT License. See [LICENSE](LICENSE) for details. Unofficial module, not affiliated with Fantasy Flight Games or Edge Studio.
