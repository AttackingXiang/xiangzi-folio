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

export type PresentationMarker = FolderStyle | BookmarkStyle;
export type PresentationWidth = 1.5 | 2 | 3 | 4 | 6 | 8 | 9 | 12 | 16;
const markerPattern = /\s*\[(?:folio:)?(directory|icons|mixed|dock|stack|focus|columns|featured|tile|compact|w1\.5|w3|w4|w6|w8|w9|w12|closed)\]\s*/gi;
const validWidths = new Set<number>([3, 4, 6, 8, 9, 12]);
const validBookmarkWidths = new Set<number>([1.5, 2, 3, 4, 6, 8, 12, 16]);
const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const shortMarkerPattern = /\s*~([A-Za-z0-9_-]{2})\s*$/;
const compactMarkerPattern = /\s*~x([AB][A-Za-z0-9_-])\s*$/;
const bookmarkMarkerPattern = /\s*~b([AB][A-Za-z0-9_-])\s*$/;
const styleCodes: Array<FolderStyle | undefined> = [undefined, "directory", "icons", "mixed", "dock", "stack", "focus", "columns"];
const widthCodes: Array<PresentationWidth | undefined> = [undefined, 3, 4, 6, 8, 9, 12];
const bookmarkStyleCodes: Array<Exclude<BookmarkStyle, "row"> | undefined> = [undefined, "tile", "featured", "dock", "compact"];
const bookmarkWidthCodes: Array<PresentationWidth | undefined> = [undefined, 3, 4, 6, 8, 12, 2, 16];
const shortFolderStyles: FolderStyle[] = ["directory", "icons", "mixed", "dock", "stack", "focus", "columns"];
const shortFolderWidths: Array<PresentationWidth | undefined> = [undefined, 3, 4, 6, 8, 9, 12];
const shortBookmarkStyles: BookmarkStyle[] = ["row", "tile", "featured", "dock", "compact"];
const shortBookmarkWidths: Array<PresentationWidth | undefined> = [undefined, 1.5, 2, 3, 4, 6, 8, 12, 16];
const shortMarkerVersion = 1;

export type FolderRole = "quick-access";
type ShortPresentation = { kind: "folder" | "bookmark"; marker?: PresentationMarker; width?: PresentationWidth; collapsed?: boolean; rows?: 1 | 2; role?: FolderRole };
const quickAccessPayload = shortFolderStyles.length * shortFolderWidths.length * 2;

function shortChecksum(payload: number, type: number, version: number) {
  return (payload ^ (payload >> 2) ^ (payload >> 5) ^ (type * 3) ^ version) & 3;
}

function encodeShortMarker(payload: number, kind: "folder" | "bookmark") {
  const type = kind === "bookmark" ? 1 : 0;
  const checksum = shortChecksum(payload, type, shortMarkerVersion);
  const word = payload | (type << 7) | (shortMarkerVersion << 8) | (checksum << 10);
  return `~${base64Alphabet[(word >> 6) & 63]}${base64Alphabet[word & 63]}`;
}

