import type { MouseEvent } from "react";

// True for a plain left click with no modifiers: the case where the browser
// navigates the current tab (and therefore unloads this document) rather
// than opening the link in a new/background tab.
function opensInPlace(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

// Bookmark links fire an async "move to front" side effect on click. A plain
// click navigates the current document immediately, which can unload the
// page before that async call finishes. Await it before navigating by hand
// so the reorder reliably lands; for modified/middle clicks the browser
// opens a new tab and this document keeps running, so the default behavior
// is left alone and the reorder can safely fire without blocking it.
export async function openBookmarkLink(event: MouseEvent, url: string | undefined, recordRecent: () => Promise<void>): Promise<void> {
  if (!url) return;
  if (!opensInPlace(event)) { void recordRecent(); return; }
  event.preventDefault();
  await recordRecent();
  window.location.href = url;
}
