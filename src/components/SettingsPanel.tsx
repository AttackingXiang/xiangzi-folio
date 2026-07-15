import { useRef, type ChangeEvent, type CSSProperties } from "react";
import {
  ArrowsClockwise, ArrowCounterClockwise, Check, Image, PaintBrush, Rows,
  UploadSimple, X,
} from "@phosphor-icons/react";
import type { AppConfig } from "../types";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { prepareLocalImage } from "../lib/images";
import { themePresetById, themePresets, withThemePreset } from "../lib/themes";

const accents = ["#8fb9ee", "#ff6b57", "#6558f5", "#2b9d78", "#e89f32", "#e6538e"];

type Props = {
  config: AppConfig;
  onConfig: (recipe: (value: AppConfig) => AppConfig) => void;
  onClose: () => void;
  onError: (message: string) => void;
};

export function SettingsPanel({ config, onConfig, onClose, onError }: Props) {
  const imageInput = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const currentTheme = themePresetById[config.theme];
  useDialogFocus(true, panelRef, onClose);
  const pickBackground = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const backgroundImage = await prepareLocalImage(file, { maxWidth: 1920, maxHeight: 1080, maxBytes: 2 * 1024 * 1024 });
      onConfig((value) => ({ ...value, backgroundImage }));
    } catch (reason) { onError(reason instanceof Error ? reason.message : "背景图处理失败"); }
    event.target.value = "";
  };

  return <aside ref={panelRef} className="settings-panel" role="dialog" aria-modal="true" aria-label="主页设置">
    <header><div><small>外观与体验</small><h2>主页设置</h2></div><button className="icon-button" aria-label="关闭设置" onClick={onClose}><X /></button></header>
    <section className="theme-section"><h3><PaintBrush />主题预设 <small>15 套</small></h3><div className="theme-presets">{themePresets.map((theme) => {
      const previewStyle = { "--preview-background": theme.preview.background, "--preview-surface": theme.preview.surface, "--preview-ink": theme.preview.ink, "--preview-accent": theme.accent } as CSSProperties;
      return <button key={theme.id} className={config.theme === theme.id ? "active" : ""} onClick={() => onConfig((value) => withThemePreset(value, theme.id))} aria-label={`使用${theme.label}主题`}>
        <span className="theme-preview" style={previewStyle}><i /><i /><i /></span>
        <span className="theme-preset__copy"><strong>{theme.label}</strong><small>{theme.description}</small></span>
        {config.theme === theme.id && <Check weight="bold" />}
      </button>;
    })}</div><div className="theme-summary"><span><strong>{currentTheme.label}</strong><small>{currentTheme.audience}</small></span><button onClick={() => onConfig((value) => withThemePreset(value, config.theme))}><ArrowCounterClockwise />恢复主题默认</button></div></section>
    <section><div className="setting-row"><div><h3><Image />背景图</h3><p>本地保存；上传图片始终覆盖主题背景</p></div><button className="button button--soft" onClick={() => imageInput.current?.click()}><UploadSimple />选择图片</button><input ref={imageInput} hidden type="file" accept="image/*" onChange={pickBackground} /></div>{config.backgroundImage && <div className="background-preview" style={{ backgroundImage: `url(${config.backgroundImage})` }}><button onClick={() => onConfig((value) => ({ ...value, backgroundImage: "" }))}>恢复主题背景</button></div>}</section>
    <section><label className="range-label"><span><strong>玻璃模糊</strong><small className="range-value">{config.glassStrength}px</small></span><input type="range" min="0" max="36" value={config.glassStrength} onChange={(event) => onConfig((value) => ({ ...value, glassStrength: Number(event.target.value) }))} /></label><label className="range-label"><span><strong>背景遮罩</strong><small className="range-value">{config.backgroundShade}%</small></span><input type="range" min="0" max="75" value={config.backgroundShade} onChange={(event) => onConfig((value) => ({ ...value, backgroundShade: Number(event.target.value) }))} /></label></section>
    <section><h3><Rows />内容密度</h3><div className="segmented"><button className={config.density === "comfortable" ? "active" : ""} onClick={() => onConfig((value) => ({ ...value, density: "comfortable" }))}>舒适</button><button className={config.density === "compact" ? "active" : ""} onClick={() => onConfig((value) => ({ ...value, density: "compact" }))}>紧凑</button></div></section>
    <section><div className="setting-row"><div><h3><ArrowsClockwise />最近点击置顶</h3><p>不在同级前 5 名时，点击后移到最前面</p></div><button className={`toggle ${config.recentClickToFront ? "active" : ""}`} role="switch" aria-label="最近点击置顶" aria-checked={config.recentClickToFront} onClick={() => onConfig((value) => ({ ...value, recentClickToFront: !value.recentClickToFront }))}><span /></button></div></section>
    <section><h3>强调色</h3><div className="color-row">{accents.map((color) => <button key={color} aria-label={color} className={config.accent === color ? "active" : ""} style={{ backgroundColor: color }} onClick={() => onConfig((value) => ({ ...value, accent: color }))} />)}</div></section>
    <p className="settings-note">主题与背景保存在本机；书签和文件夹的展示样式使用三字符尾码随 Chrome 书签同步。</p>
  </aside>;
}
