import {
  resolveRenderableSlideIndex,
  slotHasRenderablePreview,
  type SlideSlotPreviewLike,
} from "@/app/projects/[id]/generate/_views/streamingWorkbenchPreview";

function makeSlot(
  index: number,
  overrides: Partial<SlideSlotPreviewLike> = {}
): SlideSlotPreviewLike {
  return {
    index,
    legacySlide: null,
    authoritySlide: null,
    ...overrides,
  };
}

describe("streaming workbench SVG selection", () => {
  it("treats authority svg as renderable preview", () => {
    expect(
      slotHasRenderablePreview(
        makeSlot(0, {
          authoritySlide: {
            svg_data_url: "data:image/svg+xml;base64,AAA",
          },
        })
      )
    ).toBe(true);
  });

  it("falls back to the first renderable slide when the preferred slide is pending", () => {
    const slots = [
      makeSlot(0),
      makeSlot(1, {
        authoritySlide: {
          svg_data_url: "data:image/svg+xml;base64,BBB",
        },
      }),
      makeSlot(2),
    ];

    expect(resolveRenderableSlideIndex(slots, 0)).toBe(1);
  });

  it("keeps the preferred slide when it is already renderable", () => {
    const slots = [
      makeSlot(0, {
        authoritySlide: {
          svg_data_url: "data:image/svg+xml;base64,AAA",
        },
      }),
      makeSlot(1, {
        authoritySlide: {
          svg_data_url: "data:image/svg+xml;base64,BBB",
        },
      }),
    ];

    expect(resolveRenderableSlideIndex(slots, 1)).toBe(1);
  });
});
