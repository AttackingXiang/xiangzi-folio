import type { AppConfig, ThemeMode } from "../types";

export type ThemePreset = {
  id: ThemeMode;
  label: string;
  description: string;
  audience: string;
  group: "精选" | "明亮" | "自然" | "深色";
  accent: string;
  glassStrength: number;
  backgroundShade: number;
  preview: { background: string; surface: string; ink: string };
};

export const themePresets: ThemePreset[] = [
  { id: "orbital", label: "轨道工坊", description: "深蓝摄影玻璃", audience: "开发者与效率用户", group: "精选", accent: "#8fb9ee", glassStrength: 20, backgroundShade: 10, preview: { background: "linear-gradient(145deg,#10253c,#526273 62%,#9a725f)", surface: "rgba(87,105,132,.72)", ink: "#f7f9fd" } },
  { id: "glass", label: "晨雾玻璃", description: "奶油薄荷微光", audience: "日常与轻量用户", group: "精选", accent: "#6558f5", glassStrength: 22, backgroundShade: 4, preview: { background: "linear-gradient(145deg,#fff6df,#dff1e8 58%,#dfe8ff)", surface: "rgba(255,255,255,.72)", ink: "#202729" } },
  { id: "dusk", label: "暮色空间", description: "蓝紫建筑黄昏", audience: "设计师与创意用户", group: "精选", accent: "#9da9ff", glassStrength: 18, backgroundShade: 10, preview: { background: "linear-gradient(145deg,#102c51,#676892 62%,#e49b6b)", surface: "rgba(54,61,91,.7)", ink: "#fbfbff" } },
  { id: "paper", label: "象牙纸感", description: "温暖纸张与墨色", audience: "写作者与阅读用户", group: "明亮", accent: "#8c6b43", glassStrength: 0, backgroundShade: 0, preview: { background: "linear-gradient(145deg,#f8f2e5,#e9dfcd)", surface: "#fffaf0", ink: "#392f25" } },
  { id: "nordic", label: "北欧晨光", description: "冷白与雾霾蓝", audience: "办公与极简用户", group: "明亮", accent: "#5e88a5", glassStrength: 14, backgroundShade: 0, preview: { background: "linear-gradient(145deg,#f7faf9,#dfeae8 58%,#cbdbe6)", surface: "rgba(255,255,255,.8)", ink: "#263438" } },
  { id: "sakura", label: "樱雾", description: "柔粉与珍珠白", audience: "生活方式用户", group: "明亮", accent: "#d87896", glassStrength: 18, backgroundShade: 3, preview: { background: "linear-gradient(145deg,#fff4f4,#f3dce7 62%,#deddf4)", surface: "rgba(255,250,252,.78)", ink: "#48343d" } },
  { id: "ink", label: "水墨留白", description: "克制灰白与青墨", audience: "中文阅读与研究用户", group: "明亮", accent: "#4f6d70", glassStrength: 0, backgroundShade: 0, preview: { background: "linear-gradient(145deg,#f3f3ef,#dfe3df 68%,#b7c5c2)", surface: "rgba(250,250,247,.9)", ink: "#252c2b" } },
  { id: "clarity", label: "清晰高对比", description: "无模糊易读界面", audience: "低视力与专注用户", group: "明亮", accent: "#0967d2", glassStrength: 0, backgroundShade: 0, preview: { background: "linear-gradient(145deg,#ffffff,#e9f1fb)", surface: "#ffffff", ink: "#111827" } },
  { id: "forest", label: "森林书房", description: "松绿与木质暖光", audience: "自然与专注用户", group: "自然", accent: "#6fa27c", glassStrength: 16, backgroundShade: 10, preview: { background: "linear-gradient(145deg,#17392f,#496b56 62%,#a18766)", surface: "rgba(42,70,58,.72)", ink: "#f5fbf6" } },
  { id: "ocean", label: "深海蓝", description: "海湾蓝与冷青", audience: "沉浸与夜间用户", group: "自然", accent: "#5bc0d1", glassStrength: 18, backgroundShade: 16, preview: { background: "linear-gradient(145deg,#05263b,#176177 62%,#6cb6b4)", surface: "rgba(14,60,78,.72)", ink: "#f2fbfd" } },
  { id: "desert", label: "沙丘暖阳", description: "陶土与沙金暖色", audience: "摄影与旅行用户", group: "自然", accent: "#c77d4e", glassStrength: 10, backgroundShade: 3, preview: { background: "linear-gradient(145deg,#f3dfc1,#d9a776 60%,#a96246)", surface: "rgba(255,244,226,.74)", ink: "#422d22" } },
  { id: "night", label: "午夜静谧", description: "中性黑与柔和蓝", audience: "通用夜间用户", group: "深色", accent: "#7da7ff", glassStrength: 16, backgroundShade: 25, preview: { background: "linear-gradient(145deg,#0c1218,#202d38)", surface: "rgba(30,41,49,.82)", ink: "#f2f6f7" } },
  { id: "terminal", label: "终端极光", description: "冷蓝工作室玻璃", audience: "工程师与极客用户", group: "深色", accent: "#73b9ff", glassStrength: 20, backgroundShade: 18, preview: { background: "linear-gradient(145deg,#14253d,#3f5770 62%,#66869c)", surface: "rgba(67,88,111,.72)", ink: "#f5f7fb" } },
  { id: "circuit", label: "电路工作室", description: "烟粉与金属暖灰", audience: "硬件与创客用户", group: "深色", accent: "#e5a184", glassStrength: 18, backgroundShade: 15, preview: { background: "linear-gradient(145deg,#322a30,#655258 62%,#a68172)", surface: "rgba(104,84,91,.72)", ink: "#faf7f3" } },
  { id: "graphite", label: "石墨商务", description: "稳重灰黑与银蓝", audience: "商务与专业用户", group: "深色", accent: "#a8b8d1", glassStrength: 8, backgroundShade: 18, preview: { background: "linear-gradient(145deg,#151a21,#343d49 62%,#677384)", surface: "rgba(47,56,67,.86)", ink: "#f6f8fb" } },
];

export const themePresetById = Object.fromEntries(themePresets.map((theme) => [theme.id, theme])) as Record<ThemeMode, ThemePreset>;

export function withThemePreset(config: AppConfig, id: ThemeMode): AppConfig {
  const preset = themePresetById[id];
  return { ...config, theme: id, accent: preset.accent, glassStrength: preset.glassStrength, backgroundShade: preset.backgroundShade };
}
