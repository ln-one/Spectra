import { describe, expect, test } from "vitest";
import { parsePptdProject, pptdPageLocalAssetPaths, pptdPagePaths } from "./format";

describe("PPTD format boundary", () => {
  test("normalizes manifest paths without exposing editor internals", () => {
    expect(pptdPagePaths("size: [1280, 720]\npages: [./pages/cover.page]")).toEqual([
      "pages/cover.page",
    ]);
  });

  test("parses the public semantic project without editor runtime code", () => {
    expect(
      parsePptdProject("title: Deck\nsize: [1280, 720]\npages: [./pages/cover.page]", {
        "pages/cover.page":
          "pageType: cover\nnotes: Speaker note\nelements: [{ elementId: title, elementType: text, bounds: [0, 0, 100, 20], content: { text: Hello, style: $title } }]",
      }),
    ).toMatchObject({
      pages: [
        { elements: [{ content: { style: "$title", text: "Hello" } }], notes: "Speaker note" },
      ],
      title: "Deck",
    });
  });

  test("collects every supported page image reference", () => {
    expect(
      pptdPageLocalAssetPaths(`
pageType: content
background: { type: image, src: images/background.png }
elements:
  - { elementId: hero, elementType: image, bounds: [0, 0, 10, 10], src: images/hero.png }
  - { elementId: shape, elementType: shape, bounds: [0, 0, 10, 10], shapeName: rect, fill: { type: image, src: images/shape.png } }
  - elementId: table
    elementType: table
    bounds: [0, 0, 10, 10]
    rows:
      - [ { fill: { type: image, src: images/cell.png } } ]
`),
    ).toEqual(["images/background.png", "images/hero.png", "images/shape.png", "images/cell.png"]);
  });

  test("leaves remote and embedded images for the browser bundle", () => {
    expect(
      pptdPageLocalAssetPaths(`
pageType: content
elements:
  - { elementId: remote, elementType: image, bounds: [0, 0, 10, 10], src: https://cdn.example/image.png }
  - { elementId: relative, elementType: image, bounds: [0, 0, 10, 10], src: //cdn.example/image.png }
  - { elementId: embedded, elementType: image, bounds: [0, 0, 10, 10], src: "data:image/png;base64,aGVsbG8=" }
`),
    ).toEqual([]);
  });

  test("rejects page shapes outside the public format envelope", () => {
    expect(() =>
      pptdPageLocalAssetPaths(`
pageType: content
elements:
  - { elementId: unsafe, elementType: unknown, bounds: [0, 0, 10, 10] }
`),
    ).toThrow();
  });

  test("keeps fill validation aligned with the editor format", () => {
    expect(() =>
      pptdPageLocalAssetPaths(`
pageType: content
background: { type: solid }
elements: []
`),
    ).toThrow();
  });
});
