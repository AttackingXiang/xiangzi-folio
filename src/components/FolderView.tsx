import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from "react";
import {
  ArrowSquareOut, CaretDown, CaretRight, Cards, DotsSixVertical, DotsThree, Eye, EyeSlash, Folder, FolderOpen,
  GridFour, LinkSimple, ListBullets, PencilSimple, Rows, SquaresFour, Star, Trash,
} from "@phosphor-icons/react";
import { bookmarks, collectLinks, countLinks, folderStyleOptions, parsePresentationTitle, resolveFolderStyle, setFolderPresentationTitle } from "../lib/bookmarks";
import { favicon } from "../lib/favicon";
import { createTranslator } from "../lib/i18n";
import { openBookmarkLink } from "../lib/navigation";
import { clearActiveDragItem, getActiveDragItem, setActiveDragItem, type DragItem } from "../lib/dragSession";
import type { AppConfig, BookmarkNode, BookmarkStyle, EditorValue, FolderStyle, Language } from "../types";

export const stylesList: Array<{ id: FolderStyle; icon: typeof ListBullets }> = [
  { id: "directory", icon: ListBullets }, { id: "icons", icon: GridFour }, { id: "mixed", icon: SquaresFour }, { id: "dock", icon: Rows },
  { id: "stack", icon: ListBullets }, { id: "focus", icon: SquaresFour }, { id: "columns", icon: Rows }, { id: "cards", icon: Cards },
];

type Props = {
  node: BookmarkNode;
  config: AppConfig;
  editing: boolean;
  level?: number;
  block?: boolean;
  siblingIndex?: number;
  pageSpan?: number;
  pinned?: boolean;
  onConfig: (recipe: (value: AppConfig) => AppConfig) => void;
  onEdit: (value: EditorValue) => void;
  onRefresh: () => Promise<void>;
  onToast: (text: string) => void;
  onMove: (node: BookmarkNode) => void;
  onNewFolder: (parentId: string) => void;
  onNewBookmark: (parentId: string, defaults: Pick<EditorValue, "style" | "width" | "rows">) => void;
  onDelete: (node: BookmarkNode, parentId: string, index: number) => void;
  onRecentClick: (node: BookmarkNode, parent: BookmarkNode, index: number) => Promise<void>;
  onTogglePinned?: (node: BookmarkNode, pin: boolean) => void;
};

const dragMime = "application/x-xiangzi-folio-bookmark";
const quickDragMime = "application/x-xiangzi-folio-quick";
const dragEndEvent = "xiangzi-folio-drag-end";
const dragPreviewEvent = "xiangzi-folio-drag-preview";

type DropIndicator = { left: number; top: number; width: number; height: number };
type BookmarkDropPreview = {
  sourceId: string; sourceParentId?: string; sourceIndex: number;
  targetId: string; targetParentId: string; targetIndex: number; targetTitle: string;
  // Which edge of the hovered item the placeholder sits on. Deciding this from
  // the pointer position (rather than always inserting before) is what makes
  // dragging left and right symmetric — see insertionIndexFor.
  after: boolean;
  // Where to paint the insertion bar, in coordinates relative to the grid that
  // holds it. Null only if the target element vanished between measuring and
  // rendering, in which case the bar falls back to the grid's origin.
  indicator: DropIndicator | null;
  width: number; rows: number;
};
type BookmarkDropSlot = Omit<BookmarkDropPreview, "sourceId" | "sourceParentId" | "sourceIndex" | "width" | "rows" | "after" | "indicator"> & {
  left: number; right: number; top: number; bottom: number;
};
let activeDropSlots: BookmarkDropSlot[] = [];
let dropSlotCaptureSource: string | null = null;
let dragScroll = { x: 0, y: 0 };

function hasBookmarkDrag(event: DragEvent) {
  // Chromium exposes custom MIME types during dragover/dragenter even when it
  // withholds their text until the final drop event. This also accepts a
  // quick-access bookmark dragged into an ordinary page folder.
  if (getActiveDragItem()?.type === "bookmark") return true;
  const types = Array.from(event.dataTransfer.types || []);
  return types.includes(dragMime) || types.includes(quickDragMime);
}

export function writeDragPayload(dataTransfer: DataTransfer, item: DragItem, url?: string) {
  dataTransfer.setData(dragMime, JSON.stringify(item));
  // text/uri-list and text/plain stay the real URL so a bookmark dragged out to
  // the address bar, another window, or a different app pastes as a link. The
  // internal payload rides the private MIME type only; in-page drops read it
  // from the drag session anyway, which is what makes that split safe.
  if (url) {
    dataTransfer.setData("text/uri-list", url);
    dataTransfer.setData("text/plain", url);
  }
}

function readDragItem(event: DragEvent): DragItem | null {
  // The drag session is authoritative for anything that started on this page,
  // including browsers that withhold custom payload text until drop.
  const activeDragItem = getActiveDragItem();
  if (activeDragItem) return activeDragItem;
  let raw = "";
  try { raw = event.dataTransfer.getData(dragMime); } catch { /* ignored */ }
  if (!raw) return null;
  try { return JSON.parse(raw) as DragItem; } catch { return null; }
}

function captureBookmarkDropSlots(sourceId: string) {
  dragScroll = { x: window.scrollX, y: window.scrollY };
  activeDropSlots = Array.from(document.querySelectorAll<HTMLElement>(".bookmark[data-bookmark-id]"), (element) => {
    const rect = element.getBoundingClientRect();
    return {
      targetId: element.dataset.bookmarkId || "",
      targetParentId: element.dataset.parentId || "",
      targetIndex: Number(element.dataset.bookmarkIndex || 0),
      targetTitle: element.dataset.bookmarkTitle || "",
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
    };
  }).filter((slot) => slot.targetId && slot.targetParentId);
  dropSlotCaptureSource = sourceId;
}

