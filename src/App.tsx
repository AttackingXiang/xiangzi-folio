import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import {
  ArrowsClockwise, Browsers, CaretDown, Check, Database, DownloadSimple, Export,
  Eye, EyeSlash, FolderPlus, GearSix, Heart, LinkSimple, MagnifyingGlass,
  PencilSimple, SquaresFour, UploadSimple, X,
} from "@phosphor-icons/react";
import { RiOpenaiFill } from "react-icons/ri";
import { SiAnthropic, SiBilibili, SiGooglegemini, SiYoutube } from "react-icons/si";
import { MoveDialog } from "./components/BookmarkMenus";
import { EditorDialog } from "./components/EditorDialog";
import { FolderView, ResizeHandle } from "./components/FolderView";
import { QuickAccess } from "./components/QuickAccess";
import { SettingsPanel } from "./components/SettingsPanel";
import { SupportDialog } from "./components/SupportDialog";
import { useBookmarks } from "./hooks/useBookmarks";
import { allFolders, bookmarks, exportBookmarksHtml, getRootFolders, importBundle, importHtml, isQuickAccessFolder, parsePresentationTitle, restoreBookmarkBranch, setBookmarkPresentationTitle, setFolderPresentationTitle, setQuickAccessTitle } from "./lib/bookmarks";
import { createBundle, defaultConfig, downloadText, loadConfig, parseBundle, saveConfig } from "./lib/config";
import { createTranslator, resolveLanguage } from "./lib/i18n";
import { prepareLocalImage } from "./lib/images";
import type { AppConfig, BookmarkNode, BookmarkStyle, EditorValue, FolderStyle, SearchEngine } from "./types";

const engines: Record<SearchEngine, { label: string; action: string; host: string }> = {
  google: { label: "Google", action: "https://www.google.com/search?q=", host: "google.com" },
  bing: { label: "Bing", action: "https://www.bing.com/search?q=", host: "bing.com" },
  baidu: { label: "百度", action: "https://www.baidu.com/s?wd=", host: "baidu.com" },
  duckduckgo: { label: "DuckDuckGo", action: "https://duckduckgo.com/?q=", host: "duckduckgo.com" },
};

const widthPresets = [{ value: 12, key: "editor.fullRow" }, { value: 9, label: "3/4" }, { value: 8, label: "2/3" }, { value: 6, label: "1/2" }, { value: 4, label: "1/3" }, { value: 3, label: "1/4" }];
const productMark = "/icons/brand-mark.png";

function flattenBlocks(roots: BookmarkNode[]): BookmarkNode[] {
  const links = roots.flatMap((root) => (root.children || []).filter((item) => item.url));
  const direct = links.length ? { id: "direct-all", parentId: roots[0]?.id, title: "快捷书签", children: links } : null;
  return [...(direct ? [direct] : []), ...roots.flatMap((root) => (root.children || []).filter((item) => !item.url && !isQuickAccessFolder(item) && parsePresentationTitle(item.title).title !== "常用入口"))];
}

function walkNodes(nodes: BookmarkNode[]): BookmarkNode[] {
  return nodes.flatMap((node) => [node, ...walkNodes(node.children || [])]);
}

function remapRecord<T>(record: Record<string, T> | undefined, idMap: Record<string, string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record || {}).map(([id, value]) => [idMap[id] || id, value]));
}

function remapConfigIds(config: AppConfig, idMap: Record<string, string>): AppConfig {
  return {
    ...config,
    folderStyles: remapRecord(config.folderStyles, idMap),
    folderWidths: remapRecord(config.folderWidths, idMap),
    bookmarkStyles: remapRecord(config.bookmarkStyles, idMap),
    bookmarkWidths: remapRecord(config.bookmarkWidths, idMap),
    bookmarkRows: remapRecord(config.bookmarkRows, idMap),
    folderOrder: config.folderOrder.map((id) => idMap[id] || id),
    collapsed: config.collapsed.map((id) => idMap[id] || id),
  };
}

