import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import {
  ArrowsClockwise, ArrowCounterClockwise, Check, Image, PaintBrush, Rows,
  UploadSimple, X,
} from "@phosphor-icons/react";
import type { AppConfig } from "../types";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { prepareLocalImage } from "../lib/images";
import { createTranslator } from "../lib/i18n";
import { themePresetById, themePresets, withThemePreset } from "../lib/themes";

const accents = ["#8fb9ee", "#ff6b57", "#6558f5", "#2b9d78", "#e89f32", "#e6538e"];

type Props = {
  config: AppConfig;
  onConfig: (recipe: (value: AppConfig) => AppConfig) => void;
  onClose: () => void;
  onError: (message: string) => void;
};

// Range inputs fire on every pixel of drag. Writing straight to `config`
// there re-renders the whole app (bookmark grid included) once per tick even
// though only two CSS variables on the root actually need to move live. This
// keeps the slider's own live value in local state, pushes it to the DOM
// directly for instant feedback, and only commits the real config change
// (which the rest of the app reacts to) once the drag settles.
function useLiveConfigSlider(value: number, cssVar: string, format: (next: number) => string, commit: (next: number) => void): [number, (next: number) => void] {
  const [local, setLocal] = useState(value);
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setLocal(value); latest.current = value; }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onChange = (next: number) => {
    setLocal(next); latest.current = next;
    document.querySelector<HTMLElement>(".app")?.style.setProperty(cssVar, format(next));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(latest.current), 150);
  };
  return [local, onChange];
}

export function SettingsPanel({ config, onConfig, onClose, onError }: Props) {
  const imageInput = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const currentTheme = themePresetById[config.theme];
  const t = createTranslator(config.language);
  useDialogFocus(true, panelRef, onClose);
  const [liveBlur, onBlurChange] = useLiveConfigSlider(config.glassStrength, "--glass-blur", (next) => `${next}px`, (next) => onConfig((value) => ({ ...value, glassStrength: next })));
  const [liveShade, onShadeChange] = useLiveConfigSlider(config.backgroundShade, "--shade", (next) => `${next / 100}`, (next) => onConfig((value) => ({ ...value, backgroundShade: next })));
  const pickBackground = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const backgroundImage = await prepareLocalImage(file, { maxWidth: 1920, maxHeight: 1080, maxBytes: 2 * 1024 * 1024 });
      onConfig((value) => ({ ...value, backgroundImage }));
    } catch (reason) { onError(reason instanceof Error ? reason.message : t("settings.backgroundError")); }
    event.target.value = "";
  };

  return <aside ref={panelRef} className="settings-panel" role="dialog" aria-modal="true" aria-label={t("settings.title")}>
    <header><div><small>{t("settings.eyebrow")}</small><h2>{t("settings.title")}</h2></div><button className="icon-button" aria-label={t("settings.close")} onClick={onClose}><X /></button></header>
    <section><div className="setting-row"><div><h3>{t("settings.language")}</h3><p>{t("settings.languageHint")}</p></div><select aria-label={t("settings.language")} value={config.language} onChange={(event) => onConfig((value) => ({ ...value, language: event.target.value as AppConfig["language"] }))}><option value="auto">{t("language.auto")}</option><option value="zh-CN">{t("language.zh")}</option><option value="en">{t("language.en")}</option></select></div></section>
    <section className="theme-section"><h3><PaintBrush />{t("settings.themePresets")} <small>{t("settings.sets", { count: themePresets.length })}</small></h3><div className="theme-presets">{themePresets.map((theme) => {
      const previewStyle = { "--preview-background": theme.preview.background, "--preview-surface": theme.preview.surface, "--preview-ink": theme.preview.ink, "--preview-accent": theme.accent } as CSSProperties;
      const label = t(`theme.${theme.id}`);
      return <button key={theme.id} className={config.theme === theme.id ? "active" : ""} onClick={() => onConfig((value) => withThemePreset(value, theme.id))} aria-label={t("settings.useTheme", { theme: label })}>
        <span className="theme-preview" style={previewStyle}><i /><i /><i /></span>
        <span className="theme-preset__copy"><strong>{label}</strong><small>{t(`theme.${theme.id}.desc`)}</small></span>
        {config.theme === theme.id && <Check weight="bold" />}
      </button>;
    })}</div><div className="theme-summary"><span><strong>{t(`theme.${currentTheme.id}`)}</strong><small>{t(`theme.${currentTheme.id}.audience`)}</small></span><button onClick={() => onConfig((value) => withThemePreset(value, config.theme))}><ArrowCounterClockwise />{t("settings.restoreTheme")}</button></div></section>
    <section><div className="setting-row"><div><h3><Image />{t("settings.background")}</h3><p>{t("settings.backgroundHint")}</p></div><button className="button button--soft" onClick={() => imageInput.current?.click()}><UploadSimple />{t("settings.chooseImage")}</button><input ref={imageInput} hidden type="file" accept="image/*" onChange={pickBackground} /></div>{config.backgroundImage && <div className="background-preview" style={{ backgroundImage: `url(${config.backgroundImage})` }}><button onClick={() => onConfig((value) => ({ ...value, backgroundImage: "" }))}>{t("settings.restoreBackground")}</button></div>}</section>
    <section><label className="range-label"><span><strong>{t("settings.blur")}</strong><small className="range-value">{liveBlur}px</small></span><input type="range" min="0" max="36" value={liveBlur} onChange={(event) => onBlurChange(Number(event.target.value))} /></label><label className="range-label"><span><strong>{t("settings.shade")}</strong><small className="range-value">{liveShade}%</small></span><input type="range" min="0" max="75" value={liveShade} onChange={(event) => onShadeChange(Number(event.target.value))} /></label></section>
    <section><h3><Rows />{t("settings.density")}</h3><div className="segmented"><button className={config.density === "comfortable" ? "active" : ""} onClick={() => onConfig((value) => ({ ...value, density: "comfortable" }))}>{t("settings.comfortable")}</button><button className={config.density === "compact" ? "active" : ""} onClick={() => onConfig((value) => ({ ...value, density: "compact" }))}>{t("settings.compact")}</button></div></section>
    <section><div className="setting-row"><div><h3><ArrowsClockwise />{t("settings.recent")}</h3><p>{t("settings.recentHint")}</p></div><button className={`toggle ${config.recentClickToFront ? "active" : ""}`} role="switch" aria-label={t("settings.recent")} aria-checked={config.recentClickToFront} onClick={() => onConfig((value) => ({ ...value, recentClickToFront: !value.recentClickToFront }))}><span /></button></div></section>
    <section><h3>{t("settings.accent")}</h3><div className="color-row">{accents.map((color) => <button key={color} aria-label={color} className={config.accent === color ? "active" : ""} style={{ backgroundColor: color }} onClick={() => onConfig((value) => ({ ...value, accent: color }))} />)}</div></section>
    <p className="settings-note">{t("settings.note")}</p>
  </aside>;
}
