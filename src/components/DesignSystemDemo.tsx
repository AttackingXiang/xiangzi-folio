import { useMemo, useState, type ComponentType } from "react";
import {
  ArrowDown, ArrowUpRight, ArrowsClockwise, Bell, BookmarkSimple, Browsers, CalendarBlank, Camera,
  ChartBar, Check, CheckCircle, CircleHalf, Cloud, Code, Command, Compass,
  Copy, Database, DeviceMobile, DownloadSimple, DotsThree, Eye, EyeSlash, FileText, FigmaLogo, FolderSimple,
  GearSix, GithubLogo, Globe, GridFour, Heart, House, Info, LinkSimple, List, LockSimple,
  MagnifyingGlass, Monitor, NotePencil, Palette, PencilSimple, Plus, Rows,
  ShieldCheck, SlidersHorizontal, Sparkle, SquaresFour, StackSimple, Star, TerminalWindow, Trash,
  UploadSimple, Warning, X,
} from "@phosphor-icons/react";
import { themePresetById } from "../lib/themes";
import type { ThemeMode } from "../types";

type IconComponent = ComponentType<any>;

type IconEntry = { name: string; usage: string; icon: IconComponent; tone?: string };

const iconGroups: Array<{ id: string; title: string; description: string; icons: IconEntry[] }> = [
  {
    id: "navigation",
    title: "导航与层级",
    description: "用于页面入口、路径、内容层级和收藏关系。",
    icons: [
      { name: "首页", usage: "Home / root", icon: House },
      { name: "探索", usage: "Discover / browse", icon: Compass },
      { name: "文件夹", usage: "Folder / collection", icon: FolderSimple },
      { name: "书签", usage: "Bookmark / save", icon: BookmarkSimple },
      { name: "网格", usage: "Grid / overview", icon: SquaresFour },
      { name: "列表", usage: "List / detail", icon: List },
      { name: "堆叠", usage: "Stack / layers", icon: StackSimple },
      { name: "返回", usage: "Back / previous", icon: ArrowDown },
    ],
  },
  {
    id: "actions",
    title: "操作与编辑",
    description: "用于新增、编辑、复制、上传和删除等明确动作。",
    icons: [
      { name: "新增", usage: "Create / add", icon: Plus },
      { name: "编辑", usage: "Edit / rename", icon: PencilSimple },
      { name: "复制", usage: "Duplicate / copy", icon: Copy },
      { name: "下载", usage: "Download / export", icon: DownloadSimple },
      { name: "上传", usage: "Upload / import", icon: UploadSimple },
      { name: "刷新", usage: "Refresh / sync", icon: ArrowsClockwise },
      { name: "删除", usage: "Delete / remove", icon: Trash },
      { name: "链接", usage: "Link / external", icon: LinkSimple },
    ],
  },
  {
    id: "system",
    title: "系统与状态",
    description: "用于设置、通知、成功反馈和需要用户注意的状态。",
    icons: [
      { name: "设置", usage: "Settings / preferences", icon: GearSix },
      { name: "筛选", usage: "Filter / controls", icon: SlidersHorizontal },
      { name: "通知", usage: "Notification / inbox", icon: Bell },
      { name: "完成", usage: "Success / done", icon: CheckCircle, tone: "success" },
      { name: "信息", usage: "Info / hint", icon: Info, tone: "info" },
      { name: "警告", usage: "Warning / caution", icon: Warning, tone: "warning" },
      { name: "隐私", usage: "Privacy / secure", icon: ShieldCheck },
      { name: "锁定", usage: "Locked / private", icon: LockSimple },
    ],
  },
  {
    id: "content",
    title: "内容与工作",
    description: "用于文档、数据、设备和工作台入口。",
    icons: [
      { name: "文档", usage: "Document / notes", icon: FileText },
      { name: "笔记", usage: "Note / writing", icon: NotePencil },
      { name: "日历", usage: "Calendar / schedule", icon: CalendarBlank },
      { name: "数据", usage: "Database / storage", icon: Database },
      { name: "报表", usage: "Analytics / metrics", icon: ChartBar },
      { name: "桌面端", usage: "Desktop / monitor", icon: Monitor },
      { name: "移动端", usage: "Mobile / device", icon: DeviceMobile },
      { name: "云端", usage: "Cloud / online", icon: Cloud },
    ],
  },
  {
    id: "brands",
    title: "品牌与工具",
    description: "仅用于识别品牌或产品来源，不承担主要操作语义。",
    icons: [
      { name: "Figma", usage: "Brand / design", icon: FigmaLogo },
      { name: "GitHub", usage: "Brand / code", icon: GithubLogo },
      { name: "网页", usage: "Browser / website", icon: Browsers },
      { name: "终端", usage: "Developer / terminal", icon: TerminalWindow },
      { name: "代码", usage: "Code / repository", icon: Code },
      { name: "全球", usage: "Web / global", icon: Globe },
      { name: "相机", usage: "Photo / media", icon: Camera },
      { name: "创意", usage: "Creative / sparkle", icon: Sparkle },
    ],
  },
];

