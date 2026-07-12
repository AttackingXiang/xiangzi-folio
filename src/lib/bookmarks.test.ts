import { describe, expect, it } from "vitest";
import { countLinks, exportBookmarksHtml, normalizeUrl, parseBookmarksHtml, parsePresentationTitle, setBookmarkPresentationTitle, setFolderPresentationTitle } from "./bookmarks";
import { demoTree } from "../data/demo";

describe("bookmark utilities", () => {
  it("normalizes plain domains without altering protocols", () => {
    expect(normalizeUrl("example.com/path")).toBe("https://example.com/path");
    expect(normalizeUrl("chrome://bookmarks")).toBe("chrome://bookmarks");
  });

  it("counts every nested bookmark", () => {
    expect(countLinks(demoTree[0])).toBe(25);
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
    expect(setFolderPresentationTitle("[folio:mixed][folio:w6] 设计资源", { style: "icons", width: 12 })).toBe("设计资源 ~xAy");
    expect(setFolderPresentationTitle("[folio:icons][folio:w3] 设计资源", { width: null })).toBe("设计资源 ~xAC");
    expect(setFolderPresentationTitle("[folio:icons][folio:w3] 设计资源", { collapsed: true })).toBe("设计资源 ~xBK");
    expect(setFolderPresentationTitle("[folio:icons][folio:w3][folio:closed] 设计资源", { collapsed: false })).toBe("设计资源 ~xAK");
    expect(parsePresentationTitle("设计资源 ~xBK")).toEqual({ title: "设计资源", marker: "icons", width: 3, collapsed: true });
    expect(setBookmarkPresentationTitle("OpenAI", { style: "tile", width: 6, rows: 2 })).toBe("OpenAI ~bBZ");
    expect(parsePresentationTitle("OpenAI ~bBZ")).toEqual({ title: "OpenAI", marker: "tile", width: 6, rows: 2 });
  });
});
