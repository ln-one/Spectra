import { describe, expect, it, vi } from "vitest";
import {
  createPresentationEditorClient,
  createPresentationEditorImageMaterializer,
} from "./editor-client";
import {
  PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS,
  PRESENTATION_EDITOR_PROJECT_MAX_BYTES,
  PRESENTATION_EDITOR_SOURCE_MAX_BYTES,
} from "./editor-policy";

const identity = {
  artifactId: "00000000-0000-4000-8000-000000000001",
  conversationId: "00000000-0000-4000-8000-000000000002",
  revisionId: "00000000-0000-4000-8000-000000000003",
  workspaceId: "00000000-0000-4000-8000-000000000004",
};
const timestamp = "2026-07-29T00:00:00.000Z";

function readyDetail(revisionId: string, parentRevisionId: string) {
  return {
    artifact: {
      createdAt: timestamp,
      currentRevision: {
        artifactId: identity.artifactId,
        content: {
          pageCount: 1,
          pageTitles: ["Cover"],
          schemaVersion: 1,
          summary: "Saved editor project",
          title: "Saved",
        },
        contentSha256: "a".repeat(64),
        createdAt: timestamp,
        id: revisionId,
        parentRevisionId,
        revisionNumber: 2,
      },
      groundingSources: [],
      id: identity.artifactId,
      title: "Saved",
      updatedAt: timestamp,
      workspaceId: identity.workspaceId,
    },
    createdAt: timestamp,
    failureCode: null,
    generationAttemptId: "00000000-0000-4000-8000-000000000007",
    generationDraft: null,
    generationSequence: 1,
    generationState: "ready",
    id: identity.artifactId,
    kind: "presentation",
    title: "Saved",
    updatedAt: timestamp,
    workspaceId: identity.workspaceId,
  };
}

