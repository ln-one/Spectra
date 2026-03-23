import { THEME_PRESETS } from "@/components/project/features/header/theme";
import {
  getProjectTheme,
  getProjectThemeAttributes,
  getProjectThemeStyle,
  resolveProjectThemePreset,
} from "@/app/projects/[id]/_views/theme";

describe("project theme contract", () => {
  it("provides style variant and tokens for every theme preset", () => {
    for (const preset of THEME_PRESETS) {
      const definition = getProjectTheme(preset.id);

      expect(definition.id).toBe(preset.id);
      expect(definition.styleVariant).toBeTruthy();
      expect(definition.colorTokens.accent).toBeTruthy();
      expect(definition.colorTokens.surface).toBeTruthy();
      expect(definition.componentTokens.panelRadius).toBeTruthy();
      expect(definition.componentTokens.panelShadow).toBeTruthy();
    }
  });

  it("falls back to mist-zinc for invalid local storage values", () => {
    expect(resolveProjectThemePreset(null)).toBe("mist-zinc");
    expect(resolveProjectThemePreset("unknown-theme")).toBe("mist-zinc");
  });

  it("returns data attributes that include style variant", () => {
    const attrs = getProjectThemeAttributes("ocean-cyan");

    expect(attrs["data-project-theme"]).toBe("ocean-cyan");
    expect(attrs["data-project-style"]).toBe("ocean-cyan");
  });

  it("maps every preset to its own style variant", () => {
    for (const preset of THEME_PRESETS) {
      const attrs = getProjectThemeAttributes(preset.id);
      expect(attrs["data-project-style"]).toBe(preset.id);
    }
  });

  it("keeps mist-zinc compatibility baseline values", () => {
    const style = getProjectThemeStyle("mist-zinc") as Record<string, string>;

    expect(style["--project-bg-base"]).toBe("#f4f4f5");
    expect(style["--project-panel-radius"]).toBe("1rem");
    expect(style["--project-control-bg"]).toBe("#ffffff");
    expect(style["--project-heading-weight"]).toBe("700");
  });
});
