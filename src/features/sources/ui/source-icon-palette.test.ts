import { describe, expect, test } from "vitest";
import { ARTIFACT_TONE_PALETTE, SOURCE_ICON_PALETTE } from "./source-icon-palette";

const NON_TEXT_CONTRAST_TARGET = 3;

function relativeLuminance(hex: string) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Invalid hex color: ${hex}`);
  const channel = (value: string | undefined) => {
    if (!value) throw new Error(`Invalid hex color: ${hex}`);
    return Number.parseInt(value, 16) / 255;
  };
  const linearize = (value: number) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const red = linearize(channel(match[1]));
  const green = linearize(channel(match[2]));
  const blue = linearize(channel(match[3]));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("source icon palette", () => {
  test.each(
    Object.entries(SOURCE_ICON_PALETTE),
  )("%s meets the non-text contrast target in light and dark themes", (_tone, colors) => {
    expect(contrastRatio(colors.light.foreground, colors.light.background)).toBeGreaterThanOrEqual(
      NON_TEXT_CONTRAST_TARGET,
    );
    expect(contrastRatio(colors.dark.foreground, colors.dark.background)).toBeGreaterThanOrEqual(
      NON_TEXT_CONTRAST_TARGET,
    );
  });
});

describe("artifact tone palette", () => {
  test.each(
    Object.entries(ARTIFACT_TONE_PALETTE),
  )("%s meets the non-text contrast target in light and dark themes", (_tone, colors) => {
    expect(contrastRatio(colors.light.foreground, colors.light.background)).toBeGreaterThanOrEqual(
      NON_TEXT_CONTRAST_TARGET,
    );
    expect(contrastRatio(colors.dark.foreground, colors.dark.background)).toBeGreaterThanOrEqual(
      NON_TEXT_CONTRAST_TARGET,
    );
  });
});
