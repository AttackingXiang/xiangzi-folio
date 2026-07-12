import { demoTree } from "../data/demo";
import type { BookmarkNode, BookmarkStyle, ExportBundle, FolderStyle } from "../types";

export type CreateInput = { parentId?: string; index?: number; title: string; url?: string };
export type MoveInput = { parentId?: string; index?: number };

export interface BookmarkRepository {
  readonly native: boolean;
  getTree(): Promise<BookmarkNode[]>;
  create(input: CreateInput): Promise<BookmarkNode>;
  update(id: string, changes: { title?: string; url?: string }): Promise<BookmarkNode>;
  move(id: string, destination: MoveInput): Promise<BookmarkNode>;
  remove(id: string, recursive?: boolean): Promise<void>;
  subscribe(listener: () => void): () => void;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nativeAvailable = () => typeof chrome !== "undefined" && !!chrome.bookmarks;

class ChromeBookmarkRepository implements BookmarkRepository {
  readonly native = true;
  async getTree() { return await chrome.bookmarks.getTree() as BookmarkNode[]; }
  async create(input: CreateInput) { return await chrome.bookmarks.create(input) as BookmarkNode; }
  async update(id: string, changes: { title?: string; url?: string }) { return await chrome.bookmarks.update(id, changes) as BookmarkNode; }
  async move(id: string, destination: MoveInput) { return await chrome.bookmarks.move(id, destination) as BookmarkNode; }
  async remove(id: string, recursive = false) {
    if (recursive) await chrome.bookmarks.removeTree(id);
    else await chrome.bookmarks.remove(id);
  }
  subscribe(listener: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const notify = () => { clearTimeout(timer); timer = setTimeout(listener, 60); };
    const events = [chrome.bookmarks.onCreated, chrome.bookmarks.onRemoved, chrome.bookmarks.onChanged, chrome.bookmarks.onMoved, chrome.bookmarks.onChildrenReordered, chrome.bookmarks.onImportEnded];
    events.forEach((event) => event.addListener(notify));
    return () => events.forEach((event) => event.removeListener(notify));
  }
}

const MOCK_KEY = "folio.mock.bookmarks.v1";

function findNode(nodes: BookmarkNode[], id: string): BookmarkNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = node.children && findNode(node.children, id);
    if (found) return found;
  }
}

function findParent(nodes: BookmarkNode[], id: string): BookmarkNode | undefined {
  for (const node of nodes) {
    if (node.children?.some((child) => child.id === id)) return node;
    const found = node.children && findParent(node.children, id);
    if (found) return found;
  }
}

