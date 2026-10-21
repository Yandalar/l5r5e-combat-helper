// @ts-nocheck
/**
 * Runs privileged actions on the active GM's client. Players may press kata
 * opportunity buttons, but only the GM can modify NPCs and update chat cards
 * the GM authored, so the player's client asks the GM over the module socket
 * (`"socket": true` in module.json).
 */
import { logWarn } from "./logger";

const MODULE_ID = "l5r5e-combat-helper";
const SOCKET = `module.${MODULE_ID}`;
const handlers = {};
const listening = new WeakSet();

function activeGM() {
  return game.users?.activeGM ?? game.users?.find?.((u) => u.isGM && u.active) ?? null;
}

/** Adds GM-side handlers `(payload, senderId) => Promise` and starts listening once. */
export function registerGmRelay(map) {
  Object.assign(handlers, map);
  const socket = game.socket;
  if (!socket || listening.has(socket)) return;
  listening.add(socket);
  socket.on(SOCKET, onSocketMessage);
}

/**
 * Runs `action` locally when this user is a GM, otherwise sends it to the
 * active GM. Returns false when it could not be dispatched (no GM connected).
 */
export async function runAsGM(action, payload) {
  if (game.user.isGM) {
    await handlers[action]?.(payload, game.user.id);
    return true;
  }
  const gm = activeGM();
  if (!gm) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.notifications.noActiveGM`));
    return false;
  }
  game.socket.emit(SOCKET, { action, payload, senderId: game.user.id, gmId: gm.id });
  return true;
}

export async function onSocketMessage(data) {
  if (!data || data.gmId !== game.user.id) return;
  const handler = handlers[data.action];
  if (!handler) return logWarn(`Unknown GM relay action: ${data.action}`);
  try {
    await handler(data.payload, data.senderId);
  } catch (error) {
    console.error(`L5R5e Combat Helper | GM relay "${data.action}" failed:`, error);
  }
}

/** Whether `senderId` may act for `actor` (GM, or owner of the actor). */
export function senderCanActFor(senderId, actor) {
  const sender = game.users.get(senderId);
  if (!sender || !actor) return false;
  return sender.isGM || actor.testUserPermission(sender, "OWNER");
}