const themeRecipes: Array<{
  id: ThemeMode;
  name: string;
  label: string;
  audience: string;
  recipe: string;
  folder: string;
  density: string;
  controls: string;
  recommended?: boolean;
}> = [
  { id: "nordic", name: "北欧晨光", label: "清爽默认", audience: "办公、日常书签", recipe: "冷白雾蓝 × 柔和玻璃 × 目录卡片", folder: "完整目录", density: "舒适", controls: "主按钮 + 柔和次按钮", recommended: true },
  { id: "glass", name: "晨雾玻璃", label: "轻盈收藏", audience: "日常、灵感收集", recipe: "奶油薄荷 × 半透明表面 × 混合组件", folder: "混合组件", density: "舒适", controls: "图标按钮 + 轻量链接" },
  { id: "paper", name: "象牙纸感", label: "编辑阅读", audience: "写作者、研究者", recipe: "暖纸白 × 墨色 × 双栏阅读", folder: "双栏阅读", density: "舒适", controls: "描边按钮 + 文本操作" },
  { id: "orbital", name: "轨道工坊", label: "沉浸工作台", audience: "开发者、效率用户", recipe: "摄影蓝灰 × 低对比玻璃 × 重点收藏", folder: "重点收藏", density: "紧凑", controls: "高对比主按钮 + 工具组" },
  { id: "dusk", name: "暮色空间", label: "创意聚焦", audience: "设计师、创意用户", recipe: "蓝紫黄昏 × 深色玻璃 × 紧凑堆叠", folder: "紧凑堆叠", density: "紧凑", controls: "强调色按钮 + 选择态" },
  { id: "clarity", name: "清晰高对比", label: "无障碍优先", audience: "低视力、专注用户", recipe: "高对比白 × 无模糊 × 图标宫格", folder: "图标宫格", density: "舒适", controls: "明确文字按钮 + 状态反馈" },
];

const buttonGroups: Array<{ id: string; title: string; description: string; buttons: Array<{ label: string; className: string; icon: IconComponent; iconOnly?: boolean }> }> = [
  {
    id: "primary",
    title: "主要动作",
    description: "每个区域最多保留一个视觉最重的动作。",
    buttons: [
      { label: "新建书签", className: "demo-button--primary", icon: Plus },
      { label: "保存更改", className: "demo-button--primary", icon: Check },
      { label: "打开链接", className: "demo-button--primary", icon: ArrowUpRight },
    ],
  },
  {
    id: "secondary",
    title: "次级动作",
    description: "保留结构和可点击感，但不抢主任务注意力。",
    buttons: [
      { label: "编辑", className: "demo-button--secondary", icon: PencilSimple },
      { label: "导出", className: "demo-button--secondary", icon: DownloadSimple },
      { label: "调整显示", className: "demo-button--secondary", icon: SlidersHorizontal },
    ],
  },
  {
    id: "quiet",
    title: "低强调动作",
    description: "用于辅助、取消或上下文操作，适合成组出现。",
    buttons: [
      { label: "取消", className: "demo-button--quiet", icon: X },
      { label: "更多", className: "demo-button--quiet", icon: StackSimple },
      { label: "隐藏背景", className: "demo-button--quiet", icon: EyeSlash },
    ],
  },
  {
    id: "icon",
    title: "图标动作",
    description: "只在语义足够稳定时使用，必须配备可访问名称。",
    buttons: [
      { label: "搜索", className: "demo-button--icon", icon: MagnifyingGlass, iconOnly: true },
      { label: "收藏", className: "demo-button--icon", icon: Heart, iconOnly: true },
      { label: "设置", className: "demo-button--icon", icon: GearSix, iconOnly: true },
    ],
  },
];

