import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import {
  ArrowsClockwise, BookmarkSimple, Browsers, CaretDown, Check, DownloadSimple, Export,
  Eye, EyeSlash, FolderPlus, GearSix, LinkSimple, MagnifyingGlass,
  PencilSimple, SlidersHorizontal, SquaresFour, Star, UploadSimple, X,
} from "@phosphor-icons/react";
import { RiOpenaiFill } from "react-icons/ri";
import { SiAnthropic, SiBilibili, SiGooglegemini, SiYoutube } from "react-icons/si";
import { MoveDialog } from "./components/BookmarkMenus";
import { EditorDialog } from "./components/EditorDialog";
import { FolderView, ResizeHandle } from "./components/FolderView";
import { SettingsPanel } from "./components/SettingsPanel";
import { useBookmarks } from "./hooks/useBookmarks";
import { allFolders, bookmarks, exportBookmarksHtml, getRootFolders, importBundle, importHtml, parsePresentationTitle, restoreBookmarkBranch, setBookmarkPresentationTitle, setFolderPresentationTitle } from "./lib/bookmarks";
import { createBundle, defaultConfig, downloadText, loadConfig, saveConfig } from "./lib/config";
import { prepareLocalImage } from "./lib/images";
import type { AppConfig, BookmarkNode, BookmarkStyle, EditorValue, ExportBundle, FolderStyle, SearchEngine } from "./types";

const engines: Record<SearchEngine, { label: string; action: string; host: string }> = {
  google: { label: "Google", action: "https://www.google.com/search?q=", host: "google.com" },
  bing: { label: "Bing", action: "https://www.bing.com/search?q=", host: "bing.com" },
  baidu: { label: "百度", action: "https://www.baidu.com/s?wd=", host: "baidu.com" },
  duckduckgo: { label: "DuckDuckGo", action: "https://duckduckgo.com/?q=", host: "duckduckgo.com" },
};

const widthPresets = [{ value: 12, label: "整行" }, { value: 9, label: "3/4" }, { value: 8, label: "2/3" }, { value: 6, label: "一半" }, { value: 4, label: "1/3" }, { value: 3, label: "1/4" }];

