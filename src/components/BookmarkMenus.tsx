import { useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowsLeftRight, Folder, MagnifyingGlass, X,
} from "@phosphor-icons/react";
import { parsePresentationTitle } from "../lib/bookmarks";
import { useDialogFocus } from "../hooks/useDialogFocus";
import type { BookmarkNode } from "../types";

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
  const dialogRef = useRef<HTMLElement>(null);
  const blocked = useMemo(() => node && !node.url ? descendants(node) : new Set<string>(), [node]);
  const folders = useMemo(() => folderOptions(roots).filter((item) => !blocked.has(item.node.id)), [roots, blocked]);
  useDialogFocus(!!node, dialogRef, onClose);
  if (!node) return null;
  const visible = folders.filter((item) => item.path.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = async (id: string) => { setMoving(id); try { await onMove(id); onClose(); } finally { setMoving(""); } };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className="move-dialog" role="dialog" aria-modal="true" aria-label={node.url ? "移动书签" : "移动文件夹"}>
      <header><span className="modal__icon"><ArrowsLeftRight weight="bold" /></span><div><small>同步修改 Chrome 书签</small><h2>移动“{parsePresentationTitle(node.title).title}”</h2></div><button className="icon-button" aria-label="关闭移动窗口" onClick={onClose}><X /></button></header>
      <label className="folder-search"><MagnifyingGlass /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索目标文件夹" /></label>
      <div className="folder-destinations">{visible.map((item) => <button key={item.node.id} disabled={moving === item.node.id} onClick={() => choose(item.node.id)}><span><Folder weight="fill" /><span><strong>{parsePresentationTitle(item.node.title).title || "根目录"}</strong><small>{item.path}</small></span></span>{item.node.id === node.parentId ? <em>当前位置</em> : <ArrowRight />}</button>)}{visible.length === 0 && <p>没有匹配的目标文件夹</p>}</div>
    </section>
  </div>;
}
