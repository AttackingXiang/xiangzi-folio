import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { bookmarks, setBookmarkPresentationTitle, setFolderPresentationTitle } from "./lib/bookmarks";
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

  it("stores folder style and width in the compact Chrome folder title", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(bookmarks, "update").mockImplementation(async (id, changes) => ({ id, title: changes.title || "设计与灵感", children: [] }));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const styleTrigger = document.querySelector<HTMLElement>('[data-folder-id="110"] > .folder__header button[title="设置显示样式"]');
    expect(styleTrigger).not.toBeNull();
    await user.click(styleTrigger!);
    await user.click(screen.getByRole("menuitemradio", { name: "图标宫格" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}").folderStyles?.["110"]).toBe("icons"));
    await waitFor(() => expect(update).toHaveBeenCalledWith("110", { title: setFolderPresentationTitle("设计与灵感", { style: "icons", width: 4, collapsed: false }) }));
    const folder = document.querySelector<HTMLElement>('[data-folder-id="110"]');
    const quarter = folder?.closest(".block-wrap")?.querySelector<HTMLElement>('button[title="1/4 · 3/12"]');
    expect(quarter).not.toBeNull();
    await user.click(quarter!);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}").folderWidths?.["110"]).toBe(3));
    await waitFor(() => expect(update).toHaveBeenCalledWith("110", { title: setFolderPresentationTitle("设计与灵感", { style: "icons", width: 3, collapsed: false }) }));
  });

  it("persists folder collapsed state in the compact Chrome folder title", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(bookmarks, "update").mockImplementation(async (id, changes) => ({ id, title: changes.title || "设计与灵感", children: [] }));
    render(<App />);
    await screen.findByText("设计与灵感");
    const folder = document.querySelector<HTMLElement>('[data-folder-id="110"]');
    expect(folder).not.toBeNull();
    const title = folder!.querySelector<HTMLButtonElement>(":scope > .folder__header > .folder__title");
    expect(title).not.toBeNull();
    await user.click(title!);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}").collapsed).toContain("110"));
    await waitFor(() => expect(update).toHaveBeenCalledWith("110", { title: setFolderPresentationTitle("设计与灵感", { style: "directory", width: 4, collapsed: true }) }));
    expect(folder).toHaveClass("is-collapsed");
    await user.click(title!);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}").collapsed).not.toContain("110"));
    await waitFor(() => expect(update).toHaveBeenCalledWith("110", { title: setFolderPresentationTitle("设计与灵感", { style: "directory", width: 4, collapsed: false }) }));
  });

  it("migrates legacy local metadata to compact title storage version three", async () => {
    const legacy = { ...defaultConfig, markerStorageVersion: 0, folderStyles: { "110": "icons" }, folderWidths: { "110": 6 } };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(legacy));
    const update = vi.spyOn(bookmarks, "update").mockImplementation(async (id, changes) => ({ id, title: changes.title || "", children: [] }));
    render(<App />);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}").markerStorageVersion).toBe(3));
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
    expect(saved.folderStyles["110"]).toBe("icons");
    expect(saved.folderWidths["110"]).toBe(6);
    expect(update).toHaveBeenCalledWith("110", { title: setFolderPresentationTitle("设计与灵感", { style: "icons", width: 6, collapsed: false }) });
  });

  it("hides editing controls until edit mode is enabled", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("button", { name: "编辑主页" })).toBeInTheDocument();
    expect(screen.queryByText("编辑主页\n布局和书签管理已合并")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "编辑主页" }));
    expect(screen.getByText("布局和书签管理已合并")).toBeInTheDocument();
    await user.click(screen.getByText("完成"));
    await waitFor(() => expect(screen.queryByText("布局和书签管理已合并")).not.toBeInTheDocument());
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
    await user.click(screen.getByRole("menuitemradio", { name: /DuckDuckGo/ }));
    expect(screen.getByPlaceholderText(/使用 DuckDuckGo 搜索/)).toBeInTheDocument();
  });

  it("supports keyboard navigation and Escape in the search engine menu", async () => {
    const user = userEvent.setup();
    render(<App />);
    const trigger = await screen.findByRole("button", { name: /选择搜索引擎/ });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    const selected = screen.getByRole("menuitemradio", { name: /Google/ });
    await waitFor(() => expect(selected).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: /Bing/ })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("uses the four-column directory default when creating a top-level component", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(bookmarks, "create").mockResolvedValue({ id: "new-component", parentId: "1", title: "新组件", children: [] });
    render(<App />);
    await screen.findByText("常用入口");
    expect(screen.queryByText("书签栏")).not.toBeInTheDocument();
    expect(screen.queryByText("今天想去哪里？")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "编辑主页" }));
    await user.click(screen.getByRole("button", { name: /新建组件/ }));
    expect(await screen.findByRole("dialog", { name: "新建文件夹" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "新建文件夹" })).toBeInTheDocument();
    expect(screen.getByText("新建并同步到 Chrome")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "名称" }), { target: { value: "新组件" } });
    await user.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ parentId: "1", title: setFolderPresentationTitle("新组件", { style: "directory", width: 4, collapsed: false }) }));
  });

  it("edits the real quick-access folder and creates child folders from its visible controls", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(bookmarks, "create").mockResolvedValue({ id: "quick-child", parentId: "90", title: "工具", children: [] });
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    await user.click(screen.getByRole("button", { name: "在常用入口中新建文件夹" }));
    fireEvent.change(screen.getByRole("textbox", { name: "名称" }), { target: { value: "工具" } });
    await user.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ parentId: "90", title: setFolderPresentationTitle("工具", { style: "icons", width: 4, collapsed: false }) }));
  });

  it("exposes edit and delete actions for quick-access bookmarks", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const remove = vi.spyOn(bookmarks, "remove").mockResolvedValue();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const quickBookmark = await screen.findByTestId("quick-bookmark-91");
    expect(quickBookmark.querySelector('button[title="编辑书签"]')).toBeInTheDocument();
    await user.click(within(quickBookmark).getByRole("button", { name: "删除书签 ChatGPT" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("91", false));
  });

  it("applies a saved display style to a quick-access bookmark", async () => {
    const user = userEvent.setup();
    vi.spyOn(bookmarks, "update").mockResolvedValue({ id: "91", parentId: "90", title: "ChatGPT", url: "https://chatgpt.com" });
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const quickBookmark = await screen.findByTestId("quick-bookmark-91");
    await user.click(within(quickBookmark).getByRole("button", { name: "编辑书签 ChatGPT" }));
    await user.click(screen.getByRole("button", { name: "重点" }));
    await user.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() => expect(screen.getByTestId("quick-bookmark-91")).toHaveClass("quick-access__item--featured"));
  });

  it("reorders quick-access bookmarks by dragging onto a frozen visible slot", async () => {
    const user = userEvent.setup();
    const move = vi.spyOn(bookmarks, "move").mockResolvedValue({ id: "93", parentId: "90", index: 1, title: "Gemini", url: "https://gemini.google.com" });
    const data = new Map<string, string>();
    const dataTransfer = { effectAllowed: "none", setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) || "" };
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const first = await screen.findByTestId("quick-bookmark-91");
    const second = screen.getByTestId("quick-bookmark-92");
    const source = screen.getByTestId("quick-bookmark-93");
    const grid = first.parentElement!;
    const rect = (left: number) => ({ left, right: left + 100, top: 0, bottom: 100, width: 100, height: 100, x: left, y: 0, toJSON: () => ({}) } as DOMRect);
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue(rect(0));
    vi.spyOn(second, "getBoundingClientRect").mockReturnValue(rect(100));
    vi.spyOn(source, "getBoundingClientRect").mockReturnValue(rect(200));
    fireEvent.dragStart(source, { dataTransfer });
    const dragAt = (type: "dragover" | "drop", x: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { clientX: { value: x }, clientY: { value: 50 }, dataTransfer: { value: dataTransfer } });
      fireEvent(grid, event);
    };
    dragAt("dragover", 150);
    expect(screen.getByText("放到这里").closest(".quick-access__drop-placeholder")?.nextElementSibling).toBe(second);
    dragAt("dragover", 350);
    expect(screen.getByLabelText("放到这里，位于本组末尾")).toBeInTheDocument();
    dragAt("dragover", 150);
    dragAt("drop", 150);
    await waitFor(() => expect(move).toHaveBeenCalledWith("93", { parentId: "90", index: 1 }));
  });

  it("moves a regular bookmark into a quick-access child folder by dropping on its header area", async () => {
    const user = userEvent.setup();
    const move = vi.spyOn(bookmarks, "move").mockResolvedValue({ id: "101", parentId: "94", title: "Figma", url: "https://figma.com" });
    const data = new Map<string, string>();
    const dataTransfer = { effectAllowed: "move", setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) || "" };
    dataTransfer.setData("application/x-xiangzi-folio-bookmark", JSON.stringify({ id: "101", parentId: "1", index: 1, type: "bookmark" }));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const destination = document.querySelector<HTMLElement>('[data-folder-id="94"]');
    expect(destination).not.toBeNull();
    fireEvent.dragEnter(destination!, { dataTransfer });
    expect(await screen.findByText("移入“影音与社区”")).toBeInTheDocument();
    fireEvent.drop(destination!, { dataTransfer });
    await waitFor(() => expect(move).toHaveBeenCalledWith("101", { parentId: "94" }));
  });

  it("moves a regular page bookmark into the quick-access root by dropping on its direct-entry area", async () => {
    const user = userEvent.setup();
    const move = vi.spyOn(bookmarks, "move").mockResolvedValue({ id: "101", parentId: "90", title: "Figma", url: "https://figma.com" });
    const data = new Map<string, string>();
    const dataTransfer = { effectAllowed: "move", types: ["application/x-xiangzi-folio-bookmark"], setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) || "" };
    dataTransfer.setData("application/x-xiangzi-folio-bookmark", JSON.stringify({ id: "101", parentId: "1", index: 1, type: "bookmark" }));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const destination = document.querySelector<HTMLElement>(".quick-access");
    expect(destination).not.toBeNull();
    fireEvent.dragEnter(destination!, { dataTransfer });
    expect(await screen.findByText("移入“常用入口”")).toBeInTheDocument();
    fireEvent.drop(destination!, { dataTransfer });
    await waitFor(() => expect(move).toHaveBeenCalledWith("101", { parentId: "90" }));
  });

  it("moves a quick-access bookmark into an ordinary page folder", async () => {
    const user = userEvent.setup();
    const move = vi.spyOn(bookmarks, "move").mockResolvedValue({ id: "93", parentId: "110", title: "Gemini", url: "https://gemini.google.com" });
    const data = new Map<string, string>();
    const dataTransfer = { effectAllowed: "none", types: [] as string[], setData: (type: string, value: string) => { data.set(type, value); if (!dataTransfer.types.includes(type)) dataTransfer.types.push(type); }, getData: (type: string) => data.get(type) || "" };
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const source = await screen.findByTestId("quick-bookmark-93");
    const destination = document.querySelector<HTMLElement>('[data-folder-id="110"] > .folder__header');
    expect(destination).not.toBeNull();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragEnter(destination!, { dataTransfer });
    fireEvent.drop(destination!, { dataTransfer });
    await waitFor(() => expect(move).toHaveBeenCalledWith("93", { parentId: "110" }));
  });

  it("hides background content from assistive technology while settings are open", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const appearance = screen.getByRole("button", { name: "外观" });
    await user.click(appearance);
    expect(screen.getByRole("dialog", { name: "主页设置" })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector("main")).toHaveAttribute("aria-hidden", "true"));
    expect(document.querySelector("main")).toHaveProperty("inert", true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "主页设置" })).not.toBeInTheDocument();
    expect(document.querySelector("main")).not.toHaveAttribute("aria-hidden");
    expect(appearance).toHaveFocus();
  });

  it("switches every settings label to English and persists the language", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    await user.click(screen.getByRole("button", { name: "外观" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "界面语言" }), "en");
    expect(screen.getByRole("dialog", { name: "Home settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Theme presets 15 sets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use Nordic Dawn theme" })).toBeInTheDocument();
    expect(document.querySelector(".quick-access")).toHaveAttribute("aria-label", "Quick Access");
    expect(document.documentElement.lang).toBe("en");
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}").language).toBe("en"));
  });

  it("opens voluntary developer support options from the footer", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "支持开发者" }));
    expect(screen.getByRole("dialog", { name: "支持开发者" })).toBeInTheDocument();
    expect(screen.getByAltText("支付宝支持二维码")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开 PayPal" })).toHaveAttribute("href", "https://www.paypal.com/ncp/payment/Q3YKYE86YKBPJ");
    await user.click(screen.getByRole("button", { name: "关闭支持开发者" }));
    expect(screen.queryByRole("dialog", { name: "支持开发者" })).not.toBeInTheDocument();
  });

  it("moves a bookmark to a selected Chrome folder from its visible action", async () => {
    const user = userEvent.setup();
    const move = vi.spyOn(bookmarks, "move").mockResolvedValue({ id: "101", title: "Figma", url: "https://figma.com" });
    render(<App />);
    const bookmark = await screen.findByTestId("bookmark-101");
    await user.click(screen.getByRole("button", { name: "编辑主页" }));
    await user.click(bookmark.querySelector<HTMLButtonElement>('button[title="移动书签"]')!);
    expect(screen.getByRole("dialog", { name: "移动书签" })).toBeInTheDocument();
    await user.click(screen.getByText("其他书签", { selector: "strong" }));
    await waitFor(() => expect(move).toHaveBeenCalledWith("101", { parentId: "2" }));
    expect(await screen.findByText(/已移动/)).toBeInTheDocument();
  });

  it("reorders bookmarks by dragging in bookmark organization mode", async () => {
    const user = userEvent.setup();
    const move = vi.spyOn(bookmarks, "move").mockResolvedValue({ id: "103", parentId: "1", index: 1, title: "Notion", url: "https://notion.so" });
    const data = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) || "",
    };
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const source = screen.getByTestId("bookmark-103");
    const first = screen.getByTestId("bookmark-101");
    const second = screen.getByTestId("bookmark-102");
    const grid = first.parentElement!;
    const rect = (left: number) => ({ left, right: left + 100, top: 0, bottom: 100, width: 100, height: 100, x: left, y: 0, toJSON: () => ({}) } as DOMRect);
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue(rect(0));
    vi.spyOn(second, "getBoundingClientRect").mockReturnValue(rect(100));
    vi.spyOn(source, "getBoundingClientRect").mockReturnValue(rect(200));
    const dragAt = (type: "dragover" | "drop", x: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { clientX: { value: x }, clientY: { value: 50 }, dataTransfer: { value: dataTransfer } });
      fireEvent(grid, event);
    };
    expect(source).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(source, { dataTransfer });
    dragAt("dragover", 50);
    expect(first).toHaveClass("is-drop-target");
    expect(screen.getByText("放到这里").closest(".bookmark-drop-placeholder")?.nextElementSibling).toBe(first);

    dragAt("dragover", 150);
    expect(first).not.toHaveClass("is-drop-target");
    expect(second).toHaveClass("is-drop-target");
    expect(screen.getByText("放到这里").closest(".bookmark-drop-placeholder")?.nextElementSibling).toBe(second);

    dragAt("dragover", 50);
    expect(first).toHaveClass("is-drop-target");
    dragAt("dragover", 350);
    expect(screen.getByLabelText("放到这里，位于 本组末尾 之前")).toBeInTheDocument();
    dragAt("dragover", 150);
    expect(second).toHaveClass("is-drop-target");

    dragAt("drop", 150);
    await waitFor(() => expect(move).toHaveBeenCalledWith("103", { parentId: "1", index: 1 }));
    expect(move).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/原书签顺延/)).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const handle = screen.getByLabelText("拖动文件夹 字体与排版");
    const target = document.querySelector<HTMLElement>('[data-folder-id="120"]');
    expect(target).not.toBeNull();
    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.dragEnter(target!, { dataTransfer });
    fireEvent.drop(target!, { dataTransfer });
    await waitFor(() => expect(move).toHaveBeenCalledWith("113", { parentId: "120" }));
    expect(await screen.findByText("已移入“开发工具”")).toBeInTheDocument();
  });

  it("shows a folder drop target and moves a bookmark into that folder from its header", async () => {
    const user = userEvent.setup();
    const move = vi.spyOn(bookmarks, "move").mockResolvedValue({ id: "101", parentId: "120", title: "Figma", url: "https://figma.com" });
    const data = new Map<string, string>();
    const dataTransfer = { effectAllowed: "none", setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) || "" };
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const source = screen.getByTestId("bookmark-101");
    const folder = document.querySelector<HTMLElement>('[data-folder-id="120"]')!;
    const header = folder.querySelector<HTMLElement>(":scope > .folder__header")!;
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragEnter(header, { dataTransfer });
    expect(within(folder).getByText("放到这里")).toBeInTheDocument();
    fireEvent.drop(header, { dataTransfer });
    await waitFor(() => expect(move).toHaveBeenCalledWith("101", { parentId: "120" }));
    expect(folder.querySelector(".folder-drop-overlay")).not.toBeInTheDocument();
    expect(await screen.findByText("已移入“开发工具”")).toBeInTheDocument();
  });

  it("clears a folder destination overlay when the browser ends a drag without a drop", async () => {
    const user = userEvent.setup();
    const data = new Map<string, string>();
    const dataTransfer = { effectAllowed: "move", setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) || "" };
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const source = await screen.findByTestId("bookmark-101");
    const folder = document.querySelector<HTMLElement>('[data-folder-id="120"]')!;
    const header = folder.querySelector<HTMLElement>(":scope > .folder__header")!;
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragEnter(header, { dataTransfer });
    expect(folder.querySelector(".folder-drop-overlay")).toBeInTheDocument();
    fireEvent.dragEnd(document);
    expect(folder.querySelector(".folder-drop-overlay")).not.toBeInTheDocument();
  });

  it("keeps visual folder styles while organizing bookmarks and exposes large drop zones", async () => {
    const user = userEvent.setup();
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...defaultConfig, folderStyles: { ...defaultConfig.folderStyles, "110": "mixed" }, folderWidths: { ...defaultConfig.folderWidths, "110": 8 } }));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const folder = document.querySelector<HTMLElement>('[data-folder-id="110"]');
    expect(folder).toHaveClass("folder--mixed");
    expect(folder?.querySelector(".mixed-grid")).toBeInTheDocument();
    expect(folder?.querySelector(":scope > .folder__body > .folder-drop-zone")).toBeInTheDocument();
  });

  it("saves a visual style, width and height on an individual bookmark", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(bookmarks, "update").mockImplementation(async (id, changes) => ({ id, title: changes.title || "Figma", url: changes.url }));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const edit = document.querySelector<HTMLButtonElement>('[data-testid="bookmark-101"] button[title="编辑书签"]');
    expect(edit).not.toBeNull();
    await user.click(edit!);
    await user.click(screen.getByRole("button", { name: "图标" }));
    await user.selectOptions(screen.getByLabelText("占用宽度"), "6");
    await user.selectOptions(screen.getByLabelText("卡片高度"), "2");
    await user.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("101", { title: setBookmarkPresentationTitle("Figma", { style: "tile", width: 6, rows: 2 }), url: "https://figma.com" }));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
      expect(saved.bookmarkStyles["101"]).toBe("tile");
      expect(saved.bookmarkWidths["101"]).toBe(6);
      expect(saved.bookmarkRows["101"]).toBe(2);
    });
  });

  it("uses a 1.5-column icon default for new bookmarks inside icon folders", async () => {
    const user = userEvent.setup();
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...defaultConfig, folderStyles: { ...defaultConfig.folderStyles, "110": "icons" } }));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    await user.click(screen.getByRole("button", { name: /在 设计与灵感 中新建书签/ }));
    expect(screen.getByRole("button", { name: "图标" })).toHaveClass("active");
    expect(screen.getByLabelText("占用宽度")).toHaveValue("1.5");
  });

  it("deletes a bookmark with the non-recursive Chrome operation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const remove = vi.spyOn(bookmarks, "remove").mockResolvedValue();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    await user.click(screen.getByRole("button", { name: "删除书签 Figma" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("101", false));
    expect(await screen.findByText("“Figma”已删除")).toBeInTheDocument();
  });

  it("sets a nested folder to half width inside its parent grid", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(bookmarks, "update").mockImplementation(async (id, changes) => ({ id, title: changes.title || "字体与排版", children: [] }));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "编辑主页" }));
    const trigger = document.querySelector<HTMLButtonElement>('[data-folder-id="113"] > .folder__header button[title="设置显示样式"]');
    expect(trigger).not.toBeNull();
    await user.click(trigger!);
    const menu = document.querySelector<HTMLElement>('[data-folder-id="113"] > .folder__header .style-menu');
    const half = Array.from(menu?.querySelectorAll("button") || []).find((button) => button.textContent === "1/2");
    expect(half).not.toBeUndefined();
    await user.click(half!);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}").folderWidths?.["113"]).toBe(6));
    await waitFor(() => expect(update).toHaveBeenCalledWith("113", { title: setFolderPresentationTitle("字体与排版", { style: "icons", width: 6, collapsed: false }) }));
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
    await waitFor(() => expect(folder?.style.getPropertyValue("--folder-span")).toBe("4"));
  });

  it("creates a real child folder from a visible folder action", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(bookmarks, "create").mockResolvedValue({ id: "new-folder", parentId: "110", title: "竞品资料", children: [] });
    render(<App />);
    await screen.findByText("设计与灵感");
    const folder = document.querySelector<HTMLElement>('[data-folder-id="110"]');
    expect(folder).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "编辑主页" }));
    await user.click(screen.getByRole("button", { name: /在 设计与灵感 中新建文件夹/ }));
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "名称" }), { target: { value: "竞品资料" } });
    await user.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ parentId: "110", title: setFolderPresentationTitle("竞品资料", { style: "icons", width: 4, collapsed: false }) }));
  });

  it("only moves a recently clicked bookmark when it is outside its sibling top five", async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...defaultConfig, recentClickToFront: true }));
    const children = Array.from({ length: 6 }, (_, index) => ({ id: `recent-${index + 1}`, parentId: "1", title: `站点 ${index + 1}`, url: `https://example.com/${index + 1}` }));
    vi.spyOn(bookmarks, "getTree").mockResolvedValue([{ id: "0", title: "root", children: [{ id: "1", parentId: "0", title: "书签栏", children }] }]);
    const move = vi.spyOn(bookmarks, "move").mockResolvedValue(children[5]);
    render(<App />);
    const fifth = await screen.findByTestId("bookmark-recent-5");
    const fifthLink = fifth.querySelector("a")!;
    fifthLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(fifthLink);
    expect(move).not.toHaveBeenCalled();
    const sixth = await screen.findByTestId("bookmark-recent-6");
    const sixthLink = sixth.querySelector("a")!;
    sixthLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(sixthLink);
    await waitFor(() => expect(move).toHaveBeenCalledWith("recent-6", { parentId: "1", index: 0 }));
    expect(move).toHaveBeenCalledTimes(1);
  });
});
