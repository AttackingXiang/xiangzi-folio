import type { AppConfig, BookmarkNode, ExportBundle } from "../types";

export const CONFIG_KEY = "xiangzi-folio.config.v1";
export const CACHE_KEY = "xiangzi-folio.bookmarks.cache.v1";
const LEGACY_CONFIG_KEY = "folio.config.v1";
const LEGACY_CACHE_KEY = "folio.bookmarks.cache.v1";

export const defaultConfig: AppConfig = {
  version: 3,
  theme: "glass",
  density: "comfortable",
  glassStrength: 20,
  backgroundImage: "",
  backgroundShade: 0,
  searchEngine: "google",
  collapsed: [],
  folderStyles: { "direct-all": "icons", "direct-1": "directory", "110": "mixed", "120": "directory", "130": "focus", "140": "dock" },
  folderWidths: { "direct-all": 12, "direct-1": 4, "110": 8, "120": 6, "130": 6, "140": 12 },
  folderOrder: [],
  accent: "#6558f5",
  markerStorageVersion: 1,
  quickLinksSeeded: false,
  showSecondaryRoots: false,
};

const hasChromeStorage = () => typeof chrome !== "undefined" && !!chrome.storage?.local;

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
  const migratedVisuals = value && value.version !== 3 ? {
    accent: value.accent === "#ff6b57" ? defaultConfig.accent : value.accent ?? defaultConfig.accent,
    glassStrength: value.glassStrength === 18 ? defaultConfig.glassStrength : value.glassStrength ?? defaultConfig.glassStrength,
    backgroundShade: !value.backgroundImage ? defaultConfig.backgroundShade : value.backgroundShade ?? defaultConfig.backgroundShade,
  } : {};
  return { ...defaultConfig, ...value, ...migratedVisuals, version: 3, markerStorageVersion: value ? value.markerStorageVersion ?? 0 : 1, folderStyles: { ...defaultConfig.folderStyles, ...value?.folderStyles }, folderWidths: { ...defaultConfig.folderWidths, ...value?.folderWidths } };
}

export const saveConfig = (config: AppConfig) => writeLocal(CONFIG_KEY, config);
export const loadCache = async () => await readLocal<BookmarkNode[]>(CACHE_KEY) || await readLocal<BookmarkNode[]>(LEGACY_CACHE_KEY);
export const saveCache = (tree: BookmarkNode[]) => writeLocal(CACHE_KEY, tree);

export function createBundle(config: AppConfig, tree: BookmarkNode[]): ExportBundle {
  return { kind: "xiangzi-folio", exportedAt: new Date().toISOString(), config, bookmarkTree: tree };
}

export function downloadText(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
