export type BookmarkNode = {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  dateAdded?: number;
  children?: BookmarkNode[];
  // UI-only count for the virtual direct-bookmark block. Native Chrome nodes
  // never carry this field and it is not persisted.
  virtualParentChildCount?: number;
};

export type FolderStyle = "directory" | "icons" | "mixed" | "dock" | "stack" | "focus" | "columns" | "cards";
export type BookmarkStyle = "row" | "tile" | "featured" | "dock" | "compact";
export type ThemeMode =
  | "glass" | "paper" | "night" | "terminal" | "orbital" | "circuit"
  | "dusk" | "nordic" | "sakura" | "forest" | "ocean" | "desert"
  | "ink" | "graphite" | "clarity";
export type Density = "comfortable" | "compact";
export type SearchEngine = "google" | "bing" | "baidu" | "duckduckgo";
export type Language = "auto" | "zh-CN" | "en";

export type AppConfig = {
  version: 1 | 2 | 3;
  theme: ThemeMode;
  density: Density;
  glassStrength: number;
  backgroundImage: string;
  backgroundShade: number;
  showFolderBackground: boolean;
  showFolderBorder: boolean;
  searchEngine: SearchEngine;
  collapsed: string[];
  folderStyles: Record<string, FolderStyle>;
  folderWidths: Record<string, number>;
  folderTransparent: Record<string, boolean>;
  folderBorderless: Record<string, boolean>;
  bookmarkStyles: Record<string, BookmarkStyle>;
  bookmarkWidths: Record<string, number>;
  bookmarkRows: Record<string, 1 | 2>;
  folderOrder: string[];
  accent: string;
  markerStorageVersion: number;
  quickLinksSeeded: boolean;
  showSecondaryRoots: boolean;
  recentClickToFront: boolean;
  brandName: string;
  brandTagline: string;
  brandLogo: string;
  language: Language;
};

export type ExportBundle = {
  kind: "xiangzi-folio" | "folio-bookmarks";
  exportedAt: string;
  config: AppConfig;
  bookmarkTree: BookmarkNode[];
};

export type EditorValue = {
  id?: string;
  parentId?: string;
  type: "bookmark" | "folder";
  title: string;
  url: string;
  style?: BookmarkStyle;
  width?: number;
  rows?: 1 | 2;
  folderStyle?: FolderStyle;
  collapsed?: boolean;
  transparent?: boolean;
  borderless?: boolean;
  pinned?: boolean;
  // True when this bookmark renders inside a quick-access/cards grid, where
  // width is a 10-column span capped well below "full row" — the editor
  // shows a differently-labeled width picker there instead of FolderView's
  // 12-column "整行/1/2/1/3" vocabulary, which would misrepresent it.
  cardsContext?: boolean;
};
