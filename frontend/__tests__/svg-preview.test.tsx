import { render } from "@testing-library/react";
import { SvgPreviewSurface } from "@/app/projects/[id]/generate/_views/components/SvgPreviewSurface";
import {
  normalizeSvgPreviewFrame,
  normalizeSvgPreviewManifest,
} from "@/app/projects/[id]/generate/_views/svgPreview";

const SVG_DATA_URL = "data:image/svg+xml;base64,PHN2Zy8+";

describe("svg preview helpers", () => {
  it("normalizes a manifest from svg_data_url", () => {
    expect(
      normalizeSvgPreviewManifest({
        index: 2,
        slide_id: "slide-3",
        svg_data_url: SVG_DATA_URL,
        width: 1280,
        height: 720,
      })
    ).toEqual({
      index: 2,
      slide_id: "slide-3",
      format: "svg",
      svg_data_url: SVG_DATA_URL,
      width: 1280,
      height: 720,
    });
  });

  it("normalizes a frame when svg lives inside preview", () => {
    expect(
      normalizeSvgPreviewFrame({
        split_index: 1,
        split_count: 3,
        preview: {
          index: 4,
          slide_id: "slide-5",
          svg_data_url: SVG_DATA_URL,
          width: 1440,
          height: 810,
        },
      })
    ).toEqual({
      index: 4,
      slide_id: "slide-5",
      format: "svg",
      svg_data_url: SVG_DATA_URL,
      split_index: 1,
      split_count: 3,
      status: undefined,
      preview: {
        index: 4,
        slide_id: "slide-5",
        format: "svg",
        svg_data_url: SVG_DATA_URL,
        width: 1440,
        height: 810,
      },
      width: 1440,
      height: 810,
    });
  });

  it("renders svg previews through an object surface without img fallback", () => {
    const { container } = render(
      <SvgPreviewSurface svgDataUrl={SVG_DATA_URL} alt="slide preview" />
    );

    const svgObject = container.querySelector('object[type="image/svg+xml"]');
    expect(svgObject).not.toBeNull();
    expect(svgObject).toHaveAttribute("data", SVG_DATA_URL);
    expect(container.querySelector("img")).toBeNull();
  });
});
