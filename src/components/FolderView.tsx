import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from "react";
import {
  ArrowSquareOut, CaretDown, CaretRight, DotsSixVertical, DotsThree, Folder, FolderOpen,
  GridFour, LinkSimple, ListBullets, PencilSimple, Rows, SquaresFour, Trash,
} from "@phosphor-icons/react";
import { bookmarks, collectLinks, countLinks, parsePresentationTitle, setFolderPresentationTitle } from "../lib/bookmarks";
import { createTranslator } from "../lib/i18n";
import type { AppConfig, BookmarkNode, BookmarkStyle, EditorValue, FolderStyle, Language } from "../types";

export const stylesList: Array<{ id: FolderStyle; icon: typeof ListBullets }> = [
  { id: "directory", icon: ListBullets }, { id: "icons", icon: GridFour }, { id: "mixed", icon: SquaresFour }, { id: "dock", icon: Rows },
  { id: "stack", icon: ListBullets }, { id: "focus", icon: SquaresFour }, { id: "columns", icon: Rows },
];

type Props = {
  node: BookmarkNode;
  config: AppConfig;
  editing: boolean;
  level?: number;
  block?: boolean;
  siblingIndex?: number;
  pageSpan?: number;
  onConfig: (recipe: (value: AppConfig) => AppConfig) => void;
  onEdit: (value: EditorValue) => void;
  onRefresh: () => Promise<void>;
  onToast: (text: string) => void;
  onMove: (node: BookmarkNode) => void;
  onNewFolder: (parentId: string) => void;
  onNewBookmark: (parentId: string, defaults: Pick<EditorValue, "style" | "width" | "rows">) => void;
  onDelete: (node: BookmarkNode, parentId: string, index: number) => void;
  onRecentClick: (node: BookmarkNode, parent: BookmarkNode, index: number) => void;
};

const dragMime = "application/x-xiangzi-folio-bookmark";
const dragEndEvent = "xiangzi-folio-drag-end";
const dragPreviewEvent = "xiangzi-folio-drag-preview";

type DragItem = { id: string; parentId?: string; index: number; type: "bookmark" | "folder"; width?: number; rows?: number };
type BookmarkDropPreview = {
  sourceId: string; sourceParentId?: string; sourceIndex: number;
  targetId: string; targetParentId: string; targetIndex: number; targetTitle: string;
  width: number; rows: number;
};
type BookmarkDropSlot = Omit<BookmarkDropPreview, "sourceId" | "sourceParentId" | "sourceIndex" | "width" | "rows"> & {
  left: number; right: number; top: number; bottom: number;
};
let activeDragItem: DragItem | null = null;
let activeDropSlots: BookmarkDropSlot[] = [];
let dragScroll = { x: 0, y: 0 };

function captureBookmarkDropSlots() {
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
}

