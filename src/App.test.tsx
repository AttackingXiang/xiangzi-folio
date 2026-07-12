import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { bookmarks } from "./lib/bookmarks";
import { CONFIG_KEY, defaultConfig } from "./lib/config";

describe("Xiangzi Folio app", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("uses Google web search by default and renders nested bookmarks", async () => {
    render(<App />);
    expect(await screen.findByPlaceholderText(/使用 Google 搜索/)).toBeInTheDocument();
    expect(await screen.findByText("霞鹜文楷")).toBeInTheDocument();
  });

  it("keeps child folders grouped when a parent uses the icon grid style", async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...defaultConfig, folderStyles: { ...defaultConfig.folderStyles, "110": "icons" } }));
    render(<App />);
    expect(await screen.findByText("字体与排版")).toBeInTheDocument();
    expect(screen.getByText("中文字体")).toBeInTheDocument();
    const parent = document.querySelector<HTMLElement>('[data-folder-id="110"]');
    expect(parent).not.toBeNull();
    await waitFor(() => expect(parent).toHaveClass("folder--icons"));
    const directGrid = parent!.querySelector(":scope > .folder__body > .icon-grid");
    expect(directGrid?.querySelectorAll(":scope > .bookmark")).toHaveLength(3);
    expect(parent!.querySelector('[data-folder-id="113"]')).toBeInTheDocument();
  });

  it("writes folder style and width choices into the native Chrome folder title", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(bookmarks, "update").mockImplementation(async (id, changes) => ({ id, title: changes.title || "设计与灵感", children: [] }));
    render(<App />);
    await user.click(await screen.findByText("编辑主页"));
    const styleTrigger = document.querySelector<HTMLElement>('[data-folder-id="110"] > .folder__header button[title="设置显示样式"]');
    expect(styleTrigger).not.toBeNull();
    await user.click(styleTrigger!);
    await user.click(screen.getByRole("button", { name: "图标宫格" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("110", { title: "设计与灵感 ~xAi" }));
    const folder = document.querySelector<HTMLElement>('[data-folder-id="110"]');
    const quarter = folder?.closest(".block-wrap")?.querySelector<HTMLElement>('button[title="1/4 · 3/12"]');
    expect(quarter).not.toBeNull();
    await user.click(quarter!);
    await waitFor(() => expect(update).toHaveBeenCalledWith("110", { title: "设计与灵感 ~xAK" }));
  });

  it("persists folder collapsed state in the native Chrome folder title", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(bookmarks, "update").mockImplementation(async (id, changes) => ({ id, title: changes.title || "设计与灵感", children: [] }));
    render(<App />);
    await screen.findByText("设计与灵感");
    const folder = document.querySelector<HTMLElement>('[data-folder-id="110"]');
    expect(folder).not.toBeNull();
    const title = folder!.querySelector<HTMLButtonElement>(":scope > .folder__header > .folder__title");
    expect(title).not.toBeNull();
    await user.click(title!);
    await waitFor(() => expect(update).toHaveBeenCalledWith("110", { title: "设计与灵感 ~xBj" }));
    expect(folder).toHaveClass("is-collapsed");
    await user.click(title!);
    await waitFor(() => expect(update).toHaveBeenCalledWith("110", { title: "设计与灵感 ~xAj" }));
  });

  it("migrates legacy local style and width metadata into native folder names once", async () => {
    const legacy = { ...defaultConfig } as Partial<typeof defaultConfig>;
    delete legacy.markerStorageVersion;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(legacy));
    const update = vi.spyOn(bookmarks, "update").mockImplementation(async (id, changes) => ({ id, title: changes.title || "", children: [] }));
    render(<App />);
    await waitFor(() => expect(update).toHaveBeenCalledWith("110", { title: "设计与灵感 ~xAj" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}").markerStorageVersion).toBe(1));
  });

  it("hides editing controls until edit mode is enabled", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText("编辑主页")).toBeInTheDocument();
    expect(screen.queryByText("页面排版")).not.toBeInTheDocument();
    await user.click(screen.getByText("编辑主页"));
    expect(screen.getByText("页面排版")).toBeInTheDocument();
    expect(screen.getByText("整理书签")).toBeInTheDocument();
    await user.click(screen.getByText("完成"));
    await waitFor(() => expect(screen.queryByText("页面排版")).not.toBeInTheDocument());
  });

  it("hides secondary Chrome roots by default and exposes them from edit mode", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("快捷书签");
    expect(screen.queryByTestId("bookmark-201")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "编辑主页" }));
    await user.click(screen.getByRole("button", { name: "显示其他书签" }));
    expect(await screen.findByTestId("bookmark-201")).toBeInTheDocument();
  });

  it("switches search engines from the picker", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /Google/ }));
    await user.click(screen.getByRole("button", { name: /DuckDuckGo/ }));
    expect(screen.getByPlaceholderText(/使用 DuckDuckGo 搜索/)).toBeInTheDocument();
  });

  it("removes the previous hero heading and opens native folder creation from right click", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("常用入口");
    expect(screen.queryByText("书签栏")).not.toBeInTheDocument();
    expect(screen.queryByText("今天想去哪里？")).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole("main"), { clientX: 200, clientY: 180 });
    await user.click(screen.getByRole("menuitem", { name: /新建文件夹/ }));
    expect(screen.getByRole("dialog", { name: "新建文件夹" })).toBeInTheDocument();
    expect(screen.getByText("新建文件夹")).toBeInTheDocument();
    expect(screen.getByText("新建并同步到 Chrome")).toBeInTheDocument();
  });

  it("moves a bookmark to a selected Chrome folder from its context menu", async () => {
    const user = userEvent.setup();
    const move = vi.spyOn(bookmarks, "move").mockResolvedValue({ id: "101", title: "Figma", url: "https://figma.com" });
    render(<App />);
    const bookmark = await screen.findByTestId("bookmark-101");
    fireEvent.contextMenu(bookmark, { clientX: 260, clientY: 210 });
    await user.click(screen.getByRole("menuitem", { name: /移动到/ }));
    expect(screen.getByRole("dialog", { name: "移动书签" })).toBeInTheDocument();
    await user.click(screen.getByText("其他书签", { selector: "strong" }));
    await waitFor(() => expect(move).toHaveBeenCalledWith("101", { parentId: "2" }));
    expect(await screen.findByText(/已移动/)).toBeInTheDocument();
  });

  it("reorders bookmarks by dragging in bookmark organization mode", async () => {
    const user = userEvent.setup();
    const move = vi.spyOn(bookmarks, "move").mockResolvedValue({ id: "102", parentId: "1", index: 0, title: "GitHub", url: "https://github.com" });
    const data = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) || "",
    };
    render(<App />);
    await user.click(await screen.findByText("编辑主页"));
    await user.click(screen.getByText("整理书签"));
    const source = screen.getByTestId("bookmark-102");
    const target = screen.getByTestId("bookmark-101");
    expect(source).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragEnter(target, { dataTransfer });
    expect(target).toHaveClass("is-drop-target");
    fireEvent.drop(target, { dataTransfer });
    await waitFor(() => expect(move).toHaveBeenCalledWith("102", { parentId: "1", index: 0 }));
    expect(move).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("顺序已同步到 Chrome 书签")).toBeInTheDocument();
  });

  it("drags a nested folder into another Chrome folder", async () => {
    const user = userEvent.setup();
    const move = vi.spyOn(bookmarks, "move").mockResolvedValue({ id: "113", parentId: "120", title: "字体与排版", children: [] });
    const data = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) || "",
    };
    render(<App />);
    await user.click(await screen.findByText("编辑主页"));
    await user.click(screen.getByText("整理书签"));
    const handle = screen.getByLabelText("拖动文件夹 字体与排版");
    const target = document.querySelector<HTMLElement>('[data-folder-id="120"]');
    expect(target).not.toBeNull();
    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.dragEnter(target!, { dataTransfer });
    fireEvent.drop(target!, { dataTransfer });
    await waitFor(() => expect(move).toHaveBeenCalledWith("113", { parentId: "120" }));
    expect(await screen.findByText("已移入“开发工具”")).toBeInTheDocument();
  });

  it("keeps visual folder styles while organizing bookmarks and exposes large drop zones", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText("编辑主页"));
    await user.click(screen.getByText("整理书签"));
    const folder = document.querySelector<HTMLElement>('[data-folder-id="110"]');
    expect(folder).toHaveClass("folder--mixed");
    expect(folder?.querySelector(".mixed-grid")).toBeInTheDocument();
    expect(folder?.querySelector(":scope > .folder__body > .folder-drop-zone")).toBeInTheDocument();
  });

  it("saves a visual style, width and height on an individual bookmark", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(bookmarks, "update").mockImplementation(async (id, changes) => ({ id, title: changes.title || "Figma", url: changes.url }));
    render(<App />);
    await user.click(await screen.findByText("编辑主页"));
    await user.click(screen.getByText("整理书签"));
    const edit = document.querySelector<HTMLButtonElement>('[data-testid="bookmark-101"] button[title="编辑书签"]');
    expect(edit).not.toBeNull();
    await user.click(edit!);
    await user.click(screen.getByRole("button", { name: "图标" }));
    await user.selectOptions(screen.getByLabelText("占用宽度"), "6");
    await user.selectOptions(screen.getByLabelText("卡片高度"), "2");
    await user.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("101", { title: "Figma ~bBZ", url: "https://figma.com" }));
  });

  it("sets a nested folder to half width inside its parent grid", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(bookmarks, "update").mockImplementation(async (id, changes) => ({ id, title: changes.title || "字体与排版", children: [] }));
    render(<App />);
    await user.click(await screen.findByText("编辑主页"));
    const trigger = document.querySelector<HTMLButtonElement>('[data-folder-id="113"] > .folder__header button[title="设置显示样式"]');
    expect(trigger).not.toBeNull();
    await user.click(trigger!);
    const menu = document.querySelector<HTMLElement>('[data-folder-id="113"] > .folder__header .style-menu');
    const half = Array.from(menu?.querySelectorAll("button") || []).find((button) => button.textContent === "1/2");
    expect(half).not.toBeUndefined();
    await user.click(half!);
    await waitFor(() => expect(update).toHaveBeenCalledWith("113", { title: "字体与排版 ~xAZ" }));
  });

  it("uses four page columns for a collapsed nested folder and restores width on expand", async () => {
    const user = userEvent.setup();
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...defaultConfig, collapsed: ["113"] }));
    render(<App />);
    await screen.findByText("字体与排版");
    const folder = document.querySelector<HTMLElement>('[data-folder-id="113"]');
    expect(folder?.style.getPropertyValue("--folder-span")).toBe("4");
    const title = folder?.querySelector<HTMLButtonElement>(".folder__title");
    expect(title).not.toBeNull();
    await user.click(title!);
    await waitFor(() => expect(folder?.style.getPropertyValue("--folder-span")).toBe("8"));
  });

  it("creates a real child folder from a folder context menu", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(bookmarks, "create").mockResolvedValue({ id: "new-folder", parentId: "110", title: "竞品资料", children: [] });
    render(<App />);
    await screen.findByText("设计与灵感");
    const folder = document.querySelector<HTMLElement>('[data-folder-id="110"]');
    expect(folder).not.toBeNull();
    fireEvent.contextMenu(folder!, { clientX: 280, clientY: 230 });
    await user.click(screen.getByRole("menuitem", { name: /新建文件夹/ }));
    await user.type(screen.getByRole("textbox", { name: "名称" }), "竞品资料");
    await user.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ parentId: "110", title: "竞品资料" }));
  });
});