function flattenBlocks(roots: BookmarkNode[]): BookmarkNode[] {
  const links = roots.flatMap((root) => (root.children || []).filter((item) => item.url));
  const direct = links.length ? { id: "direct-all", parentId: roots[0]?.id, title: "快捷书签", children: links } : null;
  return [...(direct ? [direct] : []), ...roots.flatMap((root) => (root.children || []).filter((item) => !item.url && parsePresentationTitle(item.title).title !== "常用入口"))];
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

const quickFolderTitle = "常用入口";

function quickFavicon(url: string) {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=64`);
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=128`;
}

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
  const markerMigration = useRef(false);
  const quickSeed = useRef(false);

  useEffect(() => {
    loadConfig().then((value) => { setConfig(value); setConfigReady(true); }).catch((reason) => {
      setConfigReady(true);
      setToast(reason instanceof Error ? reason.message : "读取外观配置失败");
    });
  }, []);
  useEffect(() => {
    if (!configReady) return;
    const timer = setTimeout(() => saveConfig(config).catch((reason) => setToast(reason instanceof Error ? reason.message : "保存外观配置失败")), 300);
    return () => clearTimeout(timer);
  }, [config, configReady]);
  useEffect(() => {
    if (!engineMenu) return;
    const close = (event: PointerEvent) => {
      if (!enginePicker.current?.contains(event.target as Node)) setEngineMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
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
        if (migrated) { await refresh(); setToast(`已将 ${migrated} 项展示设置写入 Chrome 书签`); }
      } catch (reason) {
        markerMigration.current = false;
        setToast(reason instanceof Error ? reason.message : "展示设置迁移失败");
      }
    };
    migrate();
  }, [config, configReady, refresh, roots]);
  const activeRoot = roots[0];
  const quickFolder = useMemo(() => allFolders(roots).find((folder) => parsePresentationTitle(folder.title).title === quickFolderTitle), [roots]);
  useEffect(() => {
    if (!native || !configReady || config.quickLinksSeeded || quickSeed.current || !activeRoot) return;
    quickSeed.current = true;
    const seed = async () => {
      try {
        let folder = quickFolder;
        if (!folder) folder = await bookmarks.create({ parentId: activeRoot.id, title: quickFolderTitle });
        const existing = new Set((folder.children || []).map((node) => node.url?.replace(/\/$/, "")));
        for (const item of quickLinks) if (!existing.has(item.url.replace(/\/$/, ""))) await bookmarks.create({ parentId: folder.id, title: item.title, url: item.url });
        setConfig((value) => ({ ...value, quickLinksSeeded: true }));
        await refresh(); setToast("常用入口已写入 Chrome 书签");
      } catch (reason) {
        quickSeed.current = false;
        setToast(reason instanceof Error ? reason.message : "常用入口创建失败");
      }
    };
    seed();
  }, [activeRoot, config.quickLinksSeeded, configReady, native, quickFolder, refresh]);
  const quickItems = useMemo(() => {
    if (!native) return quickLinks;
    return (quickFolder?.children || []).filter((node) => node.url).map((node) => {
      const seed = quickLinks.find((item) => item.url.replace(/\/$/, "") === node.url?.replace(/\/$/, ""));
      return { title: parsePresentationTitle(node.title).title, subtitle: seed?.subtitle || new URL(node.url!).hostname.replace(/^www\./, ""), url: node.url!, color: seed?.color || "#6558f5", icon: seed?.icon };
    });
  }, [native, quickFolder]);
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
      if (file.size > 20 * 1024 * 1024) throw new Error("导入文件不能超过 20MB");
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".html") || text.includes("NETSCAPE-Bookmark-file")) await importHtml(text, activeRoot.id);
      else {
        const bundle = JSON.parse(text) as ExportBundle;
        if (bundle.kind !== "xiangzi-folio" && bundle.kind !== "folio-bookmarks") throw new Error("不是有效的 Xiangzi Folio 配置文件");
        if (!bundle.config || typeof bundle.config !== "object") throw new Error("备份缺少有效的配置数据");
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
      await refresh(); notify("导入完成，书签已写入浏览器");
    } catch (reason) { notify(reason instanceof Error ? reason.message : "导入失败"); }
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
    notify(allClosed ? "已展开全部组件" : "已收起全部组件");
  };
  const moveBlock = (event: DragEvent, targetId: string) => {
    event.preventDefault(); if (!draggedBlock || draggedBlock === targetId) return;
    const ids = blocks.map((block) => block.id).filter((id) => id !== draggedBlock);
    ids.splice(ids.indexOf(targetId), 0, draggedBlock);
    onConfig((value) => ({ ...value, folderOrder: ids })); setDraggedBlock(null); notify("页面排版已更新");
  };
  const commitBlockWidth = async (block: BookmarkNode, width: number) => {
    onConfig((value) => ({ ...value, folderWidths: { ...value.folderWidths, [block.id]: width } }));
    if (!block.id.startsWith("direct-")) {
      const parsed = parsePresentationTitle(block.title);
      const style = (["directory", "icons", "mixed", "dock", "stack", "focus", "columns"] as const).includes(parsed.marker as FolderStyle) ? parsed.marker as FolderStyle : config.folderStyles[block.id] || "directory";
      await bookmarks.update(block.id, { title: setFolderPresentationTitle(block.title, { style, width, collapsed: parsed.marker ? !!parsed.collapsed : config.collapsed.includes(block.id) }) });
      await refresh();
    }
    notify("组件宽度已同步到 Chrome 书签");
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
    notify("布局已重置", async () => {
      onConfig((value) => ({ ...value, ...previous }));
      await Promise.all(previousTitles.map(({ id, title }) => bookmarks.update(id, { title })));
      await refresh();
      notify("已恢复重置前的布局");
    });
  };
  const addFolder = () => {
    if (!activeRoot) return;
    setEditor({ parentId: activeRoot.id, type: "folder", title: "", url: "", folderStyle: "mixed", width: 6 });
  };
  const moveNode = async (parentId: string) => {
    if (!moveTarget) return;
    try {
      await bookmarks.move(moveTarget.id, { parentId });
      await refresh(); notify(`“${parsePresentationTitle(moveTarget.title).title}”已移动，Chrome 书签同步完成`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "移动失败");
    }
  };
  const deleteNode = async (node: BookmarkNode, parentId: string, index: number) => {
    const title = parsePresentationTitle(node.title).title;
    if (!confirm(`删除“${title}”及其中的全部书签？删除后可在提示消失前撤销。`)) return;
    try {
      await bookmarks.remove(node.id, true);
      await refresh();
      notify(`“${title}”已删除`, async () => {
        const idMap = await restoreBookmarkBranch(parentId, node, index);
        setConfig((value) => remapConfigIds(value, idMap));
        await refresh(); notify(`已恢复“${title}”`);
      });
    } catch (reason) { notify(reason instanceof Error ? reason.message : "删除失败"); }
  };
  const pickBrandLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const brandLogo = await prepareLocalImage(file, { maxWidth: 256, maxHeight: 256, maxBytes: 512 * 1024 });
      onConfig((value) => ({ ...value, brandLogo }));
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Logo 处理失败"); }
    event.target.value = "";
  };
  const moveRecentBookmarkToFront = async (node: BookmarkNode, parent: BookmarkNode, index: number) => {
    if (!config.recentClickToFront || index < 5) return;
    try { await bookmarks.move(node.id, { parentId: parent.id, index: 0 }); } catch { /* keep opening the link if reordering fails */ }
  };
  const appStyle = { "--user-accent": config.accent, "--glass-blur": `${config.glassStrength}px`, "--shade": `${config.backgroundShade / 100}` } as React.CSSProperties;

  return <div className="app" data-theme={config.theme} data-density={config.density} style={appStyle}>
    <div className={`app-background ${config.backgroundImage ? "has-image" : ""}`} style={config.backgroundImage ? { backgroundImage: `url(${config.backgroundImage})` } : undefined} />
    <header className="topbar glass-surface">
      <div className={`brand ${editing ? "brand--editing" : ""}`}>
        {editing ? <button className="brand__mark" type="button" aria-label="替换 Logo" onClick={() => brandLogoInput.current?.click()}>{config.brandLogo ? <img src={config.brandLogo} alt="" /> : <BookmarkSimple weight="fill" />}</button> : <span className="brand__mark" aria-hidden="true">{config.brandLogo ? <img src={config.brandLogo} alt="" /> : <BookmarkSimple weight="fill" />}</span>}
        <span className="brand__copy">{editing ? <><input aria-label="品牌名称" value={config.brandName} onChange={(event) => onConfig((value) => ({ ...value, brandName: event.target.value }))} placeholder="品牌名称" /><input aria-label="品牌副标题" value={config.brandTagline} onChange={(event) => onConfig((value) => ({ ...value, brandTagline: event.target.value }))} placeholder="副标题" /></> : <><strong>{config.brandName}</strong><small>{config.brandTagline}</small></>}</span>
        {editing && <span className="brand__tools"><button type="button" className="icon-button" title="替换 Logo" aria-label="替换 Logo" onClick={() => brandLogoInput.current?.click()}><UploadSimple /></button><button type="button" className="icon-button danger" title="删除 Logo" aria-label="删除 Logo" onClick={() => onConfig((value) => ({ ...value, brandLogo: "" }))}><X /></button><input ref={brandLogoInput} hidden type="file" accept="image/*" onChange={pickBrandLogo} /></span>}
      </div>
      <form className="search" onSubmit={search}>
        <div ref={enginePicker} className="engine-picker"><button type="button" aria-label={`选择搜索引擎，当前 ${engines[config.searchEngine].label}`} aria-expanded={engineMenu} onClick={() => setEngineMenu(!engineMenu)}><Browsers weight="duotone" /><span>{engines[config.searchEngine].label}</span><CaretDown /></button>{engineMenu && <div className="engine-menu" role="listbox" aria-label="搜索引擎">{(Object.keys(engines) as SearchEngine[]).map((id) => <button type="button" role="option" aria-selected={config.searchEngine === id} key={id} className={config.searchEngine === id ? "active" : ""} onClick={() => { onConfig((value) => ({ ...value, searchEngine: id })); setEngineMenu(false); }}>{engines[id].label}<small>{engines[id].host}</small></button>)}</div>}</div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`使用 ${engines[config.searchEngine].label} 搜索，或输入网址`} aria-label="浏览器搜索" />
        <button className="search__submit" aria-label="搜索"><MagnifyingGlass weight="bold" /></button>
      </form>
      <div className="topbar__actions">{editing && <span className={`sync-status ${native ? "is-native" : ""}`} title={native ? "正在使用 Chrome 原生书签" : "普通网页演示模式"}><ArrowsClockwise weight="bold" />{native ? "Chrome 已连接" : "演示数据"}</span>}{!editing && <button className="icon-button edit-entry" aria-label="编辑主页" title="编辑主页" onClick={() => setEditing(true)}><PencilSimple /><span className="sr-only">编辑主页</span></button>}{editing && <button className="button button--primary" onClick={() => { setEditing(false); setSettings(false); }}><Check weight="bold" />完成</button>}</div>
    </header>

    {editing && <div className="editbar glass-surface">
      <div className="editbar__mode"><span>编辑主页</span><small>布局和书签管理已合并</small></div>
      <div className="editbar__tools"><button onClick={addFolder}><FolderPlus />新建组件</button><button onClick={() => activeRoot && setEditor({ parentId: activeRoot.id, type: "bookmark", title: "", url: "", style: "row", width: 4 })}><LinkSimple />新建书签</button><button className={config.showSecondaryRoots ? "active" : ""} onClick={() => onConfig((value) => ({ ...value, showSecondaryRoots: !value.showSecondaryRoots }))}>{config.showSecondaryRoots ? <EyeSlash /> : <Eye />}{config.showSecondaryRoots ? "隐藏其他书签" : "显示其他书签"}</button><button onClick={() => fileInput.current?.click()}><UploadSimple />导入</button><button onClick={exportConfig}><DownloadSimple />备份</button><button onClick={exportHtml}><Export />HTML</button><button onClick={() => setSettings(!settings)} className={settings ? "active" : ""}><GearSix />外观</button><input ref={fileInput} hidden type="file" accept=".json,.html,text/html,application/json" onChange={importFile} /></div>
      <div className="editbar__hint"><SquaresFour />拖动卡片排序 · 拖右下角调整宽度 · 卡片上可编辑或移动<button onClick={resetLayout}>重置排版</button></div>
    </div>}

    <main id="top" className="content">
      {quickItems.length > 0 && <section className="quick-access" aria-label="常用入口">
        <header><div><Star weight="fill" /><span>常用入口</span></div><button onClick={toggleAll}><SlidersHorizontal />全部展开 / 收起</button></header>
        <div className="quick-access__grid">{quickItems.map((item) => <a key={`${item.title}-${item.url}`} href={item.url} style={{ "--quick-color": item.color } as React.CSSProperties}><span className="quick-access__icon">{item.icon ? <item.icon aria-hidden="true" /> : <img src={quickFavicon(item.url)} alt="" />}</span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span></a>)}</div>
      </section>}
      {error && <div className="error-banner">{error}<button onClick={refresh}>重新读取</button></div>}
      {!loading && blocks.length === 0 && <div className="empty-state glass-surface"><BookmarkSimple weight="duotone" /><h2>这里还没有书签</h2><p>进入编辑模式，新建文件夹或导入 Chrome 书签 HTML。</p><button className="button button--primary" onClick={() => setEditing(true)}>开始整理</button></div>}
      <div className={`bookmark-grid ${editing ? "is-layout-editing" : ""}`}>
        {editing && <div className="grid-guide" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span key={index} />)}</div>}
        {blocks.map((block) => {
          const parsedBlock = parsePresentationTitle(block.title);
          const titleStyle = (["directory", "icons", "mixed", "dock", "stack", "focus", "columns"] as const).includes(parsedBlock.marker as FolderStyle) ? parsedBlock.marker as FolderStyle : undefined;
          const blockStyle = config.markerStorageVersion >= 3 ? titleStyle || config.folderStyles[block.id] || "directory" : config.folderStyles[block.id] || titleStyle || "directory";
          const configuredWidth = config.markerStorageVersion >= 3 ? parsedBlock.width || config.folderWidths[block.id] : config.folderWidths[block.id] || parsedBlock.width;
          const width = Math.max(3, Math.min(12, configuredWidth || (blockStyle === "directory" ? 4 : blocks.length <= 2 ? 6 : 4)));
          const selected = editing && selectedBlock === block.id;
          return <MasonryArticle key={block.id} width={width} tabIndex={editing ? 0 : undefined} aria-label={editing ? `选择并调整 ${parsedBlock.title}` : undefined} className={`block-wrap ${selected ? "is-selected" : ""} ${draggedBlock === block.id ? "is-dragging" : ""}`} draggable={editing} onClick={() => editing && setSelectedBlock(block.id)} onFocus={() => editing && setSelectedBlock(block.id)} onDragStart={(event) => { setSelectedBlock(block.id); setDraggedBlock(block.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDraggedBlock(null)} onDragOver={(event) => editing && event.preventDefault()} onDrop={(event) => moveBlock(event, block.id)}>
            {selected ? <div className="block-toolbar"><span className="drag-label"><SquaresFour />拖动</span><div className="width-presets">{widthPresets.map((preset) => <button type="button" key={preset.value} className={width === preset.value ? "active" : ""} title={`${preset.label} · ${preset.value}/12`} onClick={(event) => { event.stopPropagation(); commitBlockWidth(block, preset.value); }}>{preset.label}</button>)}</div></div> : editing && <button type="button" className="block-select" onClick={() => setSelectedBlock(block.id)}>选择后调整</button>}
            <FolderView node={block} block pageSpan={width} config={config} editing={editing} onConfig={onConfig} onEdit={setEditor} onRefresh={refresh} onToast={notify} onDelete={deleteNode} onMove={(node) => setMoveTarget(node)} onNewFolder={(parentId) => setEditor({ parentId, type: "folder", title: "", url: "", folderStyle: "directory", width: 4 })} onNewBookmark={(parentId) => setEditor({ parentId, type: "bookmark", title: "", url: "", style: "row", width: 4 })} onRecentClick={moveRecentBookmarkToFront} />
            {selected && <ResizeHandle width={width} onWidth={(next) => onConfig((value) => ({ ...value, folderWidths: { ...value.folderWidths, [block.id]: next } }))} onCommit={(next) => commitBlockWidth(block, next)} />}
          </MasonryArticle>;
        })}
      </div>
      <footer className="page-footer"><span><BookmarkSimple weight="fill" />Xiangzi Folio</span><p>本地优先 · Chrome 书签双向同步 · 配置可导出</p></footer>
    </main>
    {settings && editing && <><button className="settings-scrim" aria-label="关闭设置" onClick={() => setSettings(false)} /><SettingsPanel config={config} onConfig={onConfig} onClose={() => setSettings(false)} onError={notify} /></>}
    <MoveDialog node={moveTarget} roots={roots} onClose={() => setMoveTarget(null)} onMove={moveNode} />
    <EditorDialog value={editor} onConfig={onConfig} onClose={() => setEditor(null)} onSaved={refresh} onError={notify} />
    {toast && <div className="toast" role="status" aria-live="polite"><Check weight="bold" /><span>{toast}</span>{undoAction && <button type="button" onClick={async () => { const undo = undoAction; setUndoAction(null); await undo(); }}>撤销</button>}</div>}
  </div>;
}
