import { describe, expect, it } from "vitest";
import { createTranslator } from "./i18n";

describe("internationalization", () => {
  it("translates settings and interpolates operation labels", () => {
    expect(createTranslator("zh-CN")("settings.title")).toBe("主页设置");
    expect(createTranslator("en")("settings.title")).toBe("Home settings");
    expect(createTranslator("en")("common.moveInto", { title: "Research" })).toBe("Move into “Research”");
  });
});