function decodeShortMarker(value: string): ShortPresentation | undefined {
  const match = value.match(shortMarkerPattern);
  if (!match) return undefined;
  const high = base64Alphabet.indexOf(match[1][0]);
  const low = base64Alphabet.indexOf(match[1][1]);
  if (high < 0 || low < 0) return undefined;
  const word = (high << 6) | low;
  const payload = word & 127;
  const type = (word >> 7) & 1;
  const version = (word >> 8) & 3;
  const checksum = (word >> 10) & 3;
  if (version !== shortMarkerVersion || checksum !== shortChecksum(payload, type, version)) return undefined;
  if (type === 0) {
    if (payload === quickAccessPayload) return { kind: "folder", role: "quick-access" };
    if (payload >= shortFolderStyles.length * shortFolderWidths.length * 2) return undefined;
    const styleIndex = payload % shortFolderStyles.length;
    const remainder = Math.floor(payload / shortFolderStyles.length);
    const widthIndex = remainder % shortFolderWidths.length;
    const collapsed = Math.floor(remainder / shortFolderWidths.length) === 1;
    return { kind: "folder", marker: shortFolderStyles[styleIndex], width: shortFolderWidths[widthIndex], ...(collapsed ? { collapsed: true } : {}) };
  }
  if (payload >= shortBookmarkStyles.length * shortBookmarkWidths.length * 2) return undefined;
  const styleIndex = payload % shortBookmarkStyles.length;
  const remainder = Math.floor(payload / shortBookmarkStyles.length);
  const widthIndex = remainder % shortBookmarkWidths.length;
  const rows = (Math.floor(remainder / shortBookmarkWidths.length) + 1) as 1 | 2;
  return { kind: "bookmark", marker: shortBookmarkStyles[styleIndex], width: shortBookmarkWidths[widthIndex], ...(rows === 2 ? { rows } : {}) };
}

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

export function parsePresentationTitle(value: string): { title: string; marker?: PresentationMarker; width?: PresentationWidth; collapsed?: boolean; rows?: 1 | 2; role?: FolderRole } {
  const short = decodeShortMarker(value);
  const compact = decodeCompactMarker(value);
  const bookmarkCompact = decodeBookmarkMarker(value);
  const hasCompact = !!(compact.marker || compact.width || compact.collapsed);
  const hasBookmarkCompact = !!(bookmarkCompact.marker || bookmarkCompact.width || bookmarkCompact.rows === 2);
  const tokens = Array.from(value.matchAll(markerPattern), (match) => match[1].toLowerCase());
  if (tokens.length === 0 && !short && !hasCompact && !hasBookmarkCompact) return { title: value };
  const legacyMarker = tokens.find((token) => !token.startsWith("w") && token !== "closed") as PresentationMarker | undefined;
  const marker = short?.marker || compact.marker || bookmarkCompact.marker || legacyMarker;
  const widthValue = Number(tokens.find((token) => token.startsWith("w"))?.slice(1));
  const hasBookmarkMarker = tokens.some((token) => ["featured", "tile", "compact"].includes(token));
  const width = short?.width || compact.width || bookmarkCompact.width || ((hasBookmarkMarker || bookmarkCompact.marker || bookmarkCompact.width || bookmarkCompact.rows) && validBookmarkWidths.has(widthValue) ? widthValue as PresentationWidth : validWidths.has(widthValue) ? widthValue as PresentationWidth : undefined);
  const title = value.replace(markerPattern, " ").replace(short ? shortMarkerPattern : /$^/, "").replace(hasCompact ? compactMarkerPattern : /$^/, "").replace(hasBookmarkCompact ? bookmarkMarkerPattern : /$^/, "").replace(/\s+/g, " ").trim() || "未命名";
  const collapsed = short?.collapsed || compact.collapsed || tokens.includes("closed");
  const rows = short?.rows || bookmarkCompact.rows;
  return { title, ...(marker ? { marker } : {}), ...(width ? { width } : {}), ...(collapsed ? { collapsed: true } : {}), ...(rows === 2 ? { rows } : {}), ...(short?.role ? { role: short.role } : {}) };
}

export function isQuickAccessFolder(node: BookmarkNode): boolean {
  return !node.url && parsePresentationTitle(node.title).role === "quick-access";
}

export function setQuickAccessTitle(value: string): string {
  return `${parsePresentationTitle(value).title}${encodeShortMarker(quickAccessPayload, "folder")}`;
}

