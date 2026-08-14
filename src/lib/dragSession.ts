export type DragItem = {
  id: string;
  parentId?: string;
  index: number;
  type: "bookmark" | "folder";
  source?: "page" | "quick";
  title?: string;
  width?: number;
  rows?: number;
};

let activeDragItem: DragItem | null = null;

// HTML5 drag events give no way to scroll the page, so a long board makes any
// folder below the fold unreachable. While a drag is live we track the pointer
// and nudge the window whenever it sits inside the edge band.
const edgeBand = 84;
const maxStep = 22;
let pointerY = 0;
let frame = 0;

function edgeStep(position: number, size: number) {
  if (position < edgeBand) return -Math.ceil(maxStep * (1 - Math.max(0, position) / edgeBand));
  if (position > size - edgeBand) return Math.ceil(maxStep * (1 - Math.max(0, size - position) / edgeBand));
  return 0;
}

function trackPointer(event: globalThis.DragEvent) {
  pointerY = event.clientY;
}

function tick() {
  const step = edgeStep(pointerY, window.innerHeight);
  if (step) window.scrollBy(0, step);
  frame = requestAnimationFrame(tick);
}

function startEdgeScroll() {
  if (frame || typeof window === "undefined") return;
  pointerY = window.innerHeight / 2;
  document.addEventListener("dragover", trackPointer, true);
  frame = requestAnimationFrame(tick);
}

function stopEdgeScroll() {
  if (!frame) return;
  document.removeEventListener("dragover", trackPointer, true);
  cancelAnimationFrame(frame);
  frame = 0;
}

export function setActiveDragItem(item: DragItem) {
  activeDragItem = item;
  startEdgeScroll();
}

export function getActiveDragItem() {
  return activeDragItem;
}

export function clearActiveDragItem() {
  activeDragItem = null;
  stopEdgeScroll();
}
