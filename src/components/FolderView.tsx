import { useMemo, useState, type DragEvent, type MouseEvent, type PointerEvent } from "react";
import {
  ArrowSquareOut, CaretDown, CaretRight, DotsSixVertical, DotsThree, Folder, FolderOpen,
  GridFour, LinkSimple, ListBullets, PencilSimple, Rows, SquaresFour, Trash,
} from "@phosphor-icons/react";
import { bookmarks, collectLinks, countLinks, parsePresentationTitle, setFolderPresentationTitle } from "../lib/bookmarks";
import type { AppConfig, BookmarkNode, ContextTarget, EditMode, EditorValue, FolderStyle } from "../types";

const styleLabels: Record<FolderStyle, string> = {
  directory: "完整目录", icons: "图标宫格", mixed: "混合组件", dock: "横向速览", stack: "紧凑堆叠", focus: "重点收藏", columns: "双栏阅读",
};

export const stylesList: Array<{ id: FolderStyle; label: string; icon: typeof ListBullets }> = [
  { id: "directory", label: styleLabels.directory, icon: ListBullets },
  { id: "icons", label: styleLabels.icons, icon: GridFour },
  { id: "mixed", label: styleLabels.mixed, icon: SquaresFour },
  { id: "dock", label: styleLabels.dock, icon: Rows },
  { id: "stack", label: styleLabels.stack, icon: ListBullets },
  { id: "focus", label: styleLabels.focus, icon: SquaresFour },
  { id: "columns", label: styleLabels.columns, icon: Rows },
];

type Props = {
  node: BookmarkNode;
  config: AppConfig;
  editing: boolean;
  editMode: EditMode;
  level?: number;
  block?: boolean;
  siblingIndex?: number;
  pageSpan?: number;
  onConfig: (recipe: (value: AppConfig) => AppConfig) => void;
  onEdit: (value: EditorValue) => void;
  onRefresh: () => Promise<void>;
  onToast: (text: string) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>, target: ContextTarget) => void;
};

const dragMime = "application/x-xiangzi-folio-bookmark";

