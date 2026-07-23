import { describe, expect, it } from "vitest";
import { countLinks, exportBookmarksHtml, isQuickAccessFolder, normalizeUrl, parseBookmarksHtml, parsePresentationTitle, setBookmarkPresentationTitle, setFolderPresentationTitle, setQuickAccessTitle } from "./bookmarks";
import type { BookmarkStyle, FolderStyle } from "../types";
import { demoTree } from "../data/demo";

describe("bookmark utilities", () => {
  it("normalizes plain domains without altering protocols", () => {
    expect(normalizeUrl("example.com/path")).toBe("https://example.com/path");
    expect(normalizeUrl("chrome://bookmarks")).toBe("chrome://bookmarks");
  });

  it("counts every nested bookmark", () => {
    expect(countLinks(demoTree[0])).toBe(30);
  });

  it("exports and parses nested Netscape HTML", () => {
    const html = exportBookmarksHtml(demoTree);
    expect(html).toContain("NETSCAPE-Bookmark-file-1");
    expect(html).toContain("中文字体");
    const imported = parseBookmarksHtml(html);
    expect(imported).toHaveLength(3);
    expect(imported[0].title).toBe("书签栏");
    expect("children" in imported[0] && imported[0].children.length).toBeGreaterThan(4);
  });

  it("recognizes portable presentation markers without showing them in titles", () => {
    expect(parsePresentationTitle("[folio:mixed] 设计灵感")).toEqual({ title: "设计灵感", marker: "mixed" });
    expect(parsePresentationTitle("OpenAI [featured]")).toEqual({ title: "OpenAI", marker: "featured" });
    expect(parsePresentationTitle("[folio:icons][folio:w3] 设计资源")).toEqual({ title: "设计资源", marker: "icons", width: 3 });
    expect(parsePresentationTitle("[folio:icons][folio:w3][folio:closed] 设计资源")).toEqual({ title: "设计资源", marker: "icons", width: 3, collapsed: true });
    expect(parsePresentationTitle("设计资源 ~xBK")).toEqual({ title: "设计资源", marker: "icons", width: 3, collapsed: true });
    expect(parsePresentationTitle("OpenAI ~bBZ")).toEqual({ title: "OpenAI", marker: "tile", width: 6, rows: 2 });
  });

  it("encodes all 98 folder presentation combinations uniquely and reversibly", () => {
    const styles: FolderStyle[] = ["directory", "icons", "mixed", "dock", "stack", "focus", "columns"];
    const widths = [undefined, 3, 4, 6, 8, 9, 12] as const;
    const markers = new Set<string>();
    for (const style of styles) for (const width of widths) for (const collapsed of [false, true]) {
      const title = setFolderPresentationTitle("设计资源", { style, width, collapsed });
      expect(title).toMatch(/^设计资源~[A-Za-z0-9_-]{2}$/);
      expect(parsePresentationTitle(title)).toEqual({ title: "设计资源", marker: style, ...(width ? { width } : {}), ...(collapsed ? { collapsed: true } : {}) });
      markers.add(title.slice(-3));
    }
    expect(markers.size).toBe(98);
  });

  it("encodes all 90 bookmark presentation combinations uniquely and reversibly", () => {
    const styles: BookmarkStyle[] = ["row", "tile", "featured", "dock", "compact"];
    const widths = [undefined, 1.5, 2, 3, 4, 6, 8, 12, 16] as const;
    const markers = new Set<string>();
    for (const style of styles) for (const width of widths) for (const rows of [1, 2] as const) {
      const title = setBookmarkPresentationTitle("OpenAI", { style, width, rows });
      expect(title).toMatch(/^OpenAI~[A-Za-z0-9_-]{2}$/);
      expect(parsePresentationTitle(title)).toEqual({ title: "OpenAI", marker: style, ...(width ? { width } : {}), ...(rows === 2 ? { rows: 2 } : {}) });
      markers.add(title.slice(-3));
    }
    expect(markers.size).toBe(90);
  });

  it("keeps folder and bookmark marker namespaces disjoint", () => {
    const folderMarkers = new Set<string>();
    const bookmarkMarkers = new Set<string>();
    for (const style of ["directory", "icons", "mixed", "dock", "stack", "focus", "columns"] as FolderStyle[]) {
      for (const width of [undefined, 3, 4, 6, 8, 9, 12]) for (const collapsed of [false, true]) folderMarkers.add(setFolderPresentationTitle("x", { style, width, collapsed }).slice(-3));
    }
    for (const style of ["row", "tile", "featured", "dock", "compact"] as BookmarkStyle[]) {
      for (const width of [undefined, 1.5, 2, 3, 4, 6, 8, 12, 16]) for (const rows of [1, 2] as const) bookmarkMarkers.add(setBookmarkPresentationTitle("x", { style, width, rows }).slice(-3));
    }
    expect(new Set([...folderMarkers, ...bookmarkMarkers]).size).toBe(188);
  });

  it("identifies quick access by a portable role suffix regardless of its visible name", () => {
    const chinese = { id: "q1", title: setQuickAccessTitle("常用入口"), children: [] };
    const english = { id: "q2", title: setQuickAccessTitle("My launchpad"), children: [] };
    expect(chinese.title).toMatch(/^常用入口~[A-Za-z0-9_-]{2}$/);
    expect(parsePresentationTitle(english.title)).toEqual({ title: "My launchpad", role: "quick-access" });
    expect(isQuickAccessFolder(chinese)).toBe(true);
    expect(isQuickAccessFolder(english)).toBe(true);
    expect(isQuickAccessFolder({ id: "q3", title: "常用入口", children: [] })).toBe(false);
  });
});