function ThemeMiniPreview({ id }: { id: ThemeMode }) {
  const theme = themePresetById[id];
  return (
    <div className="demo-theme-preview" style={{ background: theme.preview.background, color: theme.preview.ink }}>
      <div className="demo-theme-preview__top">
        <div className="demo-theme-preview__brand"><span style={{ background: theme.accent }} />Folio</div>
        <div className="demo-theme-preview__search"><MagnifyingGlass />搜索书签</div>
        <span className="demo-theme-preview__dot" style={{ background: theme.accent }} />
      </div>
      <div className="demo-theme-preview__shelf" style={{ background: theme.preview.surface, borderColor: `${theme.accent}55` }}>
        {['ChatGPT', '设计资源', '开发工具'].map((label, index) => <span key={label} style={{ background: index === 0 ? `${theme.accent}33` : `${theme.preview.ink}12` }}>{label}</span>)}
      </div>
      <div className="demo-theme-preview__folders">
        {["设计与灵感", "今日工作", "阅读清单"].map((label, index) => <div key={label} style={{ background: theme.preview.surface, borderColor: `${theme.preview.ink}22` }}><FolderSimple style={{ color: theme.accent }} /><strong>{label}</strong><small>{index + 3} 个入口</small></div>)}
      </div>
    </div>
  );
}

