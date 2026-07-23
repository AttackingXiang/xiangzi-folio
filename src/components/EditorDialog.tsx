import { useEffect, useRef, useState, type FormEvent } from "react";
import { Cards, GridFour, LinkSimple, ListBullets, Rows, X } from "@phosphor-icons/react";
import { bookmarks, normalizeUrl, setBookmarkPresentationTitle, setFolderPresentationTitle } from "../lib/bookmarks";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { createTranslator } from "../lib/i18n";
import type { AppConfig, BookmarkStyle, EditorValue, Language } from "../types";

const bookmarkStyles: Array<{ id: BookmarkStyle; icon: typeof Rows }> = [
  { id: "row", icon: ListBullets }, { id: "tile", icon: GridFour }, { id: "featured", icon: Cards }, { id: "dock", icon: Rows }, { id: "compact", icon: ListBullets },
];

export function EditorDialog({ value, language, onConfig, onClose, onSaved, onError }: { value: EditorValue | null; language: Language; onConfig: (recipe: (value: AppConfig) => AppConfig) => void; onClose: () => void; onSaved: () => Promise<void>; onError?: (message: string) => void }) {
  const [draft, setDraft] = useState<EditorValue | null>(value);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const t = createTranslator(language);
  useEffect(() => setDraft(value), [value]);
  useDialogFocus(!!draft, dialogRef, onClose);
  if (!draft) return null;
  const dialogTitle = t("editor.title", { action: t(draft.id ? "editor.edit" : "editor.create"), type: t(draft.type === "folder" ? "editor.folder" : "editor.bookmark") });
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!draft.title.trim()) return;
    setSaving(true);
    try {
      const title = draft.title.trim();
      const storedTitle = draft.type === "bookmark"
        ? setBookmarkPresentationTitle(title, { style: draft.style || "row", width: draft.width || ((draft.style || "row") === "tile" ? 1.5 : 12), rows: draft.rows || 1 })
        : setFolderPresentationTitle(title, { style: draft.folderStyle || "directory", width: draft.width || 4, collapsed: !!draft.collapsed });
      const saved = draft.id
        ? await bookmarks.update(draft.id, { title: storedTitle, ...(draft.type === "bookmark" ? { url: normalizeUrl(draft.url) } : {}) })
        : await bookmarks.create({ parentId: draft.parentId, title: storedTitle, ...(draft.type === "bookmark" ? { url: normalizeUrl(draft.url) } : {}) });
      const id = saved.id;
      onConfig((config) => draft.type === "bookmark" ? {
        ...config,
        bookmarkStyles: { ...config.bookmarkStyles, [id]: draft.style || "row" },
        bookmarkWidths: { ...config.bookmarkWidths, [id]: draft.width || ((draft.style || "row") === "tile" ? 1.5 : 12) },
        bookmarkRows: { ...config.bookmarkRows, [id]: draft.rows || 1 },
      } : {
        ...config,
        folderStyles: { ...config.folderStyles, [id]: draft.folderStyle || "directory" },
        folderWidths: { ...config.folderWidths, [id]: draft.width || 4 },
        collapsed: draft.collapsed ? [...new Set([...config.collapsed, id])] : config.collapsed.filter((item) => item !== id),
      });
      await onSaved(); onClose();
    } catch (reason) {
      onError?.(reason instanceof Error ? reason.message : t("editor.saveError"));
    } finally { setSaving(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form ref={dialogRef} className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={dialogTitle}>
      <header><span className="modal__icon"><LinkSimple weight="bold" /></span><div><small>{t(draft.id ? "editor.updateChrome" : "editor.createChrome")}</small><h2>{dialogTitle}</h2></div><button type="button" className="icon-button" aria-label={t("editor.close")} onClick={onClose}><X /></button></header>
      <label>{t("editor.name")}<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t(draft.type === "folder" ? "editor.folderPlaceholder" : "editor.pagePlaceholder")} /></label>
      {draft.type === "bookmark" && <label>{t("editor.url")}<input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com" /></label>}
      {draft.type === "bookmark" && <section className="bookmark-appearance"><div><strong>{t("editor.appearance")}</strong><small>{t("editor.suffixHint")}</small></div><div className="appearance-options">{bookmarkStyles.map((item) => <button type="button" key={item.id} className={(draft.style || "row") === item.id ? "active" : ""} onClick={() => setDraft({ ...draft, style: item.id, width: item.id === "tile" && (draft.style || "row") !== "tile" ? 1.5 : draft.width })}><item.icon />{t(`editor.style.${item.id}`)}</button>)}</div><div className="appearance-layout"><label>{t("editor.width")}<select value={draft.width || ((draft.style || "row") === "tile" ? 1.5 : 12)} onChange={(event) => setDraft({ ...draft, width: Number(event.target.value) })}>{(draft.style || "row") === "tile" ? <><option value="16">{t("editor.columnsFull")}</option><option value="12">{t("editor.columns", { count: 12 })}</option><option value="8">{t("editor.columnsHalf")}</option><option value="6">{t("editor.columns", { count: 6 })}</option><option value="4">{t("editor.columns", { count: 4 })}</option><option value="3">{t("editor.columns", { count: 3 })}</option><option value="2">{t("editor.columns", { count: 2 })}</option><option value="1.5">{t("editor.columnsDefault")}</option></> : <><option value="12">{t("editor.fullRow")}</option><option value="8">2/3</option><option value="6">1/2</option><option value="4">1/3</option><option value="3">1/4</option></>}</select></label><label>{t("editor.height")}<select value={draft.rows || 1} onChange={(event) => setDraft({ ...draft, rows: Number(event.target.value) as 1 | 2 })}><option value="1">{t("editor.rowStandard")}</option><option value="2">{t("editor.rowFeatured")}</option></select></label></div></section>}
      <footer><button type="button" className="button button--ghost" onClick={onClose}>{t("common.cancel")}</button><button className="button button--primary" disabled={saving || !draft.title.trim() || (draft.type === "bookmark" && !draft.url.trim())}>{t(saving ? "common.saving" : "common.save")}</button></footer>
    </form>
  </div>;
}
