// @ts-nocheck
/**
 * Custom Critical Configuration
 *
 * Allows the GM to configure which compendium items are used for permanent
 * scars, and which item names map to each ring.
 *
 * The critical effects table itself is not configurable — only the scar items.
 */

import { DEFAULT_SCAR_CONFIG } from "../critical/critical-effects-table";
import { confirmDialog } from "../core/compat-utils";

export class CustomCriticalConfig {
  static async open() {
    const saved = game.settings.get("l5r5e-combat-helper", "customScarConfig");
    const workingData = {
      scars: foundry.utils.deepClone(saved || DEFAULT_SCAR_CONFIG),
    };

    return new Promise((resolve) => {
      const dialog = new Dialog(
        {
          title: game.i18n.localize("l5r5e-combat-helper.config.title"),
          content: CustomCriticalConfig._buildHTML(workingData),
          buttons: {
            save: {
              icon: '<i class="fas fa-save"></i>',
              label: game.i18n.localize("l5r5e-combat-helper.config.save"),
              callback: async (html) => {
                CustomCriticalConfig._readForm(html, workingData);
                await CustomCriticalConfig._save(workingData);
                resolve(true);
              },
            },
            cancel: {
              icon: '<i class="fas fa-times"></i>',
              label: game.i18n.localize("l5r5e-combat-helper.config.cancel"),
              callback: () => resolve(false),
            },
          },
          default: "save",
          render: (html) => CustomCriticalConfig._onRender(html, workingData),
        },
        {
          width: 700,
          height: 580,
          resizable: true,
          classes: ["l5r5e-critical-config-dialog"],
        },
      );

      dialog.render(true);
    });
  }

  // The HTML for the table
  static _buildHTML(workingData) {
    const i18n = game.i18n;
    const rings = ["air", "earth", "fire", "water", "void"];
    const ringLabels = {
      air: i18n.localize("l5r5e-combat-helper.rings.air"),
      earth: i18n.localize("l5r5e-combat-helper.rings.earth"),
      fire: i18n.localize("l5r5e-combat-helper.rings.fire"),
      water: i18n.localize("l5r5e-combat-helper.rings.water"),
      void: i18n.localize("l5r5e-combat-helper.rings.void"),
    };

    const scarRings = rings
      .map((ring) => {
        const items = (workingData.scars.rings[ring] || [])
          .map(
            (name, idx) => `
        <li class="scar-item-row">
          <input type="text" class="scar-item-input" data-ring="${ring}" data-index="${idx}"
            value="${name.replace(/"/g, "&quot;")}"
            placeholder="${i18n.localize("l5r5e-combat-helper.config.scars.itemPlaceholder")}" />
          <button type="button" class="remove-scar-item" data-ring="${ring}" data-index="${idx}" title="Remove">
            <i class="fas fa-times"></i>
          </button>
        </li>`,
          )
          .join("");

        return `
        <div class="ring-section" data-ring="${ring}">
          <h4 class="ring-header">${ringLabels[ring]}</h4>
          <ul class="scar-item-list">${items}</ul>
          <button type="button" class="add-scar-btn" data-ring="${ring}">
            <i class="fas fa-plus"></i> ${i18n.localize("l5r5e-combat-helper.config.scars.addItem")}
          </button>
        </div>`;
      })
      .join("");

    return `
      <div class="l5r5e-critical-config">
        <p class="config-hint">${i18n.localize("l5r5e-combat-helper.config.scars.hint")}</p>

        <div class="compendium-group">
          <label>${i18n.localize("l5r5e-combat-helper.config.scars.compendium")}</label>
          <input type="text" class="scars-compendium-input"
            value="${workingData.scars.compendium}"
            placeholder="l5r5e.core-peculiarities-adversities" />
          <p class="notes">${i18n.localize("l5r5e-combat-helper.config.scars.compendiumHint")}</p>
        </div>

        <div class="scars-rings">${scarRings}</div>

        <div class="config-actions">
          <button type="button" class="reset-scars reset-btn">
            <i class="fas fa-undo"></i> ${i18n.localize("l5r5e-combat-helper.config.scars.reset")}
          </button>
        </div>
      </div>`;
  }

  static _onRender(htmlOrJQuery, workingData) {
    const el = htmlOrJQuery instanceof HTMLElement ? htmlOrJQuery : htmlOrJQuery[0];
    const root = el.closest(".dialog-content") ?? el;

    root.querySelectorAll(".add-scar-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        const ring = this.dataset.ring;
        CustomCriticalConfig._readForm(root, workingData);
        workingData.scars.rings[ring] = workingData.scars.rings[ring] || [];
        workingData.scars.rings[ring].push("");
        CustomCriticalConfig._rerender(root, workingData);
      });
    });

    root.querySelectorAll(".remove-scar-item").forEach((btn) => {
      btn.addEventListener("click", function () {
        const ring = this.dataset.ring;
        const idx = parseInt(this.dataset.index);
        CustomCriticalConfig._readForm(root, workingData);
        workingData.scars.rings[ring].splice(idx, 1);
        CustomCriticalConfig._rerender(root, workingData);
      });
    });

    root.querySelector(".reset-scars")?.addEventListener("click", async () => {
      const confirmed = await confirmDialog({
        title: game.i18n.localize(
          "l5r5e-combat-helper.config.resetScars.title",
        ),
        content: `<p>${game.i18n.localize("l5r5e-combat-helper.config.resetScars.confirm")}</p>`,
      });
      if (confirmed) {
        workingData.scars = foundry.utils.deepClone(DEFAULT_SCAR_CONFIG);
        CustomCriticalConfig._rerender(root, workingData);
      }
    });
  }

  static _rerender(root, workingData) {
    const container = root.closest(".dialog-content") ?? root;
    container.innerHTML = CustomCriticalConfig._buildHTML(workingData);
    CustomCriticalConfig._onRender(container, workingData);
  }

  static _readForm(html, workingData) {
    const el = html instanceof HTMLElement ? html : html[0];
    const comp = el.querySelector(".scars-compendium-input")?.value;
    if (comp !== undefined) workingData.scars.compendium = comp.trim();

    for (const ring of ["air", "earth", "fire", "water", "void"]) {
      const inputs = el.querySelectorAll(`.scar-item-input[data-ring="${ring}"]`);
      if (inputs.length > 0) {
        workingData.scars.rings[ring] = Array.from(inputs)
          .map((input) => input.value.trim())
          .filter(Boolean);
      }
    }
  }

  static async _save(workingData) {
    if (!workingData.scars.compendium?.trim()) {
      ui.notifications.error(
        game.i18n.localize(
          "l5r5e-combat-helper.config.error.missingCompendium",
        ),
      );
      return false;
    }

    const isDefault =
      JSON.stringify(workingData.scars) === JSON.stringify(DEFAULT_SCAR_CONFIG);
    await game.settings.set(
      "l5r5e-combat-helper",
      "customScarConfig",
      isDefault ? null : workingData.scars,
    );
    ui.notifications.info(
      game.i18n.localize("l5r5e-combat-helper.config.saved"),
    );
    return true;
  }
}
