import { Fragment, useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { DotsThree, FolderOpen, FolderPlus, LinkSimple, PencilSimple, SlidersHorizontal, Star, Trash } from "@phosphor-icons/react";
import { parsePresentationTitle } from "../lib/bookmarks";
import { favicon } from "../lib/favicon";
import { stylesList } from "./FolderView";
import { createTranslator } from "../lib/i18n";
import { openBookmarkLink } from "../lib/navigation";
import { clearActiveDragItem, getActiveDragItem, setActiveDragItem } from "../lib/dragSession";
import type { AppConfig, BookmarkNode, BookmarkStyle, EditorValue, FolderStyle } from "../types";

type BookmarkDefaults = Pick<EditorValue, "style" | "width" | "rows">;
type QuickDragItem = { id: string; parentId: string; index: number; title: string };
type QuickDropIndicator = { left: number; top: number; width: number; height: number };
type QuickDropPreview = QuickDragItem & { targetId: string; targetParentId: string; targetIndex: number; targetTitle: string; span: number; after: boolean; indicator: QuickDropIndicator | null };
type QuickDropSlot = Omit<QuickDropPreview, "id" | "parentId" | "index" | "title" | "span" | "after" | "indicator"> & { left: number; right: number; top: number; bottom: number; span: number };

// Mirrors FolderView: the pointer's side of the hovered tile decides whether
// the item lands before or after it, and a drop that resolves to the position
// the item already holds is suppressed instead of animating a hint that would
// do nothing.
function quickInsertionIndex(targetIndex: number, after: boolean) { return targetIndex + (after ? 1 : 0); }
// Same axis choice as FolderView: split left/right inside a row, top/bottom for
// a tile that is alone on its row.
function quickSharesRow(hit: QuickDropSlot, slots: QuickDropSlot[]) {
  return slots.some((slot) => slot !== hit && slot.targetParentId === hit.targetParentId
    && slot.top < hit.bottom && hit.top < slot.bottom);
}
function quickIsAfter(hit: QuickDropSlot, slots: QuickDropSlot[], x: number, y: number) {
  return quickSharesRow(hit, slots) ? x >= (hit.left + hit.right) / 2 : y >= (hit.top + hit.bottom) / 2;
}

// Out-of-flow insertion bar, positioned against the grid. See the note on
// .bookmark-drop-placeholder in styles.css for why it must not take a cell.
const quickIndicatorThickness = 3;
function quickEdgeIndicator(host: HTMLElement, target: HTMLElement, after: boolean, horizontal: boolean): QuickDropIndicator {
  const rect = target.getBoundingClientRect();
  const box = host.getBoundingClientRect();
  const left = rect.left - box.left - host.clientLeft;
  const top = rect.top - box.top - host.clientTop;
  return horizontal
    ? { left: left + (after ? rect.width : 0) - quickIndicatorThickness / 2, top, width: quickIndicatorThickness, height: rect.height }
    : { left, top: top + (after ? rect.height : 0) - quickIndicatorThickness / 2, width: rect.width, height: quickIndicatorThickness };
}
function quickIndicatorFor(host: HTMLElement | null, targetId: string, after: boolean, horizontal: boolean) {
  const target = host?.querySelector<HTMLElement>(`:scope > [data-quick-bookmark-id="${CSS.escape(targetId)}"]`);
  return host && target ? quickEdgeIndicator(host, target, after, horizontal) : null;
}
function quickTailIndicatorFor(host: HTMLElement | null) {
  const items = host ? Array.from(host.querySelectorAll<HTMLElement>(":scope > [data-quick-bookmark-id]")) : [];
  const last = items[items.length - 1];
  if (!host || !last) return null;
  const rect = last.getBoundingClientRect();
  const horizontal = items.some((element) => {
    if (element === last) return false;
    const other = element.getBoundingClientRect();
    return other.top < rect.bottom && rect.top < other.bottom;
  });
  return quickEdgeIndicator(host, last, true, horizontal);
}
function quickIsNoop(insertAt: number, sourceIndex: number, sameParent: boolean) {
  return sameParent && (insertAt === sourceIndex || insertAt === sourceIndex + 1);
}

type Props = {
  folder: BookmarkNode;
  config: AppConfig;
  onConfig: (recipe: (value: AppConfig) => AppConfig) => void;
  editing: boolean;
  onToggleAll: () => void;
  onEdit: (value: EditorValue) => void;
  onMove: (node: BookmarkNode) => void;
  onDelete: (node: BookmarkNode, parentId: string, index: number) => void;
  onNewBookmark: (parentId: string, defaults: BookmarkDefaults) => void;
  onNewFolder: (parentId: string) => void;
  onRecentClick: (node: BookmarkNode, parent: BookmarkNode, index: number) => Promise<void>;
  onReorder: (id: string, parentId: string, index: number, title: string) => Promise<void>;
  onMoveInto: (id: string, parentId: string, folderTitle: string) => Promise<void>;
  onStyle: (style: FolderStyle) => void;
  onUnpin: () => void;
};

const quickBookmarkDefaults: BookmarkDefaults = { style: "tile", width: 1.5, rows: 1 };
const bookmarkStyles: BookmarkStyle[] = ["row", "tile", "featured", "dock", "compact"];
const folderDragMime = "application/x-xiangzi-folio-bookmark";
const quickDragMime = "application/x-xiangzi-folio-quick";

function hasPageBookmarkDrag(event: DragEvent) {
  // Chromium deliberately withholds custom payload text until drop. `types` is
  // available throughout the drag, while getData keeps local/test transfers working.
  if (getActiveDragItem()?.type === "bookmark") return true;
  if (Array.from(event.dataTransfer.types || []).includes(folderDragMime)) return true;
  try { return !!event.dataTransfer.getData(folderDragMime); } catch { return false; }
}

function isQuickBookmarkDrag(event: DragEvent) {
  if (getActiveDragItem()?.source === "quick") return true;
  return Array.from(event.dataTransfer.types || []).includes(quickDragMime) || !!event.dataTransfer.getData(quickDragMime);
}

function readPageBookmarkPayload(event: DragEvent) {
  const active = getActiveDragItem();
  if (active?.type === "bookmark") return active;
  let raw = "";
  try { raw = event.dataTransfer.getData(folderDragMime); } catch { /* ignored */ }
  if (!raw) return null;
  try { return JSON.parse(raw) as { id?: string; type?: string; parentId?: string }; } catch { return null; }
}

function presentationFor(node: BookmarkNode, config: AppConfig): BookmarkDefaults & { span: number; mobileSpan: number } {
  const parsed = parsePresentationTitle(node.title);
  const titleStyle = bookmarkStyles.includes(parsed.marker as BookmarkStyle) ? parsed.marker as BookmarkStyle : undefined;
  const style = config.markerStorageVersion >= 3 ? titleStyle || config.bookmarkStyles[node.id] || "tile" : config.bookmarkStyles[node.id] || titleStyle || "tile";
  const width = (config.markerStorageVersion >= 3 ? parsed.width || config.bookmarkWidths[node.id] : config.bookmarkWidths[node.id] || parsed.width) || (style === "tile" ? 1.5 : style === "featured" ? 8 : style === "dock" ? 3 : 4);
  const rows = (config.markerStorageVersion >= 3 ? parsed.rows || config.bookmarkRows[node.id] : config.bookmarkRows[node.id] || parsed.rows) || 1;
  const defaultSpan = style === "featured" ? 4 : style === "dock" ? 3 : 2;
  const scaled = style === "tile" ? Math.round(width / 1.5) * 2 : Math.round(width / 2);
  const span = Math.min(10, Math.max(defaultSpan, scaled || defaultSpan));
  return { style, width, rows, span, mobileSpan: span >= 4 ? 10 : 5 };
}

function QuickBookmark({ node, parent, index, config, editing, preview, onEdit, onMove, onDelete, onRecentClick, onDragStart, onDragEnd }: Pick<Props, "config" | "editing" | "onEdit" | "onMove" | "onDelete" | "onRecentClick"> & { node: BookmarkNode; parent: BookmarkNode; index: number; preview: QuickDropPreview | null; onDragStart: (event: DragEvent, item: QuickDragItem, url?: string) => void; onDragEnd: () => void }) {
  const [broken, setBroken] = useState(false);
  const [dragging, setDragging] = useState(false);
  const parsed = parsePresentationTitle(node.title);
  const t = createTranslator(config.language);
  const title = parsed.title || t("quick.unnamed");
  const presentation = presentationFor(node, config);
  const host = (() => { try { return new URL(node.url || "").hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const item = { id: node.id, parentId: parent.id, index, title };
  const hinted = preview?.targetId === node.id ? preview : null;
  const placeholder = hinted ? <div className="quick-access__drop-placeholder" style={hinted.indicator ? { left: hinted.indicator.left, top: hinted.indicator.top, width: hinted.indicator.width, height: hinted.indicator.height } : undefined}><span>{t("common.dropHere")}</span></div> : null;
  return <Fragment>
    {hinted && !hinted.after && placeholder}
    <article className={`quick-access__item quick-access__item--${presentation.style} ${presentation.rows === 2 ? "is-tall" : ""} ${editing ? "is-editing" : ""} ${dragging ? "is-dragging" : ""} ${preview?.targetId === node.id ? "is-drop-target" : ""}`} style={{ "--quick-span": presentation.span, "--quick-mobile-span": presentation.mobileSpan } as CSSProperties} data-testid={`quick-bookmark-${node.id}`} data-quick-bookmark-id={node.id} data-quick-parent-id={parent.id} data-quick-bookmark-index={index} data-quick-bookmark-title={title} data-quick-span={presentation.span} draggable onDragStart={(event) => { setDragging(true); onDragStart(event, item, node.url); }} onDragEnd={() => { setDragging(false); onDragEnd(); }}>
      {editing && <span className="quick-access__drag" aria-hidden="true">⋮⋮</span>}
      <a href={node.url} draggable={true} title={`${title}\n${node.url}`} onDragStart={(event) => { event.stopPropagation(); setDragging(true); onDragStart(event, item, node.url); }} onClick={(event) => { if (editing) { event.preventDefault(); return; } void openBookmarkLink(event, node.url, () => onRecentClick(node, parent, index)); }}>
        <span className="quick-access__icon" aria-hidden="true">{!broken && node.url ? <img src={favicon(node.url, 64)} alt="" onError={() => setBroken(true)} /> : <span>{title.slice(0, 1).toUpperCase()}</span>}</span>
        <span><strong>{title}</strong><small>{host}</small></span>
      </a>
      {editing && <div className="quick-access__actions"><button className="icon-button" type="button" aria-label={t("action.editBookmark", { title })} title={t("editor.edit") + t("editor.bookmark")} onClick={() => onEdit({ id: node.id, parentId: parent.id, type: "bookmark", title, url: node.url || "", style: presentation.style, width: presentation.width, rows: presentation.rows, cardsContext: true })}><PencilSimple /></button><button className="icon-button" type="button" aria-label={t("action.moveBookmark", { title })} title={t("move.bookmark")} onClick={() => onMove(node)}><LinkSimple /></button><button className="icon-button danger" type="button" aria-label={t("action.deleteBookmark", { title })} title={t("action.deleteBookmark", { title: "" }).trim()} onClick={() => onDelete(node, parent.id, index)}><Trash /></button></div>}
    </article>
    {hinted && hinted.after && placeholder}
  </Fragment>;
}

type GridProps = Pick<Props, "config" | "editing" | "onEdit" | "onMove" | "onDelete" | "onRecentClick"> & {
  parent: BookmarkNode;
  links: BookmarkNode[];
  preview: QuickDropPreview | null;
  onDragStart: (event: DragEvent, item: QuickDragItem, url?: string) => void;
  onDragEnd: () => void;
  onPreview: (event: DragEvent, parent: BookmarkNode) => void;
  onDrop: (event: DragEvent) => void;
};

function QuickGrid({ parent, links, preview, onPreview, onDrop, ...props }: GridProps) {
  const t = createTranslator(props.config.language);
  const tail = preview?.targetId === `tail-${parent.id}` ? <div className="quick-access__drop-placeholder" style={{ "--quick-span": preview.span } as CSSProperties} aria-label={t("common.dropAtEnd")}><span>{t("common.dropHere")}</span></div> : null;
  return <div className="quick-access__grid" onDragEnter={(event) => onPreview(event, parent)} onDragOver={(event) => onPreview(event, parent)} onDrop={onDrop}>{links.map((node, index) => <QuickBookmark key={node.id} node={node} parent={parent} index={node.index ?? index} preview={preview} {...props} />)}{tail}</div>;
}

type GroupProps = Omit<Props, "folder" | "onToggleAll" | "onReorder" | "onStyle" | "onUnpin"> & Pick<GridProps, "preview" | "onDragStart" | "onDragEnd" | "onPreview" | "onDrop"> & { folder: BookmarkNode; parent: BookmarkNode; depth: number };

function QuickFolderGroup({ folder, parent, depth, preview, onDragStart, onDragEnd, onPreview, onDrop, ...props }: GroupProps) {
  const [dropReady, setDropReady] = useState(false);
  useEffect(() => {
    const clear = () => setDropReady(false);
    document.addEventListener("dragend", clear, true);
    document.addEventListener("drop", clear, true);
    return () => { document.removeEventListener("dragend", clear, true); document.removeEventListener("drop", clear, true); };
  }, []);
  const children = folder.children || [];
  const links = children.filter((child) => child.url);
  const folders = children.filter((child) => !child.url);
  const t = createTranslator(props.config.language);
  const title = parsePresentationTitle(folder.title).title || t("common.unnamedFolder");
  const parentId = folder.parentId || parent.id;
  const index = folder.index ?? (parent.children || []).indexOf(folder);
  const previewExternalDrop = (event: DragEvent) => {
    if (!hasPageBookmarkDrag(event)) return;
    event.preventDefault(); event.stopPropagation(); setDropReady(true);
  };
  const dropExternalItem = async (event: DragEvent) => {
    const item = readPageBookmarkPayload(event);
    if (!item?.id) return;
    event.preventDefault(); event.stopPropagation(); setDropReady(false);
    try {
      if (item.id === folder.id) return;
      // See FolderView.dropInto: this coarse handler only relocates a bookmark
      // into a *different* folder. A reorder drag that lands off-target within
      // this same folder's own grid should not fling the item to its end.
      if (item.parentId === folder.id) { clearActiveDragItem(); return; }
      clearActiveDragItem();
      await props.onMoveInto(item.id, folder.id, title);
    } catch { /* Invalid transfer data is ignored; source components own their drag payload. */ }
  };
  return <section className={`quick-folder-group ${dropReady ? "is-drop-ready" : ""}`} style={{ "--quick-depth": depth } as CSSProperties} data-folder-id={folder.id} onDragEnter={previewExternalDrop} onDragOver={previewExternalDrop} onDragLeave={(event) => { if (event.currentTarget === event.target) setDropReady(false); }} onDrop={dropExternalItem}>
    {dropReady && <div className="quick-folder-drop-overlay" aria-hidden="true"><FolderOpen weight="fill" /><strong>{t("common.dropHere")}</strong><small>{t("common.moveInto", { title })}</small></div>}
    <header>
      <div><FolderOpen weight="fill" /><span>{title}</span><small>{links.length}</small></div>
      {props.editing && <div className="quick-folder-group__actions"><button className="icon-button" type="button" aria-label={t("action.editFolder", { title })} title={t("action.editFolder", { title: "" }).trim()} onClick={() => props.onEdit({ id: folder.id, parentId: folder.parentId, type: "folder", title, url: "", folderStyle: "icons" as FolderStyle, width: 4, transparent: !!props.config.folderTransparent[folder.id], borderless: !!props.config.folderBorderless[folder.id] })}><PencilSimple /></button><button className="icon-button" type="button" aria-label={t("action.moveFolder", { title })} title={t("move.folder")} onClick={() => props.onMove(folder)}><LinkSimple /></button><button className="icon-button" type="button" aria-label={t("action.newBookmarkIn", { title })} title={t("app.newBookmark")} onClick={() => props.onNewBookmark(folder.id, quickBookmarkDefaults)}><LinkSimple /></button><button className="icon-button" type="button" aria-label={t("action.newFolderIn", { title })} title={t("quick.newFolder")} onClick={() => props.onNewFolder(folder.id)}><FolderPlus /></button><button className="icon-button danger" type="button" aria-label={t("action.deleteFolder", { title })} title={t("action.deleteFolder", { title: "" }).trim()} onClick={() => props.onDelete(folder, parentId, index)}><Trash /></button></div>}
    </header>
    {links.length > 0 && <QuickGrid parent={folder} links={links} preview={preview} onDragStart={onDragStart} onDragEnd={onDragEnd} onPreview={onPreview} onDrop={onDrop} {...props} />}
    {folders.map((child) => <QuickFolderGroup key={child.id} folder={child} parent={folder} depth={depth + 1} preview={preview} onDragStart={onDragStart} onDragEnd={onDragEnd} onPreview={onPreview} onDrop={onDrop} {...props} />)}
  </section>;
}

export function QuickAccess({ folder, config, onConfig, editing, onToggleAll, onEdit, onMove, onDelete, onNewBookmark, onNewFolder, onRecentClick, onReorder, onMoveInto, onStyle, onUnpin }: Props) {
  const t = createTranslator(config.language);
  const [dragItem, setDragItem] = useState<QuickDragItem | null>(null);
  const [preview, setPreview] = useState<QuickDropPreview | null>(null);
  // Native dragover/drop can fire back-to-back within the same task, before React
  // has committed the state update from the preceding dragover. onDrop reads this
  // ref (updated synchronously) instead of the possibly-stale `preview` closure,
  // so a drop right after the preview is set is never missed.
  const previewRef = useRef<QuickDropPreview | null>(null);
  const updatePreview = (value: QuickDropPreview | null) => { previewRef.current = value; setPreview(value); };
  const [rootDropReady, setRootDropReady] = useState(false);
  const [styleMenu, setStyleMenu] = useState(false);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!styleMenu) return;
    const close = (event: PointerEvent) => { if (!styleMenuRef.current?.contains(event.target as Node)) setStyleMenu(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [styleMenu]);
  useEffect(() => {
    // A page bookmark dragged across the shelf can raise a hint here, but its
    // dragend fires on the FolderView item, never on a quick tile. Without
    // clearing the hint too, dragging through and dropping elsewhere leaves a
    // "放到这里" placeholder stranded in the grid.
    // The capture-phase drop runs before the grid's own bubble handler, which
    // still needs previewRef to complete the move, so that one only takes down
    // the visual. dragend always follows the drop and can clear everything.
    const clearVisual = () => { setRootDropReady(false); setPreview(null); };
    const clearAll = () => { setRootDropReady(false); setDragItem(null); updatePreview(null); };
    document.addEventListener("dragend", clearAll, true);
    document.addEventListener("drop", clearVisual, true);
    return () => { document.removeEventListener("dragend", clearAll, true); document.removeEventListener("drop", clearVisual, true); };
  }, []);
  const slots = useRef<QuickDropSlot[]>([]);
  const slotCaptureSource = useRef<string | null>(null);
  const slotScroll = useRef({ x: 0, y: 0 });
  const children = folder.children || [];
  // Quick Access is a shelf, not a regular folder card. Keep its outer frame
  // transparent by default while still allowing an explicit false value to
  // restore the shelf background from its style menu.
  const transparent = config.folderTransparent[folder.id] !== false;
  const borderless = !!config.folderBorderless[folder.id];
  const toggleTransparent = () => onConfig((value) => ({ ...value, folderTransparent: { ...value.folderTransparent, [folder.id]: !transparent } }));
  const toggleBorderless = () => onConfig((value) => ({ ...value, folderBorderless: { ...value.folderBorderless, [folder.id]: !borderless } }));
  const links = children.filter((child) => child.url);
  const folders = children.filter((child) => !child.url);
  const shared = { config, onConfig, editing, onEdit, onMove, onDelete, onNewBookmark, onNewFolder, onRecentClick, onMoveInto };
  const captureQuickSlots = (sourceId: string) => {
    slotScroll.current = { x: window.scrollX, y: window.scrollY };
    slots.current = Array.from(document.querySelectorAll<HTMLElement>("[data-quick-bookmark-id]"), (element) => {
      const rect = element.getBoundingClientRect();
      return { targetId: element.dataset.quickBookmarkId || "", targetParentId: element.dataset.quickParentId || "", targetIndex: Number(element.dataset.quickBookmarkIndex || 0), targetTitle: element.dataset.quickBookmarkTitle || "", span: Number(element.dataset.quickSpan || 1), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }).filter((slot) => slot.targetId && slot.targetParentId);
    slotCaptureSource.current = sourceId;
  };
  const currentDragItem = (): QuickDragItem | null => {
    const active = getActiveDragItem();
    if (active?.type !== "bookmark" || !active.parentId) return null;
    return { id: active.id, parentId: active.parentId, index: active.index, title: active.title || dragItem?.title || "" };
  };
  const onDragStart = (event: DragEvent, item: QuickDragItem, url?: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(quickDragMime, JSON.stringify(item));
    // Also expose the common payload. FolderView then accepts a quick entry as
    // a normal bookmark when it is dropped into any folder on the page.
    event.dataTransfer.setData(folderDragMime, JSON.stringify({ ...item, type: "bookmark" }));
    if (url) {
      event.dataTransfer.setData("text/uri-list", url);
      event.dataTransfer.setData("text/plain", url);
    }
    setActiveDragItem({ ...item, type: "bookmark", source: "quick" });
    captureQuickSlots(item.id);
    setDragItem(item); updatePreview(null);
  };
  const clearDrag = () => {
    clearActiveDragItem();
    setDragItem(null); updatePreview(null); slots.current = []; slotCaptureSource.current = null; window.dispatchEvent(new Event("xiangzi-folio-drag-end"));
  };
  const onPreview = (event: DragEvent, parent: BookmarkNode) => {
    const source = currentDragItem();
    if (!source) return;
    if (slotCaptureSource.current !== source.id) captureQuickSlots(source.id);
    event.preventDefault(); event.stopPropagation();
    const host = event.currentTarget as HTMLElement;
    const x = event.clientX + window.scrollX - slotScroll.current.x;
    const y = event.clientY + window.scrollY - slotScroll.current.y;
    const target = slots.current.find((slot) => slot.targetParentId === parent.id && x >= slot.left && x < slot.right && y >= slot.top && y < slot.bottom);
    const sameParent = source.parentId === parent.id;
    if (!target || target.targetId === source.id) {
      const groupSlots = slots.current.filter((slot) => slot.targetParentId === parent.id);
      const finalRowTop = Math.max(...groupSlots.map((slot) => slot.top));
      const finalRow = groupSlots.filter((slot) => Math.abs(slot.top - finalRowTop) < 2);
      const finalRight = Math.max(...finalRow.map((slot) => slot.right));
      const finalBottom = Math.max(...finalRow.map((slot) => slot.bottom));
      const isTail = groupSlots.length > 0 && (y >= finalBottom || (y >= finalRowTop && y < finalBottom && x >= finalRight));
      const tailIndex = (parent.children || []).length;
      if (isTail && !quickIsNoop(tailIndex, source.index, sameParent)) {
        updatePreview({ ...source, targetId: `tail-${parent.id}`, targetParentId: parent.id, targetIndex: tailIndex, targetTitle: t("common.groupEnd"), after: false, indicator: quickTailIndicatorFor(host), span: Math.max(1, Math.round(source.index >= 0 ? slots.current.find((slot) => slot.targetId === source.id)?.span || 1 : 1)) });
        return;
      }
      updatePreview(null); return;
    }
    const after = quickIsAfter(target, slots.current, x, y);
    if (quickIsNoop(quickInsertionIndex(target.targetIndex, after), source.index, sameParent)) { updatePreview(null); return; }
    updatePreview({ ...source, ...target, after, indicator: quickIndicatorFor(host, target.targetId, after, quickSharesRow(target, slots.current)) });
  };
  const onDrop = async (event: DragEvent) => {
    const source = currentDragItem();
    if (!source) return;
    const target = previewRef.current;
    if (!target) {
      // A drag that began inside the shelf has to be swallowed here even with
      // no active hint. Suppressed no-op positions produce a null preview, and
      // letting those bubble hands the drop to the section's "move into quick
      // access" handler, which re-appends the item to the end of the shelf.
      // A page bookmark still falls through: that append is its intended path.
      if (getActiveDragItem()?.source === "quick") { event.preventDefault(); event.stopPropagation(); clearDrag(); }
      return;
    }
    event.preventDefault(); event.stopPropagation();
    const sameParent = source.parentId === target.targetParentId;
    const insertAt = quickInsertionIndex(target.targetIndex, target.after);
    clearDrag();
    if (quickIsNoop(insertAt, source.index, sameParent)) return;
    await onReorder(source.id, target.targetParentId, sameParent && source.index < insertAt ? insertAt - 1 : insertAt, source.title);
  };
  const previewRootDrop = (event: DragEvent) => {
    if (isQuickBookmarkDrag(event) || !hasPageBookmarkDrag(event)) return;
    event.preventDefault(); event.stopPropagation(); setRootDropReady(true);
  };
  const dropIntoRoot = async (event: DragEvent) => {
    const item = readPageBookmarkPayload(event);
    if (!item?.id) return;
    event.preventDefault(); event.stopPropagation(); setRootDropReady(false);
    try {
      if (item.id === folder.id) return;
      // See FolderView.dropInto: only relocates into a *different* folder. A
      // shelf-internal reorder that misses the grid and lands on the shelf's
      // own background should not fling the tile to the end of the shelf.
      if (item.parentId === folder.id) { clearActiveDragItem(); return; }
      clearActiveDragItem();
      await onMoveInto(item.id, folder.id, t("quick.title"));
    } catch { /* Invalid transfer data is ignored; source components own their drag payload. */ }
  };
  return <section className={`quick-access ${transparent ? "is-transparent" : ""} ${borderless ? "is-borderless" : ""} ${rootDropReady ? "is-drop-ready" : ""}`} aria-label={t("quick.title")} onDragEnter={previewRootDrop} onDragOver={previewRootDrop} onDragLeave={(event) => { if (event.currentTarget === event.target) setRootDropReady(false); }} onDrop={dropIntoRoot}>
    {rootDropReady && <div className="quick-folder-drop-overlay quick-access__drop-overlay" aria-hidden="true"><FolderOpen weight="fill" /><strong>{t("common.dropHere")}</strong><small>{t("common.moveInto", { title: t("quick.title") })}</small></div>}
    <header><div><Star weight="fill" /><span>{t("quick.title")}</span></div><div className="quick-access__tools">{editing && <><button type="button" aria-label={t("quick.addBookmark")} title={t("quick.addBookmark")} onClick={() => onNewBookmark(folder.id, quickBookmarkDefaults)}><LinkSimple />{t("quick.newEntry")}</button><button type="button" aria-label={t("quick.addFolder")} title={t("quick.addFolder")} onClick={() => onNewFolder(folder.id)}><FolderPlus />{t("quick.newFolder")}</button><div ref={styleMenuRef} className="quick-access__style"><button type="button" aria-label={t("action.style")} title={t("action.style")} aria-expanded={styleMenu} aria-haspopup="menu" onClick={() => setStyleMenu(!styleMenu)}><DotsThree weight="bold" /></button>{styleMenu && <div className="style-menu" role="menu"><small role="presentation" className="style-menu__label">{t("editor.appearance")}</small>{stylesList.map((item) => <button title={t(`folder.style.${item.id}`)} role="menuitemradio" aria-checked={item.id === "cards"} key={item.id} className={item.id === "cards" ? "active" : ""} onClick={() => { setStyleMenu(false); onStyle(item.id); }}><item.icon />{t(`folder.style.${item.id}`)}</button>)}<small role="presentation" className="style-menu__label">{t("folder.transparent")}</small><button title={t(transparent ? "folder.opaque" : "folder.transparent")} role="menuitemcheckbox" aria-checked={transparent} className={transparent ? "active" : ""} onClick={() => { toggleTransparent(); setStyleMenu(false); }}>{transparent ? t("folder.opaque") : t("folder.transparent")}</button><small role="presentation" className="style-menu__label">{t("folder.borderless")}</small><button title={t(borderless ? "folder.bordered" : "folder.borderless")} role="menuitemcheckbox" aria-checked={borderless} className={borderless ? "active" : ""} onClick={() => { toggleBorderless(); setStyleMenu(false); }}>{borderless ? t("folder.bordered") : t("folder.borderless")}</button><small role="presentation" className="style-menu__label">{t("folder.pin")}</small><button title={t("folder.unpin")} role="menuitemradio" aria-checked="true" className="active" onClick={() => { setStyleMenu(false); onUnpin(); }}><Star weight="fill" />{t("folder.unpin")}</button></div>}</div></>}<button type="button" title={t("quick.toggleAll")} onClick={onToggleAll}><SlidersHorizontal />{t("quick.toggleAll")}</button></div></header>
    {links.length > 0 && <QuickGrid parent={folder} links={links} preview={preview} onDragStart={onDragStart} onDragEnd={clearDrag} onPreview={onPreview} onDrop={onDrop} {...shared} />}
    {folders.map((child) => <QuickFolderGroup key={child.id} folder={child} parent={folder} depth={0} preview={preview} onDragStart={onDragStart} onDragEnd={clearDrag} onPreview={onPreview} onDrop={onDrop} {...shared} />)}
  </section>;
}