function bookmarkDropSlotAt(clientX: number, clientY: number) {
  const x = clientX + window.scrollX - dragScroll.x;
  const y = clientY + window.scrollY - dragScroll.y;
  return activeDropSlots.find((slot) => x >= slot.left && x < slot.right && y >= slot.top && y < slot.bottom) || null;
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

function favicon(url = "") {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
  }
  try { return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(new URL(url).origin)}&sz=64`; }
  catch { return ""; }
}

function newBookmarkDefaults(style: FolderStyle): Pick<EditorValue, "style" | "width" | "rows"> {
  if (style === "icons" || style === "mixed") return { style: "tile", width: 1.5, rows: 1 };
  if (style === "dock") return { style: "dock", width: 3, rows: 1 };
  if (style === "stack") return { style: "compact", width: 4, rows: 1 };
  if (style === "focus") return { style: "featured", width: 8, rows: 1 };
  if (style === "columns") return { style: "row", width: 6, rows: 1 };
  return { style: "row", width: 4, rows: 1 };
}

function LinkItem({ node, parent, index, config, editing, onEdit, onMove, onDelete, onRecentClick, dropTarget, variant = "row", defaultWidth, pageSpan = 12 }: {
  node: BookmarkNode; parent: BookmarkNode; index: number; editing: boolean;
  config: AppConfig;
  onEdit: Props["onEdit"];
  onMove: Props["onMove"]; onDelete: Props["onDelete"]; onRecentClick: Props["onRecentClick"];
  dropTarget: boolean;
  variant?: "row" | "tile" | "featured" | "dock";
  defaultWidth?: number;
  pageSpan?: number;
}) {
  const [broken, setBroken] = useState(false);
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
    if (!organize) return;
    activeDragItem = { id: node.id, parentId: parent.id, index, type: "bookmark", width: itemWidth, rows };
    event.dataTransfer.setData(dragMime, JSON.stringify(activeDragItem));
    event.dataTransfer.effectAllowed = "move";
    captureBookmarkDropSlots();
  };
  return (
    <div className={`bookmark bookmark--${markedVariant} ${compact ? "bookmark--compact" : ""} ${rows === 2 ? "bookmark--tall" : ""} ${organize ? "is-organizing" : ""} ${dropTarget ? "is-drop-target" : ""}`} style={{ "--item-span": itemWidth } as CSSProperties} draggable={organize} onDragStart={beginDrag} onDragEnd={() => { activeDragItem = null; activeDropSlots = []; window.dispatchEvent(new Event(dragEndEvent)); }} data-testid={`bookmark-${node.id}`} data-bookmark-id={node.id} data-parent-id={parent.id} data-bookmark-index={index} data-bookmark-title={parsed.title}>
      {organize && <span className="bookmark__drag" title={t("action.dragSort")} aria-label={t("action.dragSort")}><DotsSixVertical weight="bold" /></span>}
      <a href={node.url} draggable={false} className="bookmark__link" title={`${parsed.title}\n${node.url}`} onClick={(event) => { if (editing) event.preventDefault(); else onRecentClick(node, parent, index); }}>
        <span className="favicon" aria-hidden="true">
          {!broken && node.url ? <img src={favicon(node.url)} alt="" onError={() => setBroken(true)} /> : <span>{parsed.title.slice(0, 1).toUpperCase()}</span>}
        </span>
        <span className="bookmark__copy"><strong>{parsed.title || t("common.unnamed")}</strong>{markedVariant === "featured" && <small>{node.url?.replace(/^https?:\/\//, "").split("/")[0]}</small>}</span>
        {markedVariant === "row" && <ArrowSquareOut className="bookmark__open" weight="bold" />}
      </a>
      {organize && (
        <div className="bookmark__actions"><button className="icon-button" aria-label={t("action.editBookmark", { title: parsed.title })} title={t("action.editBookmark", { title: "" }).trim()} onClick={(event) => { event.preventDefault(); onEdit({ id: node.id, parentId: parent.id, type: "bookmark", title: parsed.title, url: node.url || "", style: itemStyle, width: itemWidth, rows }); }}><PencilSimple /></button><button className="icon-button" aria-label={t("action.moveBookmark", { title: parsed.title })} title={t("move.bookmark")} onClick={(event) => { event.preventDefault(); onMove(node); }}><LinkSimple /></button><button className="icon-button danger" aria-label={t("action.deleteBookmark", { title: parsed.title })} title={t("action.deleteBookmark", { title: "" }).trim()} onClick={(event) => { event.preventDefault(); onDelete(node, parent.id, index); }}><Trash /></button></div>
      )}
    </div>
  );
}

export function FolderView({ node, config, editing, level = 0, block = false, siblingIndex = node.index ?? 0, pageSpan = 12, onConfig, onEdit, onRefresh, onToast, onMove, onNewFolder, onNewBookmark, onDelete, onRecentClick }: Props) {
  const t = createTranslator(config.language);
  const [menu, setMenu] = useState(false);
  const [dropReady, setDropReady] = useState(false);
  const [bookmarkDropPreview, setBookmarkDropPreview] = useState<BookmarkDropPreview | null>(null);
  const styleActions = useRef<HTMLDivElement>(null);
  const styleTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const clear = () => { setDropReady(false); setBookmarkDropPreview(null); };
    const clearOther = (event: Event) => {
      if ((event as CustomEvent<string | null>).detail !== node.id) setBookmarkDropPreview(null);
    };
    window.addEventListener(dragEndEvent, clear);
    window.addEventListener(dragPreviewEvent, clearOther);
    // Native dragend can be delivered after the React tree has reflowed (or a
    // browser cancels a drop). Capture it at document level so no destination
    // overlay can remain stuck on a parent folder.
    document.addEventListener("dragend", clear, true);
    document.addEventListener("drop", clear, true);
    return () => {
      window.removeEventListener(dragEndEvent, clear);
      window.removeEventListener(dragPreviewEvent, clearOther);
      document.removeEventListener("dragend", clear, true);
      document.removeEventListener("drop", clear, true);
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
  const markerStyle = ["directory", "icons", "mixed", "dock", "stack", "focus", "columns"].includes(parsedFolder.marker || "") ? parsedFolder.marker as FolderStyle : undefined;
  const style = config.markerStorageVersion >= 3 ? markerStyle || config.folderStyles[node.id] || (block ? "directory" : "icons") : config.folderStyles[node.id] || markerStyle || (block ? "directory" : "icons");
  const collapsed = config.markerStorageVersion >= 3 && markerStyle ? !!parsedFolder.collapsed : config.collapsed.includes(node.id) || !!parsedFolder.collapsed;
  const children = node.children || [];
  const links = useMemo(() => collectLinks(node), [node]);
  const directLinks = useMemo(() => children.filter((child) => !!child.url), [children]);
  const childFolders = useMemo(() => children.filter((child) => !child.url), [children]);
  const organize = editing;
  const previewFolderDrop = (event: DragEvent) => {
    if (!organize) return;
    event.preventDefault(); event.stopPropagation();
    window.dispatchEvent(new CustomEvent(dragPreviewEvent, { detail: null }));
    setDropReady(true);
  };
  const displayStyle: FolderStyle = style;
  const virtual = node.id.startsWith("direct-");
  const effectiveParent = virtual ? { ...node, id: node.parentId || node.id.slice("direct-".length) } : node;
  const parentFor = (child: BookmarkNode) => virtual && child.parentId ? { ...effectiveParent, id: child.parentId } : effectiveParent;
  const presentationWidth = config.markerStorageVersion >= 3 && markerStyle ? parsedFolder.width : config.folderWidths[node.id] || parsedFolder.width;
  const nestedWidth = Math.min(pageSpan, presentationWidth || pageSpan);
  const renderedFolderSpan = !block && collapsed ? Math.min(4, pageSpan) : nestedWidth;
  const componentSpan = block ? pageSpan : renderedFolderSpan;
  const beginFolderDrag = (event: DragEvent) => {
    if (!organize || virtual) return;
    event.stopPropagation();
    activeDragItem = { id: node.id, parentId: node.parentId, index: siblingIndex, type: "folder" };
    event.dataTransfer.setData(dragMime, JSON.stringify(activeDragItem));
    event.dataTransfer.effectAllowed = "move";
  };
  const dropBeforeFolder = async (event: DragEvent) => {
    if (!organize || virtual) return;
    const raw = event.dataTransfer.getData(dragMime); if (!raw) return;
    event.preventDefault(); event.stopPropagation(); setDropReady(false); window.dispatchEvent(new Event(dragEndEvent));
    const item = JSON.parse(raw) as { id: string; parentId?: string; index: number };
    if (item.id === node.id || !node.parentId) return;
    const targetIndex = item.parentId === node.parentId && item.index < siblingIndex ? siblingIndex - 1 : siblingIndex;
    try {
      await bookmarks.move(item.id, { parentId: node.parentId, index: targetIndex });
      await onRefresh(); onToast(t("folder.orderSynced"));
    } catch (reason) { onToast(reason instanceof Error ? reason.message : t("folder.moveError")); }
  };
  const dropOnFolderHeader = async (event: DragEvent) => {
    const raw = event.dataTransfer.getData(dragMime);
    const item = activeDragItem || (raw ? JSON.parse(raw) as DragItem : null);
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
      await bookmarks.update(node.id, { title: setFolderPresentationTitle(node.title, next) });
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
  const dropInto = async (event: DragEvent) => {
    if (!organize) return;
    const raw = event.dataTransfer.getData(dragMime); if (!raw) return;
    event.preventDefault(); event.stopPropagation(); setDropReady(false); window.dispatchEvent(new Event(dragEndEvent));
    const item = JSON.parse(raw) as { id: string };
    if (item.id === effectiveParent.id) return;
    try { activeDragItem = null; setBookmarkDropPreview(null); await bookmarks.move(item.id, { parentId: effectiveParent.id }); await onRefresh(); onToast(t("notice.movedInto", { title: parsedFolder.title })); }
    catch (reason) { onToast(reason instanceof Error ? reason.message : t("notice.moveError")); }
  };
  const dropAtBookmarkPreview = async (event: DragEvent) => {
    if (activeDragItem?.type !== "bookmark") return;
    event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new Event(dragEndEvent));
    const preview = bookmarkDropPreview;
    if (!preview) return;
    const targetIndex = preview.sourceParentId === preview.targetParentId && preview.sourceIndex < preview.targetIndex ? preview.targetIndex - 1 : preview.targetIndex;
    try {
      activeDragItem = null; setBookmarkDropPreview(null); setDropReady(false);
      await bookmarks.move(preview.sourceId, { parentId: preview.targetParentId, index: targetIndex });
      await onRefresh(); onToast(t("folder.bookmarkReordered", { title: preview.targetTitle }));
    } catch (reason) { onToast(reason instanceof Error ? reason.message : t("folder.bookmarkReorderError")); }
  };
  const previewBookmarkAtPointer = (event: DragEvent) => {
    const item = activeDragItem;
    if (!organize || item?.type !== "bookmark") return;
    event.preventDefault(); event.stopPropagation(); setDropReady(false);
    const slot = bookmarkDropSlotAt(event.clientX, event.clientY);
    if (!slot || slot.targetId === item.id) {
      if (bookmarkTailSlotAt(effectiveParent.id, event.clientX, event.clientY)) {
        window.dispatchEvent(new CustomEvent(dragPreviewEvent, { detail: node.id }));
        setBookmarkDropPreview({
          sourceId: item.id, sourceParentId: item.parentId, sourceIndex: item.index,
          targetId: `tail-${node.id}`, targetParentId: effectiveParent.id, targetIndex: children.length, targetTitle: t("common.groupEnd"),
          width: item.width || 1.5, rows: item.rows || 1,
        });
        return;
      }
      window.dispatchEvent(new CustomEvent(dragPreviewEvent, { detail: null }));
      return;
    }
    window.dispatchEvent(new CustomEvent(dragPreviewEvent, { detail: node.id }));
    setBookmarkDropPreview({
      sourceId: item.id, sourceParentId: item.parentId, sourceIndex: item.index,
      ...slot, width: item.width || 1.5, rows: item.rows || 1,
    });
  };
  const bookmarkGridDrag = { onDragEnter: previewBookmarkAtPointer, onDragOver: previewBookmarkAtPointer, onDrop: dropAtBookmarkPreview };
  const common = { config, editing, pageSpan: componentSpan, onConfig, onEdit, onRefresh, onToast, onMove, onNewFolder, onNewBookmark, onDelete, onRecentClick };
  const renderLink = (child: BookmarkNode, index: number, variant: "row" | "tile" | "featured" | "dock", defaultWidth?: number) => <Fragment key={`${child.id}-${index}`}>
    {bookmarkDropPreview?.targetId === child.id && <BookmarkDropPlaceholder preview={bookmarkDropPreview} variant={variant} language={config.language} />}
    <LinkItem node={child} parent={parentFor(child)} index={child.index ?? index} config={config} variant={variant} defaultWidth={defaultWidth} pageSpan={componentSpan} editing={editing} onEdit={onEdit} onMove={onMove} onDelete={onDelete} onRecentClick={onRecentClick} dropTarget={bookmarkDropPreview?.targetId === child.id} />
  </Fragment>;
  const renderTail = (variant: "row" | "tile" | "featured" | "dock") => bookmarkDropPreview?.targetId === `tail-${node.id}` ? <BookmarkDropPlaceholder preview={bookmarkDropPreview} variant={variant} language={config.language} /> : null;
  return (
    <section className={`folder ${block ? "folder--block" : "folder--nested"} folder--${displayStyle} ${collapsed ? "is-collapsed" : ""} ${links.length > 12 ? "is-dense" : ""} ${dropReady && !bookmarkDropPreview ? "is-drop-ready" : ""}`} style={{ "--page-columns": componentSpan, ...(!block ? { "--folder-span": renderedFolderSpan } : {}) } as React.CSSProperties} data-folder-id={node.id} data-native-title={node.title} onDragEnter={previewFolderDrop} onDragLeave={() => setDropReady(false)} onDragOver={(event) => { if (organize) { event.preventDefault(); event.stopPropagation(); } }} onDrop={dropInto}>
      {organize && dropReady && !bookmarkDropPreview && <div className="folder-drop-overlay" aria-hidden="true"><FolderOpen weight="fill" /><strong>{t("common.dropHere")}</strong><small>{t("common.moveInto", { title: parsedFolder.title })}</small></div>}
      <header className="folder__header" onDragEnter={previewFolderDrop} onDragOver={(event) => { if (organize) { event.preventDefault(); event.stopPropagation(); } }} onDrop={dropOnFolderHeader}>
        {organize && !virtual && <span className="folder__drag" draggable onDragStart={beginFolderDrag} onDragEnd={() => { activeDragItem = null; setDropReady(false); window.dispatchEvent(new Event(dragEndEvent)); }} title={t("folder.drag")} aria-label={t("folder.dragAria", { title: parsedFolder.title })}><DotsSixVertical weight="bold" /></span>}
        <button className="folder__title" onClick={toggle} aria-expanded={!collapsed}>
          {collapsed ? <CaretRight weight="bold" /> : <CaretDown weight="bold" />}
          {collapsed ? <Folder weight="fill" /> : <FolderOpen weight="fill" />}
          <span>{parsedFolder.title || t("common.unnamedFolder")}</span>
          <small>{countLinks(node)}</small>
        </button>
        {organize && <span className="drop-hint">{t("folder.dropHint")}</span>}
        {editing && (
          <div ref={styleActions} className="folder__actions" onKeyDown={(event) => { if (event.key === "Escape" && menu) { event.preventDefault(); setMenu(false); styleTrigger.current?.focus(); } }}>
            {!virtual && <><button className="icon-button" title={t("action.editFolder", { title: "" }).trim()} aria-label={t("action.editFolder", { title: parsedFolder.title })} onClick={() => onEdit({ id: node.id, parentId: node.parentId, type: "folder", title: parsedFolder.title, url: "", folderStyle: style, width: nestedWidth, collapsed })}><PencilSimple /></button><button className="icon-button" title={t("move.folder")} aria-label={t("action.moveFolder", { title: parsedFolder.title })} onClick={() => onMove(node)}><LinkSimple /></button><button className="icon-button" title={t("app.newBookmark")} aria-label={t("action.newBookmarkIn", { title: parsedFolder.title })} onClick={() => onNewBookmark(node.id, newBookmarkDefaults(displayStyle))}><LinkSimple /></button><button className="icon-button" title={t("quick.newFolder")} aria-label={t("action.newFolderIn", { title: parsedFolder.title })} onClick={() => onNewFolder(node.id)}><FolderOpen /></button></>}
            <button ref={styleTrigger} className="icon-button" title={t("action.style")} aria-label={`${t("action.style")} ${parsedFolder.title}`} aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu(!menu)}><DotsThree weight="bold" /></button>
            {menu && <div className="style-menu" role="menu"><small role="presentation" className="style-menu__label">{t("editor.appearance")}</small>{stylesList.map((item) => <button role="menuitemradio" aria-checked={style === item.id} key={item.id} className={style === item.id ? "active" : ""} onClick={() => changeStyle(item.id)}><item.icon />{t(`folder.style.${item.id}`)}</button>)}{!block && <><small role="presentation" className="style-menu__label">{t("folder.internalWidth")}</small><div role="group" aria-label={t("folder.internalWidth")} className="style-menu__widths">{[{ value: 12, label: t("editor.fullRow") }, { value: 6, label: "1/2" }, { value: 4, label: "1/3" }, { value: 3, label: "1/4" }].map((item) => <button role="menuitemradio" aria-checked={nestedWidth === item.value} key={item.value} className={nestedWidth === item.value ? "active" : ""} onClick={() => changeWidth(item.value)}>{item.label}</button>)}</div></>}</div>}
            {!virtual && <button className="icon-button danger" title={t("action.deleteFolder", { title: "" }).trim()} aria-label={t("action.deleteFolder", { title: parsedFolder.title })} onClick={() => onDelete(node, node.parentId || effectiveParent.id, siblingIndex)}><Trash /></button>}
          </div>
        )}
      </header>
      {!collapsed && <div className="folder__body" onDragEnter={previewFolderDrop} onDragOver={(event) => { if (organize) { event.preventDefault(); event.stopPropagation(); } }} onDrop={dropInto}>
        {children.length === 0 && <button className="empty-folder" onClick={() => editing && onNewBookmark(node.id, newBookmarkDefaults(displayStyle))}><Folder />{t("folder.empty")}{editing && ` · ${t("folder.addBookmark")}`}</button>}
        {(displayStyle === "directory" || displayStyle === "stack" || displayStyle === "columns") && <div className="directory-grid" {...bookmarkGridDrag}>{children.map((child, index) => child.url
          ? renderLink(child, child.index ?? index, "row", displayStyle === "columns" ? 6 : 4)
          : <FolderView key={child.id} node={child} siblingIndex={index} level={level + 1} {...common} />)}{renderTail("row")}</div>}
        {displayStyle === "icons" && directLinks.length > 0 && <div className="icon-grid" {...bookmarkGridDrag}>{directLinks.map((child) => renderLink(child, child.index ?? children.indexOf(child), "tile"))}{renderTail("tile")}</div>}
        {displayStyle === "mixed" && directLinks.length > 0 && <div className="mixed-grid" {...bookmarkGridDrag}>{directLinks.map((child, index) => renderLink(child, child.index ?? children.indexOf(child), index === 0 ? "featured" : "tile"))}{renderTail("tile")}</div>}
        {displayStyle === "dock" && directLinks.length > 0 && <div className="dock-list" {...bookmarkGridDrag}>{directLinks.map((child) => renderLink(child, child.index ?? children.indexOf(child), "dock"))}{renderTail("dock")}</div>}
        {displayStyle === "focus" && directLinks.length > 0 && <div className="focus-list" {...bookmarkGridDrag}>{directLinks.map((child, index) => renderLink(child, child.index ?? children.indexOf(child), index < 2 ? "featured" : "row"))}{renderTail("row")}</div>}
        {displayStyle !== "directory" && displayStyle !== "stack" && displayStyle !== "columns" && childFolders.length > 0 && <div className="folder-groups">{childFolders.map((child) => <FolderView key={child.id} node={child} siblingIndex={children.indexOf(child)} level={level + 1} {...common} />)}</div>}
        {organize && <div className="folder-drop-zone" onDragEnter={previewFolderDrop} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }} onDrop={dropInto}><FolderOpen />{t("folder.dropZone", { title: parsedFolder.title })}</div>}
      </div>}
    </section>
  );
}

function BookmarkDropPlaceholder({ preview, variant, language }: { preview: BookmarkDropPreview; variant: "row" | "tile" | "featured" | "dock"; language: Language }) {
  const t = createTranslator(language);
  return <div className={`bookmark bookmark-drop-placeholder bookmark--${variant} ${preview.rows === 2 ? "bookmark--tall" : ""}`} style={{ "--item-span": preview.width } as CSSProperties} aria-label={t("folder.dropBefore", { title: preview.targetTitle })}><span>{t("common.dropHere")}</span></div>;
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
