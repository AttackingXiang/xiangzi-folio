import type {
  AppConfig, BookmarkNode, BookmarkStyle, Density, ExportBundle, FolderStyle, Language, SearchEngine, ThemeMode,
} from "../types";
import { themePresetById } from "./themes";

export const CONFIG_KEY = "xiangzi-folio.config.v1";
export const CACHE_KEY = "xiangzi-folio.bookmarks.cache.v1";
const LEGACY_CONFIG_KEY = "folio.config.v1";
const LEGACY_CACHE_KEY = "folio.bookmarks.cache.v1";
const folderStyleValues = new Set<FolderStyle>(["directory", "icons", "mixed", "dock", "stack", "focus", "columns"]);
const bookmarkStyleValues = new Set<BookmarkStyle>(["row", "tile", "featured", "dock", "compact"]);
const densityValues = new Set<Density>(["comfortable", "compact"]);
const searchEngineValues = new Set<SearchEngine>(["google", "bing", "baidu", "duckduckgo"]);
const languageValues = new Set<Language>(["auto", "zh-CN", "en"]);
const folderWidthValues = new Set([3, 4, 6, 8, 9, 12]);
const bookmarkWidthValues = new Set([1.5, 2, 3, 4, 6, 8, 12, 16]);
const maxBackgroundLength = 3 * 1024 * 1024;
const maxLogoLength = 768 * 1024;
const maxImportedNodes = 100_000;
const maxImportedDepth = 64;

export const defaultConfig: AppConfig = {
  version: 3,
  theme: "nordic",
  density: "comfortable",
  glassStrength: 14,
  backgroundImage: "",
  backgroundShade: 0,
  searchEngine: "google",
  collapsed: [],
  folderStyles: { "direct-all": "directory" },
  folderWidths: { "direct-all": 4 },
  bookmarkStyles: {},
  bookmarkWidths: {},
  bookmarkRows: {},
  folderOrder: [],
  accent: "#5e88a5",
  markerStorageVersion: 3,
  quickLinksSeeded: false,
  showSecondaryRoots: false,
  recentClickToFront: true,
  brandName: "Xiangzi",
  brandTagline: "FOLIO",
  brandLogo: "",
  language: "auto",
};

// The browser preview intentionally mirrors the bundled demo tree. These IDs
// never become defaults for the installed extension, where Chrome assigns IDs.
const demoConfig: AppConfig = {
  ...defaultConfig,
  folderStyles: { ...defaultConfig.folderStyles, "110": "directory", "120": "directory", "130": "directory", "140": "directory" },
  folderWidths: { ...defaultConfig.folderWidths, "110": 4, "120": 4, "130": 4, "140": 4 },
};

const hasChromeStorage = () => typeof chrome !== "undefined" && !!chrome.storage?.local;

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const clamp = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const safeBoolean = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
const safeText = (value: unknown, fallback: string, maxLength: number) => typeof value === "string" ? value.slice(0, maxLength) : fallback;
const safeLocalImage = (value: unknown, fallback: string, maxLength: number) => typeof value === "string" && value.length <= maxLength && (value === "" || value.startsWith("data:image/")) ? value : fallback;

function safeStringList(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

function safeRecord<T>(value: unknown, accepts: (entry: unknown) => entry is T): Record<string, T> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, entry]) => id.length > 0 && accepts(entry))) as Record<string, T>;
}

export function sanitizeConfig(value: unknown, base: AppConfig = defaultConfig, markerFallback = base.markerStorageVersion): AppConfig {
  const raw = isRecord(value) ? value : {};
  const safeMarkerFallback = Number.isInteger(markerFallback) && markerFallback >= 0 && markerFallback <= 3 ? markerFallback : base.markerStorageVersion;
  const theme = typeof raw.theme === "string" && raw.theme in themePresetById ? raw.theme as ThemeMode : base.theme;
  const folderStyles = safeRecord(raw.folderStyles, (entry): entry is FolderStyle => typeof entry === "string" && folderStyleValues.has(entry as FolderStyle));
  const folderWidths = safeRecord(raw.folderWidths, (entry): entry is number => typeof entry === "number" && folderWidthValues.has(entry));
  const bookmarkStyles = safeRecord(raw.bookmarkStyles, (entry): entry is BookmarkStyle => typeof entry === "string" && bookmarkStyleValues.has(entry as BookmarkStyle));
  const bookmarkWidths = safeRecord(raw.bookmarkWidths, (entry): entry is number => typeof entry === "number" && bookmarkWidthValues.has(entry));
  const bookmarkRows = safeRecord(raw.bookmarkRows, (entry): entry is 1 | 2 => entry === 1 || entry === 2);
  const markerStorageVersion = typeof raw.markerStorageVersion === "number" && Number.isInteger(raw.markerStorageVersion) && raw.markerStorageVersion >= 0 && raw.markerStorageVersion <= 3
    ? raw.markerStorageVersion
    : safeMarkerFallback;
  return {
    version: 3,
    theme,
    density: typeof raw.density === "string" && densityValues.has(raw.density as Density) ? raw.density as Density : base.density,
    glassStrength: clamp(raw.glassStrength, base.glassStrength, 0, 36),
    backgroundImage: safeLocalImage(raw.backgroundImage, base.backgroundImage, maxBackgroundLength),
    backgroundShade: clamp(raw.backgroundShade, base.backgroundShade, 0, 75),
    searchEngine: typeof raw.searchEngine === "string" && searchEngineValues.has(raw.searchEngine as SearchEngine) ? raw.searchEngine as SearchEngine : base.searchEngine,
    collapsed: safeStringList(raw.collapsed, base.collapsed),
    folderStyles: { ...base.folderStyles, ...folderStyles },
    folderWidths: { ...base.folderWidths, ...folderWidths },
    bookmarkStyles: { ...base.bookmarkStyles, ...bookmarkStyles },
    bookmarkWidths: { ...base.bookmarkWidths, ...bookmarkWidths },
    bookmarkRows: { ...base.bookmarkRows, ...bookmarkRows },
    folderOrder: safeStringList(raw.folderOrder, base.folderOrder),
    accent: typeof raw.accent === "string" && /^#[\da-f]{6}$/i.test(raw.accent) ? raw.accent : base.accent,
    markerStorageVersion,
    quickLinksSeeded: safeBoolean(raw.quickLinksSeeded, base.quickLinksSeeded),
    showSecondaryRoots: safeBoolean(raw.showSecondaryRoots, base.showSecondaryRoots),
    recentClickToFront: safeBoolean(raw.recentClickToFront, base.recentClickToFront),
    brandName: safeText(raw.brandName, base.brandName, 80),
    brandTagline: safeText(raw.brandTagline, base.brandTagline, 80),
    brandLogo: safeLocalImage(raw.brandLogo, base.brandLogo, maxLogoLength),
    language: typeof raw.language === "string" && languageValues.has(raw.language as Language) ? raw.language as Language : base.language,
  };
}

