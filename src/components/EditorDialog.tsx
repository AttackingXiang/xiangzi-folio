import { useEffect, useRef, useState, type FormEvent } from "react";
import { Cards, Eye, EyeSlash, GridFour, LinkSimple, ListBullets, Rows, X } from "@phosphor-icons/react";
import { bookmarks, normalizeUrl, setBookmarkPresentationTitle, setFolderPresentationTitle } from "../lib/bookmarks";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { createTranslator } from "../lib/i18n";
import type { AppConfig, BookmarkStyle, EditorValue, Language } from "../types";

const bookmarkStyles: Array<{ id: BookmarkStyle; icon: typeof Rows }> = [
  { id: "row", icon: ListBullets }, { id: "tile", icon: GridFour }, { id: "featured", icon: Cards }, { id: "dock", icon: Rows }, { id: "compact", icon: ListBullets },
];

// The width a bookmark actually renders at comes from its own marker, the
// folder style it sits in, or a per-variant default — a wider set than any one
// preset list below covers. A <select> whose value matches no <option> silently
// displays the first one, which both misreports the current size and rewrites
// it on save, so the effective width is always appended when it is missing.
function widthOptions(cards: boolean, tile: boolean, current: number, t: (key: string, vars?: Record<string, string | number>) => string) {
  const presets = cards
    ? (tile
      ? [{ value: 8, label: t("editor.cardWidest") }, { value: 4, label: t("editor.cardWider") }, { value: 3, label: t("editor.cardStandard") }, { value: 1.5, label: t("editor.cardCompact") }]
      : [{ value: 16, label: t("editor.cardWidest") }, { value: 8, label: t("editor.cardWider") }, { value: 6, label: t("editor.cardStandard") }, { value: 4, label: t("editor.cardCompact") }])
    : (tile
      ? [{ value: 16, label: t("editor.columnsFull") }, { value: 12, label: t("editor.columns", { count: 12 }) }, { value: 8, label: t("editor.columnsHalf") }, { value: 6, label: t("editor.columns", { count: 6 }) }, { value: 4, label: t("editor.columns", { count: 4 }) }, { value: 3, label: t("editor.columns", { count: 3 }) }, { value: 2, label: t("editor.columns", { count: 2 }) }, { value: 1.5, label: t("editor.columnsDefault") }]
      : [{ value: 12, label: t("editor.fullRow") }, { value: 8, label: "2/3" }, { value: 6, label: "1/2" }, { value: 4, label: "1/3" }, { value: 3, label: "1/4" }]);
  if (presets.some((option) => option.value === current)) return presets;
  return [...presets, { value: current, label: t("editor.columns", { count: current }) }].sort((a, b) => b.value - a.value);
}

