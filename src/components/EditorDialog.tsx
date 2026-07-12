import { useEffect, useState, type FormEvent } from "react";
import { Cards, GridFour, LinkSimple, ListBullets, Rows, X } from "@phosphor-icons/react";
import { bookmarks, normalizeUrl, setBookmarkPresentationTitle, setFolderPresentationTitle } from "../lib/bookmarks";
import type { BookmarkStyle, EditorValue } from "../types";

const bookmarkStyles: Array<{ id: BookmarkStyle; label: string; icon: typeof Rows }> = [
  { id: "row", label: "列表", icon: ListBullets },
  { id: "tile", label: "图标", icon: GridFour },
  { id: "featured", label: "重点", icon: Cards },
  { id: "dock", label: "横向", icon: Rows },
  { id: "compact", label: "紧凑", icon: ListBullets },
];

export function EditorDialog({ value, onClose, onSaved }: { value: EditorValue | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<EditorValue | null>(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(value), [value]);
  if (!draft) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!draft.title.trim()) return;
    setSaving(true);
    try {
      const title = draft.type === "bookmark"
        ? setBookmarkPresentationTitle(draft.title.trim(), { style: draft.style, width: draft.width, rows: draft.rows })
        : setFolderPresentationTitle(draft.title.trim(), { style: draft.folderStyle, width: draft.width, collapsed: draft.collapsed });
      if (draft.id) await bookmarks.update(draft.id, { title, ...(draft.type === "bookmark" ? { url: normalizeUrl(draft.url) } : {}) });
      else await bookmarks.create({ parentId: draft.parentId, title, ...(draft.type === "bookmark" ? { url: normalizeUrl(draft.url) } : {}) });
      await onSaved(); onClose();
    } finally { setSaving(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={`${draft.id ? "编辑" : "新建"}${draft.type === "folder" ? "文件夹" : "书签"}`}>
      <header><span className="modal__icon"><LinkSimple weight="bold" /></span><div><small>{draft.id ? "更新 Chrome 书签" : "新建并同步到 Chrome"}</small><h2>{draft.type === "folder" ? `${draft.id ? "编辑" : "新建"}文件夹` : `${draft.id ? "编辑" : "新建"}书签`}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></header>
      <label>名称<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={draft.type === "folder" ? "例如：设计灵感" : "网页名称"} /></label>
      {draft.type === "bookmark" && <label>网址<input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com" /></label>}
      {draft.type === "bookmark" && <section className="bookmark-appearance"><div><strong>展示样式</strong><small>样式设置会随 Chrome 书签名称同步</small></div><div className="appearance-options">{bookmarkStyles.map((item) => <button type="button" key={item.id} className={(draft.style || "row") === item.id ? "active" : ""} onClick={() => setDraft({ ...draft, style: item.id, width: item.id === "tile" && (draft.style || "row") !== "tile" ? 2 : draft.width })}><item.icon />{item.label}</button>)}</div><div className="appearance-layout"><label>占用宽度<select value={draft.width || ((draft.style || "row") === "tile" ? 2 : 12)} onChange={(event) => setDraft({ ...draft, width: Number(event.target.value) })}>{(draft.style || "row") === "tile" ? <><option value="16">16 列 · 整行</option><option value="12">12 列</option><option value="8">8 列 · 半行</option><option value="6">6 列</option><option value="4">4 列</option><option value="3">3 列</option><option value="2">2 列 · 默认</option></> : <><option value="12">整行</option><option value="8">2/3</option><option value="6">1/2</option><option value="4">1/3</option><option value="3">1/4</option></>}</select></label><label>卡片高度<select value={draft.rows || 1} onChange={(event) => setDraft({ ...draft, rows: Number(event.target.value) as 1 | 2 })}><option value="1">标准一行</option><option value="2">突出两行</option></select></label></div></section>}
      <footer><button type="button" className="button button--ghost" onClick={onClose}>取消</button><button className="button button--primary" disabled={saving || !draft.title.trim() || (draft.type === "bookmark" && !draft.url.trim())}>{saving ? "保存中…" : "保存并同步"}</button></footer>
    </form>
  </div>;
}
