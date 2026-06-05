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