function portablePresentationTitle(node: BookmarkNode, config: AppConfig): string {
  const parsed = parsePresentationTitle(node.title);
  if (node.url) {
    const parsedStyle = (["row", "tile", "featured", "dock", "compact"] as const).includes(parsed.marker as BookmarkStyle) ? parsed.marker as BookmarkStyle : undefined;
    const style = config.bookmarkStyles?.[node.id] || parsedStyle;
    const width = config.bookmarkWidths?.[node.id] || parsed.width;
    const rows = config.bookmarkRows?.[node.id] || parsed.rows || 1;
    return style || width || rows === 2 ? setBookmarkPresentationTitle(node.title, { style: style || "row", width, rows }) : node.title;
  }
  const parsedStyle = (["directory", "icons", "mixed", "dock", "stack", "focus", "columns"] as const).includes(parsed.marker as FolderStyle) ? parsed.marker as FolderStyle : undefined;
  const style = config.folderStyles?.[node.id] || parsedStyle;
  const width = config.folderWidths?.[node.id] || parsed.width;
  const collapsed = config.collapsed?.includes(node.id) || !!parsed.collapsed;
  return style || width || collapsed ? setFolderPresentationTitle(node.title, { style: style || "directory", width, collapsed }) : node.title;
}

const quickLinks = [
  { title: "ChatGPT", subtitle: "OpenAI", url: "https://chatgpt.com", color: "#111111", icon: RiOpenaiFill },
  { title: "Claude", subtitle: "Anthropic", url: "https://claude.ai", color: "#d97757", icon: SiAnthropic },
  { title: "Gemini", subtitle: "Google AI", url: "https://gemini.google.com", color: "#4285f4", icon: SiGooglegemini },
  { title: "YouTube", subtitle: "视频", url: "https://youtube.com", color: "#ff0033", icon: SiYoutube },
  { title: "Bilibili", subtitle: "哔哩哔哩", url: "https://bilibili.com", color: "#00aeec", icon: SiBilibili },
];

function isLikelyUrl(value: string) {
  return /^(https?:\/\/|chrome:\/\/|file:\/\/)/i.test(value.trim()) || /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(value.trim());
}

