export type BookmarkNode = {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  dateAdded?: number;
  children?: BookmarkNode[];
};

export type FolderStyle = "directory" | "icons" | "mixed" | "dock" | "stack" | "focus" | "columns";
export type BookmarkStyle = "row" | "tile" | "featured" | "dock" | "compact";
export type ThemeMode = "glass" | "paper" | "night" | "terminal" | "orbital" | "circuit";
export type Density = "comfortable" | "compact";
export type EditMode = "layout" | "bookmarks";

export type SearchEngine = "google" | "bing" | "baidu" | "duckduckgo";

export type AppConfig = {
  version: 1 | 2 | 3;
  theme: ThemeMode;
  density: Density;
  glassStrength: number;
  backgroundImage: string;
  backgroundShade: number;
  searchEngine: SearchEngine;
  collapsed: string[];
  folderStyles: Record<string, FolderStyle>;
  folderWidths: Record<string, number>;
  folderOrder: string[];
  accent: string;
  markerStorageVersion: number;
  quickLinksSeeded: boolean;
  showSecondaryRoots: boolean;
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
};

export type ContextTarget = {
  kind: "root" | "folder" | "bookmark";
  parentId: string;
  node?: BookmarkNode;
};
