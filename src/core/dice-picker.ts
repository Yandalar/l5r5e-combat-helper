// @ts-nocheck
/**
 * Ring-dependent TNs in the system's DicePickerDialog ("TN 4 (Earth 5,
 * Fire 2)"). Clicking a ring in the dialog runs `this.ringId = ...` and
 * re-renders, so redefining `ringId` on one dialog instance lets the TN
 * follow the chosen ring. The module still evaluates the result from the
 * base TN and the ring rolled (kata-activation, critical-mitigation).
 */

/** The `ringId` property descriptor from the dialog's prototype chain, or null. */
function ringIdDescriptor(dialog) {
  for (let proto = Object.getPrototypeOf(dialog); proto; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, "ringId");
    if (descriptor) return descriptor.set ? descriptor : null;
  }
  return null;
}

/**
 * Makes `dialog`'s TN follow its ring: base + ringDifficulty[ring], at least 1.
 * Only this instance changes; the system's difficulty setter keeps honoring
 * a locked hidden TN. Does nothing without ring variants.
 */
export function applyRingDifficulty(dialog, base, ringDifficulty) {
  if (!dialog || !ringDifficulty || Object.keys(ringDifficulty).length === 0) return dialog;
  const descriptor = ringIdDescriptor(dialog);
  if (!descriptor) return dialog;

  const tnFor = (ring) => Math.max(1, base + (ringDifficulty[ring] ?? 0));
  Object.defineProperty(dialog, "ringId", {
    configurable: true,
    get: descriptor.get,
    set(ringId) {
      descriptor.set.call(this, ringId);
      this.difficulty = tnFor(this.object?.ring?.id);
    },
  });
  dialog.difficulty = tnFor(dialog.object?.ring?.id);
  return dialog;
}

/** Opens the system's dice picker; with `ringDifficulty`, its TN follows the chosen ring. */
export function openDicePicker(params, ringDifficulty = null) {
  const dialog = new game.l5r5e.DicePickerDialog(params);
  applyRingDifficulty(dialog, params.difficulty, ringDifficulty);
  dialog.render(true);
  return dialog;
}
