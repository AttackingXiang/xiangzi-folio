import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type MouseEvent } from "react";
import {
  ArrowsClockwise, BookmarkSimple, Browsers, CaretDown, Check, DownloadSimple, Export,
  Eye, EyeSlash, FolderPlus, GearSix, Image, Layout, LinkSimple, MagnifyingGlass, Moon, PaintBrush,
  PencilSimple, Rows, SlidersHorizontal, Sparkle, SquaresFour, Star, Sun, UploadSimple, X, TerminalWindow, Planet, Cpu,
} from "@phosphor-icons/react";
import { RiOpenaiFill } from "react-icons/ri";
import { SiAnthropic, SiBilibili, SiGooglegemini, SiYoutube } from "react-icons/si";
import { BookmarkContextMenu, MoveDialog, type MenuState } from "./components/BookmarkMenus";
import { EditorDialog } from "./components/EditorDialog";
import { FolderView, ResizeHandle } from "./components/FolderView";
import { useBookmarks } from "./hooks/useBookmarks";
import { allFolders, bookmarks, exportBookmarksHtml, getRootFolders, importBundle, importHtml, parsePresentationTitle, setBookmarkPresentationTitle, setFolderPresentationTitle } from "./lib/bookmarks";
import { createBundle, defaultConfig, downloadText, loadConfig, saveConfig } from "./lib/config";
import type { AppConfig, BookmarkNode, ContextTarget, EditMode, EditorValue, ExportBundle, SearchEngine, ThemeMode } from "./types";

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

function SettingsPanel({ config, onConfig, onClose }: { config: AppConfig; onConfig: (recipe: (value: AppConfig) => AppConfig) => void; onClose: () => void }) {
  const imageInput = useRef<HTMLInputElement>(null);
  const pickBackground = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => onConfig((value) => ({ ...value, backgroundImage: String(reader.result || "") })); reader.readAsDataURL(file);
  };
  return <aside className="settings-panel">
    <header><div><small>外观与体验</small><h2>主页设置</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>
    <section><h3><PaintBrush />主题</h3><div className="segmented segmented--cards">{([
      { id: "glass", label: "毛玻璃", icon: Sparkle }, { id: "paper", label: "纸感", icon: Sun }, { id: "night", label: "深色", icon: Moon },
      { id: "terminal", label: "终端极光", icon: TerminalWindow }, { id: "orbital", label: "轨道工坊", icon: Planet }, { id: "circuit", label: "电路工作室", icon: Cpu },
    ] as { id: ThemeMode; label: string; icon: typeof Sparkle }[]).map(({ id, label, icon: Icon }) => <button key={id} className={config.theme === id ? "active" : ""} onClick={() => onConfig((value) => ({ ...value, theme: id }))}><Icon /><span>{label}</span>{config.theme === id && <Check weight="bold" />}</button>)}</div></section>
    <section><div className="setting-row"><div><h3><Image />背景图</h3><p>支持 JPG / PNG / WebP，本地保存</p></div><button className="button button--soft" onClick={() => imageInput.current?.click()}><UploadSimple />选择图片</button><input ref={imageInput} hidden type="file" accept="image/*" onChange={pickBackground} /></div>{config.backgroundImage && <div className="background-preview" style={{ backgroundImage: `url(${config.backgroundImage})` }}><button onClick={() => onConfig((value) => ({ ...value, backgroundImage: "" }))}>移除</button></div>}</section>
    <section><label className="range-label"><span><strong>玻璃模糊</strong><small>{config.glassStrength}px</small></span><input type="range" min="0" max="36" value={config.glassStrength} onChange={(event) => onConfig((value) => ({ ...value, glassStrength: Number(event.target.value) }))} /></label><label className="range-label"><span><strong>背景遮罩</strong><small>{config.backgroundShade}%</small></span><input type="range" min="0" max="75" value={config.backgroundShade} onChange={(event) => onConfig((value) => ({ ...value, backgroundShade: Number(event.target.value) }))} /></label></section>
    <section><h3><Rows />内容密度</h3><div className="segmented"><button className={config.density === "comfortable" ? "active" : ""} onClick={() => onConfig((value) => ({ ...value, density: "comfortable" }))}>舒适</button><button className={config.density === "compact" ? "active" : ""} onClick={() => onConfig((value) => ({ ...value, density: "compact" }))}>紧凑</button></div></section>
    <section><h3>强调色</h3><div className="color-row">{["#ff6b57", "#6558f5", "#2b9d78", "#e89f32", "#e6538e"].map((color) => <button key={color} aria-label={color} className={config.accent === color ? "active" : ""} style={{ backgroundColor: color }} onClick={() => onConfig((value) => ({ ...value, accent: color }))} />)}</div></section>
    <p className="settings-note">所有外观配置只保存在本机，不会污染书签内容。导出配置后可在其他浏览器恢复。</p>
  </aside>;
}

