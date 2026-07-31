import { describe, expect, it } from "vitest";
import { defaultConfig, parseBundle, sanitizeConfig } from "./config";

it("uses Nordic Dawn as the first-run appearance default", () => {
  expect(defaultConfig).toMatchObject({ theme: "nordic", accent: "#5e88a5", glassStrength: 14, backgroundShade: 0, recentClickToFront: true });
});

describe("configuration validation", () => {
  it("clamps visual values and drops malformed persisted fields", () => {
    const config = sanitizeConfig({
      ...defaultConfig,
      theme: "unknown",
      density: "dense",
      glassStrength: 100,
      backgroundShade: -10,
      backgroundImage: "https://example.com/tracker.png",
      folderOrder: ["one", 2, "one", "two"],
      folderStyles: { one: "icons", two: "invalid" },
      bookmarkWidths: { one: 1.5, two: 7 },
      accent: "red",
      brandName: 123,
    });

    expect(config.theme).toBe(defaultConfig.theme);
    expect(config.density).toBe(defaultConfig.density);
    expect(config.glassStrength).toBe(36);
    expect(config.backgroundShade).toBe(0);
    expect(config.backgroundImage).toBe("");
    expect(config.folderOrder).toEqual(["one", "two"]);
    expect(config.folderStyles.one).toBe("icons");
    expect(config.folderStyles.two).toBeUndefined();
    expect(config.bookmarkWidths).toEqual({ one: 1.5 });
    expect(config.accent).toBe(defaultConfig.accent);
    expect(config.brandName).toBe(defaultConfig.brandName);
  });

  it("accepts a valid portable backup and sanitizes its local appearance", () => {
    const bundle = parseBundle({
      kind: "xiangzi-folio",
      exportedAt: "2026-07-15T00:00:00.000Z",
      config: { ...defaultConfig, searchEngine: "duckduckgo", backgroundShade: 999 },
      bookmarkTree: [{ id: "0", title: "root", children: [{ id: "1", parentId: "0", title: "书签栏", children: [{ id: "a", parentId: "1", title: "OpenAI", url: "https://openai.com" }] }] }],
    });

    expect(bundle.config.searchEngine).toBe("duckduckgo");
    expect(bundle.config.backgroundShade).toBe(75);
    expect(bundle.bookmarkTree[0].children?.[0].children?.[0].url).toBe("https://openai.com");
  });

  it("rejects duplicate IDs and malformed folder contents before import", () => {
    expect(() => parseBundle({ kind: "xiangzi-folio", config: defaultConfig, bookmarkTree: [{ id: "same", title: "A", url: "https://a.example" }, { id: "same", title: "B", url: "https://b.example" }] })).toThrow(/重复/);
    expect(() => parseBundle({ kind: "xiangzi-folio", config: defaultConfig, bookmarkTree: [{ id: "a", title: "A", children: {} }] })).toThrow(/文件夹内容/);
    expect(() => parseBundle({ kind: "xiangzi-folio", config: defaultConfig, bookmarkTree: [{ id: "a", title: "A", url: "https://example.com", children: [] }] })).toThrow(/书签或文件夹/);
    expect(() => parseBundle({ kind: "xiangzi-folio", config: defaultConfig, bookmarkTree: [{ id: "a", title: "A" }] })).toThrow(/书签或文件夹/);
  });
});
