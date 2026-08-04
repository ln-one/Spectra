import { describe, expect, it } from "vitest";
import { DEFAULT_GRAPH_VIEW_THEME, parseGraphViewCssColor, readGraphViewTheme } from "./theme";

describe("recovered host theme probing", () => {
  it("parses computed rgb and rgba colors with opacity", () => {
    expect(parseGraphViewCssColor("rgb(83, 109, 221)")).toEqual({ a: 1, rgb: 0x536ddd });
    expect(parseGraphViewCssColor("rgba(83, 109, 221, 0.5)", 0.8)).toEqual({
      a: 0.4,
      rgb: 0x536ddd,
    });
  });

  it("falls back per color when a host class has no parseable value", () => {
    const fallback = { ...DEFAULT_GRAPH_VIEW_THEME, text: { a: 0.7, rgb: 0x123456 } };
    const theme = readGraphViewTheme(undefined, fallback);
    expect(theme.text).toEqual({ a: 0.7, rgb: 0x123456 });
    expect(theme.fill).toEqual(DEFAULT_GRAPH_VIEW_THEME.fill);
  });
});