// A slot sharing a row with another one belongs to a horizontal run (grid row,
// dock, wrapping tiles) and splits left/right. A slot alone on its row is part
// of a stacked list and splits top/bottom instead. Picking the wrong axis makes
// the whole before/after decision meaningless, which is why it is derived from
// the measured layout rather than from the folder's declared style.
function slotOrientation(hit: BookmarkDropSlot, slots: BookmarkDropSlot[]) {
  return slots.some((slot) => slot !== hit && slot.targetParentId === hit.targetParentId
    && slot.top < hit.bottom && hit.top < slot.bottom);
}

function isAfterSlot(hit: BookmarkDropSlot, slots: BookmarkDropSlot[], x: number, y: number) {
  return slotOrientation(hit, slots) ? x >= (hit.left + hit.right) / 2 : y >= (hit.top + hit.bottom) / 2;
}

const indicatorThickness = 3;

// The drop hint is painted as an out-of-flow bar sitting on the insertion edge.
// Staying out of flow is the whole point: an in-flow placeholder consumes a
// grid cell and pushes every later item aside, so the item under the cursor
// stops being the item whose rectangle the hit test compares against. With
// nothing shifting, the rectangles captured at dragstart stay truthful for the
// entire drag and what you see is exactly what you get.
function edgeIndicator(host: HTMLElement, target: HTMLElement, after: boolean, horizontal: boolean): DropIndicator {
  const rect = target.getBoundingClientRect();
  const box = host.getBoundingClientRect();
  // clientLeft/clientTop discount the host's own border: getBoundingClientRect
  // measures border boxes, while an absolutely positioned child is placed
  // against the padding box.
  const left = rect.left - box.left - host.clientLeft;
  const top = rect.top - box.top - host.clientTop;
  return horizontal
    ? { left: left + (after ? rect.width : 0) - indicatorThickness / 2, top, width: indicatorThickness, height: rect.height }
    : { left, top: top + (after ? rect.height : 0) - indicatorThickness / 2, width: rect.width, height: indicatorThickness };
}

function indicatorFor(host: HTMLElement | null, targetId: string, after: boolean, horizontal: boolean): DropIndicator | null {
  const target = host?.querySelector<HTMLElement>(`:scope > .bookmark[data-bookmark-id="${CSS.escape(targetId)}"]`);
  return host && target ? edgeIndicator(host, target, after, horizontal) : null;
}

// Trailing edge of the last rendered item, used for the "append to this group"
// hint that has no bookmark of its own to attach to.
function tailIndicatorFor(host: HTMLElement | null): DropIndicator | null {
  const items = host ? Array.from(host.querySelectorAll<HTMLElement>(":scope > .bookmark[data-bookmark-id]")) : [];
  const last = items[items.length - 1];
  if (!host || !last) return null;
  const rect = last.getBoundingClientRect();
  const horizontal = items.some((element) => {
    if (element === last) return false;
    const other = element.getBoundingClientRect();
    return other.top < rect.bottom && rect.top < other.bottom;
  });
  return edgeIndicator(host, last, true, horizontal);
}

// Live variant of isAfterSlot for folders, which are not part of the frozen
// bookmark slot cache. Orientation comes from the folder's real siblings: one
// sharing its row means the run is horizontal, otherwise it is a stack.
function isAfterSiblingElement(target: HTMLElement, selfSelector: string, clientX: number, clientY: number) {
  const self = target.closest<HTMLElement>(selfSelector) || target;
  const rect = self.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const siblings = Array.from(self.parentElement?.children || [])
    .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== self)
    .map((element) => element.getBoundingClientRect())
    .filter((box) => box.width > 0 && box.height > 0);
  const sharesRow = siblings.some((box) => box.top < rect.bottom && rect.top < box.bottom);
  return sharesRow ? clientX >= rect.left + rect.width / 2 : clientY >= rect.top + rect.height / 2;
}

function bookmarkDropSlotAt(clientX: number, clientY: number, parentId?: string) {
  const x = clientX + window.scrollX - dragScroll.x;
  const y = clientY + window.scrollY - dragScroll.y;
  const hit = activeDropSlots.find((slot) => (!parentId || slot.targetParentId === parentId)
    && x >= slot.left && x < slot.right && y >= slot.top && y < slot.bottom);
  if (!hit) return null;
  // Past the midpoint means "put it after this one". Without this every drop
  // inserted before the hovered item, so dragging an item forwards always
  // landed one slot short and dropping onto the very next neighbour was a
  // no-op that still animated a placeholder.
  return { slot: hit, after: isAfterSlot(hit, activeDropSlots, x, y), horizontal: slotOrientation(hit, activeDropSlots) };
}

// Where the dragged item would land in the target folder's child list, counted
// before it is removed from its old position.
function insertionIndexFor(targetIndex: number, after: boolean) {
  return targetIndex + (after ? 1 : 0);
}

// chrome.bookmarks.move takes the index in the list the node has already been
// removed from, so a same-parent move that starts left of the insertion point
// shifts down by one.
function resolveMoveIndex(insertAt: number, sourceIndex: number, sameParent: boolean) {
  return sameParent && sourceIndex < insertAt ? insertAt - 1 : insertAt;
}

// Both of these land the item exactly where it already is. Suppressing the
// placeholder for them keeps the UI honest: you never see a drop hint that
// would do nothing.
function isNoopInsertion(insertAt: number, sourceIndex: number, sameParent: boolean) {
  return sameParent && (insertAt === sourceIndex || insertAt === sourceIndex + 1);
}

