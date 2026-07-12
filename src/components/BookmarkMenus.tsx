import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, ArrowsLeftRight, CaretRight, Folder, FolderOpen, FolderPlus,
  LinkSimple, MagnifyingGlass, PencilSimple, X,
} from "@phosphor-icons/react";
import { parsePresentationTitle } from "../lib/bookmarks";
import type { BookmarkNode, ContextTarget } from "../types";

export type MenuState = ContextTarget & { x: number; y: number };

export function BookmarkContextMenu({ menu, onClose, onNewFolder, onNewBookmark, onMove, onEdit }: {
  menu: MenuState | null;
  onClose: () => void;
  onNewFolder: (parentId: string) => void;
  onNewBookmark: (parentId: string) => void;
  onMove: (node: BookmarkNode) => void;
  onEdit: (node: BookmarkNode, parentId: string) => void;
}) {
  useEffect(() => {
    if (!menu) return;
    const close = () => onClose();
    const escape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("click", close); window.removeEventListener("blur", close); window.removeEventListener("scroll", close, true); window.removeEventListener("keydown", escape); };
  }, [menu, onClose]);
  if (!menu) return null;
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 228));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - 230));
  const title = menu.node ? parsePresentationTitle(menu.node.title).title : "当前目录";
  const run = (action: () => void) => { action(); onClose(); };
  return <div className="context-menu" role="menu" style={{ left, top }} onClick={(event) => event.stopPropagation()}>
    <div className="context-menu__title"><span>{menu.kind === "bookmark" ? <LinkSimple /> : <FolderOpen />}</span><div><small>{menu.kind === "bookmark" ? "书签" : menu.kind === "folder" ? "文件夹" : "书签根目录"}</small><strong>{title}</strong></div></div>
    {menu.kind !== "bookmark" && <>
      <button role="menuitem" aria-label="新建文件夹" onClick={() => run(() => onNewFolder(menu.parentId))}><FolderPlus /><span>新建文件夹</span><small>同步到 Chrome</small></button>
      <button role="menuitem" aria-label="新建书签" onClick={() => run(() => onNewBookmark(menu.parentId))}><LinkSimple /><span>新建书签</span></button>
      <div className="context-menu__line" />
    </>}
    {menu.node && <>
      <button role="menuitem" aria-label="移动到" onClick={() => run(() => onMove(menu.node!))}><ArrowsLeftRight /><span>移动到…</span><CaretRight /></button>
      <button role="menuitem" aria-label="重命名或编辑" onClick={() => run(() => onEdit(menu.node!, menu.parentId))}><PencilSimple /><span>重命名 / 编辑</span></button>
    </>}
    {menu.kind === "root" && <p>也可以在任意文件夹上右键，新建其子目录。</p>}
  </div>;
}

function descendants(node: BookmarkNode): Set<string> {
  const ids = new Set<string>([node.id]);
  const visit = (value: BookmarkNode) => { ids.add(value.id); value.children?.forEach(visit); };
  node.children?.forEach(visit);
  return ids;
}

function folderOptions(nodes: BookmarkNode[], parents: string[] = []): Array<{ node: BookmarkNode; path: string }> {
  return nodes.flatMap((node) => {
    if (node.url) return [];
    const title = parsePresentationTitle(node.title).title || "根目录";
    const path = [...parents, title];
    return [{ node, path: path.join(" / ") }, ...folderOptions(node.children || [], path)];
  });
}

export function MoveDialog({ node, roots, onClose, onMove }: {
  node: BookmarkNode | null;
  roots: BookmarkNode[];
  onClose: () => void;
  onMove: (parentId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [moving, setMoving] = useState("");
  const blocked = useMemo(() => node && !node.url ? descendants(node) : new Set<string>(), [node]);
  const folders = useMemo(() => folderOptions(roots).filter((item) => !blocked.has(item.node.id)), [roots, blocked]);
  if (!node) return null;
  const visible = folders.filter((item) => item.path.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = async (id: string) => { setMoving(id); try { await onMove(id); onClose(); } finally { setMoving(""); } };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="move-dialog" role="dialog" aria-modal="true" aria-label={node.url ? "移动书签" : "移动文件夹"}>
      <header><span className="modal__icon"><ArrowsLeftRight weight="bold" /></span><div><small>同步修改 Chrome 书签</small><h2>移动“{parsePresentationTitle(node.title).title}”</h2></div><button className="icon-button" aria-label="关闭移动窗口" onClick={onClose}><X /></button></header>
      <label className="folder-search"><MagnifyingGlass /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索目标文件夹" /></label>
      <div className="folder-destinations">{visible.map((item) => <button key={item.node.id} disabled={moving === item.node.id} onClick={() => choose(item.node.id)}><span><Folder weight="fill" /><span><strong>{parsePresentationTitle(item.node.title).title || "根目录"}</strong><small>{item.path}</small></span></span>{item.node.id === node.parentId ? <em>当前位置</em> : <ArrowRight />}</button>)}{visible.length === 0 && <p>没有匹配的目标文件夹</p>}</div>
    </section>
  </div>;
}
