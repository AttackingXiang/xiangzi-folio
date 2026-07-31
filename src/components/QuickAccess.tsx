import { Fragment, useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { FolderOpen, FolderPlus, LinkSimple, PencilSimple, SlidersHorizontal, Star, Trash } from "@phosphor-icons/react";
import { parsePresentationTitle } from "../lib/bookmarks";
import { favicon } from "../lib/favicon";
import { createTranslator } from "../lib/i18n";
import { openBookmarkLink } from "../lib/navigation";
import type { AppConfig, BookmarkNode, BookmarkStyle, EditorValue, FolderStyle } from "../types";

type BookmarkDefaults = Pick<EditorValue, "style" | "width" | "rows">;
type QuickDragItem = { id: string; parentId: string; index: number; title: string };
type QuickDropPreview = QuickDragItem & { targetId: string; targetParentId: string; targetIndex: number; targetTitle: string; span: number };
type QuickDropSlot = Omit<QuickDropPreview, "id" | "parentId" | "index" | "title" | "span"> & { left: number; right: number; top: number; bottom: number; span: number };

type Props = {
  folder: BookmarkNode;
  config: AppConfig;
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
};

const quickBookmarkDefaults: BookmarkDefaults = { style: "tile", width: 1.5, rows: 1 };
const bookmarkStyles: BookmarkStyle[] = ["row", "tile", "featured", "dock", "compact"];
const folderDragMime = "application/x-xiangzi-folio-bookmark";
const quickDragMime = "application/x-xiangzi-folio-quick";

function hasPageBookmarkDrag(event: DragEvent) {
  // Chromium deliberately withholds custom payload text until drop. `types` is
  // available throughout the drag, while getData keeps local/test transfers working.
  return Array.from(event.dataTransfer.types || []).includes(folderDragMime) || !!event.dataTransfer.getData(folderDragMime);
}

function isQuickBookmarkDrag(event: DragEvent) {
  return Array.from(event.dataTransfer.types || []).includes(quickDragMime) || !!event.dataTransfer.getData(quickDragMime);
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

function QuickBookmark({ node, parent, index, config, editing, preview, onEdit, onMove, onDelete, onRecentClick, onDragStart, onDragEnd }: Pick<Props, "config" | "editing" | "onEdit" | "onMove" | "onDelete" | "onRecentClick"> & { node: BookmarkNode; parent: BookmarkNode; index: number; preview: QuickDropPreview | null; onDragStart: (event: DragEvent, item: QuickDragItem) => void; onDragEnd: () => void }) {
  const [broken, setBroken] = useState(false);
  const parsed = parsePresentationTitle(node.title);
  const t = createTranslator(config.language);
  const title = parsed.title || t("quick.unnamed");
  const presentation = presentationFor(node, config);
  const host = (() => { try { return new URL(node.url || "").hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const item = { id: node.id, parentId: parent.id, index, title };
  return <Fragment>
    {preview?.targetId === node.id && <div className="quick-access__drop-placeholder" style={{ "--quick-span": preview.span } as CSSProperties}>{t("common.dropHere")}</div>}
    <article className={`quick-access__item quick-access__item--${presentation.style} ${presentation.rows === 2 ? "is-tall" : ""} ${editing ? "is-editing" : ""} ${preview?.targetId === node.id ? "is-drop-target" : ""}`} style={{ "--quick-span": presentation.span, "--quick-mobile-span": presentation.mobileSpan } as CSSProperties} data-testid={`quick-bookmark-${node.id}`} data-quick-bookmark-id={node.id} data-quick-parent-id={parent.id} data-quick-bookmark-index={index} data-quick-bookmark-title={title} data-quick-span={presentation.span} draggable={editing} onDragStart={(event) => onDragStart(event, item)} onDragEnd={onDragEnd}>
      {editing && <span className="quick-access__drag" aria-hidden="true">⋮⋮</span>}
      <a href={node.url} title={`${title}\n${node.url}`} onClick={(event) => { if (editing) { event.preventDefault(); return; } void openBookmarkLink(event, node.url, () => onRecentClick(node, parent, index)); }}>
        <span className="quick-access__icon" aria-hidden="true">{!broken && node.url ? <img src={favicon(node.url, 64)} alt="" onError={() => setBroken(true)} /> : <span>{title.slice(0, 1).toUpperCase()}</span>}</span>
        <span><strong>{title}</strong><small>{host}</small></span>
      </a>
      {editing && <div className="quick-access__actions"><button className="icon-button" type="button" aria-label={t("action.editBookmark", { title })} title={t("editor.edit") + t("editor.bookmark")} onClick={() => onEdit({ id: node.id, parentId: parent.id, type: "bookmark", title, url: node.url || "", style: presentation.style, width: presentation.width, rows: presentation.rows })}><PencilSimple /></button><button className="icon-button" type="button" aria-label={t("action.moveBookmark", { title })} title={t("move.bookmark")} onClick={() => onMove(node)}><LinkSimple /></button><button className="icon-button danger" type="button" aria-label={t("action.deleteBookmark", { title })} title={t("action.deleteBookmark", { title: "" }).trim()} onClick={() => onDelete(node, parent.id, index)}><Trash /></button></div>}
    </article>
  </Fragment>;
}

type GridProps = Pick<Props, "config" | "editing" | "onEdit" | "onMove" | "onDelete" | "onRecentClick"> & {
  parent: BookmarkNode;
  links: BookmarkNode[];
  preview: QuickDropPreview | null;
  onDragStart: (event: DragEvent, item: QuickDragItem) => void;
  onDragEnd: () => void;
  onPreview: (event: DragEvent, parent: BookmarkNode) => void;
  onDrop: (event: DragEvent) => void;
};

function QuickGrid({ parent, links, preview, onPreview, onDrop, ...props }: GridProps) {
  const t = createTranslator(props.config.language);
  const tail = preview?.targetId === `tail-${parent.id}` ? <div className="quick-access__drop-placeholder" style={{ "--quick-span": preview.span } as CSSProperties} aria-label={t("common.dropAtEnd")}><span>{t("common.dropHere")}</span></div> : null;
  return <div className="quick-access__grid" onDragEnter={(event) => onPreview(event, parent)} onDragOver={(event) => onPreview(event, parent)} onDrop={onDrop}>{links.map((node, index) => <QuickBookmark key={node.id} node={node} parent={parent} index={node.index ?? index} preview={preview} {...props} />)}{tail}</div>;
}

type GroupProps = Omit<Props, "folder" | "onToggleAll" | "onReorder"> & Pick<GridProps, "preview" | "onDragStart" | "onDragEnd" | "onPreview" | "onDrop"> & { folder: BookmarkNode; parent: BookmarkNode; depth: number };

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
    if (!props.editing || !hasPageBookmarkDrag(event)) return;
    event.preventDefault(); event.stopPropagation(); setDropReady(true);
  };
  const dropExternalItem = async (event: DragEvent) => {
    const raw = event.dataTransfer.getData(folderDragMime);
    if (!props.editing || !raw) return;
    event.preventDefault(); event.stopPropagation(); setDropReady(false);
    try {
      const item = JSON.parse(raw) as { id?: string };
      if (!item.id || item.id === folder.id) return;
      await props.onMoveInto(item.id, folder.id, title);
    } catch { /* Invalid transfer data is ignored; source components own their drag payload. */ }
  };
  return <section className={`quick-folder-group ${dropReady ? "is-drop-ready" : ""}`} style={{ "--quick-depth": depth } as CSSProperties} data-folder-id={folder.id} onDragEnter={previewExternalDrop} onDragOver={previewExternalDrop} onDragLeave={(event) => { if (event.currentTarget === event.target) setDropReady(false); }} onDrop={dropExternalItem}>
    {dropReady && <div className="quick-folder-drop-overlay" aria-hidden="true"><FolderOpen weight="fill" /><strong>{t("common.dropHere")}</strong><small>{t("common.moveInto", { title })}</small></div>}
    <header>
      <div><FolderOpen weight="fill" /><span>{title}</span><small>{links.length}</small></div>
      {props.editing && <div className="quick-folder-group__actions"><button className="icon-button" type="button" aria-label={t("action.editFolder", { title })} title={t("action.editFolder", { title: "" }).trim()} onClick={() => props.onEdit({ id: folder.id, parentId: folder.parentId, type: "folder", title, url: "", folderStyle: "icons" as FolderStyle, width: 4 })}><PencilSimple /></button><button className="icon-button" type="button" aria-label={t("action.moveFolder", { title })} title={t("move.folder")} onClick={() => props.onMove(folder)}><LinkSimple /></button><button className="icon-button" type="button" aria-label={t("action.newBookmarkIn", { title })} title={t("app.newBookmark")} onClick={() => props.onNewBookmark(folder.id, quickBookmarkDefaults)}><LinkSimple /></button><button className="icon-button" type="button" aria-label={t("action.newFolderIn", { title })} title={t("quick.newFolder")} onClick={() => props.onNewFolder(folder.id)}><FolderPlus /></button><button className="icon-button danger" type="button" aria-label={t("action.deleteFolder", { title })} title={t("action.deleteFolder", { title: "" }).trim()} onClick={() => props.onDelete(folder, parentId, index)}><Trash /></button></div>}
    </header>
    {links.length > 0 && <QuickGrid parent={folder} links={links} preview={preview} onDragStart={onDragStart} onDragEnd={onDragEnd} onPreview={onPreview} onDrop={onDrop} {...props} />}
    {folders.map((child) => <QuickFolderGroup key={child.id} folder={child} parent={folder} depth={depth + 1} preview={preview} onDragStart={onDragStart} onDragEnd={onDragEnd} onPreview={onPreview} onDrop={onDrop} {...props} />)}
  </section>;
}

export function QuickAccess({ folder, config, editing, onToggleAll, onEdit, onMove, onDelete, onNewBookmark, onNewFolder, onRecentClick, onReorder, onMoveInto }: Props) {
  const t = createTranslator(config.language);
  const [dragItem, setDragItem] = useState<QuickDragItem | null>(null);
  const [preview, setPreview] = useState<QuickDropPreview | null>(null);
  const [rootDropReady, setRootDropReady] = useState(false);
  useEffect(() => {
    const clear = () => setRootDropReady(false);
    document.addEventListener("dragend", clear, true);
    document.addEventListener("drop", clear, true);
    return () => { document.removeEventListener("dragend", clear, true); document.removeEventListener("drop", clear, true); };
  }, []);
  const slots = useRef<QuickDropSlot[]>([]);
  const children = folder.children || [];
  const links = children.filter((child) => child.url);
  const folders = children.filter((child) => !child.url);
  const shared = { config, editing, onEdit, onMove, onDelete, onNewBookmark, onNewFolder, onRecentClick, onMoveInto };
  const onDragStart = (event: DragEvent, item: QuickDragItem) => {
    if (!editing) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(quickDragMime, JSON.stringify(item));
    // Also expose the common payload. FolderView then accepts a quick entry as
    // a normal bookmark when it is dropped into any folder on the page.
    event.dataTransfer.setData(folderDragMime, JSON.stringify({ ...item, type: "bookmark" }));
    slots.current = Array.from(document.querySelectorAll<HTMLElement>("[data-quick-bookmark-id]"), (element) => {
      const rect = element.getBoundingClientRect();
      return { targetId: element.dataset.quickBookmarkId || "", targetParentId: element.dataset.quickParentId || "", targetIndex: Number(element.dataset.quickBookmarkIndex || 0), targetTitle: element.dataset.quickBookmarkTitle || "", span: Number(element.dataset.quickSpan || 1), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }).filter((slot) => slot.targetId && slot.targetParentId);
    setDragItem(item); setPreview(null);
  };
  const clearDrag = () => { setDragItem(null); setPreview(null); slots.current = []; window.dispatchEvent(new Event("xiangzi-folio-drag-end")); };
  const onPreview = (event: DragEvent, parent: BookmarkNode) => {
    if (!editing || !dragItem) return;
    event.preventDefault(); event.stopPropagation();
    const target = slots.current.find((slot) => event.clientX >= slot.left && event.clientX < slot.right && event.clientY >= slot.top && event.clientY < slot.bottom);
    if (!target || target.targetId === dragItem.id) {
      const groupSlots = slots.current.filter((slot) => slot.targetParentId === parent.id);
      const finalRowTop = Math.max(...groupSlots.map((slot) => slot.top));
      const finalRow = groupSlots.filter((slot) => Math.abs(slot.top - finalRowTop) < 2);
      const finalRight = Math.max(...finalRow.map((slot) => slot.right));
      const finalBottom = Math.max(...finalRow.map((slot) => slot.bottom));
      const isTail = groupSlots.length > 0 && (event.clientY >= finalBottom || (event.clientY >= finalRowTop && event.clientY < finalBottom && event.clientX >= finalRight));
      if (isTail) {
        setPreview({ ...dragItem, targetId: `tail-${parent.id}`, targetParentId: parent.id, targetIndex: (parent.children || []).length, targetTitle: t("common.groupEnd"), span: Math.max(1, Math.round(dragItem.index >= 0 ? slots.current.find((slot) => slot.targetId === dragItem.id)?.span || 1 : 1)) });
        return;
      }
      setPreview(null); return;
    }
    setPreview({ ...dragItem, ...target });
  };
  const onDrop = async (event: DragEvent) => {
    if (!dragItem || !preview) return;
    event.preventDefault(); event.stopPropagation();
    const targetIndex = dragItem.parentId === preview.targetParentId && dragItem.index < preview.targetIndex ? preview.targetIndex - 1 : preview.targetIndex;
    clearDrag();
    await onReorder(dragItem.id, preview.targetParentId, targetIndex, dragItem.title);
  };
  const previewRootDrop = (event: DragEvent) => {
    if (!editing || isQuickBookmarkDrag(event) || !hasPageBookmarkDrag(event)) return;
    event.preventDefault(); event.stopPropagation(); setRootDropReady(true);
  };
  const dropIntoRoot = async (event: DragEvent) => {
    const raw = event.dataTransfer.getData(folderDragMime);
    if (!editing || !raw) return;
    event.preventDefault(); event.stopPropagation(); setRootDropReady(false);
    try {
      const item = JSON.parse(raw) as { id?: string };
      if (!item.id || item.id === folder.id) return;
      await onMoveInto(item.id, folder.id, t("quick.title"));
    } catch { /* Invalid transfer data is ignored; source components own their drag payload. */ }
  };
  return <section className={`quick-access ${rootDropReady ? "is-drop-ready" : ""}`} aria-label={t("quick.title")} onDragEnter={previewRootDrop} onDragOver={previewRootDrop} onDragLeave={(event) => { if (event.currentTarget === event.target) setRootDropReady(false); }} onDrop={dropIntoRoot}>
    {rootDropReady && <div className="quick-folder-drop-overlay quick-access__drop-overlay" aria-hidden="true"><FolderOpen weight="fill" /><strong>{t("common.dropHere")}</strong><small>{t("common.moveInto", { title: t("quick.title") })}</small></div>}
    <header><div><Star weight="fill" /><span>{t("quick.title")}</span></div><div className="quick-access__tools">{editing && <><button type="button" aria-label={t("quick.addBookmark")} onClick={() => onNewBookmark(folder.id, quickBookmarkDefaults)}><LinkSimple />{t("quick.newEntry")}</button><button type="button" aria-label={t("quick.addFolder")} onClick={() => onNewFolder(folder.id)}><FolderPlus />{t("quick.newFolder")}</button></>}<button type="button" onClick={onToggleAll}><SlidersHorizontal />{t("quick.toggleAll")}</button></div></header>
    {links.length > 0 && <QuickGrid parent={folder} links={links} preview={preview} onDragStart={onDragStart} onDragEnd={clearDrag} onPreview={onPreview} onDrop={onDrop} {...shared} />}
    {folders.map((child) => <QuickFolderGroup key={child.id} folder={child} parent={folder} depth={0} preview={preview} onDragStart={onDragStart} onDragEnd={clearDrag} onPreview={onPreview} onDrop={onDrop} {...shared} />)}
  </section>;
}