describe("presentation editor client", () => {
  it("deduplicates one deck-level archive image request while preserving caller order", async () => {
    const requestBodies: string[][] = [];
    const fetchRequest = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { paths: string[] };
      requestBodies.push(body.paths);
      return new Response(
        JSON.stringify({
          assets: body.paths.map((path) => `data:image/png;base64,${btoa(path)}`),
        }),
        { status: 200 },
      );
    });
    const client = createPresentationEditorClient(identity, {
      fetch: fetchRequest,
      readOnly: false,
    });
    const uniquePaths = Array.from({ length: 101 }, (_, index) => `images/${index}.png`);
    const requestedPaths = [...uniquePaths, uniquePaths[0] ?? ""];

    const assets = await client.resolveSourceAssets(requestedPaths);

    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).toHaveLength(101);
    expect(assets).toHaveLength(102);
    expect(assets[101]).toBe(assets[0]);
  });

  it("rejects an over-budget deck before reading and decompressing its archive", async () => {
    const fetchRequest = vi.fn<typeof fetch>();
    const client = createPresentationEditorClient(identity, {
      fetch: fetchRequest,
      readOnly: false,
    });
    const paths = Array.from(
      { length: PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS + 1 },
      (_, index) => `images/${index}.png`,
    );

    await expect(client.resolveSourceAssets(paths)).rejects.toThrow(
      "presentation_source_assets_too_many",
    );
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it("prevents persistence after an archive image response is incomplete", async () => {
    const fetchRequest = vi.fn<typeof fetch>(async () =>
      Promise.resolve(new Response(JSON.stringify({ assets: [null] }), { status: 200 })),
    );
    const client = createPresentationEditorClient(identity, {
      fetch: fetchRequest,
      readOnly: false,
    });

    await expect(client.resolveSourceAssets(["images/missing.png"])).rejects.toThrow(
      "presentation_source_asset_missing",
    );
    await expect(
      client.saveProject({
        name: "Incomplete",
        pptJson: new Blob(["{}"], { type: "application/json" }),
      }),
    ).rejects.toThrow("presentation_source_assets_incomplete");
    expect(fetchRequest).toHaveBeenCalledOnce();
  });

  it("advances its private revision cursor after each successful save", async () => {
    const firstSavedRevision = "00000000-0000-4000-8000-000000000005";
    const secondSavedRevision = "00000000-0000-4000-8000-000000000006";
    const expectedRevisionIds: FormDataEntryValue[] = [];
    const details = [
      readyDetail(firstSavedRevision, identity.revisionId),
      readyDetail(secondSavedRevision, firstSavedRevision),
    ];
    const fetchRequest = vi.fn<typeof fetch>(async (_input, init) => {
      const formData = init?.body;
      if (!(formData instanceof FormData)) throw new Error("Expected editor project form data");
      expectedRevisionIds.push(formData.get("expectedRevisionId") ?? "");
      return new Response(JSON.stringify({ detail: details.shift() }), {
        status: 200,
      });
    });
    const client = createPresentationEditorClient(identity, {
      fetch: fetchRequest,
      readOnly: false,
    });
    const project = {
      name: "Saved",
      pptJson: new Blob(["{}"], { type: "application/json" }),
    };

    await client.saveProject(project);
    await client.saveProject(project);

    expect(expectedRevisionIds).toEqual([identity.revisionId, firstSavedRevision]);
  });

  it("includes the reverse PPTD source in the multipart save", async () => {
    const source = {
      pageMap: { "pages/one.page": "pageType: content\nelements: []" },
      pptdContent: "title: Saved\nsize: [100, 100]\npages: [pages/one.page]",
    };
    const fetchRequest = vi.fn<typeof fetch>(async (_input, init) => {
      const formData = init?.body;
      if (!(formData instanceof FormData)) throw new Error("Expected editor project form data");
      expect(JSON.parse(String(formData.get("pptdSource")))).toEqual(source);
      return new Response(
        JSON.stringify({ detail: readyDetail(identity.revisionId, identity.revisionId) }),
        {
          status: 200,
        },
      );
    });
    const client = createPresentationEditorClient(identity, {
      fetch: fetchRequest,
      readOnly: false,
    });

    await client.saveProject({
      name: "Saved",
      pptJson: new Blob(["{}"], { type: "application/json" }),
      source,
    });
    expect(fetchRequest).toHaveBeenCalledOnce();
  });

  it("loads the saved revision after its revision cursor advances", async () => {
    const savedRevisionId = "00000000-0000-4000-8000-000000000005";
    const requestedUrls: string[] = [];
    const fetchRequest = vi.fn<typeof fetch>(async (input, init) => {
      requestedUrls.push(String(input));
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({
            detail: readyDetail(savedRevisionId, identity.revisionId),
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          kind: "saved-project",
          payloadUrl: "/api/artifacts/presentation/project",
          title: "Saved",
        }),
        { status: 200 },
      );
    });
    const client = createPresentationEditorClient(identity, {
      fetch: fetchRequest,
      readOnly: false,
    });

    await client.saveProject({
      name: "Saved",
      pptJson: new Blob(["{}"], { type: "application/json" }),
    });
    await expect(client.loadSource()).resolves.toMatchObject({
      kind: "saved-project",
    });

    expect(requestedUrls[1]).toContain(`revisionId=${savedRevisionId}`);
  });

  it("rejects cumulative image uploads before they exhaust the project budget", async () => {
    const materialize = createPresentationEditorImageMaterializer(
      50,
      async () => "data:image/png;base64,AQID",
    );
    const image = () => new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });

    await expect(materialize(image())).resolves.toBe("data:image/png;base64,AQID");
    await expect(materialize(image())).rejects.toThrow("presentation_image_upload_budget_exceeded");
  });

  it("rejects an oversized editor project before sending it to the server", async () => {
    const fetchRequest = vi.fn<typeof fetch>();
    const client = createPresentationEditorClient(identity, {
      fetch: fetchRequest,
      readOnly: false,
    });

    await expect(
      client.saveProject({
        name: "Too large",
        pptJson: new Blob([new ArrayBuffer(PRESENTATION_EDITOR_PROJECT_MAX_BYTES + 1)]),
      }),
    ).rejects.toThrow("presentation_editor_project_too_large");
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it("rejects an oversized reverse PPTD source before sending it to the server", async () => {
    const fetchRequest = vi.fn<typeof fetch>();
    const client = createPresentationEditorClient(identity, {
      fetch: fetchRequest,
      readOnly: false,
    });

    await expect(
      client.saveProject({
        name: "Too large",
        pptJson: new Blob(["{}"]),
        source: { pageMap: {}, pptdContent: "x".repeat(PRESENTATION_EDITOR_SOURCE_MAX_BYTES) },
      }),
    ).rejects.toThrow("presentation_editor_source_too_large");
    expect(fetchRequest).not.toHaveBeenCalled();
  });
});