export function EditorDialog({ value, language, onConfig, onClose, onSaved, onError }: { value: EditorValue | null; language: Language; onConfig: (recipe: (value: AppConfig) => AppConfig) => void; onClose: () => void; onSaved: () => Promise<void>; onError?: (message: string) => void }) {
  const [draft, setDraft] = useState<EditorValue | null>(value);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const t = createTranslator(language);
  useEffect(() => setDraft(value), [value]);
  useDialogFocus(!!draft, dialogRef, onClose);
  if (!draft) return null;
  const dialogTitle = t("editor.title", { action: t(draft.id ? "editor.edit" : "editor.create"), type: t(draft.type === "folder" ? "editor.folder" : "editor.bookmark") });
  // Card widths are proportions inside a shelf, not page columns, so an unset
  // width has to fall back inside the same scale the presets use — otherwise
  // the dialog offers (and then saves) a page-column value like 12.
  const isTileDraft = (draft.style || "row") === "tile";
  const currentWidth = draft.width || (draft.cardsContext ? (isTileDraft ? 1.5 : 6) : (isTileDraft ? 1.5 : 12));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!draft.title.trim()) return;
    setSaving(true);
    try {
      const title = draft.title.trim();
      const storedTitle = draft.type === "bookmark"
        ? setBookmarkPresentationTitle(title, { style: draft.style || "row", width: draft.width || ((draft.style || "row") === "tile" ? 1.5 : 12), rows: draft.rows || 1 })
        : setFolderPresentationTitle(title, { style: draft.folderStyle || "directory", width: draft.width || 4, collapsed: !!draft.collapsed, pinned: draft.pinned });
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
        folderTransparent: { ...config.folderTransparent, [id]: !!draft.transparent },
        folderBorderless: { ...config.folderBorderless, [id]: !!draft.borderless },
        collapsed: draft.collapsed ? [...new Set([...config.collapsed, id])] : config.collapsed.filter((item) => item !== id),
      });
      await onSaved(); onClose();
    } catch (reason) {
      onError?.(reason instanceof Error ? reason.message : t("editor.saveError"));
    } finally { setSaving(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form ref={dialogRef} className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={dialogTitle}>
      <header><span className="modal__icon"><LinkSimple weight="bold" /></span><div><small>{t(draft.id ? "editor.updateChrome" : "editor.createChrome")}</small><h2>{dialogTitle}</h2></div><button type="button" className="icon-button" aria-label={t("editor.close")} title={t("editor.close")} onClick={onClose}><X /></button></header>
      <label>{t("editor.name")}<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t(draft.type === "folder" ? "editor.folderPlaceholder" : "editor.pagePlaceholder")} /></label>
      {draft.type === "bookmark" && <label>{t("editor.url")}<input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com" /></label>}
      {draft.type === "bookmark" && <section className="bookmark-appearance"><div><strong>{t("editor.appearance")}</strong><small>{draft.cardsContext ? t("editor.cardsHint") : t("editor.suffixHint")}</small></div><div className="appearance-options">{bookmarkStyles.map((item) => <button type="button" key={item.id} className={(draft.style || "row") === item.id ? "active" : ""} onClick={() => setDraft({ ...draft, style: item.id, width: item.id === "tile" && (draft.style || "row") !== "tile" ? 1.5 : draft.width })}><item.icon />{t(`editor.style.${item.id}`)}</button>)}</div><div className="appearance-layout"><label>{t("editor.width")}<select value={currentWidth} onChange={(event) => setDraft({ ...draft, width: Number(event.target.value) })}>{widthOptions(!!draft.cardsContext, (draft.style || "row") === "tile", currentWidth, t).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>{t("editor.height")}<select value={draft.rows || 1} onChange={(event) => setDraft({ ...draft, rows: Number(event.target.value) as 1 | 2 })}><option value="1">{t("editor.rowStandard")}</option><option value="2">{t("editor.rowFeatured")}</option></select></label></div></section>}
      {draft.type === "folder" && <><section className="folder-appearance"><div><strong>{t("folder.transparent")}</strong><small>{t(draft.transparent ? "folder.opaque" : "folder.transparent")}</small></div><button type="button" role="switch" aria-label={t("folder.transparent")} title={t(draft.transparent ? "folder.opaque" : "folder.transparent")} aria-checked={!!draft.transparent} className={`toggle ${draft.transparent ? "active" : ""}`} onClick={() => setDraft({ ...draft, transparent: !draft.transparent })}>{draft.transparent ? <EyeSlash /> : <Eye />}</button></section><section className="folder-appearance"><div><strong>{t("folder.borderless")}</strong><small>{t(draft.borderless ? "folder.bordered" : "folder.borderless")}</small></div><button type="button" role="switch" aria-label={t("folder.borderless")} title={t(draft.borderless ? "folder.bordered" : "folder.borderless")} aria-checked={!!draft.borderless} className={`toggle ${draft.borderless ? "active" : ""}`} onClick={() => setDraft({ ...draft, borderless: !draft.borderless })}>{draft.borderless ? <EyeSlash /> : <Eye />}</button></section></>}
      <footer><button type="button" className="button button--ghost" title={t("common.cancel")} onClick={onClose}>{t("common.cancel")}</button><button className="button button--primary" title={t(saving ? "common.saving" : "common.save")} disabled={saving || !draft.title.trim() || (draft.type === "bookmark" && !draft.url.trim())}>{t(saving ? "common.saving" : "common.save")}</button></footer>
    </form>
  </div>;
}