function bookmarkTailSlotAt(parentId: string, clientX: number, clientY: number) {
  const x = clientX + window.scrollX - dragScroll.x;
  const y = clientY + window.scrollY - dragScroll.y;
  const slots = activeDropSlots.filter((slot) => slot.targetParentId === parentId);
  if (!slots.length) return false;
  const finalRowTop = Math.max(...slots.map((slot) => slot.top));
  const finalRow = slots.filter((slot) => Math.abs(slot.top - finalRowTop) < 2);
  const finalRight = Math.max(...finalRow.map((slot) => slot.right));
  const finalBottom = Math.max(...finalRow.map((slot) => slot.bottom));
  return y >= finalBottom || (y >= finalRowTop && y < finalBottom && x >= finalRight);
}

function newBookmarkDefaults(style: FolderStyle): Pick<EditorValue, "style" | "width" | "rows"> {
  if (style === "icons" || style === "mixed") return { style: "tile", width: 1.5, rows: 1 };
  if (style === "dock") return { style: "dock", width: 3, rows: 1 };
  if (style === "stack") return { style: "compact", width: 4, rows: 1 };
  if (style === "focus") return { style: "featured", width: 8, rows: 1 };
  if (style === "columns") return { style: "row", width: 6, rows: 1 };
  if (style === "cards") return { style: "row", width: 3, rows: 1 };
  return { style: "row", width: 4, rows: 1 };
}

