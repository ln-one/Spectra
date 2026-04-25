import { render, screen, waitFor } from "@testing-library/react";
import { FileItem } from "@/components/project/features/sources/components/FileItem";
import { ragApi } from "@/lib/sdk";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({
    children,
    components,
  }: {
    children: string;
    components?: {
      img?: (props: { src?: string; alt?: string }) => JSX.Element;
    };
  }) => {
    const text = String(children || "");
    const htmlImage = /<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/i.exec(
      text
    );
    if (htmlImage && components?.img) {
      return components.img({ src: htmlImage[1], alt: htmlImage[2] });
    }
    const match = /!\[([^\]]*)\]\(([^)]+)\)/.exec(text);
    if (match && components?.img) {
      return components.img({ alt: match[1], src: match[2] });
    }
    return text;
  },
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: () => undefined,
}));

jest.mock("rehype-raw", () => ({
  __esModule: true,
  default: () => undefined,
}));

jest.mock("rehype-sanitize", () => ({
  __esModule: true,
  default: () => undefined,
  defaultSchema: {
    tagNames: [],
    attributes: {},
  },
}));

jest.mock("@/lib/sdk", () => ({
  ragApi: {
    fetchSourceImageBlob: jest.fn(),
  },
}));

describe("FileItem markdown image rendering", () => {
  const mockedFetchSourceImageBlob =
    ragApi.fetchSourceImageBlob as jest.MockedFunction<
      typeof ragApi.fetchSourceImageBlob
    >;

  beforeEach(() => {
    mockedFetchSourceImageBlob.mockReset();
    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      configurable: true,
      value: jest.fn(() => "blob:mock-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      writable: true,
      configurable: true,
      value: jest.fn(),
    });
  });

  function renderItem(content: string) {
    return render(
      <FileItem
        file={{
          id: "f-1",
          filename: "sample.pdf",
          file_type: "pdf",
          mime_type: "application/pdf",
          file_size: 100,
          status: "ready",
          created_at: "",
          updated_at: "",
        }}
        isSelected
        onToggle={jest.fn()}
        onDelete={jest.fn()}
        isCompact={false}
        isFocused
        focusDetail={{
          chunk_id: "chunk-1",
          content,
          source: {
            source_type: "document",
            page_number: 1,
          },
        }}
        isExpanded
        onCollapse={jest.fn()}
      />
    );
  }

  it("renders markdown images from images/ path via source-image api", async () => {
    mockedFetchSourceImageBlob.mockResolvedValueOnce(
      new Blob(["abc"], { type: "image/jpeg" })
    );
    renderItem("![demo](images/a.jpg)");

    await waitFor(() => {
      expect(mockedFetchSourceImageBlob).toHaveBeenCalledWith(
        "chunk-1",
        "images/a.jpg"
      );
    });

    const image = await screen.findByRole("img", { name: "demo" });
    expect(image).toHaveAttribute("src", "blob:mock-image");
  });

  it("renders markdown images from safe relative path via source-image api", async () => {
    mockedFetchSourceImageBlob.mockResolvedValueOnce(
      new Blob(["abc"], { type: "image/jpeg" })
    );
    renderItem("![demo](assets/a.jpg)");

    await waitFor(() => {
      expect(mockedFetchSourceImageBlob).toHaveBeenCalledWith(
        "chunk-1",
        "assets/a.jpg"
      );
    });
  });

  it("renders html img from relative path via source-image api", async () => {
    mockedFetchSourceImageBlob.mockResolvedValueOnce(
      new Blob(["abc"], { type: "image/jpeg" })
    );
    renderItem("<img src=\"assets/a.jpg\" alt=\"demo\" />");

    await waitFor(() => {
      expect(mockedFetchSourceImageBlob).toHaveBeenCalledWith(
        "chunk-1",
        "assets/a.jpg"
      );
    });
  });

  it("keeps absolute URL images without calling source-image api", async () => {
    renderItem("![net](https://example.com/a.jpg)");
    const image = await screen.findByRole("img", { name: "net" });
    expect(image).toHaveAttribute("src", "https://example.com/a.jpg");
    expect(mockedFetchSourceImageBlob).not.toHaveBeenCalled();
  });

  it("recovers when switching from failed image to a different image", async () => {
    mockedFetchSourceImageBlob
      .mockRejectedValueOnce(new Error("当前来源无可用图片"))
      .mockResolvedValueOnce(new Blob(["ok"], { type: "image/png" }));

    const rendered = renderItem("![demo](assets/a.jpg)");
    await screen.findByText("当前来源无可用图片");

    rendered.rerender(
      <FileItem
        file={{
          id: "f-1",
          filename: "sample.pdf",
          file_type: "pdf",
          mime_type: "application/pdf",
          file_size: 100,
          status: "ready",
          created_at: "",
          updated_at: "",
        }}
        isSelected
        onToggle={jest.fn()}
        onDelete={jest.fn()}
        isCompact={false}
        isFocused
        focusDetail={{
          chunk_id: "chunk-1",
          content: "![demo](assets/b.jpg)",
          source: {
            source_type: "document",
            page_number: 1,
          },
        }}
        isExpanded
        onCollapse={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(mockedFetchSourceImageBlob).toHaveBeenCalledWith(
        "chunk-1",
        "assets/b.jpg"
      );
    });
    const image = await screen.findByRole("img", { name: "demo" });
    expect(image).toHaveAttribute("src", "blob:mock-image");
  });
});
