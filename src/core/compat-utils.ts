// @ts-nocheck
export async function confirmDialog({ title, content, defaultYes = false }) {
  if (foundry.applications?.api?.DialogV2) {
    return (await foundry.applications.api.DialogV2.confirm({
      window: { title },
      content,
      rejectClose: false,
    })) ?? false;
  }
  return (await Dialog.confirm({
    title,
    content,
    yes: () => true,
    no: () => false,
    defaultYes,
  })) ?? false;
}

export function resolveMessageId(li) {
  if (li instanceof HTMLElement) {
    return li.dataset.messageId || li.getAttribute("data-message-id");
  } else if (li?.jquery || (typeof jQuery !== "undefined" && li instanceof jQuery)) {
    return li.data("messageId") || li.attr("data-message-id");
  }
  return (
    li?.dataset?.messageId || li?.getAttribute?.("data-message-id") || null
  );
}

/**
 * Registers a chat-message render listener with an `HTMLElement` argument.
 * v13+ uses `renderChatMessageHTML` (the jQuery `renderChatMessage` hook is
 * deprecated until v15 and skipped for messages rendered by `system.renderHTML`);
 * v11–v12 only have `renderChatMessage`, whose `html` is jQuery.
 */
export function onRenderChatMessage(fn) {
  const generation = Number(globalThis.game?.release?.generation ?? 13);
  if (generation >= 13) {
    Hooks.on("renderChatMessageHTML", (message, html, data) => fn(message, html, data));
  } else {
    Hooks.on("renderChatMessage", (message, html, data) => fn(message, html?.jquery ? html[0] : html, data));
  }
}

function messageAuthorId(message) {
  const author = message?.author ?? message?.user;
  return typeof author === "string" ? author : author?.id ?? null;
}

/**
 * `createChatMessage` fires on every connected client. Only one of them may
 * process a roll, or cards and effects are duplicated: the active GM (the only
 * one allowed to modify NPCs and other players' actors), or the message author
 * when no GM is connected.
 */
export function isResponsibleClient(message) {
  const users = game.users;
  const gm = users?.activeGM ?? users?.find?.((u) => u.isGM && u.active);
  if (gm) return gm.id === game.user.id;
  const authorId = messageAuthorId(message);
  return !authorId || authorId === game.user.id;
}

/**
 * Target actors of a roll as seen by the processing client: the author's own
 * `game.user.targets` (multi-target), otherwise the first target l5r5e stores
 * in the roll (`l5rData.target`, a TokenDocument), which every client receives.
 */
export function rollTargetActors(message, l5rData) {
  const authorId = messageAuthorId(message);
  if (!authorId || authorId === game.user.id) {
    return Array.from(game.user.targets).map((t) => t.actor).filter(Boolean);
  }
  const actor = l5rData?.target?.actor;
  return actor ? [actor] : [];
}

/**
 * Chat context-menu entry valid on every supported version: v14 renamed
 * `name` → `label` and `condition` → `visible` (old keys warn, removed in v16).
 * Both pairs are set; v14 reads the new ones, older versions the old ones.
 */
export function contextMenuEntry({ name, condition, ...rest }) {
  const entry = { ...rest, name, label: name };
  if (condition !== undefined) Object.assign(entry, { condition, visible: condition });
  return entry;
}