export function App() {
  const { tree, loading, error, refresh, native } = useBookmarks();
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [configReady, setConfigReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>("layout");
  const [settings, setSettings] = useState(false);
  const [editor, setEditor] = useState<EditorValue | null>(null);
  const [query, setQuery] = useState("");
  const [engineMenu, setEngineMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<MenuState | null>(null);
  const [moveTarget, setMoveTarget] = useState<BookmarkNode | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const markerMigration = useRef(false);
  const quickSeed = useRef(false);

  useEffect(() => { loadConfig().then((value) => { setConfig(value); setConfigReady(true); }); }, []);
  useEffect(() => { if (configReady) saveConfig(config); }, [config, configReady]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2400); return () => clearTimeout(timer); }, [toast]);

  const roots = useMemo(() => getRootFolders(tree), [tree]);
  useEffect(() => {
    if (!configReady || config.markerStorageVersion >= 1 || markerMigration.current || roots.length === 0) return;
    markerMigration.current = true;
    const migrate = async () => {
      let changed = false;
      try {
        for (const folder of allFolders(roots)) {
          const style = config.folderStyles[folder.id];
          const width = config.folderWidths[folder.id];
          const collapsed = config.collapsed.includes(folder.id);
          if (!style && !width && !collapsed) continue;
          const title = setFolderPresentationTitle(folder.title, { style, width, collapsed });
          if (title !== folder.title) { await bookmarks.update(folder.id, { title }); changed = true; }
        }
        setConfig((value) => ({ ...value, markerStorageVersion: 1 }));
        if (changed) { await refresh(); setToast("现有布局样式已迁移到 Chrome 文件夹名称"); }
      } catch (reason) {
        markerMigration.current = false;
        setToast(reason instanceof Error ? reason.message : "样式标识迁移失败");
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
        for (const item of quickLinks) if (!existing.has(item.url.replace(/\/$/, ""))) await bookmarks.create({ parentId: folder.id, title: setBookmarkPresentationTitle(item.title, { style: "tile", width: 2 }), url: item.url });
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

  const onConfig = (recipe: (value: AppConfig) => AppConfig) => setConfig((value) => recipe(value));
  const search = (event: FormEvent) => {
    event.preventDefault(); const value = query.trim(); if (!value) return;
    window.location.href = isLikelyUrl(value) ? (/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`) : `${engines[config.searchEngine].action}${encodeURIComponent(value)}`;
  };
  const exportConfig = () => downloadText(`xiangzi-folio-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(createBundle(config, tree), null, 2), "application/json");
  const exportHtml = () => downloadText(`chrome-bookmarks-${new Date().toISOString().slice(0, 10)}.html`, exportBookmarksHtml(tree), "text/html");
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !activeRoot) return;
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".html") || text.includes("NETSCAPE-Bookmark-file")) await importHtml(text, activeRoot.id);
      else {
        const bundle = JSON.parse(text) as ExportBundle;
        if (bundle.kind !== "xiangzi-folio" && bundle.kind !== "folio-bookmarks") throw new Error("不是有效的 Xiangzi Folio 配置文件");
        const idMap = bundle.bookmarkTree?.length ? await importBundle(bundle, activeRoot.id) : {};
        const remapRecord = <T,>(record: Record<string, T>) => Object.fromEntries(Object.entries(record || {}).map(([id, value]) => [idMap[id] || id, value]));
        setConfig({
          ...defaultConfig,
          ...bundle.config,
          folderStyles: remapRecord(bundle.config.folderStyles),
          folderWidths: remapRecord(bundle.config.folderWidths),
          folderOrder: (bundle.config.folderOrder || []).map((id) => idMap[id] || id),
          collapsed: (bundle.config.collapsed || []).map((id) => idMap[id] || id),
        });
      }
      await refresh(); setToast("导入完成，书签已写入浏览器");
    } catch (reason) { setToast(reason instanceof Error ? reason.message : "导入失败"); }
    event.target.value = "";
  };
  const toggleAll = async () => {
    const ids = blocks.flatMap((block) => [block.id]);
    const allClosed = blocks.every((block) => parsePresentationTitle(block.title).collapsed ?? config.collapsed.includes(block.id));
    onConfig((value) => ({ ...value, collapsed: allClosed ? value.collapsed.filter((id) => !ids.includes(id)) : [...new Set([...value.collapsed, ...ids])] }));
    await Promise.all(blocks.filter((block) => !block.id.startsWith("direct-")).map((block) => bookmarks.update(block.id, {
      title: setFolderPresentationTitle(block.title, { collapsed: !allClosed }),
    })));
    await refresh();
  };
  const moveBlock = (event: DragEvent, targetId: string) => {
    event.preventDefault(); if (!draggedBlock || draggedBlock === targetId) return;
    const ids = blocks.map((block) => block.id).filter((id) => id !== draggedBlock);
    ids.splice(ids.indexOf(targetId), 0, draggedBlock);
    onConfig((value) => ({ ...value, folderOrder: ids })); setDraggedBlock(null); setToast("页面排版已更新");
  };
  const commitBlockWidth = async (block: BookmarkNode, width: number) => {
    onConfig((value) => ({ ...value, folderWidths: { ...value.folderWidths, [block.id]: width } }));
    if (block.id.startsWith("direct-")) return;
    const parsed = parsePresentationTitle(block.title);
    const markedStyle = ["directory", "icons", "mixed", "dock", "stack", "focus", "columns"].includes(parsed.marker || "") ? parsed.marker as AppConfig["folderStyles"][string] : undefined;
    await bookmarks.update(block.id, { title: setFolderPresentationTitle(block.title, { width, style: markedStyle || config.folderStyles[block.id] }) });
    await refresh(); setToast("组件宽度已写入 Chrome 文件夹名称");
  };
  const resetLayout = async () => {
    onConfig((value) => ({ ...value, folderOrder: [], folderWidths: {}, collapsed: [] }));
    const blockIds = new Set(blocks.map((block) => block.id));
    for (const folder of allFolders(roots)) {
      const parsed = parsePresentationTitle(folder.title);
      if (parsed.collapsed || (blockIds.has(folder.id) && parsed.width)) await bookmarks.update(folder.id, { title: setFolderPresentationTitle(folder.title, { collapsed: false, ...(blockIds.has(folder.id) ? { width: null } : {}) }) });
    }
    await refresh(); setToast("布局宽度已重置，名称标识同步更新");
  };
  const addFolder = async () => {
    if (!activeRoot) return;
    const created = await bookmarks.create({ parentId: activeRoot.id, title: setFolderPresentationTitle("新组件", { style: "mixed", width: 6 }) });
    onConfig((value) => ({ ...value, folderStyles: { ...value.folderStyles, [created.id]: "mixed" }, folderWidths: { ...value.folderWidths, [created.id]: 6 } }));
    await refresh(); setEditor({ id: created.id, parentId: activeRoot.id, type: "folder", title: "新组件", url: "" });
  };
  const openContextMenu = (event: MouseEvent<HTMLElement>, target: ContextTarget) => {
    event.preventDefault(); event.stopPropagation();
    setContextMenu({ ...target, x: event.clientX, y: event.clientY });
  };
  const editContextNode = (node: BookmarkNode, parentId: string) => {
    const parsed = parsePresentationTitle(node.title);
    const bookmarkStyle = ["tile", "featured", "dock", "compact"].includes(parsed.marker || "") ? parsed.marker as EditorValue["style"] : "row";
    const folderStyle = ["directory", "icons", "mixed", "dock", "stack", "focus", "columns"].includes(parsed.marker || "") ? parsed.marker as AppConfig["folderStyles"][string] : undefined;
    setEditor({ id: node.id, parentId, type: node.url ? "bookmark" : "folder", title: parsed.title, url: node.url || "", ...(node.url ? { style: bookmarkStyle, width: parsed.width || 12, rows: parsed.rows || 1 } : { folderStyle, width: parsed.width, collapsed: parsed.collapsed }) });
  };
  const moveContextNode = async (parentId: string) => {
    if (!moveTarget) return;
    await bookmarks.move(moveTarget.id, { parentId });
    await refresh(); setToast(`“${moveTarget.title}”已移动，Chrome 书签同步完成`);
  };
  const appStyle = { "--accent": config.accent, "--glass-blur": `${config.glassStrength}px`, "--shade": `${config.backgroundShade / 100}` } as React.CSSProperties;

  return <div className="app" data-theme={config.theme} data-density={config.density} style={appStyle}>
    <div className={`app-background ${config.backgroundImage ? "has-image" : ""}`} style={config.backgroundImage ? { backgroundImage: `url(${config.backgroundImage})` } : undefined} />
    <header className="topbar glass-surface">
      <a className="brand" href="#top" aria-label="Xiangzi Folio 首页"><span className="brand__mark"><BookmarkSimple weight="fill" /></span><span><strong>Xiangzi</strong><small>FOLIO</small></span></a>
      <form className="search" onSubmit={search}>
        <div className="engine-picker"><button type="button" onClick={() => setEngineMenu(!engineMenu)}><Browsers weight="duotone" /><span>{engines[config.searchEngine].label}</span><CaretDown /></button>{engineMenu && <div className="engine-menu">{(Object.keys(engines) as SearchEngine[]).map((id) => <button type="button" key={id} className={config.searchEngine === id ? "active" : ""} onClick={() => { onConfig((value) => ({ ...value, searchEngine: id })); setEngineMenu(false); }}>{engines[id].label}<small>{engines[id].host}</small></button>)}</div>}</div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`使用 ${engines[config.searchEngine].label} 搜索，或输入网址`} aria-label="浏览器搜索" />
        <button className="search__submit" aria-label="搜索"><MagnifyingGlass weight="bold" /></button>
      </form>
      <div className="topbar__actions"><span className={`sync-status ${native ? "is-native" : ""}`} title={native ? "正在使用 Chrome 原生书签" : "普通网页演示模式"}><ArrowsClockwise weight="bold" />{native ? "Chrome 已连接" : "演示数据"}</span>{!editing && <button className="button edit-entry" aria-label="编辑主页" title="编辑主页" onClick={() => setEditing(true)}><PencilSimple /><span className="sr-only">编辑主页</span></button>}{editing && <button className="button button--primary" onClick={() => { setEditing(false); setSettings(false); }}><Check weight="bold" />完成</button>}</div>
    </header>

    {editing && <div className="editbar glass-surface">
      <div className="editbar__mode"><span>编辑模式</span><div className="segmented"><button className={editMode === "layout" ? "active" : ""} onClick={() => setEditMode("layout")}><Layout />页面排版</button><button className={editMode === "bookmarks" ? "active" : ""} onClick={() => setEditMode("bookmarks")}><BookmarkSimple />整理书签</button></div></div>
      <div className="editbar__tools"><button onClick={addFolder}><FolderPlus />新建组件</button><button onClick={() => activeRoot && setEditor({ parentId: activeRoot.id, type: "bookmark", title: "", url: "" })}><LinkSimple />新建书签</button><button className={config.showSecondaryRoots ? "active" : ""} onClick={() => onConfig((value) => ({ ...value, showSecondaryRoots: !value.showSecondaryRoots }))}>{config.showSecondaryRoots ? <EyeSlash /> : <Eye />}{config.showSecondaryRoots ? "隐藏其他书签" : "显示其他书签"}</button><button onClick={() => fileInput.current?.click()}><UploadSimple />导入</button><button onClick={exportConfig}><DownloadSimple />备份</button><button onClick={exportHtml}><Export />HTML</button><button onClick={() => setSettings(!settings)} className={settings ? "active" : ""}><GearSix />外观</button><input ref={fileInput} hidden type="file" accept=".json,.html,text/html,application/json" onChange={importFile} /></div>
      {editMode === "layout" && <div className="editbar__hint"><SquaresFour />拖动卡片排序 · 拖右下角调整宽度<button onClick={resetLayout}>重置排版</button></div>}
    </div>}

    <main id="top" className="content" onContextMenu={(event) => activeRoot && openContextMenu(event, { kind: "root", parentId: activeRoot.id })}>
      {quickItems.length > 0 && <section className="quick-access" aria-label="常用入口">
        <header><div><Star weight="fill" /><span>常用入口</span><small>每天都要用的 5 个网站</small></div><button onClick={toggleAll}><SlidersHorizontal />全部展开 / 收起</button></header>
        <div className="quick-access__grid">{quickItems.map((item) => <a key={`${item.title}-${item.url}`} href={item.url} style={{ "--quick-color": item.color } as React.CSSProperties}><span className="quick-access__icon">{item.icon ? <item.icon aria-hidden="true" /> : <img src={quickFavicon(item.url)} alt="" />}</span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span></a>)}</div>
      </section>}
      {error && <div className="error-banner">{error}<button onClick={refresh}>重新读取</button></div>}
      {!loading && blocks.length === 0 && <div className="empty-state glass-surface"><BookmarkSimple weight="duotone" /><h2>这里还没有书签</h2><p>进入编辑模式，新建文件夹或导入 Chrome 书签 HTML。</p><button className="button button--primary" onClick={() => setEditing(true)}>开始整理</button></div>}
      <div className={`bookmark-grid ${editing && editMode === "layout" ? "is-layout-editing" : ""}`}>
        {editing && editMode === "layout" && <div className="grid-guide" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span key={index} />)}</div>}
        {blocks.map((block) => {
          const parsedBlock = parsePresentationTitle(block.title);
          const blockStyle = (["directory", "icons", "mixed", "dock", "stack", "focus", "columns"] as const).includes(parsedBlock.marker as "directory") ? parsedBlock.marker : config.folderStyles[block.id] || "directory";
          const width = Math.max(3, Math.min(12, parsedBlock.width || config.folderWidths[block.id] || (blockStyle === "directory" ? 4 : blocks.length <= 2 ? 6 : 4)));
          return <MasonryArticle key={block.id} width={width} className={`block-wrap ${draggedBlock === block.id ? "is-dragging" : ""}`} draggable={editing && editMode === "layout"} onDragStart={(event) => { setDraggedBlock(block.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDraggedBlock(null)} onDragOver={(event) => editing && editMode === "layout" && event.preventDefault()} onDrop={(event) => moveBlock(event, block.id)}>
            {editing && editMode === "layout" && <div className="block-toolbar"><span className="drag-label"><SquaresFour />拖动</span><div className="width-presets">{widthPresets.map((preset) => <button key={preset.value} className={width === preset.value ? "active" : ""} title={`${preset.label} · ${preset.value}/12`} onClick={() => commitBlockWidth(block, preset.value)}>{preset.label}</button>)}</div></div>}
            <FolderView node={block} block pageSpan={width} config={config} editing={editing} editMode={editMode} onConfig={onConfig} onEdit={setEditor} onRefresh={refresh} onToast={setToast} onContextMenu={openContextMenu} />
            {editing && editMode === "layout" && <ResizeHandle width={width} onWidth={(next) => onConfig((value) => ({ ...value, folderWidths: { ...value.folderWidths, [block.id]: next } }))} onCommit={(next) => commitBlockWidth(block, next)} />}
          </MasonryArticle>;
        })}
      </div>
      <footer className="page-footer"><span><BookmarkSimple weight="fill" />Xiangzi Folio</span><p>本地优先 · Chrome 书签双向同步 · 配置可导出</p></footer>
    </main>
    {settings && editing && <><button className="settings-scrim" aria-label="关闭设置" onClick={() => setSettings(false)} /><SettingsPanel config={config} onConfig={onConfig} onClose={() => setSettings(false)} /></>}
    <BookmarkContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onNewFolder={(parentId) => setEditor({ parentId, type: "folder", title: "", url: "" })} onNewBookmark={(parentId) => setEditor({ parentId, type: "bookmark", title: "", url: "" })} onMove={setMoveTarget} onEdit={editContextNode} />
    <MoveDialog node={moveTarget} roots={roots} onClose={() => setMoveTarget(null)} onMove={moveContextNode} />
    <EditorDialog value={editor} onClose={() => setEditor(null)} onSaved={refresh} />
    {toast && <div className="toast"><Check weight="bold" />{toast}</div>}
  </div>;
}