export function DesignSystemDemo() {
  const [activeTheme, setActiveTheme] = useState<ThemeMode>("nordic");
  const [iconFilter, setIconFilter] = useState("全部");
  const [selectedButton, setSelectedButton] = useState("新建书签");
  const [showTransparency, setShowTransparency] = useState(false);
  const activePreset = themePresetById[activeTheme];
  const visibleGroups = useMemo(() => iconFilter === "全部" ? iconGroups : iconGroups.filter((group) => group.title === iconFilter), [iconFilter]);

  return (
    <div className="design-demo" style={{ "--demo-accent": activePreset.accent } as React.CSSProperties}>
      <header className="design-demo__header">
        <a className="design-demo__brand" href="/" aria-label="返回 Folio">
          <span className="design-demo__brand-mark"><SquaresFour weight="fill" /></span>
          <span><strong>Xiangzi Folio</strong><small>DESIGN SYSTEM / SHOWCASE</small></span>
        </a>
        <div className="design-demo__header-actions">
          <span className="design-demo__version">v1.1 · local reference</span>
          <a className="demo-button demo-button--quiet" href="#themes"><Palette />主题组合</a>
          <a className="demo-button demo-button--primary" href="#icons"><GridFour />图标索引</a>
        </div>
      </header>

      <div className="design-demo__layout">
        <aside className="design-demo__aside">
          <span className="design-demo__eyebrow">FOLIO / VISUAL KIT</span>
          <h1>把风格、图标和动作组合成可执行的默认主题。</h1>
          <p>这是一份贴近真实页面的设计资产展示：图标沿用 Phosphor，主题沿用 Folio 的 15 套 token，按钮组合对应实际书签管理场景。</p>
          <nav className="design-demo__nav" aria-label="展示内容">
            <a href="#overview"><span>01</span>系统概览</a>
            <a href="#themes"><span>02</span>默认主题组合</a>
            <a href="#icons"><span>03</span>主流图标索引</a>
            <a href="#buttons"><span>04</span>功能按钮组合</a>
            <a href="#guidance"><span>05</span>使用规则</a>
          </nav>
          <div className="design-demo__aside-note"><CircleHalf />当前预览：{activePreset.label}<strong>{activePreset.description}</strong></div>
        </aside>

        <main className="design-demo__main">
          <section id="overview" className="demo-section demo-hero">
            <div className="demo-hero__copy">
              <span className="demo-kicker"><Sparkle weight="fill" /> READY-TO-MIX / 01</span>
              <h2>一个默认主题，不只是颜色。</h2>
              <p>它还应该同时决定表面透明度、文件夹结构、信息密度、按钮层级和图标语气。下面的组合卡片可以作为新主题或产品落地页的起始配方。</p>
              <div className="demo-hero__actions">
                <a className="demo-button demo-button--primary" href="#themes"><Sparkle />查看推荐组合</a>
                <a className="demo-button demo-button--secondary" href="#icons"><GridFour />浏览图标</a>
              </div>
            </div>
            <div className="demo-hero__stage" style={{ background: activePreset.preview.background }}>
              <div className="demo-hero__stage-glow" style={{ background: activePreset.accent }} />
              <div className="demo-hero__window" style={{ color: activePreset.preview.ink }}>
                <div className="demo-hero__window-bar"><span /><span /><span /><small>new tab / folio</small><DotsThree /></div>
                <div className="demo-hero__window-search" style={{ background: activePreset.preview.surface }}><MagnifyingGlass />搜索书签，或使用 Google 搜索 <ArrowUpRight /></div>
                <div className="demo-hero__window-grid">
                  <div className="demo-hero__feature" style={{ background: activePreset.preview.surface, borderColor: `${activePreset.accent}66` }}><div><Star weight="fill" style={{ color: activePreset.accent }} /><span>快捷入口</span></div><strong>让每天打开的页面<br />先被看见。</strong><small>5 quick links · local first</small></div>
                  <div className="demo-hero__folder-stack"><div style={{ background: activePreset.preview.surface }}><FolderSimple style={{ color: activePreset.accent }} /><span>设计与灵感</span><small>7</small></div><div style={{ background: activePreset.preview.surface }}><FolderSimple style={{ color: activePreset.accent }} /><span>开发工具</span><small>5</small></div><div style={{ background: activePreset.preview.surface }}><FolderSimple style={{ color: activePreset.accent }} /><span>今日工作</span><small>4</small></div></div>
                </div>
              </div>
            </div>
          </section>

          <section id="themes" className="demo-section">
            <div className="demo-section__heading"><div><span className="demo-kicker">02 / THEME RECIPES</span><h2>默认主题组合</h2></div><p>先选一个用户场景，再决定表面、文件夹和动作层级。不要只换一套颜色。</p></div>
            <div className="demo-theme-grid">
              {themeRecipes.map((recipe) => {
                const preset = themePresetById[recipe.id];
                const selected = activeTheme === recipe.id;
                return <button className={`demo-theme-card ${selected ? "is-selected" : ""}`} type="button" key={recipe.id} onClick={() => setActiveTheme(recipe.id)} aria-pressed={selected}>
                  <div className="demo-theme-card__preview"><ThemeMiniPreview id={recipe.id} />{recipe.recommended && <span className="demo-theme-card__badge"><Star weight="fill" />推荐默认</span>}</div>
                  <div className="demo-theme-card__copy"><div><span className="demo-theme-card__label">{recipe.label}</span><h3>{recipe.name}</h3></div><span className="demo-theme-card__check">{selected ? <CheckCircle weight="fill" /> : <CircleHalf />}</span><p>{recipe.audience}</p><small>{recipe.recipe}</small></div>
                  <div className="demo-theme-card__meta"><span><FolderSimple />{recipe.folder}</span><span><Rows />{recipe.density}</span><span><Command />{recipe.controls}</span></div>
                  <div className="demo-theme-card__swatches"><i style={{ background: preset.accent }} /><i style={{ background: preset.preview.surface }} /><i style={{ background: preset.preview.ink }} /><em>{preset.accent}</em></div>
                </button>;
              })}
            </div>
            <div className="demo-combo-strip">
              <div><span className="demo-kicker">ACTIVE PREVIEW</span><strong>{activePreset.label} · {activePreset.description}</strong><small>点击上方卡片切换舞台预览，当前强调色为 {activePreset.accent}。</small></div>
              <div className="demo-combo-strip__controls"><button type="button" className={`demo-toggle ${showTransparency ? "is-on" : ""}`} aria-pressed={showTransparency} onClick={() => setShowTransparency((value) => !value)}>{showTransparency ? <EyeSlash /> : <Eye />}文件夹透明背景</button><span className={`demo-surface-swatch ${showTransparency ? "is-transparent" : ""}`} style={{ background: showTransparency ? "transparent" : activePreset.preview.surface, borderColor: activePreset.accent }}><FolderSimple />文件夹框</span></div>
            </div>
          </section>

          <section id="icons" className="demo-section">
            <div className="demo-section__heading"><div><span className="demo-kicker">03 / ICON LIBRARY</span><h2>主流图标索引</h2></div><p>使用稳定、可识别的语义图标；品牌图标只表达来源，不代替操作含义。</p></div>
            <div className="demo-filter-row" role="tablist" aria-label="图标分类"><button type="button" className={iconFilter === "全部" ? "is-active" : ""} onClick={() => setIconFilter("全部")}>全部 <span>{iconGroups.reduce((sum, group) => sum + group.icons.length, 0)}</span></button>{iconGroups.map((group) => <button type="button" key={group.id} className={iconFilter === group.title ? "is-active" : ""} onClick={() => setIconFilter(group.title)}>{group.title} <span>{group.icons.length}</span></button>)}</div>
            <div className="demo-icon-groups">{visibleGroups.map((group) => <div className="demo-icon-group" key={group.id}><div className="demo-icon-group__heading"><div><h3>{group.title}</h3><p>{group.description}</p></div><span>{group.icons.length} icons</span></div><div className="demo-icon-grid">{group.icons.map((item) => { const Icon = item.icon; return <div className="demo-icon-card" key={item.name}><span className={`demo-icon-card__glyph ${item.tone ? `is-${item.tone}` : ""}`}><Icon weight="regular" /></span><strong>{item.name}</strong><small>{item.usage}</small><code>20 / regular</code></div>; })}</div></div>)}</div>
            <div className="demo-icon-specs"><div><span>16 px</span><small>行内状态</small></div><div><span>20 px</span><small>常规按钮</small></div><div><span>24 px</span><small>快捷入口</small></div><div><span>32 px</span><small>空状态 / 特性</small></div><div><span>regular</span><small>默认语气</small></div><div><span>duotone</span><small>强调层级</small></div></div>
          </section>

          <section id="buttons" className="demo-section">
            <div className="demo-section__heading"><div><span className="demo-kicker">04 / ACTION PATTERNS</span><h2>功能按钮组合</h2></div><p>把动作分成主要、次级、低强调和图标四种层级，让每个区域都有清晰的下一步。</p></div>
            <div className="demo-button-layout"><div className="demo-button-groups">{buttonGroups.map((group) => <div className="demo-button-group" key={group.id}><div><h3>{group.title}</h3><p>{group.description}</p></div><div className="demo-button-row">{group.buttons.map((button) => { const Icon = button.icon; return <button type="button" key={button.label} aria-label={button.label} className={`demo-button ${button.className} ${button.iconOnly ? "demo-button--icon-only" : ""} ${selectedButton === button.label ? "is-picked" : ""}`} onClick={() => setSelectedButton(button.label)}>{button.iconOnly ? <Icon /> : <><Icon />{button.label}</>}</button>; })}</div></div>)}</div><div className="demo-button-rail"><span className="demo-kicker">INTERACTION STATE</span><div className="demo-button-rail__icon"><CheckCircle weight="fill" /></div><h3>{selectedButton}</h3><p>点击任意按钮可以查看选择态。实际页面建议保留明确的文本名称，只有通用且高频的动作才使用纯图标。</p><div className="demo-button-rail__stack"><span><Check />可访问名称</span><span><Check />hover 上浮 1px</span><span><Check />focus 保留强调色轮廓</span></div></div></div>
          </section>

          <section id="guidance" className="demo-section demo-guidance">
            <div className="demo-section__heading"><div><span className="demo-kicker">05 / USAGE RULES</span><h2>落地时的五条规则</h2></div><p>这些规则会让图标、主题和按钮在不同页面继续保持同一套产品气质。</p></div>
            <div className="demo-guidance__grid">{[
              ["01", "一个区域一个主动作", "主按钮只承担最重要的下一步，其他动作降级为次级或低强调。"],
              ["02", "图标必须可解释", "没有稳定语义的动作不要只放图标；必要时补充 tooltip 和 aria-label。"],
              ["03", "透明不等于无层次", "文件夹框可透明，但标题、边界或局部表面仍应保留轻微层次。"],
              ["04", "主题是完整配方", "背景、表面、密度、文件夹布局和按钮语气必须一起调。"],
              ["05", "品牌图标不做导航", "Figma、GitHub 等图标用于识别来源，页面导航仍使用通用语义图标。"],
            ].map(([number, title, text]) => <div key={number} className="demo-guidance__item"><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div>
          </section>
        </main>
      </div>
      <footer className="design-demo__footer"><span><SquaresFour weight="fill" /> Xiangzi Folio Design System</span><a href="/">返回实际主页 <ArrowUpRight /></a><small>图标：Phosphor Icons · 主题：Folio token system · 本页为本地展示 demo</small></footer>
    </div>
  );
}