export async function readLocal<T>(key: string): Promise<T | undefined> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : undefined;
  } catch { return undefined; }
}

export async function writeLocal<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) await chrome.storage.local.set({ [key]: value });
  else localStorage.setItem(key, JSON.stringify(value));
}

export async function loadConfig(): Promise<AppConfig> {
  const value = await readLocal<Partial<AppConfig>>(CONFIG_KEY) || await readLocal<Partial<AppConfig>>(LEGACY_CONFIG_KEY);
  const base = hasChromeStorage() ? defaultConfig : demoConfig;
  const migratedVisuals = value && value.version !== 3 ? {
    accent: value.accent === "#ff6b57" ? defaultConfig.accent : value.accent ?? defaultConfig.accent,
    glassStrength: value.glassStrength === 18 ? defaultConfig.glassStrength : value.glassStrength ?? defaultConfig.glassStrength,
    backgroundShade: !value.backgroundImage ? defaultConfig.backgroundShade : value.backgroundShade ?? defaultConfig.backgroundShade,
  } : {};
  return sanitizeConfig({ ...base, ...value, ...migratedVisuals }, base, value ? value.markerStorageVersion ?? 0 : 3);
}

export const saveConfig = (config: AppConfig) => writeLocal(CONFIG_KEY, config);
export const loadCache = async () => await readLocal<BookmarkNode[]>(CACHE_KEY) || await readLocal<BookmarkNode[]>(LEGACY_CACHE_KEY);
export const saveCache = (tree: BookmarkNode[]) => writeLocal(CACHE_KEY, tree);

export function createBundle(config: AppConfig, tree: BookmarkNode[]): ExportBundle {
  return { kind: "xiangzi-folio", exportedAt: new Date().toISOString(), config, bookmarkTree: tree };
}

export function parseBundle(value: unknown): ExportBundle {
  if (!isRecord(value) || (value.kind !== "xiangzi-folio" && value.kind !== "folio-bookmarks")) throw new Error("不是有效的 Xiangzi Folio 配置文件");
  if (!Array.isArray(value.bookmarkTree) || value.bookmarkTree.length === 0) throw new Error("备份中没有可导入的书签");
  const seenIds = new Set<string>();
  let nodeCount = 0;
  const parseNodes = (nodes: unknown[], depth: number): BookmarkNode[] => {
    if (depth > maxImportedDepth) throw new Error(`备份目录层级不能超过 ${maxImportedDepth} 层`);
    return nodes.map((entry) => {
      if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id || typeof entry.title !== "string") throw new Error("备份包含无效的书签节点");
      if (seenIds.has(entry.id)) throw new Error("备份包含重复的书签 ID");
      seenIds.add(entry.id);
      nodeCount += 1;
      if (nodeCount > maxImportedNodes) throw new Error(`备份最多支持 ${maxImportedNodes} 个节点`);
      if (entry.url !== undefined && typeof entry.url !== "string") throw new Error("备份包含无效的网址");
      if (entry.children !== undefined && !Array.isArray(entry.children)) throw new Error("备份包含无效的文件夹内容");
      const isBookmark = typeof entry.url === "string" && entry.url.length > 0;
      const isFolder = Array.isArray(entry.children);
      if (isBookmark === isFolder) throw new Error("备份节点必须是书签或文件夹，不能同时属于两者");
      return {
        id: entry.id,
        ...(typeof entry.parentId === "string" ? { parentId: entry.parentId } : {}),
        ...(typeof entry.index === "number" && Number.isInteger(entry.index) && entry.index >= 0 ? { index: entry.index } : {}),
        title: entry.title.slice(0, 10_000),
        ...(isBookmark ? { url: (entry.url as string).slice(0, 100_000) } : {}),
        ...(Array.isArray(entry.children) ? { children: parseNodes(entry.children, depth + 1) } : {}),
      };
    });
  };
  return {
    kind: value.kind,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : new Date(0).toISOString(),
    config: sanitizeConfig(value.config, defaultConfig, 3),
    bookmarkTree: parseNodes(value.bookmarkTree, 0),
  };
}

export function downloadText(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
