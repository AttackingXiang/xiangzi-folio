import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowsLeftRight, Folder, MagnifyingGlass, X,
} from "@phosphor-icons/react";
import { parsePresentationTitle } from "../lib/bookmarks";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { createTranslator } from "../lib/i18n";
import type { BookmarkNode, Language } from "../types";

function descendants(node: BookmarkNode): Set<string> {
  const ids = new Set<string>([node.id]);
  const visit = (value: BookmarkNode) => { ids.add(value.id); value.children?.forEach(visit); };
  node.children?.forEach(visit);
  return ids;
}

function folderOptions(nodes: BookmarkNode[], rootLabel: string, parents: string[] = []): Array<{ node: BookmarkNode; path: string }> {
  return nodes.flatMap((node) => {
    if (node.url) return [];
    const title = parsePresentationTitle(node.title).title || rootLabel;
    const path = [...parents, title];
    return [{ node, path: path.join(" / ") }, ...folderOptions(node.children || [], rootLabel, path)];
  });
}

export function MoveDialog({ node, roots, language, onClose, onMove }: {
  node: BookmarkNode | null;
  roots: BookmarkNode[];
  language: Language;
  onClose: () => void;
  onMove: (parentId: string) => Promise<void>;
}) {
  const t = createTranslator(language);
  const [query, setQuery] = useState("");
  const [moving, setMoving] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const blocked = useMemo(() => node && !node.url ? descendants(node) : new Set<string>(), [node]);
  const folders = useMemo(() => folderOptions(roots, t("common.root")).filter((item) => !blocked.has(item.node.id)), [roots, blocked, t]);
  useDialogFocus(!!node, dialogRef, onClose);
  // Each open targets a different node; a leftover search term from the
  // previous move would otherwise keep filtering the destination list.
  useEffect(() => { setQuery(""); setMoving(""); }, [node?.id]);
  if (!node) return null;
  const visible = folders.filter((item) => item.path.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = async (id: string) => { setMoving(id); try { await onMove(id); onClose(); } finally { setMoving(""); } };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className="move-dialog" role="dialog" aria-modal="true" aria-label={t(node.url ? "move.bookmark" : "move.folder")}>
      <header><span className="modal__icon"><ArrowsLeftRight weight="bold" /></span><div><small>{t("move.sync")}</small><h2>{t("move.title", { title: parsePresentationTitle(node.title).title })}</h2></div><button className="icon-button" aria-label={t("move.close")} title={t("move.close")} onClick={onClose}><X /></button></header>
      <label className="folder-search"><MagnifyingGlass /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("move.search")} /></label>
      <div className="folder-destinations">{visible.map((item) => <button key={item.node.id} disabled={moving === item.node.id} onClick={() => choose(item.node.id)}><span><Folder weight="fill" /><span><strong>{parsePresentationTitle(item.node.title).title || t("common.root")}</strong><small>{item.path}</small></span></span>{item.node.id === node.parentId ? <em>{t("move.current")}</em> : <ArrowRight />}</button>)}{visible.length === 0 && <p>{t("move.empty")}</p>}</div>
    </section>
  </div>;
}
