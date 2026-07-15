import type { AppConfig, BookmarkNode, ExportBundle } from "../types";
import { themePresetById } from "./themes";

export const CONFIG_KEY = "xiangzi-folio.config.v1";
export const CACHE_KEY = "xiangzi-folio.bookmarks.cache.v1";
const LEGACY_CONFIG_KEY = "folio.config.v1";
const LEGACY_CACHE_KEY = "folio.bookmarks.cache.v1";

export const defaultConfig: AppConfig = {
  version: 3,
  theme: "orbital",
  density: "comfortable",
  glassStrength: 20,
  backgroundImage: "",
  backgroundShade: 10,
  searchEngine: "google",
  collapsed: [],
  folderStyles: { "direct-all": "directory" },
  folderWidths: { "direct-all": 4 },
  bookmarkStyles: {},
  bookmarkWidths: {},
  bookmarkRows: {},
  folderOrder: [],
  accent: "#8fb9ee",
  markerStorageVersion: 3,
  quickLinksSeeded: false,
  showSecondaryRoots: false,
  recentClickToFront: false,
  brandName: "Xiangzi",
  brandTagline: "FOLIO",
  brandLogo: "",
};

// The browser preview intentionally mirrors the bundled demo tree. These IDs
// never become defaults for the installed extension, where Chrome assigns IDs.
const demoConfig: AppConfig = {
  ...defaultConfig,
  folderStyles: { ...defaultConfig.folderStyles, "110": "directory", "120": "directory", "130": "directory", "140": "directory" },
  folderWidths: { ...defaultConfig.folderWidths, "110": 4, "120": 4, "130": 4, "140": 4 },
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
  const base = hasChromeStorage() ? defaultConfig : demoConfig;
  const migratedVisuals = value && value.version !== 3 ? {
    accent: value.accent === "#ff6b57" ? defaultConfig.accent : value.accent ?? defaultConfig.accent,
    glassStrength: value.glassStrength === 18 ? defaultConfig.glassStrength : value.glassStrength ?? defaultConfig.glassStrength,
    backgroundShade: !value.backgroundImage ? defaultConfig.backgroundShade : value.backgroundShade ?? defaultConfig.backgroundShade,
  } : {};
  return {
    ...base,
    ...value,
    ...migratedVisuals,
    theme: value?.theme && value.theme in themePresetById ? value.theme : base.theme,
    version: 3,
    markerStorageVersion: value ? value.markerStorageVersion ?? 0 : 3,
    folderStyles: { ...base.folderStyles, ...value?.folderStyles },
    folderWidths: { ...base.folderWidths, ...value?.folderWidths },
    bookmarkStyles: { ...base.bookmarkStyles, ...value?.bookmarkStyles },
    bookmarkWidths: { ...base.bookmarkWidths, ...value?.bookmarkWidths },
    bookmarkRows: { ...base.bookmarkRows, ...value?.bookmarkRows },
  };
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
