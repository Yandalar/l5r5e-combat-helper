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
