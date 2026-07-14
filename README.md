# Xiangzi Folio 书签主页

Xiangzi Folio 是一个本地优先的 Chrome 新标签页扩展。它直接读取和修改 Chrome 原生书签，不要求登录 Google；如果浏览器自身开启了 Chrome 同步，其中的新增、重命名、网址修改、移动、排序和删除也会随原生书签同步。

## 已实现

- React 19 + TypeScript + Vite + Chrome Manifest V3。
- 扩展通过 `chrome_url_overrides.newtab` 直接接管 Chrome 新标签页，不需要 New Tab Redirect。
- Google 网页搜索/地址栏（默认），可切换 Bing、百度、DuckDuckGo。
- 完整递归展示多级文件夹，支持任意层级展开/收起。
- 未放入文件夹的书签单独展示，并可拖入真实 Chrome 文件夹。
- 浏览模式隐藏全部管理按钮；一个统一编辑模式同时处理页面排版和 Chrome 书签整理，不使用右键菜单。
- 任意书签都可通过可见操作按钮选择目标目录移动；移动调用 `chrome.bookmarks.move`，Chrome 原生书签立即同步更新。
- 编辑模式支持拖动书签排序；同目录拖动修改原生顺序，拖到其他文件夹会移动归类，并显示落点高亮。
- 编辑工具栏和文件夹操作区可新建真实 Chrome 文件夹或书签。
- 12 栏手动排版：整行、3/4、2/3、1/2、1/3、1/4，支持拖动排序和拖拽调整宽度。
- 七种文件夹组件：完整目录、图标宫格、混合组件、横向速览、紧凑堆叠、重点收藏、双栏阅读。
- 组件样式只作用于当前文件夹的直属书签；子文件夹始终保留独立分组并递归展示，可分别设置自己的组件样式。
- 新建组件会创建真实 Chrome 文件夹；拖入书签会调用 `chrome.bookmarks.move`。
- 原生书签事件实时监听，本地快照缓存用于快速首屏和短暂 API 异常兜底。
- 毛玻璃、纸感、深色、终端极光、轨道工坊、电路工作室六套主题；支持本地背景图、模糊、遮罩、密度和强调色。
- Xiangzi Folio JSON 完整备份/导入（书签 + 外观 + 排版），导入时重新映射 Chrome 分配的新 ID。
- Chrome Netscape HTML 导入/导出；导入内容写入原生书签，因此可进入 Chrome 同步。
- 三字符样式状态码：书签与文件夹的展示状态使用 `~` 加两个 Base64URL 字符保存，例如 `设计资源~VH`。12 位状态字包含无重复的混合进制数据、节点类型、版本和校验；页面会隐藏尾码。旧版 `[folio:...]`、`~xAB`、`~bAB` 仍可读取，并会安全迁移。

## 安装到 Chrome

1. 打开 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目的 `dist` 目录：`/Volumes/PortableSSD/code/software/xiangzi-folio/dist`。
5. 打开一个新标签页即可使用。

> 首次加载后，如果 Chrome 提示新标签页已被某扩展更改，选择保留即可。

## 本地开发

```bash
npm install
npm run dev
```

普通网页环境会启用一套可编辑的演示书签；加载为 Chrome 扩展时自动切换到原生书签 API。

生产构建与测试：

```bash
npm test
npm run build
```

## 数据与同步边界

- **书签内容**：唯一真实来源是 Chrome 原生书签。Xiangzi Folio 不需要 Google OAuth。
- **Google 同步**：由 Chrome 自身负责。Xiangzi Folio 不读取 Google 账号或云端接口。
- **书签与文件夹展示样式**：写入原生标题的三字符状态码，跟随 Chrome 书签同步；HTML 导出会输出干净标题，Xiangzi Folio JSON 备份保留完整状态，旧版本地配置首次启动会自动迁移。
- **主题、背景图等纯外观配置**：继续保存在 `chrome.storage.local`；可通过 Xiangzi Folio JSON 迁移。
- **本地缓存**：只保存最近一次书签树快照，用于加快加载，不替代 Chrome 书签。
- **背景图**：以本地 Data URL 保存，不会上传到网络。

## 目录

- `src/lib/bookmarks.ts`：Chrome/演示双适配器、HTML/JSON 导入导出。
- `src/components/FolderView.tsx`：递归文件夹、组件样式和书签拖放。
- `src/components/BookmarkMenus.tsx`：书签移动和多级目标目录选择。
- `src/App.tsx`：搜索、编辑模式、12 栏排版和设置。
- `public/manifest.json`：Chrome MV3 清单。
- `dist/`：可直接加载的构建结果。
