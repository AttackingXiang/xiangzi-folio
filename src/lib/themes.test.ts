import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import { themePresetById, themePresets, withThemePreset } from "./themes";

describe("theme presets", () => {
  it("defines 15 uniquely addressable curated themes", () => {
    expect(themePresets).toHaveLength(15);
    expect(new Set(themePresets.map(({ id }) => id)).size).toBe(15);
    expect(new Set(themePresets.map(({ label }) => label)).size).toBe(15);
    expect(Object.keys(themePresetById)).toHaveLength(15);
  });

  it("keeps every preset within supported visual ranges", () => {
    for (const preset of themePresets) {
      expect(preset.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(preset.glassStrength).toBeGreaterThanOrEqual(0);
      expect(preset.glassStrength).toBeLessThanOrEqual(30);
      expect(preset.backgroundShade).toBeGreaterThanOrEqual(0);
      expect(preset.backgroundShade).toBeLessThanOrEqual(50);
      expect(preset.description.trim()).not.toBe("");
      expect(preset.audience.trim()).not.toBe("");
    }
  });

  it("applies a preset without replacing the user's local background", () => {
    const current = { ...defaultConfig, backgroundImage: "data:image/jpeg;base64,user-image" };
    const next = withThemePreset(current, "dusk");

    expect(next).toMatchObject({
      theme: "dusk",
      accent: themePresetById.dusk.accent,
      glassStrength: themePresetById.dusk.glassStrength,
      backgroundShade: themePresetById.dusk.backgroundShade,
      backgroundImage: current.backgroundImage,
    });
  });
});