function LinkItem({ node, parent, index, config, editing, onEdit, onMove, onDelete, onRecentClick, dropTarget, variant = "row", defaultWidth, pageSpan = 12, cards = false }: {
  node: BookmarkNode; parent: BookmarkNode; index: number; editing: boolean;
  config: AppConfig;
  onEdit: Props["onEdit"];
  onMove: Props["onMove"]; onDelete: Props["onDelete"]; onRecentClick: Props["onRecentClick"];
  dropTarget: boolean;
  variant?: "row" | "tile" | "featured" | "dock";
  defaultWidth?: number;
  pageSpan?: number;
  // Purely a display flag: shows the host subtitle and applies the card
  // visual treatment on top of the "row" variant. It never gets persisted —
  // the bookmark's own saved style (if any) still wins, exactly as for every
  // other variant.
  cards?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [dragging, setDragging] = useState(false);
  const t = createTranslator(config.language);
  const organize = editing;
  const parsed = parsePresentationTitle(node.title);
  const savedStyle = config.bookmarkStyles[node.id];
  const titleStyle = (["row", "featured", "tile", "dock", "compact"] as const).includes(parsed.marker as BookmarkStyle) ? parsed.marker as BookmarkStyle : undefined;
  const itemStyle = config.markerStorageVersion >= 3 ? titleStyle || savedStyle || variant : savedStyle || titleStyle || variant;
  const markedVariant = itemStyle === "compact" ? "row" : itemStyle;
  const compact = itemStyle === "compact";
  const itemWidth = Math.min(pageSpan, (config.markerStorageVersion >= 3 ? parsed.width || config.bookmarkWidths[node.id] : config.bookmarkWidths[node.id] || parsed.width) || defaultWidth || (variant === "row" ? 4 : variant === "featured" ? 8 : 1.5));
  const rows = (config.markerStorageVersion >= 3 ? parsed.rows || config.bookmarkRows[node.id] : config.bookmarkRows[node.id] || parsed.rows) || 1;
  const beginDrag = (event: DragEvent) => {
    // In edit mode the outer block is also draggable; keep this bookmark drag
    // from being claimed as a top-level layout drag.
    event.stopPropagation();
    const item: DragItem = { id: node.id, parentId: parent.id, index, type: "bookmark", source: "page", title: parsed.title, width: itemWidth, rows };
    setActiveDragItem(item);
    writeDragPayload(event.dataTransfer, item, node.url);
    event.dataTransfer.effectAllowed = "move";
    captureBookmarkDropSlots(node.id);
    setDragging(true);
  };
  const endDrag = () => { setDragging(false); clearActiveDragItem(); activeDropSlots = []; dropSlotCaptureSource = null; window.dispatchEvent(new Event(dragEndEvent)); };
  return (
    <div className={`bookmark bookmark--${markedVariant} ${cards ? "bookmark--card" : ""} ${compact ? "bookmark--compact" : ""} ${rows === 2 ? "bookmark--tall" : ""} ${organize ? "is-organizing" : ""} ${dragging ? "is-dragging" : ""} ${dropTarget ? "is-drop-target" : ""}`} style={{ "--item-span": itemWidth } as CSSProperties} draggable onDragStart={beginDrag} onDragEnd={endDrag} data-testid={`bookmark-${node.id}`} data-bookmark-id={node.id} data-parent-id={parent.id} data-bookmark-index={index} data-bookmark-title={parsed.title}>
      {organize && <span className="bookmark__drag" title={t("action.dragSort")} aria-label={t("action.dragSort")}><DotsSixVertical weight="bold" /></span>}
      <a href={node.url} draggable={true} className="bookmark__link" title={`${parsed.title}\n${node.url}`} onDragStart={beginDrag} onClick={(event) => { if (editing) { event.preventDefault(); return; } void openBookmarkLink(event, node.url, () => onRecentClick(node, parent, index)); }}>
        <span className="favicon" aria-hidden="true">
          {!broken && node.url ? <img src={favicon(node.url)} alt="" onError={() => setBroken(true)} /> : <span>{parsed.title.slice(0, 1).toUpperCase()}</span>}
        </span>
        <span className="bookmark__copy"><strong>{parsed.title || t("common.unnamed")}</strong>{(markedVariant === "featured" || cards) && <small>{node.url?.replace(/^https?:\/\//, "").split("/")[0]}</small>}</span>
        {markedVariant === "row" && !cards && <ArrowSquareOut className="bookmark__open" weight="bold" />}
      </a>
      {organize && (
        <div className="bookmark__actions"><button className="icon-button" aria-label={t("action.editBookmark", { title: parsed.title })} title={t("action.editBookmark", { title: "" }).trim()} onClick={(event) => { event.preventDefault(); onEdit({ id: node.id, parentId: parent.id, type: "bookmark", title: parsed.title, url: node.url || "", style: itemStyle, width: itemWidth, rows, cardsContext: cards }); }}><PencilSimple /></button><button className="icon-button" aria-label={t("action.moveBookmark", { title: parsed.title })} title={t("move.bookmark")} onClick={(event) => { event.preventDefault(); onMove(node); }}><LinkSimple /></button><button className="icon-button danger" aria-label={t("action.deleteBookmark", { title: parsed.title })} title={t("action.deleteBookmark", { title: "" }).trim()} onClick={(event) => { event.preventDefault(); onDelete(node, parent.id, index); }}><Trash /></button></div>
      )}
    </div>
  );
}

function CollapsedFolderPreview({ children }: { children: BookmarkNode[] }) {
  const links = children.filter((child) => !!child.url).slice(0, 3);
  if (!links.length) return null;
  const total = children.filter((child) => !!child.url).length;
  return <div className="folder__collapsed-preview" aria-hidden="true">
    {links.map((child) => <span key={child.id} title={child.title}>{child.url ? <img src={favicon(child.url, 32)} alt="" /> : child.title.slice(0, 1)}</span>)}
    {total > links.length && <small>+{total - links.length}</small>}
  </div>;
}

export function FolderView({ node, config, editing, level = 0, block = false, siblingIndex = node.index ?? 0, pageSpan = 12, pinned = false, onConfig, onEdit, onRefresh, onToast, onMove, onNewFolder, onNewBookmark, onDelete, onRecentClick, onTogglePinned }: Props) {
  const t = createTranslator(config.language);
  const [menu, setMenu] = useState(false);
  const [dropReady, setDropReady] = useState(false);
  const [bookmarkDropPreview, setBookmarkDropPreview] = useState<BookmarkDropPreview | null>(null);
  // Native dragover/drop can fire back-to-back within the same task, before React
  // has committed the state update from the preceding dragover. The drop handler
  // reads this ref (updated synchronously) instead of the possibly-stale state
  // closure, so a drop right after the preview is set is never missed.
  const bookmarkDropPreviewRef = useRef<BookmarkDropPreview | null>(null);
  const updateBookmarkDropPreview = (value: BookmarkDropPreview | null) => {
    bookmarkDropPreviewRef.current = value;
    setBookmarkDropPreview(value);
  };
  const styleActions = useRef<HTMLDivElement>(null);
  const styleTrigger = useRef<HTMLButtonElement>(null);
  // Toggling dropReady mounts or unmounts the folder drop zone, which resizes
  // this folder and shifts everything below it. The frozen slot rectangles
  // describe the layout from before that shift, so drop them and let the next
  // dragover re-measure.
  useEffect(() => { dropSlotCaptureSource = null; }, [dropReady]);
  useEffect(() => {
    const clear = () => { setDropReady(false); updateBookmarkDropPreview(null); };
    const clearNativeEnd = () => { clearActiveDragItem(); activeDropSlots = []; dropSlotCaptureSource = null; clear(); };
    const clearOther = (event: Event) => {
      if ((event as CustomEvent<string | null>).detail !== node.id) updateBookmarkDropPreview(null);
    };
    // The native "drop" event's capture phase always runs before this folder's
    // own bubble-phase onDrop handler, which still needs bookmarkDropPreviewRef
    // to consume the pending move. Only hide a stuck overlay here (state), and
    // leave the ref alone — the target's own drop handler clears it once done.
    const clearVisualOnly = () => { setDropReady(false); setBookmarkDropPreview(null); };
    // Grids and folder frames stopPropagation on the drags they handle, so a
    // bubble-phase listener here only sees drags over page areas that accept
    // nothing — exactly when a leftover placeholder should disappear.
    const clearOnUnhandledDrag = () => { setDropReady(false); updateBookmarkDropPreview(null); };
    // Frozen slot rectangles describe a layout that a resize has invalidated.
    // Dropping the capture marker makes the next dragover re-measure.
    const invalidateSlots = () => { dropSlotCaptureSource = null; };
    window.addEventListener(dragEndEvent, clear);
    window.addEventListener(dragPreviewEvent, clearOther);
    window.addEventListener("resize", invalidateSlots);
    document.addEventListener("dragover", clearOnUnhandledDrag);
    // Native dragend can be delivered after the React tree has reflowed (or a
    // browser cancels a drop). Capture it at document level so no destination
    // overlay can remain stuck on a parent folder.
    document.addEventListener("dragend", clearNativeEnd, true);
    document.addEventListener("drop", clearVisualOnly, true);
    return () => {
      window.removeEventListener(dragEndEvent, clear);
      window.removeEventListener(dragPreviewEvent, clearOther);
      window.removeEventListener("resize", invalidateSlots);
      document.removeEventListener("dragover", clearOnUnhandledDrag);
      document.removeEventListener("dragend", clearNativeEnd, true);
      document.removeEventListener("drop", clearVisualOnly, true);
    };
  }, [node.id]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: globalThis.PointerEvent) => {
      if (!styleActions.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);
  const parsedFolder = parsePresentationTitle(node.title);
  const markerStyle = folderStyleOptions.includes(parsedFolder.marker as FolderStyle) ? parsedFolder.marker as FolderStyle : undefined;
  const style = resolveFolderStyle(node, config, block);
  const collapsed = config.markerStorageVersion >= 3 && markerStyle ? !!parsedFolder.collapsed : config.collapsed.includes(node.id) || !!parsedFolder.collapsed;
  const transparent = !!config.folderTransparent[node.id];
  const borderless = !!config.folderBorderless[node.id];
  const children = node.children || [];
  const links = useMemo(() => collectLinks(node), [node]);
  const directLinks = useMemo(() => children.filter((child) => !!child.url), [children]);
  const childFolders = useMemo(() => children.filter((child) => !child.url), [children]);
  const organize = editing;
  const previewFolderDrop = (event: DragEvent) => {
    if (!organize && !hasBookmarkDrag(event)) return;
    event.preventDefault(); event.stopPropagation();
    window.dispatchEvent(new CustomEvent(dragPreviewEvent, { detail: null }));
    setDropReady(true);
  };
  const displayStyle: FolderStyle = style;
  const virtual = node.id.startsWith("direct-");
  const displayTitle = virtual ? t("folder.directTitle") : parsedFolder.title;
  const effectiveParent = virtual ? { ...node, id: node.parentId || node.id.slice("direct-".length) } : node;
  const parentChildCount = virtual ? node.virtualParentChildCount ?? children.length : children.length;
  const parentFor = (child: BookmarkNode) => virtual && child.parentId ? { ...effectiveParent, id: child.parentId } : effectiveParent;
  const presentationWidth = config.markerStorageVersion >= 3 && markerStyle ? parsedFolder.width : config.folderWidths[node.id] || parsedFolder.width;
  const nestedWidth = Math.min(pageSpan, presentationWidth || pageSpan);
  const renderedFolderSpan = !block && collapsed ? Math.min(4, pageSpan) : nestedWidth;
  const componentSpan = block ? pageSpan : renderedFolderSpan;
  const beginFolderDrag = (event: DragEvent) => {
    if (virtual) return;
    event.stopPropagation();
    const item: DragItem = { id: node.id, parentId: node.parentId, index: siblingIndex, type: "folder", source: "page", title: parsedFolder.title };
    setActiveDragItem(item);
    writeDragPayload(event.dataTransfer, item);
    event.dataTransfer.effectAllowed = "move";
    captureBookmarkDropSlots(node.id);
  };
  const dropBeforeFolder = async (event: DragEvent) => {
    if (virtual) return;
    const item = readDragItem(event); if (!item) return;
    event.preventDefault(); event.stopPropagation(); setDropReady(false); window.dispatchEvent(new Event(dragEndEvent));
    if (item.id === node.id || !node.parentId) return;
    // Same midpoint rule as bookmarks, and the axis is derived the same way:
    // from where the sibling folders actually sit. An aspect-ratio guess gets
    // this wrong for the common case — a stacked folder is far wider than it
    // is tall, so it would always be split left/right instead of top/bottom.
    const after = isAfterSiblingElement(event.currentTarget as HTMLElement, `[data-folder-id="${node.id}"]`, event.clientX, event.clientY);
    const sameParent = item.parentId === node.parentId;
    const insertAt = insertionIndexFor(siblingIndex, after);
    clearActiveDragItem();
    activeDropSlots = []; dropSlotCaptureSource = null;
    if (isNoopInsertion(insertAt, item.index, sameParent)) return;
    try {
      await bookmarks.move(item.id, { parentId: node.parentId, index: resolveMoveIndex(insertAt, item.index, sameParent) });
      await onRefresh(); onToast(t("folder.orderSynced"));
    } catch (reason) { onToast(reason instanceof Error ? reason.message : t("folder.moveError")); }
  };
  const dropOnFolderHeader = async (event: DragEvent) => {
    const item = readDragItem(event);
    if (item?.type === "bookmark") return dropInto(event);
    return dropBeforeFolder(event);
  };
  const syncPresentation = async (next: { style: FolderStyle; width?: number; collapsed: boolean }, message: string) => {
    onConfig((value) => ({
      ...value,
      folderStyles: { ...value.folderStyles, [node.id]: next.style },
      folderWidths: next.width ? { ...value.folderWidths, [node.id]: next.width } : value.folderWidths,
      collapsed: next.collapsed ? [...new Set([...value.collapsed, node.id])] : value.collapsed.filter((id) => id !== node.id),
    }));
    if (!virtual) {
      await bookmarks.update(node.id, { title: setFolderPresentationTitle(node.title, { ...next, pinned }) });
      await onRefresh();
    }
    onToast(message);
  };
  const toggle = async () => {
    const nextCollapsed = !collapsed;
    try { await syncPresentation({ style, width: presentationWidth, collapsed: nextCollapsed }, t(nextCollapsed ? "folder.collapsed" : "folder.expanded")); }
    catch (reason) { onToast(reason instanceof Error ? reason.message : t("folder.syncError")); }
  };
  const changeStyle = async (next: FolderStyle) => {
    setMenu(false);
    try { await syncPresentation({ style: next, width: presentationWidth, collapsed }, t("folder.styleSynced")); }
    catch (reason) { onToast(reason instanceof Error ? reason.message : t("folder.syncError")); }
  };
  const changeWidth = async (next: number) => {
    try { await syncPresentation({ style, width: next, collapsed }, t("folder.widthSynced")); }
    catch (reason) { onToast(reason instanceof Error ? reason.message : t("folder.syncError")); }
  };
  const toggleTransparent = () => {
    const next = !transparent;
    onConfig((value) => ({ ...value, folderTransparent: { ...value.folderTransparent, [node.id]: next } }));
    setMenu(false);
    onToast(t(next ? "folder.transparentOn" : "folder.transparentOff"));
  };
  const toggleBorderless = () => {
    const next = !borderless;
    onConfig((value) => ({ ...value, folderBorderless: { ...value.folderBorderless, [node.id]: next } }));
    setMenu(false);
    onToast(t(next ? "folder.borderlessOn" : "folder.borderlessOff"));
  };
  const dropInto = async (event: DragEvent) => {
    const item = readDragItem(event); if (!item) return;
    event.preventDefault(); event.stopPropagation(); setDropReady(false); window.dispatchEvent(new Event(dragEndEvent));
    if (item.id === effectiveParent.id) return;
    // Bookmarks drag at any time now, and the grid's precise slot detector owns
    // reordering within a folder — this coarse "append to the end" handler is
    // only for genuinely relocating a bookmark into a *different* folder. A
    // reorder drag that lands a few pixels outside any grid slot (missing the
    // hitbox, or landing on the header/padding) would otherwise fling the
    // bookmark to the end of the same folder it already lives in, since this
    // path has no positional intent of its own.
    if (item.parentId === effectiveParent.id) { clearActiveDragItem(); activeDropSlots = []; dropSlotCaptureSource = null; updateBookmarkDropPreview(null); return; }
    try { clearActiveDragItem(); activeDropSlots = []; dropSlotCaptureSource = null; updateBookmarkDropPreview(null); await bookmarks.move(item.id, { parentId: effectiveParent.id }); await onRefresh(); onToast(t("notice.movedInto", { title: displayTitle })); }
    catch (reason) { onToast(reason instanceof Error ? reason.message : t("notice.moveError")); }
  };
  const dropAtBookmarkPreview = async (event: DragEvent) => {
    if (getActiveDragItem()?.type !== "bookmark") return;
    // Read the ref before dispatching dragEndEvent: that dispatch runs this
    // component's own cleanup listener synchronously, which would otherwise
    // null the ref out from under us before we get to consume it.
    const preview = bookmarkDropPreviewRef.current;
    event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new Event(dragEndEvent));
    if (!preview) return;
    const sameParent = preview.sourceParentId === preview.targetParentId;
    const insertAt = insertionIndexFor(preview.targetIndex, preview.after);
    clearActiveDragItem(); activeDropSlots = []; dropSlotCaptureSource = null; updateBookmarkDropPreview(null); setDropReady(false);
    if (isNoopInsertion(insertAt, preview.sourceIndex, sameParent)) return;
    try {
      await bookmarks.move(preview.sourceId, { parentId: preview.targetParentId, index: resolveMoveIndex(insertAt, preview.sourceIndex, sameParent) });
      await onRefresh(); onToast(t("folder.bookmarkReordered", { title: preview.targetTitle }));
    } catch (reason) { onToast(reason instanceof Error ? reason.message : t("folder.bookmarkReorderError")); }
  };
  const previewBookmarkAtPointer = (event: DragEvent) => {
    const item = getActiveDragItem();
    if (item?.type !== "bookmark") return;
    if (dropSlotCaptureSource !== item.id) captureBookmarkDropSlots(item.id);
    event.preventDefault(); event.stopPropagation(); setDropReady(false);
    const host = event.currentTarget as HTMLElement;
    const clearPreview = () => { window.dispatchEvent(new CustomEvent(dragPreviewEvent, { detail: null })); };
    // The virtual "direct links" block aggregates every visible root, so its
    // children legitimately carry different parent ids (parentFor stamps each
    // child's own). Scoping to effectiveParent.id there would hide every
    // bookmark that came from a secondary root.
    const hit = bookmarkDropSlotAt(event.clientX, event.clientY, virtual ? undefined : effectiveParent.id);
    if (!hit || hit.slot.targetId === item.id) {
      if (bookmarkTailSlotAt(effectiveParent.id, event.clientX, event.clientY)
        && !isNoopInsertion(parentChildCount, item.index, item.parentId === effectiveParent.id)) {
        window.dispatchEvent(new CustomEvent(dragPreviewEvent, { detail: node.id }));
        updateBookmarkDropPreview({
          sourceId: item.id, sourceParentId: item.parentId, sourceIndex: item.index,
          targetId: `tail-${node.id}`, targetParentId: effectiveParent.id, targetIndex: parentChildCount, targetTitle: t("common.groupEnd"),
          after: false, indicator: tailIndicatorFor(host), width: item.width || 1.5, rows: item.rows || 1,
        });
        return;
      }
      clearPreview();
      return;
    }
    const sameParent = item.parentId === hit.slot.targetParentId;
    if (isNoopInsertion(insertionIndexFor(hit.slot.targetIndex, hit.after), item.index, sameParent)) { clearPreview(); return; }
    window.dispatchEvent(new CustomEvent(dragPreviewEvent, { detail: node.id }));
    updateBookmarkDropPreview({
      sourceId: item.id, sourceParentId: item.parentId, sourceIndex: item.index,
      ...hit.slot, after: hit.after, indicator: indicatorFor(host, hit.slot.targetId, hit.after, hit.horizontal),
      width: item.width || 1.5, rows: item.rows || 1,
    });
  };
  const bookmarkGridDrag = { onDragEnter: previewBookmarkAtPointer, onDragOver: previewBookmarkAtPointer, onDrop: dropAtBookmarkPreview };
  const common = { config, editing, pageSpan: componentSpan, onConfig, onEdit, onRefresh, onToast, onMove, onNewFolder, onNewBookmark, onDelete, onRecentClick };
  const renderLink = (child: BookmarkNode, index: number, variant: "row" | "tile" | "featured" | "dock", defaultWidth?: number, cards = false) => {
    const hinted = bookmarkDropPreview?.targetId === child.id ? bookmarkDropPreview : null;
    const placeholder = hinted ? <BookmarkDropPlaceholder preview={hinted} language={config.language} /> : null;
    return <Fragment key={`${child.id}-${index}`}>
      {hinted && !hinted.after && placeholder}
      <LinkItem node={child} parent={parentFor(child)} index={child.index ?? index} config={config} variant={variant} defaultWidth={defaultWidth} pageSpan={componentSpan} editing={editing} onEdit={onEdit} onMove={onMove} onDelete={onDelete} onRecentClick={onRecentClick} dropTarget={!!hinted} cards={cards} />
      {hinted && hinted.after && placeholder}
    </Fragment>;
  };
  const renderTail = () => bookmarkDropPreview?.targetId === `tail-${node.id}` ? <BookmarkDropPlaceholder preview={bookmarkDropPreview} language={config.language} /> : null;
  return (
    <section className={`folder ${block ? "folder--block" : "folder--nested"} folder--${displayStyle} ${collapsed ? "is-collapsed" : ""} ${transparent ? "is-transparent" : ""} ${borderless ? "is-borderless" : ""} ${menu ? "has-style-menu" : ""} ${links.length > 12 ? "is-dense" : ""} ${dropReady && !bookmarkDropPreview ? "is-drop-ready" : ""}`} style={{ "--page-columns": componentSpan, ...(!block ? { "--folder-span": renderedFolderSpan } : {}) } as React.CSSProperties} data-folder-id={node.id} data-native-title={node.title} onDragEnter={previewFolderDrop} onDragLeave={() => setDropReady(false)} onDragOver={(event) => { if (organize || hasBookmarkDrag(event)) { event.preventDefault(); event.stopPropagation(); } }} onDrop={dropInto}>
      {dropReady && !bookmarkDropPreview && <div className="folder-drop-overlay" aria-hidden="true"><FolderOpen weight="fill" /><strong>{t("common.dropHere")}</strong><small>{t("common.moveInto", { title: displayTitle })}</small></div>}
      <header className="folder__header" onDragEnter={previewFolderDrop} onDragOver={(event) => { if (organize || hasBookmarkDrag(event)) { event.preventDefault(); event.stopPropagation(); } }} onDrop={dropOnFolderHeader}>
        {!virtual && <span className="folder__drag" draggable onDragStart={beginFolderDrag} onDragEnd={() => { clearActiveDragItem(); setDropReady(false); window.dispatchEvent(new Event(dragEndEvent)); }} title={t("folder.drag")} aria-label={t("folder.dragAria", { title: parsedFolder.title })}><DotsSixVertical weight="bold" /></span>}
        <button className="folder__title" onClick={toggle} aria-expanded={!collapsed}>
          {collapsed ? <CaretRight weight="bold" /> : <CaretDown weight="bold" />}
          {collapsed ? <Folder weight="fill" /> : <FolderOpen weight="fill" />}
          <span>{displayTitle || t("common.unnamedFolder")}</span>
          <small>{countLinks(node)}</small>
        </button>
        {organize && <span className="drop-hint">{t("folder.dropHint")}</span>}
        {editing && (
          <div ref={styleActions} className="folder__actions" onKeyDown={(event) => { if (event.key === "Escape" && menu) { event.preventDefault(); setMenu(false); styleTrigger.current?.focus(); } }}>
            {!virtual && <><button className="icon-button" title={t("action.editFolder", { title: "" }).trim()} aria-label={t("action.editFolder", { title: parsedFolder.title })} onClick={() => onEdit({ id: node.id, parentId: node.parentId, type: "folder", title: parsedFolder.title, url: "", folderStyle: style, width: nestedWidth, collapsed, transparent, borderless, pinned })}><PencilSimple /></button><button className="icon-button" title={t("move.folder")} aria-label={t("action.moveFolder", { title: parsedFolder.title })} onClick={() => onMove(node)}><LinkSimple /></button><button className="icon-button" title={t("app.newBookmark")} aria-label={t("action.newBookmarkIn", { title: parsedFolder.title })} onClick={() => onNewBookmark(node.id, newBookmarkDefaults(displayStyle))}><LinkSimple /></button><button className="icon-button" title={t("quick.newFolder")} aria-label={t("action.newFolderIn", { title: parsedFolder.title })} onClick={() => onNewFolder(node.id)}><FolderOpen /></button></>}
            <button ref={styleTrigger} className="icon-button folder__style-trigger" title={t("action.style")} aria-label={`${t("action.style")} ${displayTitle}`} aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu(!menu)}><DotsThree weight="bold" /><span>{t("action.style")}</span></button>
            {menu && <div className="style-menu" role="menu"><small role="presentation" className="style-menu__label">{t("editor.appearance")}</small>{stylesList.map((item) => <button role="menuitemradio" aria-checked={style === item.id} key={item.id} className={style === item.id ? "active" : ""} onClick={() => changeStyle(item.id)}><item.icon />{t(`folder.style.${item.id}`)}</button>)}<small role="presentation" className="style-menu__label">{t("folder.transparent")}</small><button role="menuitemcheckbox" aria-checked={transparent} className={transparent ? "active" : ""} onClick={toggleTransparent}>{transparent ? <EyeSlash /> : <Eye />}{t(transparent ? "folder.opaque" : "folder.transparent")}</button><small role="presentation" className="style-menu__label">{t("folder.borderless")}</small><button role="menuitemcheckbox" aria-checked={borderless} className={borderless ? "active" : ""} onClick={toggleBorderless}>{borderless ? <EyeSlash /> : <Eye />}{t(borderless ? "folder.bordered" : "folder.borderless")}</button>{!block && <><small role="presentation" className="style-menu__label">{t("folder.internalWidth")}</small><div role="group" aria-label={t("folder.internalWidth")} className="style-menu__widths">{[{ value: 12, label: t("editor.fullRow") }, { value: 6, label: "1/2" }, { value: 4, label: "1/3" }, { value: 3, label: "1/4" }].map((item) => <button role="menuitemradio" aria-checked={nestedWidth === item.value} key={item.value} className={nestedWidth === item.value ? "active" : ""} onClick={() => changeWidth(item.value)}>{item.label}</button>)}</div></>}{block && !virtual && onTogglePinned && <><small role="presentation" className="style-menu__label">{t("folder.pin")}</small><button role="menuitemradio" aria-checked={pinned} className={pinned ? "active" : ""} onClick={() => { setMenu(false); onTogglePinned(node, !pinned); }}><Star weight={pinned ? "fill" : "regular"} />{t(pinned ? "folder.unpin" : "folder.pinAsQuick")}</button></>}</div>}
            {!virtual && !pinned && <button className="icon-button danger" title={t("action.deleteFolder", { title: "" }).trim()} aria-label={t("action.deleteFolder", { title: parsedFolder.title })} onClick={() => onDelete(node, node.parentId || effectiveParent.id, siblingIndex)}><Trash /></button>}
          </div>
        )}
      </header>
      {collapsed && <CollapsedFolderPreview children={children} />}
      {!collapsed && <div className="folder__body" onDragEnter={previewFolderDrop} onDragOver={(event) => { if (organize || hasBookmarkDrag(event)) { event.preventDefault(); event.stopPropagation(); } }} onDrop={dropInto}>
        {children.length === 0 && <button className="empty-folder" onClick={() => editing && onNewBookmark(node.id, newBookmarkDefaults(displayStyle))}><Folder />{t("folder.empty")}{editing && ` · ${t("folder.addBookmark")}`}</button>}
        {(displayStyle === "directory" || displayStyle === "stack" || displayStyle === "columns") && <div className="directory-grid" {...bookmarkGridDrag}>{children.map((child, index) => child.url
          ? renderLink(child, child.index ?? index, "row", displayStyle === "columns" ? 6 : 4)
          : <FolderView key={child.id} node={child} siblingIndex={index} level={level + 1} {...common} />)}{renderTail()}</div>}
        {displayStyle === "icons" && directLinks.length > 0 && <div className="icon-grid" {...bookmarkGridDrag}>{directLinks.map((child) => renderLink(child, child.index ?? children.indexOf(child), "tile"))}{renderTail()}</div>}
        {displayStyle === "mixed" && directLinks.length > 0 && <div className="mixed-grid" {...bookmarkGridDrag}>{directLinks.map((child, index) => renderLink(child, child.index ?? children.indexOf(child), index === 0 ? "featured" : "tile"))}{renderTail()}</div>}
        {displayStyle === "dock" && directLinks.length > 0 && <div className="dock-list" {...bookmarkGridDrag}>{directLinks.map((child) => renderLink(child, child.index ?? children.indexOf(child), "dock"))}{renderTail()}</div>}
        {displayStyle === "focus" && directLinks.length > 0 && <div className="focus-list" {...bookmarkGridDrag}>{directLinks.map((child, index) => renderLink(child, child.index ?? children.indexOf(child), index < 2 ? "featured" : "row"))}{renderTail()}</div>}
        {displayStyle === "cards" && directLinks.length > 0 && <div className="cards-grid" {...bookmarkGridDrag}>{directLinks.map((child) => renderLink(child, child.index ?? children.indexOf(child), "row", 3, true))}{renderTail()}</div>}
        {displayStyle !== "directory" && displayStyle !== "stack" && displayStyle !== "columns" && childFolders.length > 0 && <div className="folder-groups">{childFolders.map((child) => <FolderView key={child.id} node={child} siblingIndex={children.indexOf(child)} level={level + 1} {...common} />)}</div>}
        {(organize || dropReady) && <div className="folder-drop-zone" onDragEnter={previewFolderDrop} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }} onDrop={dropInto}><FolderOpen />{t("folder.dropZone", { title: displayTitle })}</div>}
      </div>}
    </section>
  );
}

function BookmarkDropPlaceholder({ preview, language }: { preview: BookmarkDropPreview; language: Language }) {
  const t = createTranslator(language);
  const { indicator } = preview;
  // Absolutely positioned against the grid, so it never takes a cell. The label
  // is kept in the DOM for assistive tech and tests but clipped visually — a
  // 3px bar has nowhere to put text.
  return <div
    className="bookmark-drop-placeholder"
    style={indicator ? { left: indicator.left, top: indicator.top, width: indicator.width, height: indicator.height } : undefined}
    aria-label={t("folder.dropBefore", { title: preview.targetTitle })}
  ><span>{t("common.dropHere")}</span></div>;
}

export function ResizeHandle({ width, language, onWidth, onCommit }: { width: number; language: Language; onWidth: (value: number) => void; onCommit?: (value: number) => void }) {
  const t = createTranslator(language);
  const begin = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation();
    const container = event.currentTarget.closest(".bookmark-grid");
    if (!container) return;
    const start = event.clientX; const startWidth = width; const column = container.clientWidth / 12;
    let latest = startWidth;
    const allowed = [3, 4, 6, 8, 9, 12];
    const move = (next: globalThis.PointerEvent) => {
      const raw = Math.max(3, Math.min(12, startWidth + (next.clientX - start) / column));
      latest = allowed.reduce((best, value) => Math.abs(value - raw) < Math.abs(best - raw) ? value : best, allowed[0]);
      onWidth(latest);
    };
    const finish = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); onCommit?.(latest); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish);
  };
  return <button className="resize-handle" onPointerDown={begin} title={t("folder.resize", { width })}><span /></button>;
}
