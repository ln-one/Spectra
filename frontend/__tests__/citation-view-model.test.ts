import {
  toCitationViewModel,
  toCitationViewModels,
} from "@/lib/chat/citation-view-model";

describe("citation view model adapter", () => {
  it("maps page/timestamp/score fields", () => {
    const result = toCitationViewModel(
      {
        chunk_id: "chunk_1",
        source_type: "web",
        filename: "example.com",
        page_number: 3,
        timestamp: "12.6",
        score: "0.88",
        content_preview: "preview content",
      },
      0
    );

    expect(result).toEqual({
      index: 0,
      chunkId: "chunk_1",
      sourceType: "web",
      filename: "example.com",
      pageNumber: 3,
      timestamp: 12.6,
      score: 0.88,
      contentPreview: "preview content",
    });
  });

  it("falls back to default source type and preview_text", () => {
    const result = toCitationViewModel(
      {
        chunk_id: "chunk_2",
        source_type: "unknown",
        filename: "doc.pdf",
        preview_text: "legacy preview",
      },
      1
    );

    expect(result).toEqual({
      index: 1,
      chunkId: "chunk_2",
      sourceType: "document",
      filename: "doc.pdf",
      pageNumber: undefined,
      timestamp: undefined,
      score: undefined,
      contentPreview: "legacy preview",
    });
  });

  it("filters invalid citations in batch mapping", () => {
    const results = toCitationViewModels([
      {
        chunk_id: "chunk_valid",
        source_type: "audio",
        filename: "audio.mp3",
      },
      { filename: "missing_chunk_id" },
      null,
      "bad",
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      chunkId: "chunk_valid",
      sourceType: "audio",
      filename: "audio.mp3",
    });
  });
});
