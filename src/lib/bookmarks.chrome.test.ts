import { afterEach, describe, expect, it, vi } from "vitest";

const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });

describe("Chrome bookmark adapter", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it("uses the native Chrome bookmark API when the extension permission exists", async () => {
    const getTree = vi.fn().mockResolvedValue([{ id: "0", title: "root", children: [] }]);
    vi.stubGlobal("chrome", {
      bookmarks: {
        getTree,
        create: vi.fn(), update: vi.fn(), move: vi.fn(), remove: vi.fn(), removeTree: vi.fn(),
        onCreated: event(), onRemoved: event(), onChanged: event(), onMoved: event(), onChildrenReordered: event(), onImportEnded: event(),
      },
    });
    vi.resetModules();
    const module = await import("./bookmarks");
    expect(module.bookmarks.native).toBe(true);
    await expect(module.bookmarks.getTree()).resolves.toEqual([{ id: "0", title: "root", children: [] }]);
    expect(getTree).toHaveBeenCalledOnce();
  });
});