function MasonryArticle({ width, children, ...props }: { width: number; children: React.ReactNode } & Omit<React.HTMLAttributes<HTMLElement>, "style">) {
  const ref = useRef<HTMLElement>(null);
  const [rowSpan, setRowSpan] = useState(1);
  useEffect(() => {
    const element = ref.current; if (!element) return;
    const update = () => setRowSpan(Math.max(1, Math.ceil((element.getBoundingClientRect().height + 18) / 26)));
    update();
    const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <article ref={ref} {...props} style={{ gridColumn: `span ${width}`, gridRowEnd: `span ${rowSpan}` }}>{children}</article>;
}

export function App() {
  const { tree, loading, error, refresh, native } = useBookmarks();
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [configReady, setConfigReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [editor, setEditor] = useState<EditorValue | null>(null);
  const [query, setQuery] = useState("");
  const [engineMenu, setEngineMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [undoAction, setUndoAction] = useState<null | (() => Promise<void>)>(null);
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<BookmarkNode | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const brandLogoInput = useRef<HTMLInputElement>(null);
  const enginePicker = useRef<HTMLDivElement>(null);
  const engineButton = useRef<HTMLButtonElement>(null);
  const engineOptions = useRef<Array<HTMLButtonElement | null>>([]);
  const markerMigration = useRef(false);
  const quickSeed = useRef(false);
  const t = createTranslator(config.language);
  const engineLabel = (id: SearchEngine) => id === "baidu" ? t("engine.baidu") : engines[id].label;

  useEffect(() => {
    document.documentElement.lang = resolveLanguage(config.language);
  }, [config.language]);

  useEffect(() => {
    loadConfig().then((value) => { setConfig(value); setConfigReady(true); }).catch((reason) => {
      setConfigReady(true);
      setToast(reason instanceof Error ? reason.message : t("notice.configReadError"));
    });
  }, []);
  useEffect(() => {
    if (!configReady) return;
    const timer = setTimeout(() => saveConfig(config).catch((reason) => setToast(reason instanceof Error ? reason.message : t("notice.configSaveError"))), 300);
    return () => clearTimeout(timer);
  }, [config, configReady]);
  useEffect(() => {
    if (!engineMenu) return;
    const close = (event: PointerEvent) => {
      if (!enginePicker.current?.contains(event.target as Node)) setEngineMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setEngineMenu(false);
      engineButton.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [engineMenu]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => { setToast(""); setUndoAction(null); }, undoAction ? 6500 : 2400); return () => clearTimeout(timer); }, [toast, undoAction]);

  const roots = useMemo(() => getRootFolders(tree), [tree]);
  useEffect(() => {
    if (!configReady || config.markerStorageVersion >= 3 || markerMigration.current || roots.length === 0) return;
    markerMigration.current = true;
    const migrate = async () => {
      try {
        const folderStyles = { ...config.folderStyles };
        const folderWidths = { ...config.folderWidths };
        const bookmarkStyles = { ...config.bookmarkStyles };
        const bookmarkWidths = { ...config.bookmarkWidths };
        const bookmarkRows = { ...config.bookmarkRows };
        const collapsed = new Set(config.collapsed);
        let migrated = 0;
        for (const node of walkNodes(roots)) {
          const parsed = parsePresentationTitle(node.title);
          let nextTitle = node.title;
          if (node.url) {
            if (["tile", "featured", "dock", "compact"].includes(parsed.marker || "")) bookmarkStyles[node.id] = parsed.marker as BookmarkStyle;
            if (parsed.width) bookmarkWidths[node.id] = parsed.width;
            if (parsed.rows) bookmarkRows[node.id] = parsed.rows;
            const style = bookmarkStyles[node.id] || (["row", "tile", "featured", "dock", "compact"].includes(parsed.marker || "") ? parsed.marker as BookmarkStyle : undefined);
            const width = bookmarkWidths[node.id] || parsed.width;
            const rows = bookmarkRows[node.id] || parsed.rows || 1;
            if (style || width || rows === 2) nextTitle = setBookmarkPresentationTitle(node.title, { style: style || "row", width, rows });
          } else {
            if (["directory", "icons", "mixed", "dock", "stack", "focus", "columns"].includes(parsed.marker || "")) folderStyles[node.id] = parsed.marker as FolderStyle;
            if (parsed.width) folderWidths[node.id] = parsed.width;
            if (parsed.collapsed) collapsed.add(node.id);
            const style = folderStyles[node.id] || (["directory", "icons", "mixed", "dock", "stack", "focus", "columns"].includes(parsed.marker || "") ? parsed.marker as FolderStyle : undefined);
            const width = folderWidths[node.id] || parsed.width;
            const isCollapsed = collapsed.has(node.id) || !!parsed.collapsed;
            if (style || width || isCollapsed) nextTitle = setFolderPresentationTitle(node.title, { style: style || "directory", width, collapsed: isCollapsed });
          }
          if (nextTitle !== node.title) { await bookmarks.update(node.id, { title: nextTitle }); migrated += 1; }
        }
        setConfig((value) => ({ ...value, folderStyles, folderWidths, bookmarkStyles, bookmarkWidths, bookmarkRows, collapsed: [...collapsed], markerStorageVersion: 3 }));
        if (migrated) { await refresh(); setToast(t("notice.markerMigrated", { count: migrated })); }
      } catch (reason) {
        markerMigration.current = false;
        setToast(reason instanceof Error ? reason.message : t("notice.markerMigrationError"));
      }
    };
    migrate();
  }, [config, configReady, refresh, roots]);
  const activeRoot = roots[0];
  const quickFolder = useMemo(() => activeRoot ? allFolders([activeRoot]).find((folder) => isQuickAccessFolder(folder)) || allFolders([activeRoot]).find((folder) => parsePresentationTitle(folder.title).title === "常用入口") : undefined, [activeRoot]);
  useEffect(() => {
    if (!quickFolder || isQuickAccessFolder(quickFolder)) return;
    bookmarks.update(quickFolder.id, { title: setQuickAccessTitle(quickFolder.title) }).then(refresh).catch((reason) => setToast(reason instanceof Error ? reason.message : t("notice.quickSeedError")));
  }, [quickFolder, refresh]);
  useEffect(() => {
    if (!native || !configReady || config.quickLinksSeeded || quickSeed.current || !activeRoot) return;
    quickSeed.current = true;
    const seed = async () => {
      try {
        let folder = quickFolder;
        if (!folder) folder = await bookmarks.create({ parentId: activeRoot.id, title: setQuickAccessTitle(t("quick.title")) });
        const existing = new Set((folder.children || []).map((node) => node.url?.replace(/\/$/, "")));
        for (const item of quickLinks) if (!existing.has(item.url.replace(/\/$/, ""))) await bookmarks.create({ parentId: folder.id, title: item.title, url: item.url });
        setConfig((value) => ({ ...value, quickLinksSeeded: true }));
        await refresh(); setToast(t("notice.quickSeeded"));
      } catch (reason) {
        quickSeed.current = false;
        setToast(reason instanceof Error ? reason.message : t("notice.quickSeedError"));
      }
    };
    seed();
  }, [activeRoot, config.quickLinksSeeded, configReady, native, quickFolder, refresh]);
  const visibleRoots = useMemo(() => config.showSecondaryRoots ? roots : roots.slice(0, 1), [config.showSecondaryRoots, roots]);
  const rawBlocks = useMemo(() => flattenBlocks(visibleRoots), [visibleRoots]);
  const blocks = useMemo(() => {
    const order = config.folderOrder;
    return [...rawBlocks].sort((a, b) => {
      const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
      if (ai < 0 && bi < 0) return 0; if (ai < 0) return 1; if (bi < 0) return -1; return ai - bi;
    });
  }, [rawBlocks, config.folderOrder]);
  useEffect(() => {
    if (!editing) { setSelectedBlock(null); return; }
    if (!selectedBlock || !blocks.some((block) => block.id === selectedBlock)) setSelectedBlock(blocks[0]?.id || null);
  }, [blocks, editing, selectedBlock]);

  const onConfig = (recipe: (value: AppConfig) => AppConfig) => setConfig((value) => recipe(value));
  const notify = (message: string, undo?: () => Promise<void>) => { setToast(message); setUndoAction(undo ? () => undo : null); };
  const search = (event: FormEvent) => {
    event.preventDefault(); const value = query.trim(); if (!value) return;
    window.location.href = isLikelyUrl(value) ? (/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`) : `${engines[config.searchEngine].action}${encodeURIComponent(value)}`;
  };
  const exportConfig = () => downloadText(`xiangzi-folio-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(createBundle(config, tree), null, 2), "application/json");
  const exportHtml = () => downloadText(`chrome-bookmarks-${new Date().toISOString().slice(0, 10)}.html`, exportBookmarksHtml(tree), "text/html");
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !activeRoot) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error(t("notice.importTooLarge"));
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".html") || text.includes("NETSCAPE-Bookmark-file")) await importHtml(text, activeRoot.id);
      else {
        const bundle = parseBundle(JSON.parse(text));
        const idMap = await importBundle(bundle, activeRoot.id);
        await Promise.all(walkNodes(bundle.bookmarkTree).map(async (node) => {
          const importedId = idMap[node.id];
          if (!importedId) return;
          const title = portablePresentationTitle(node, bundle.config);
          if (title !== node.title) await bookmarks.update(importedId, { title });
        }));
        setConfig({
          ...defaultConfig,
          ...bundle.config,
          folderStyles: remapRecord(bundle.config.folderStyles, idMap),
          folderWidths: remapRecord(bundle.config.folderWidths, idMap),
          bookmarkStyles: remapRecord(bundle.config.bookmarkStyles, idMap),
          bookmarkWidths: remapRecord(bundle.config.bookmarkWidths, idMap),
          bookmarkRows: remapRecord(bundle.config.bookmarkRows, idMap),
          folderOrder: (bundle.config.folderOrder || []).map((id) => idMap[id] || id),
          collapsed: (bundle.config.collapsed || []).map((id) => idMap[id] || id),
          markerStorageVersion: 3,
        });
      }
      await refresh(); notify(t("notice.importDone"));
    } catch (reason) { notify(reason instanceof Error ? reason.message : t("notice.importError")); }
    event.target.value = "";
  };
  const toggleAll = async () => {
    const ids = blocks.flatMap((block) => [block.id]);
    const allClosed = blocks.every((block) => {
      const parsed = parsePresentationTitle(block.title);
      return parsed.marker ? !!parsed.collapsed : config.collapsed.includes(block.id);
    });
    onConfig((value) => ({ ...value, collapsed: allClosed ? value.collapsed.filter((id) => !ids.includes(id)) : [...new Set([...value.collapsed, ...ids])] }));
    await Promise.all(blocks.filter((block) => !block.id.startsWith("direct-")).map(async (block) => {
      const parsed = parsePresentationTitle(block.title);
      const style = (["directory", "icons", "mixed", "dock", "stack", "focus", "columns"] as const).includes(parsed.marker as FolderStyle) ? parsed.marker as FolderStyle : config.folderStyles[block.id] || "directory";
      await bookmarks.update(block.id, { title: setFolderPresentationTitle(block.title, { style, width: parsed.width || config.folderWidths[block.id], collapsed: !allClosed }) });
    }));
    await refresh();
    notify(t(allClosed ? "notice.expandedAll" : "notice.collapsedAll"));
  };
  const moveBlock = (event: DragEvent, targetId: string) => {
    event.preventDefault(); if (!draggedBlock || draggedBlock === targetId) return;
    const ids = blocks.map((block) => block.id).filter((id) => id !== draggedBlock);
    ids.splice(ids.indexOf(targetId), 0, draggedBlock);
    onConfig((value) => ({ ...value, folderOrder: ids })); setDraggedBlock(null); notify(t("notice.layoutUpdated"));
  };
  const commitBlockWidth = async (block: BookmarkNode, width: number) => {
    onConfig((value) => ({ ...value, folderWidths: { ...value.folderWidths, [block.id]: width } }));
    if (!block.id.startsWith("direct-")) {
      const parsed = parsePresentationTitle(block.title);
      const style = (["directory", "icons", "mixed", "dock", "stack", "focus", "columns"] as const).includes(parsed.marker as FolderStyle) ? parsed.marker as FolderStyle : config.folderStyles[block.id] || "directory";
      await bookmarks.update(block.id, { title: setFolderPresentationTitle(block.title, { style, width, collapsed: parsed.marker ? !!parsed.collapsed : config.collapsed.includes(block.id) }) });
      await refresh();
    }
    notify(t("notice.widthSynced"));
  };
  const resetLayout = async () => {
    const previous = { folderOrder: config.folderOrder, folderWidths: config.folderWidths, collapsed: config.collapsed };
    const previousTitles = blocks.filter((block) => !block.id.startsWith("direct-")).map((block) => ({ id: block.id, title: block.title }));
    onConfig((value) => ({ ...value, folderOrder: [], folderWidths: {}, collapsed: [] }));
    await Promise.all(previousTitles.map(async ({ id, title }) => {
      const parsed = parsePresentationTitle(title);
      const style = (["directory", "icons", "mixed", "dock", "stack", "focus", "columns"] as const).includes(parsed.marker as FolderStyle) ? parsed.marker as FolderStyle : config.folderStyles[id] || "directory";
      await bookmarks.update(id, { title: setFolderPresentationTitle(title, { style, collapsed: false }) });
    }));
    await refresh();
    notify(t("notice.layoutReset"), async () => {
      onConfig((value) => ({ ...value, ...previous }));
      await Promise.all(previousTitles.map(({ id, title }) => bookmarks.update(id, { title })));
      await refresh();
      notify(t("notice.layoutRestored"));
    });
  };
  const addFolder = () => {
    if (!activeRoot) return;
    setEditor({ parentId: activeRoot.id, type: "folder", title: "", url: "", folderStyle: "directory", width: 4 });
  };
  const moveNode = async (parentId: string) => {
    if (!moveTarget) return;
    try {
      await bookmarks.move(moveTarget.id, { parentId });
      await refresh(); notify(t("notice.moved", { title: parsePresentationTitle(moveTarget.title).title }));
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : t("notice.moveError"));
    }
  };
  const deleteNode = async (node: BookmarkNode, parentId: string, index: number) => {
    const title = parsePresentationTitle(node.title).title;
    const question = t(node.url ? "notice.deleteBookmarkConfirm" : "notice.deleteFolderConfirm", { title });
    if (!confirm(question)) return;
    try {
      await bookmarks.remove(node.id, !node.url);
      await refresh();
      notify(t("notice.deleted", { title }), async () => {
        const idMap = await restoreBookmarkBranch(parentId, node, index);
        setConfig((value) => remapConfigIds(value, idMap));
        await refresh(); notify(t("notice.restored", { title }));
      });
    } catch (reason) { notify(reason instanceof Error ? reason.message : t("notice.deleteError")); }
  };
  const pickBrandLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const brandLogo = await prepareLocalImage(file, { maxWidth: 256, maxHeight: 256, maxBytes: 512 * 1024 });
      onConfig((value) => ({ ...value, brandLogo }));
    } catch (reason) { notify(reason instanceof Error ? reason.message : t("notice.logoError")); }
    event.target.value = "";
  };
  const moveRecentBookmarkToFront = async (node: BookmarkNode, parent: BookmarkNode, index: number) => {
    if (!config.recentClickToFront || index < 5) return;
    try { await bookmarks.move(node.id, { parentId: parent.id, index: 0 }); } catch { /* keep opening the link if reordering fails */ }
  };
  const reorderQuickBookmark = async (id: string, parentId: string, index: number, title: string) => {
    try {
      await bookmarks.move(id, { parentId, index });
      await refresh(); notify(t("notice.reordered", { title }));
    } catch (reason) { notify(reason instanceof Error ? reason.message : t("notice.quickReorderError")); }
  };
  const moveItemIntoQuickFolder = async (id: string, parentId: string, folderTitle: string) => {
    try {
      await bookmarks.move(id, { parentId });
      await refresh(); notify(t("notice.movedInto", { title: folderTitle }));
    } catch (reason) { notify(reason instanceof Error ? reason.message : t("notice.quickMoveError")); }
  };
  const engineIds = Object.keys(engines) as SearchEngine[];
  const focusEngineOption = (index: number) => requestAnimationFrame(() => engineOptions.current[index]?.focus());
  const openEngineMenu = (direction: "first" | "last" | "selected") => {
    setEngineMenu(true);
    const selected = Math.max(0, engineIds.indexOf(config.searchEngine));
    focusEngineOption(direction === "first" ? 0 : direction === "last" ? engineIds.length - 1 : selected);
  };
  const moveEngineFocus = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowDown") next = (index + 1) % engineIds.length;
    else if (event.key === "ArrowUp") next = (index - 1 + engineIds.length) % engineIds.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = engineIds.length - 1;
    else return;
    event.preventDefault();
    engineOptions.current[next]?.focus();
  };
  const appStyle = { "--user-accent": config.accent, "--glass-blur": `${config.glassStrength}px`, "--shade": `${config.backgroundShade / 100}` } as React.CSSProperties;
  const brandLogo = config.brandLogo || productMark;

  return <div className="app" data-theme={config.theme} data-density={config.density} style={appStyle}>
    <div className={`app-background ${config.backgroundImage ? "has-image" : ""}`} style={config.backgroundImage ? { backgroundImage: `url(${config.backgroundImage})` } : undefined} />
    <header className="topbar glass-surface">
      <div className={`brand ${editing ? "brand--editing" : ""}`}>
        {editing ? <button className="brand__mark" type="button" aria-label={t("app.replaceLogo")} onClick={() => brandLogoInput.current?.click()}><img src={brandLogo} alt="" /></button> : <span className="brand__mark" aria-hidden="true"><img src={brandLogo} alt="" /></span>}
        <span className="brand__copy">{editing ? <><input aria-label={t("app.brandName")} value={config.brandName} onChange={(event) => onConfig((value) => ({ ...value, brandName: event.target.value }))} placeholder={t("app.brandName")} /><input aria-label={t("app.brandTagline")} value={config.brandTagline} onChange={(event) => onConfig((value) => ({ ...value, brandTagline: event.target.value }))} placeholder={t("app.taglinePlaceholder")} /></> : <><strong>{config.brandName}</strong><small>{config.brandTagline}</small></>}</span>
        {editing && <span className="brand__tools"><button type="button" className="icon-button" title={t("app.replaceLogo")} aria-label={t("app.replaceLogo")} onClick={() => brandLogoInput.current?.click()}><UploadSimple /></button><button type="button" className="icon-button danger" title={t("app.deleteLogo")} aria-label={t("app.deleteLogo")} onClick={() => onConfig((value) => ({ ...value, brandLogo: "" }))}><X /></button><input ref={brandLogoInput} hidden type="file" accept="image/*" onChange={pickBrandLogo} /></span>}
      </div>
      <form className="search" onSubmit={search}>
        <div ref={enginePicker} className="engine-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEngineMenu(false); }}><button ref={engineButton} type="button" aria-label={t("app.searchPicker", { engine: engineLabel(config.searchEngine) })} aria-expanded={engineMenu} aria-haspopup="menu" onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); openEngineMenu("selected"); } else if (event.key === "ArrowUp") { event.preventDefault(); openEngineMenu("last"); } }} onClick={() => setEngineMenu(!engineMenu)}><Browsers weight="duotone" /><span>{engineLabel(config.searchEngine)}</span><CaretDown /></button>{engineMenu && <div className="engine-menu" role="menu" aria-label={t("app.searchEngines")}>{engineIds.map((id, index) => <button ref={(element) => { engineOptions.current[index] = element; }} type="button" role="menuitemradio" aria-checked={config.searchEngine === id} key={id} className={config.searchEngine === id ? "active" : ""} onKeyDown={(event) => moveEngineFocus(event, index)} onClick={() => { onConfig((value) => ({ ...value, searchEngine: id })); setEngineMenu(false); requestAnimationFrame(() => engineButton.current?.focus()); }}>{engineLabel(id)}<small>{engines[id].host}</small></button>)}</div>}</div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("app.searchPlaceholder", { engine: engineLabel(config.searchEngine) })} aria-label={t("app.search")} />
        <button className="search__submit" aria-label={t("app.search")}><MagnifyingGlass weight="bold" /></button>
      </form>
      <div className="topbar__actions">{editing && <span className={`sync-status ${native ? "is-native" : ""}`} title={t(native ? "app.chromeNative" : "app.webDemo")}><ArrowsClockwise weight="bold" />{t(native ? "app.chromeConnected" : "app.demoData")}</span>}{!editing && <button className="icon-button edit-entry" aria-label={t("app.editHome")} title={t("app.editHome")} onClick={() => setEditing(true)}><PencilSimple /><span className="sr-only">{t("app.editHome")}</span></button>}{editing && <button className="button button--primary" onClick={() => { setEditing(false); setSettings(false); }}><Check weight="bold" />{t("app.done")}</button>}</div>
    </header>

    {editing && <div className="editbar glass-surface">
      <div className="editbar__mode"><span>{t("app.editHome")}</span><small>{t("app.editHint")}</small></div>
      <div className="editbar__tools"><button onClick={addFolder}><FolderPlus />{t("app.newComponent")}</button><button onClick={() => activeRoot && setEditor({ parentId: activeRoot.id, type: "bookmark", title: "", url: "", style: "row", width: 4 })}><LinkSimple />{t("app.newBookmark")}</button><button className={config.showSecondaryRoots ? "active" : ""} onClick={() => onConfig((value) => ({ ...value, showSecondaryRoots: !value.showSecondaryRoots }))}>{config.showSecondaryRoots ? <EyeSlash /> : <Eye />}{t(config.showSecondaryRoots ? "app.hideOther" : "app.showOther")}</button><details className="editbar__data"><summary><Database />{t("app.data")}</summary><div><button onClick={() => fileInput.current?.click()}><UploadSimple />{t("app.import")}</button><button onClick={exportConfig}><DownloadSimple />{t("app.backup")}</button><button onClick={exportHtml}><Export />HTML</button></div></details><button onClick={() => setSettings(!settings)} className={settings ? "active" : ""}><GearSix />{t("app.appearance")}</button><input ref={fileInput} hidden type="file" accept=".json,.html,text/html,application/json" onChange={importFile} /></div>
      <div className="editbar__hint"><SquaresFour />{t("app.layoutHint")}<button onClick={resetLayout}>{t("app.resetLayout")}</button></div>
    </div>}

    <main id="top" className="content">
      {quickFolder && <QuickAccess folder={quickFolder} config={config} editing={editing} onToggleAll={toggleAll} onEdit={setEditor} onMove={(node) => setMoveTarget(node)} onDelete={deleteNode} onNewFolder={(parentId) => setEditor({ parentId, type: "folder", title: "", url: "", folderStyle: "icons", width: 4 })} onNewBookmark={(parentId, defaults) => setEditor({ parentId, type: "bookmark", title: "", url: "", ...defaults })} onRecentClick={moveRecentBookmarkToFront} onReorder={reorderQuickBookmark} onMoveInto={moveItemIntoQuickFolder} />}
      {error && <div className="error-banner">{error}<button onClick={refresh}>{t("app.retry")}</button></div>}
      {!loading && blocks.length === 0 && <div className="empty-state glass-surface"><img className="product-mark product-mark--empty" src={productMark} alt="" /><h2>{t("app.emptyTitle")}</h2><p>{t("app.emptyHint")}</p><button className="button button--primary" onClick={() => setEditing(true)}>{t("app.start")}</button></div>}
      <div className={`bookmark-grid ${editing ? "is-layout-editing" : ""}`}>
        {editing && <div className="grid-guide" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span key={index} />)}</div>}
        {blocks.map((block) => {
          const parsedBlock = parsePresentationTitle(block.title);
          const titleStyle = (["directory", "icons", "mixed", "dock", "stack", "focus", "columns"] as const).includes(parsedBlock.marker as FolderStyle) ? parsedBlock.marker as FolderStyle : undefined;
          const blockStyle = config.markerStorageVersion >= 3 ? titleStyle || config.folderStyles[block.id] || "directory" : config.folderStyles[block.id] || titleStyle || "directory";
          const configuredWidth = config.markerStorageVersion >= 3 ? parsedBlock.width || config.folderWidths[block.id] : config.folderWidths[block.id] || parsedBlock.width;
          const width = Math.max(3, Math.min(12, configuredWidth || (blockStyle === "directory" ? 4 : blocks.length <= 2 ? 6 : 4)));
          const selected = editing && selectedBlock === block.id;
          return <MasonryArticle key={block.id} width={width} tabIndex={editing ? 0 : undefined} aria-label={editing ? t("app.selectAria", { title: parsedBlock.title }) : undefined} className={`block-wrap ${selected ? "is-selected" : ""} ${draggedBlock === block.id ? "is-dragging" : ""}`} draggable={editing} onClick={() => editing && setSelectedBlock(block.id)} onFocus={() => editing && setSelectedBlock(block.id)} onDragStart={(event) => { setSelectedBlock(block.id); setDraggedBlock(block.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDraggedBlock(null)} onDragOver={(event) => editing && event.preventDefault()} onDrop={(event) => moveBlock(event, block.id)}>
            {selected ? <div className="block-toolbar"><span className="drag-label"><SquaresFour />{t("app.drag")}</span><div className="width-presets">{widthPresets.map((preset) => { const label = preset.key ? t(preset.key) : preset.label!; return <button type="button" key={preset.value} className={width === preset.value ? "active" : ""} title={`${label} · ${preset.value}/12`} onClick={(event) => { event.stopPropagation(); commitBlockWidth(block, preset.value); }}>{label}</button>; })}</div></div> : editing && <button type="button" className="block-select" onClick={() => setSelectedBlock(block.id)}>{t("app.selectAdjust")}</button>}
            <FolderView node={block} block pageSpan={width} config={config} editing={editing} onConfig={onConfig} onEdit={setEditor} onRefresh={refresh} onToast={notify} onDelete={deleteNode} onMove={(node) => setMoveTarget(node)} onNewFolder={(parentId) => setEditor({ parentId, type: "folder", title: "", url: "", folderStyle: "icons", width: 4 })} onNewBookmark={(parentId, defaults) => setEditor({ parentId, type: "bookmark", title: "", url: "", ...defaults })} onRecentClick={moveRecentBookmarkToFront} />
            {selected && <ResizeHandle width={width} language={config.language} onWidth={(next) => onConfig((value) => ({ ...value, folderWidths: { ...value.folderWidths, [block.id]: next } }))} onCommit={(next) => commitBlockWidth(block, next)} />}
          </MasonryArticle>;
        })}
      </div>
      <footer className="page-footer"><span><img className="product-mark product-mark--footer" src={productMark} alt="" />Xiangzi Folio</span><p>{t("app.footer")}</p><button className="footer-support" type="button" onClick={() => setSupportOpen(true)}><Heart weight="fill" />{t("support.open")}</button></footer>
    </main>
    {settings && editing && <><button className="settings-scrim" data-dialog-dismiss aria-hidden="true" tabIndex={-1} onClick={() => setSettings(false)} /><SettingsPanel config={config} onConfig={onConfig} onClose={() => setSettings(false)} onError={notify} /></>}
    <MoveDialog node={moveTarget} roots={roots} language={config.language} onClose={() => setMoveTarget(null)} onMove={moveNode} />
    <EditorDialog value={editor} language={config.language} onConfig={onConfig} onClose={() => setEditor(null)} onSaved={refresh} onError={notify} />
    <SupportDialog open={supportOpen} language={config.language} onClose={() => setSupportOpen(false)} />
    {toast && <div className="toast" role="status" aria-live="polite"><Check weight="bold" /><span>{toast}</span>{undoAction && <button type="button" onClick={async () => { const undo = undoAction; setUndoAction(null); await undo(); }}>{t("common.undo")}</button>}</div>}
  </div>;
}