function favicon(url = "") {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
  }
  try { return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(new URL(url).origin)}&sz=64`; }
  catch { return ""; }
}

function LinkItem({ node, parent, index, editing, editMode, onEdit, onRefresh, onToast, onContextMenu, variant = "row", defaultWidth, pageSpan = 12 }: {
  node: BookmarkNode; parent: BookmarkNode; index: number; editing: boolean; editMode: EditMode;
  onEdit: Props["onEdit"]; onRefresh: Props["onRefresh"]; onToast: Props["onToast"];
  onContextMenu: Props["onContextMenu"];
  variant?: "row" | "tile" | "featured" | "dock";
  defaultWidth?: number;
  pageSpan?: number;
}) {
  const [broken, setBroken] = useState(false);
  const [dropReady, setDropReady] = useState(false);
  const organize = editing && editMode === "bookmarks";
  const parsed = parsePresentationTitle(node.title);
  const markedVariant = parsed.marker === "featured" || parsed.marker === "tile" || parsed.marker === "dock" ? parsed.marker : variant;
  const compact = parsed.marker === "compact";
  const itemWidth = Math.min(pageSpan, parsed.width || defaultWidth || (variant === "row" ? 4 : variant === "featured" ? 8 : 2));
  const beginDrag = (event: DragEvent) => {
    if (!organize) return;
    event.dataTransfer.setData(dragMime, JSON.stringify({ id: node.id, parentId: parent.id, index, type: "bookmark" }));
    event.dataTransfer.effectAllowed = "move";
  };
  const dropBefore = async (event: DragEvent) => {
    if (!organize) return;
    const raw = event.dataTransfer.getData(dragMime); if (!raw) return;
    event.preventDefault(); event.stopPropagation(); setDropReady(false);
    const item = JSON.parse(raw) as { id: string; parentId: string; index: number };
    if (item.id === node.id) return;
    const targetIndex = item.parentId === parent.id && item.index < index ? index - 1 : index;
    await bookmarks.move(item.id, { parentId: parent.id, index: targetIndex });
    await onRefresh(); onToast("顺序已同步到 Chrome 书签");
  };
  return (
    <div className={`bookmark bookmark--${markedVariant} ${compact ? "bookmark--compact" : ""} ${parsed.rows === 2 ? "bookmark--tall" : ""} ${organize ? "is-organizing" : ""} ${dropReady ? "is-drop-target" : ""}`} style={{ "--item-span": itemWidth } as React.CSSProperties} draggable={organize} onDragStart={beginDrag} onDragEnd={() => setDropReady(false)} onDragEnter={(event) => { if (organize) { event.preventDefault(); event.stopPropagation(); setDropReady(true); } }} onDragLeave={() => setDropReady(false)} onDragOver={(event) => { if (organize) { event.preventDefault(); event.stopPropagation(); } }} onDrop={dropBefore} onContextMenu={(event) => onContextMenu(event, { kind: "bookmark", parentId: parent.id, node })} data-testid={`bookmark-${node.id}`}>
      {organize && <span className="bookmark__drag" title="拖动排序" aria-label="拖动排序"><DotsSixVertical weight="bold" /></span>}
      <a href={node.url} draggable={false} className="bookmark__link" title={`${node.title}\n${node.url}`}>
        <span className="favicon" aria-hidden="true">
          {!broken && node.url ? <img src={favicon(node.url)} alt="" onError={() => setBroken(true)} /> : <span>{parsed.title.slice(0, 1).toUpperCase()}</span>}
        </span>
        <span className="bookmark__copy"><strong>{parsed.title || "未命名"}</strong>{markedVariant === "featured" && <small>{node.url?.replace(/^https?:\/\//, "").split("/")[0]}</small>}</span>
        {markedVariant === "row" && <ArrowSquareOut className="bookmark__open" weight="bold" />}
      </a>
      {organize && (
        <button className="icon-button bookmark__edit" title="编辑书签" onClick={(event) => { event.preventDefault(); onEdit({ id: node.id, parentId: parent.id, type: "bookmark", title: parsed.title, url: node.url || "", style: markedVariant === "row" ? "row" : markedVariant, width: itemWidth, rows: parsed.rows || 1 }); }}><PencilSimple /></button>
      )}
    </div>
  );
}

export function FolderView({ node, config, editing, editMode, level = 0, block = false, siblingIndex = node.index ?? 0, pageSpan = 12, onConfig, onEdit, onRefresh, onToast, onContextMenu }: Props) {
  const [menu, setMenu] = useState(false);
  const [dropReady, setDropReady] = useState(false);
  const parsedFolder = parsePresentationTitle(node.title);
  const markerStyle = ["directory", "icons", "mixed", "dock", "stack", "focus", "columns"].includes(parsedFolder.marker || "") ? parsedFolder.marker as FolderStyle : undefined;
  const style = markerStyle || config.folderStyles[node.id] || "directory";
  const collapsed = parsedFolder.collapsed ?? config.collapsed.includes(node.id);
  const children = node.children || [];
  const links = useMemo(() => collectLinks(node), [node]);
  const directLinks = useMemo(() => children.filter((child) => !!child.url), [children]);
  const childFolders = useMemo(() => children.filter((child) => !child.url), [children]);
  const organize = editing && editMode === "bookmarks";
  const displayStyle: FolderStyle = style;
  const virtual = node.id.startsWith("direct-");
  const effectiveParent = virtual ? { ...node, id: node.parentId || node.id.slice("direct-".length) } : node;
  const parentFor = (child: BookmarkNode) => virtual && child.parentId ? { ...effectiveParent, id: child.parentId } : effectiveParent;
  const nestedWidth = Math.min(pageSpan, parsedFolder.width || config.folderWidths[node.id] || pageSpan);
  const renderedFolderSpan = !block && collapsed ? Math.min(4, pageSpan) : nestedWidth;
  const componentSpan = block ? pageSpan : renderedFolderSpan;
  const beginFolderDrag = (event: DragEvent) => {
    if (!organize || virtual) return;
    event.stopPropagation();
    event.dataTransfer.setData(dragMime, JSON.stringify({ id: node.id, parentId: node.parentId, index: siblingIndex, type: "folder" }));
    event.dataTransfer.effectAllowed = "move";
  };
  const dropBeforeFolder = async (event: DragEvent) => {
    if (!organize || virtual) return;
    const raw = event.dataTransfer.getData(dragMime); if (!raw) return;
    event.preventDefault(); event.stopPropagation(); setDropReady(false);
    const item = JSON.parse(raw) as { id: string; parentId?: string; index: number };
    if (item.id === node.id || !node.parentId) return;
    const targetIndex = item.parentId === node.parentId && item.index < siblingIndex ? siblingIndex - 1 : siblingIndex;
    try {
      await bookmarks.move(item.id, { parentId: node.parentId, index: targetIndex });
      await onRefresh(); onToast("文件夹顺序已同步到 Chrome 书签");
    } catch (reason) { onToast(reason instanceof Error ? reason.message : "文件夹移动失败"); }
  };
  const toggle = async () => {
    const nextCollapsed = !collapsed;
    onConfig((value) => ({ ...value, collapsed: nextCollapsed ? [...new Set([...value.collapsed, node.id])] : value.collapsed.filter((id) => id !== node.id) }));
    if (virtual) return;
    await bookmarks.update(node.id, { title: setFolderPresentationTitle(node.title, {
      style: markerStyle || config.folderStyles[node.id],
      width: parsedFolder.width || config.folderWidths[node.id],
      collapsed: nextCollapsed,
    }) });
    await onRefresh();
    onToast(nextCollapsed ? "收起状态已同步到 Chrome 书签" : "展开状态已同步到 Chrome 书签");
  };
  const changeStyle = async (next: FolderStyle) => {
    onConfig((value) => ({ ...value, folderStyles: { ...value.folderStyles, [node.id]: next } }));
    setMenu(false);
    if (virtual) return;
    await bookmarks.update(node.id, { title: setFolderPresentationTitle(node.title, { style: next, width: parsedFolder.width || config.folderWidths[node.id] }) });
    await onRefresh(); onToast("显示样式已写入 Chrome 文件夹名称");
  };
  const changeWidth = async (next: number) => {
    onConfig((value) => ({ ...value, folderWidths: { ...value.folderWidths, [node.id]: next } }));
    if (virtual) return;
    await bookmarks.update(node.id, { title: setFolderPresentationTitle(node.title, { style, width: next, collapsed }) });
    await onRefresh(); onToast("文件夹内部宽度已同步到 Chrome 书签");
  };
  const dropInto = async (event: DragEvent) => {
    if (!organize) return;
    const raw = event.dataTransfer.getData(dragMime); if (!raw) return;
    event.preventDefault(); event.stopPropagation(); setDropReady(false);
    const item = JSON.parse(raw) as { id: string };
    if (item.id === effectiveParent.id) return;
    try { await bookmarks.move(item.id, { parentId: effectiveParent.id }); await onRefresh(); onToast(`已移入“${node.title}”`); }
    catch (reason) { onToast(reason instanceof Error ? reason.message : "移动失败"); }
  };
  const remove = async () => {
    if (!confirm(`删除“${node.title}”及其中的全部书签？此操作也会同步到 Chrome。`)) return;
    await bookmarks.remove(node.id, true); await onRefresh(); onToast("文件夹已删除");
  };
  const common = { config, editing, editMode, pageSpan: componentSpan, onConfig, onEdit, onRefresh, onToast, onContextMenu };
  return (
    <section className={`folder ${block ? "folder--block" : "folder--nested"} folder--${displayStyle} ${collapsed ? "is-collapsed" : ""} ${links.length > 12 ? "is-dense" : ""} ${dropReady ? "is-drop-ready" : ""}`} style={{ "--page-columns": componentSpan, ...(!block ? { "--folder-span": renderedFolderSpan } : {}) } as React.CSSProperties} data-folder-id={node.id} data-native-title={node.title} onDragEnter={(event) => { if (organize) { event.preventDefault(); event.stopPropagation(); setDropReady(true); } }} onDragLeave={() => setDropReady(false)} onDragOver={(event) => { if (organize) { event.preventDefault(); event.stopPropagation(); } }} onDrop={dropInto} onContextMenu={(event) => onContextMenu(event, virtual ? { kind: "root", parentId: effectiveParent.id } : { kind: "folder", parentId: node.id, node })}>
      <header className="folder__header" onDragEnter={(event) => { if (organize) { event.preventDefault(); event.stopPropagation(); setDropReady(true); } }} onDragOver={(event) => { if (organize) { event.preventDefault(); event.stopPropagation(); } }} onDrop={dropBeforeFolder}>
        {organize && !virtual && <span className="folder__drag" draggable onDragStart={beginFolderDrag} onDragEnd={() => setDropReady(false)} title="拖动文件夹排序或移入其他文件夹" aria-label={`拖动文件夹 ${parsedFolder.title}`}><DotsSixVertical weight="bold" /></span>}
        <button className="folder__title" onClick={toggle} aria-expanded={!collapsed}>
          {collapsed ? <CaretRight weight="bold" /> : <CaretDown weight="bold" />}
          {collapsed ? <Folder weight="fill" /> : <FolderOpen weight="fill" />}
          <span>{parsedFolder.title || "未命名文件夹"}</span>
          <small>{countLinks(node)}</small>
        </button>
        {organize && <span className="drop-hint">拖入此文件夹</span>}
        {editing && (
          <div className="folder__actions">
            {!virtual && <button className="icon-button" title="编辑文件夹" aria-label={`编辑文件夹 ${parsedFolder.title}`} onClick={() => onEdit({ id: node.id, parentId: node.parentId, type: "folder", title: parsedFolder.title, url: "", folderStyle: style, width: nestedWidth, collapsed })}><PencilSimple /></button>}
            <button className="icon-button" title="设置显示样式" onClick={() => setMenu(!menu)}><DotsThree weight="bold" /></button>
            {menu && <div className="style-menu" onMouseLeave={() => setMenu(false)}><small className="style-menu__label">展示样式</small>{stylesList.map((item) => <button key={item.id} className={style === item.id ? "active" : ""} onClick={() => changeStyle(item.id)}><item.icon />{item.label}</button>)}{!block && <><small className="style-menu__label">内部占位</small><div className="style-menu__widths">{[{ value: 12, label: "整行" }, { value: 6, label: "1/2" }, { value: 4, label: "1/3" }, { value: 3, label: "1/4" }].map((item) => <button key={item.value} className={nestedWidth === item.value ? "active" : ""} onClick={() => changeWidth(item.value)}>{item.label}</button>)}</div></>}</div>}
            {!virtual && <button className="icon-button danger" title="删除文件夹" aria-label={`删除文件夹 ${node.title}`} onClick={remove}><Trash /></button>}
          </div>
        )}
      </header>
      {!collapsed && <div className="folder__body" onDragEnter={(event) => { if (organize) { event.preventDefault(); event.stopPropagation(); setDropReady(true); } }} onDragOver={(event) => { if (organize) { event.preventDefault(); event.stopPropagation(); } }} onDrop={dropInto}>
        {children.length === 0 && <button className="empty-folder" onClick={() => editing && onEdit({ parentId: node.id, type: "bookmark", title: "", url: "" })}><Folder />空文件夹{editing && " · 添加书签"}</button>}
        {(displayStyle === "directory" || displayStyle === "stack" || displayStyle === "columns") && <div className="directory-grid">{children.map((child, index) => child.url
          ? <LinkItem key={child.id} node={child} parent={parentFor(child)} index={child.index ?? index} variant="row" defaultWidth={displayStyle === "columns" ? 6 : 4} pageSpan={componentSpan} editing={editing} editMode={editMode} onEdit={onEdit} onRefresh={onRefresh} onToast={onToast} onContextMenu={onContextMenu} />
          : <FolderView key={child.id} node={child} siblingIndex={index} level={level + 1} {...common} />)}</div>}
        {displayStyle === "icons" && directLinks.length > 0 && <div className="icon-grid">{directLinks.map((child, index) => <LinkItem key={`${child.id}-${index}`} node={child} parent={parentFor(child)} index={child.index ?? children.indexOf(child)} variant="tile" pageSpan={componentSpan} editing={editing} editMode={editMode} onEdit={onEdit} onRefresh={onRefresh} onToast={onToast} onContextMenu={onContextMenu} />)}</div>}
        {displayStyle === "mixed" && directLinks.length > 0 && <div className="mixed-grid">{directLinks.map((child, index) => <LinkItem key={`${child.id}-${index}`} node={child} parent={parentFor(child)} index={child.index ?? children.indexOf(child)} variant={index === 0 ? "featured" : "tile"} pageSpan={componentSpan} editing={editing} editMode={editMode} onEdit={onEdit} onRefresh={onRefresh} onToast={onToast} onContextMenu={onContextMenu} />)}</div>}
        {displayStyle === "dock" && directLinks.length > 0 && <div className="dock-list">{directLinks.map((child, index) => <LinkItem key={`${child.id}-${index}`} node={child} parent={parentFor(child)} index={child.index ?? children.indexOf(child)} variant="dock" pageSpan={componentSpan} editing={editing} editMode={editMode} onEdit={onEdit} onRefresh={onRefresh} onToast={onToast} onContextMenu={onContextMenu} />)}</div>}
        {displayStyle === "focus" && directLinks.length > 0 && <div className="focus-list">{directLinks.map((child, index) => <LinkItem key={`${child.id}-${index}`} node={child} parent={parentFor(child)} index={child.index ?? children.indexOf(child)} variant={index < 2 ? "featured" : "row"} pageSpan={componentSpan} editing={editing} editMode={editMode} onEdit={onEdit} onRefresh={onRefresh} onToast={onToast} onContextMenu={onContextMenu} />)}</div>}
        {displayStyle !== "directory" && displayStyle !== "stack" && displayStyle !== "columns" && childFolders.length > 0 && <div className="folder-groups">{childFolders.map((child) => <FolderView key={child.id} node={child} siblingIndex={children.indexOf(child)} level={level + 1} {...common} />)}</div>}
        {organize && <div className="folder-drop-zone" onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); setDropReady(true); }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }} onDrop={dropInto}><FolderOpen />拖到此区域，移入“{parsedFolder.title}”</div>}
      </div>}
    </section>
  );
}

export function ResizeHandle({ width, onWidth, onCommit }: { width: number; onWidth: (value: number) => void; onCommit?: (value: number) => void }) {
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
  return <button className="resize-handle" onPointerDown={begin} title={`拖动调整宽度 · 当前 ${width}/12`}><span /></button>;
}