class LocalBookmarkRepository implements BookmarkRepository {
  readonly native = false;
  private listeners = new Set<() => void>();
  private tree: BookmarkNode[];
  constructor() {
    try { this.tree = JSON.parse(localStorage.getItem(MOCK_KEY) || "null") || clone(demoTree); }
    catch { this.tree = clone(demoTree); }
  }
  private commit() {
    localStorage.setItem(MOCK_KEY, JSON.stringify(this.tree));
    this.listeners.forEach((listener) => listener());
  }
  async getTree() { return clone(this.tree); }
  async create(input: CreateInput) {
    const parent = findNode(this.tree, input.parentId || "1") || findNode(this.tree, "1")!;
    parent.children ||= [];
    const node: BookmarkNode = { id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, parentId: parent.id, title: input.title, ...(input.url ? { url: input.url } : { children: [] }) };
    parent.children.splice(input.index ?? parent.children.length, 0, node);
    this.commit(); return clone(node);
  }
  async update(id: string, changes: { title?: string; url?: string }) {
    const node = findNode(this.tree, id); if (!node) throw new Error("书签不存在");
    if (changes.title !== undefined) node.title = changes.title;
    if (changes.url !== undefined) node.url = changes.url;
    this.commit(); return clone(node);
  }
  async move(id: string, destination: MoveInput) {
    const node = findNode(this.tree, id); const oldParent = findParent(this.tree, id);
    const nextParent = findNode(this.tree, destination.parentId || oldParent?.id || "1");
    if (!node || !oldParent || !nextParent || node.id === nextParent.id) throw new Error("无法移动这个项目");
    if (node.children && findNode(node.children, nextParent.id)) throw new Error("不能移动到自己的子文件夹");
    oldParent.children = oldParent.children?.filter((item) => item.id !== id);
    nextParent.children ||= [];
    nextParent.children.splice(destination.index ?? nextParent.children.length, 0, node);
    node.parentId = nextParent.id; this.commit(); return clone(node);
  }
  async remove(id: string) {
    const parent = findParent(this.tree, id); if (!parent) throw new Error("无法删除根目录");
    parent.children = parent.children?.filter((item) => item.id !== id); this.commit();
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}

export const bookmarks: BookmarkRepository = nativeAvailable() ? new ChromeBookmarkRepository() : new LocalBookmarkRepository();

export function getRootFolders(tree: BookmarkNode[]): BookmarkNode[] {
  return tree[0]?.children || tree;
}

export function countLinks(node: BookmarkNode): number {
  if (node.url) return 1;
  return (node.children || []).reduce((total, child) => total + countLinks(child), 0);
}

export function collectLinks(node: BookmarkNode): BookmarkNode[] {
  return node.url ? [node] : (node.children || []).flatMap(collectLinks);
}

export function allFolders(nodes: BookmarkNode[]): BookmarkNode[] {
  return nodes.flatMap((node) => node.url ? [] : [node, ...allFolders(node.children || [])]);
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export type PresentationMarker = FolderStyle | "featured" | "tile" | "compact";
export type PresentationWidth = 2 | 3 | 4 | 6 | 8 | 9 | 12 | 16;
const markerPattern = /\s*\[(?:folio:)?(directory|icons|mixed|dock|stack|focus|columns|featured|tile|compact|w3|w4|w6|w8|w9|w12|closed)\]\s*/gi;
const folderStyles = new Set<FolderStyle>(["directory", "icons", "mixed", "dock", "stack", "focus", "columns"]);
const validWidths = new Set<number>([3, 4, 6, 8, 9, 12]);
const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const compactMarkerPattern = /\s*~x([AB][A-Za-z0-9_-])\s*$/;
const bookmarkMarkerPattern = /\s*~b([AB][A-Za-z0-9_-])\s*$/;
const styleCodes: Array<FolderStyle | undefined> = [undefined, "directory", "icons", "mixed", "dock", "stack", "focus", "columns"];
const widthCodes: Array<PresentationWidth | undefined> = [undefined, 3, 4, 6, 8, 9, 12];
const bookmarkStyleCodes: Array<Exclude<BookmarkStyle, "row"> | undefined> = [undefined, "tile", "featured", "dock", "compact"];
const bookmarkWidthCodes: Array<PresentationWidth | undefined> = [undefined, 3, 4, 6, 8, 12, 2, 16];

function decodeCompactMarker(value: string) {
  const match = value.match(compactMarkerPattern);
  if (!match) return {};
  const high = base64Alphabet.indexOf(match[1][0]);
  const low = base64Alphabet.indexOf(match[1][1]);
  if (high < 0 || low < 0) return {};
  const code = (high << 6) | low;
  if (((code >> 3) & 7) > 6) return {};
  return {
    marker: styleCodes[code & 7],
    width: widthCodes[(code >> 3) & 7],
    collapsed: !!(code & 64),
  };
}

function encodeCompactMarker(style?: FolderStyle, width?: PresentationWidth, collapsed = false) {
  const code = styleCodes.indexOf(style) | (widthCodes.indexOf(width) << 3) | (collapsed ? 64 : 0);
  if (!code) return "";
  return `~x${base64Alphabet[(code >> 6) & 63]}${base64Alphabet[code & 63]}`;
}

function decodeBookmarkMarker(value: string) {
  const match = value.match(bookmarkMarkerPattern);
  if (!match) return {};
  const high = base64Alphabet.indexOf(match[1][0]);
  const low = base64Alphabet.indexOf(match[1][1]);
  const code = (high << 6) | low;
  const style = bookmarkStyleCodes[code & 7];
  const width = bookmarkWidthCodes[(code >> 3) & 7];
  if (high < 0 || low < 0 || (code & 7) > 4 || ((code >> 3) & 7) > 7) return {};
  return { marker: style, width, rows: (code & 64) ? 2 as const : 1 as const };
}

function encodeBookmarkMarker(style?: BookmarkStyle, width?: PresentationWidth, rows: 1 | 2 = 1) {
  const normalizedStyle = style === "row" ? undefined : style;
  const code = bookmarkStyleCodes.indexOf(normalizedStyle) | (bookmarkWidthCodes.indexOf(width) << 3) | (rows === 2 ? 64 : 0);
  if (!code) return "";
  return `~b${base64Alphabet[(code >> 6) & 63]}${base64Alphabet[code & 63]}`;
}

export function parsePresentationTitle(value: string): { title: string; marker?: PresentationMarker; width?: PresentationWidth; collapsed?: boolean; rows?: 1 | 2 } {
  const compact = decodeCompactMarker(value);
  const bookmarkCompact = decodeBookmarkMarker(value);
  const hasCompact = !!(compact.marker || compact.width || compact.collapsed);
  const hasBookmarkCompact = !!(bookmarkCompact.marker || bookmarkCompact.width || bookmarkCompact.rows === 2);
  const tokens = Array.from(value.matchAll(markerPattern), (match) => match[1].toLowerCase());
  if (tokens.length === 0 && !hasCompact && !hasBookmarkCompact) return { title: value };
  const legacyMarker = tokens.find((token) => !token.startsWith("w") && token !== "closed") as PresentationMarker | undefined;
  const marker = compact.marker || bookmarkCompact.marker || legacyMarker;
  const widthValue = Number(tokens.find((token) => token.startsWith("w"))?.slice(1));
  const width = compact.width || bookmarkCompact.width || (validWidths.has(widthValue) ? widthValue as PresentationWidth : undefined);
  const title = value.replace(markerPattern, " ").replace(hasCompact ? compactMarkerPattern : /$^/, "").replace(hasBookmarkCompact ? bookmarkMarkerPattern : /$^/, "").replace(/\s+/g, " ").trim() || "未命名";
  const collapsed = compact.collapsed || tokens.includes("closed");
  return { title, ...(marker ? { marker } : {}), ...(width ? { width } : {}), ...(collapsed ? { collapsed: true } : {}), ...(bookmarkCompact.rows === 2 ? { rows: 2 as const } : {}) };
}

export function setFolderPresentationTitle(value: string, changes: { style?: FolderStyle | null; width?: number | null; collapsed?: boolean | null }): string {
  const parsed = parsePresentationTitle(value);
  const currentStyle = parsed.marker && folderStyles.has(parsed.marker as FolderStyle) ? parsed.marker as FolderStyle : undefined;
  const style = changes.style === undefined ? currentStyle : changes.style || undefined;
  const requestedWidth = changes.width === undefined ? parsed.width : changes.width;
  const width = requestedWidth && validWidths.has(requestedWidth) ? requestedWidth as PresentationWidth : undefined;
  const collapsed = changes.collapsed === undefined ? parsed.collapsed : !!changes.collapsed;
  const marker = encodeCompactMarker(style, width, collapsed);
  return `${parsed.title}${marker ? ` ${marker}` : ""}`;
}

export function setBookmarkPresentationTitle(value: string, changes: { style?: BookmarkStyle | null; width?: number | null; rows?: 1 | 2 }): string {
  const parsed = parsePresentationTitle(value);
  const currentStyle = (["tile", "featured", "dock", "compact"] as const).includes(parsed.marker as "tile") ? parsed.marker as BookmarkStyle : undefined;
  const style = changes.style === undefined ? currentStyle : changes.style || undefined;
  const requestedWidth = changes.width === undefined ? parsed.width : changes.width;
  const width = requestedWidth && bookmarkWidthCodes.includes(requestedWidth as PresentationWidth) ? requestedWidth as PresentationWidth : undefined;
  const marker = encodeBookmarkMarker(style, width, changes.rows ?? parsed.rows ?? 1);
  return `${parsed.title}${marker ? ` ${marker}` : ""}`;
}

async function createBranch(parentId: string, nodes: BookmarkNode[], idMap: Record<string, string>): Promise<void> {
  for (const node of nodes) {
    const created = await bookmarks.create({ parentId, title: node.title || "未命名", ...(node.url ? { url: normalizeUrl(node.url) } : {}) });
    idMap[node.id] = created.id;
    if (!node.url && node.children?.length) await createBranch(created.id, node.children, idMap);
  }
}

export async function importBundle(bundle: ExportBundle, targetParentId: string): Promise<Record<string, string>> {
  const container = await bookmarks.create({ parentId: targetParentId, title: `Xiangzi Folio 导入 · ${new Date().toLocaleDateString("zh-CN")}` });
  const roots = bundle.bookmarkTree[0]?.children || bundle.bookmarkTree;
  const idMap: Record<string, string> = {};
  await createBranch(container.id, roots.flatMap((root) => root.children || []), idMap);
  return idMap;
}

type HtmlLink = { title: string; url: string };
type HtmlFolder = { title: string; children: Array<HtmlFolder | HtmlLink> };

export function parseBookmarksHtml(html: string): Array<HtmlFolder | HtmlLink> {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const parseList = (list: Element): HtmlFolder["children"] => {
    const result: HtmlFolder["children"] = [];
    Array.from(list.children).forEach((child) => {
      if (child.tagName !== "DT") return;
      const anchor = child.querySelector(":scope > A");
      const heading = child.querySelector(":scope > H3");
      if (anchor) result.push({ title: anchor.textContent?.trim() || "未命名", url: anchor.getAttribute("href") || "" });
      else if (heading) {
        const next = child.nextElementSibling?.tagName === "DL" ? child.nextElementSibling : child.querySelector(":scope > DL");
        result.push({ title: heading.textContent?.trim() || "未命名文件夹", children: next ? parseList(next) : [] });
      }
    });
    return result;
  };
  const first = documentNode.querySelector("DL");
  return first ? parseList(first) : [];
}

export async function importHtml(html: string, targetParentId: string): Promise<void> {
  const parsed = parseBookmarksHtml(html);
  const container = await bookmarks.create({ parentId: targetParentId, title: `HTML 导入 · ${new Date().toLocaleDateString("zh-CN")}` });
  await createBranch(container.id, parsed as BookmarkNode[], {});
}

const escapeHtml = (value: string) => value.replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char]!);
function nodeToHtml(node: BookmarkNode, depth: number): string {
  const pad = "    ".repeat(depth);
  if (node.url) return `${pad}<DT><A HREF="${escapeHtml(node.url)}">${escapeHtml(node.title)}</A>\n`;
  const children = (node.children || []).map((child) => nodeToHtml(child, depth + 1)).join("");
  return `${pad}<DT><H3>${escapeHtml(node.title)}</H3>\n${pad}<DL><p>\n${children}${pad}</DL><p>\n`;
}

export function exportBookmarksHtml(tree: BookmarkNode[]): string {
  const roots = tree[0]?.children || tree;
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${roots.map((node) => nodeToHtml(node, 1)).join("")}</DL><p>\n`;
}