export function setFolderPresentationTitle(value: string, presentation: { style: FolderStyle; width?: number; collapsed?: boolean }) {
  const styleIndex = shortFolderStyles.indexOf(presentation.style);
  const widthIndex = shortFolderWidths.indexOf(presentation.width as PresentationWidth | undefined);
  if (styleIndex < 0 || widthIndex < 0) throw new Error("不支持的文件夹展示设置");
  const payload = ((presentation.collapsed ? 1 : 0) * shortFolderWidths.length + widthIndex) * shortFolderStyles.length + styleIndex;
  return `${parsePresentationTitle(value).title}${encodeShortMarker(payload, "folder")}`;
}

export function setBookmarkPresentationTitle(value: string, presentation: { style: BookmarkStyle; width?: number; rows?: 1 | 2 }) {
  const styleIndex = shortBookmarkStyles.indexOf(presentation.style);
  const widthIndex = shortBookmarkWidths.indexOf(presentation.width as PresentationWidth | undefined);
  if (styleIndex < 0 || widthIndex < 0) throw new Error("不支持的书签展示设置");
  const rowsIndex = (presentation.rows || 1) - 1;
  const payload = (rowsIndex * shortBookmarkWidths.length + widthIndex) * shortBookmarkStyles.length + styleIndex;
  return `${parsePresentationTitle(value).title}${encodeShortMarker(payload, "bookmark")}`;
}

async function createBranch(parentId: string, nodes: BookmarkNode[], idMap: Record<string, string>, firstIndex?: number): Promise<void> {
  for (const [position, node] of nodes.entries()) {
    const created = await bookmarks.create({ parentId, ...(firstIndex !== undefined ? { index: firstIndex + position } : {}), title: node.title || "未命名", ...(node.url ? { url: normalizeUrl(node.url) } : {}) });
    idMap[node.id] = created.id;
    if (!node.url && node.children?.length) await createBranch(created.id, node.children, idMap);
  }
}

export async function restoreBookmarkBranch(parentId: string, node: BookmarkNode, index?: number): Promise<Record<string, string>> {
  const idMap: Record<string, string> = {};
  await createBranch(parentId, [node], idMap, index);
  return idMap;
}

export async function importBundle(bundle: ExportBundle, targetParentId: string): Promise<Record<string, string>> {
  if (!bundle.bookmarkTree?.length) throw new Error("备份中没有可导入的书签");
  const container = await bookmarks.create({ parentId: targetParentId, title: `Xiangzi Folio 导入 · ${new Date().toLocaleDateString("zh-CN")}` });
  try {
    const roots = bundle.bookmarkTree[0]?.children || bundle.bookmarkTree;
    const idMap: Record<string, string> = {};
    await createBranch(container.id, roots.flatMap((root) => root.children || []), idMap);
    return idMap;
  } catch (reason) {
    await bookmarks.remove(container.id, true).catch(() => undefined);
    throw reason;
  }
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
  if (parsed.length === 0) throw new Error("HTML 中没有找到可导入的书签");
  const container = await bookmarks.create({ parentId: targetParentId, title: `HTML 导入 · ${new Date().toLocaleDateString("zh-CN")}` });
  try { await createBranch(container.id, parsed as BookmarkNode[], {}); }
  catch (reason) { await bookmarks.remove(container.id, true).catch(() => undefined); throw reason; }
}

const escapeHtml = (value: string) => value.replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char]!);
function nodeToHtml(node: BookmarkNode, depth: number): string {
  const pad = "    ".repeat(depth);
  if (node.url) return `${pad}<DT><A HREF="${escapeHtml(node.url)}">${escapeHtml(parsePresentationTitle(node.title).title)}</A>\n`;
  const children = (node.children || []).map((child) => nodeToHtml(child, depth + 1)).join("");
  return `${pad}<DT><H3>${escapeHtml(parsePresentationTitle(node.title).title)}</H3>\n${pad}<DL><p>\n${children}${pad}</DL><p>\n`;
}

export function exportBookmarksHtml(tree: BookmarkNode[]): string {
  const roots = tree[0]?.children || tree;
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${roots.map((node) => nodeToHtml(node, 1)).join("")}</DL><p>\n`;
}
