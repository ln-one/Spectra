import {
  DECKELIER_CHILD_READY_MESSAGE,
  DECKELIER_LOAD_STATUS_MESSAGE,
  DECKELIER_PARENT_READY_MESSAGE,
  DECKELIER_PROTOCOL_VERSION,
} from "@deckelier/contracts";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import { PresentationEditorFrame } from "./PresentationEditorFrame";

type CapturedParentMethods = {
  close(): void;
  getOKCImage(paths: string[]): Promise<Array<string | undefined>>;
  save(payload: { name: string; pptJson: Blob }): Promise<void>;
  selectSlides(slideIndexes: number[]): void;
  uploadImage(file: File): Promise<string>;
};

const penpal = vi.hoisted(() => ({
  child: {
    convertPPTDToSlides: vi.fn(),
    previewPPTDSlides: vi.fn(),
    setSelectedSlides: vi.fn(),
    setTheme: vi.fn().mockResolvedValue(undefined),
    startEdit: vi.fn(),
  },
  connectCount: 0,
  destroy: vi.fn(),
  methods: null as CapturedParentMethods | null,
}));

vi.mock("penpal", () => ({
  connect: vi.fn(({ methods }: { methods: CapturedParentMethods }) => {
    penpal.connectCount += 1;
    penpal.methods = methods;
    return { destroy: penpal.destroy, promise: Promise.resolve(penpal.child) };
  }),
  WindowMessenger: class WindowMessenger {},
}));

const workspaceId = "00000000-0000-4000-8000-000000000701";
const conversationId = "00000000-0000-4000-8000-000000000702";
const artifactId = "00000000-0000-4000-8000-000000000703";
const revisionId = "00000000-0000-4000-8000-000000000704";

function renderFrame(onClose = vi.fn()) {
  const view = renderWithIntl(
    <PresentationEditorFrame
      artifactId={artifactId}
      conversationId={conversationId}
      onClose={onClose}
      onDetailUpdated={vi.fn()}
      readOnly={false}
      revisionId={revisionId}
      workspaceId={workspaceId}
    />,
  );
  return {
    frame: screen.getByTitle("智能课件") as HTMLIFrameElement,
    onClose,
    view,
  };
}

function loadEditorFrame(frame: HTMLIFrameElement) {
  const postMessage = vi.spyOn(frame.contentWindow as Window, "postMessage");
  fireEvent.load(frame);
  const readyRequest = postMessage.mock.calls
    .filter(
      ([message]) =>
        typeof message === "object" &&
        message !== null &&
        Reflect.get(message, "type") === DECKELIER_PARENT_READY_MESSAGE,
    )
    .at(-1)?.[0];
  if (!readyRequest || typeof readyRequest !== "object") {
    throw new Error("presentation editor transport request was not sent");
  }
  const sessionId = Reflect.get(readyRequest, "sessionId");
  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        sessionId,
        type: DECKELIER_CHILD_READY_MESSAGE,
        version: DECKELIER_PROTOCOL_VERSION,
      },
      origin: window.location.origin,
      source: frame.contentWindow,
    }),
  );
  postMessage.mockRestore();
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete document.documentElement.dataset.theme;
  penpal.child.convertPPTDToSlides.mockReset().mockResolvedValue(undefined);
  penpal.child.previewPPTDSlides.mockReset().mockResolvedValue(undefined);
  penpal.child.setSelectedSlides.mockReset().mockResolvedValue(undefined);
  penpal.child.setTheme.mockReset().mockResolvedValue(undefined);
  penpal.child.startEdit.mockReset().mockResolvedValue(undefined);
  penpal.connectCount = 0;
  penpal.destroy.mockReset();
  penpal.methods = null;
});

test("connects on iframe load without depending on START_LOAD", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        kind: "pptd",
        pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
        pptdContent: "pages: [pages/cover.page]",
      }),
      { status: 200 },
    ),
  );
  const { frame } = renderFrame();

  loadEditorFrame(frame);

  await waitFor(() => expect(penpal.child.convertPPTDToSlides).toHaveBeenCalledOnce());
  await waitFor(() => expect(penpal.child.setTheme).toHaveBeenCalledWith("light"));
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining(`/api/artifacts/presentation/${artifactId}/source?`),
  );
});

test("keeps the iframe theme synchronized with the outer React theme", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        kind: "pptd",
        pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
        pptdContent: "pages: [pages/cover.page]",
      }),
      { status: 200 },
    ),
  );
  const { frame } = renderFrame();

  loadEditorFrame(frame);

  await waitFor(() => expect(penpal.child.setTheme).toHaveBeenCalledWith("light"));
  document.documentElement.dataset.theme = "dark";

  await waitFor(() => expect(penpal.child.setTheme).toHaveBeenLastCalledWith("dark"));
});

test("loads a ready revision in one editor conversion without using the streaming preview API", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        kind: "pptd",
        pageMap: {
          "pages/cover.page": "pageType: cover\nelements: []",
          "pages/detail.page": "pageType: content\nelements: []",
        },
        pptdContent: "pages: [pages/cover.page, pages/detail.page]",
      }),
      { status: 200 },
    ),
  );
  const { frame } = renderFrame();

  loadEditorFrame(frame);

  await waitFor(() => expect(penpal.child.convertPPTDToSlides).toHaveBeenCalledOnce());
  expect(penpal.child.convertPPTDToSlides).toHaveBeenCalledWith(
    "pages: [pages/cover.page, pages/detail.page]",
    {
      "pages/cover.page": "pageType: cover\nelements: []",
      "pages/detail.page": "pageType: content\nelements: []",
    },
    {
      readOnly: false,
      saveOnFirstGenerate: false,
    },
  );
  expect(penpal.child.previewPPTDSlides).not.toHaveBeenCalled();
  expect(screen.queryByText("正在加载课件编辑器…")).not.toBeInTheDocument();
});

test("loads a ready revision into the streaming preview with full icon conversion", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        kind: "pptd",
        pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
        pptdContent: "pages: [pages/cover.page]",
      }),
      { status: 200 },
    ),
  );
  const onSlideSelectionChange = vi.fn();
  const view = renderWithIntl(
    <PresentationEditorFrame
      artifactId={artifactId}
      conversationId={conversationId}
      onClose={vi.fn()}
      onDetailUpdated={vi.fn()}
      onSlideSelectionChange={onSlideSelectionChange}
      readOnly
      revisionId={revisionId}
      surface="stream-preview"
      workspaceId={workspaceId}
    />,
  );
  const frame = screen.getByTitle("智能课件") as HTMLIFrameElement;
  expect(frame.src).toContain("surface=stream-preview");

  loadEditorFrame(frame);

  await waitFor(() => expect(penpal.child.convertPPTDToSlides).toHaveBeenCalledOnce());
  expect(penpal.child.convertPPTDToSlides).toHaveBeenCalledWith(
    "pages: [pages/cover.page]",
    { "pages/cover.page": "pageType: cover\nelements: []" },
    { readOnly: true, saveOnFirstGenerate: false },
  );
  expect(penpal.child.previewPPTDSlides).not.toHaveBeenCalled();
  penpal.methods?.selectSlides([]);
  expect(onSlideSelectionChange).toHaveBeenCalledWith([]);
  expect(penpal.connectCount).toBe(1);
  view.unmount();
});

test("enters the editor when a saved project finishes loading even if its loaded notification is missed", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        kind: "saved-project",
        payloadUrl: "/presentation-project.json",
        title: "Saved presentation",
      }),
      { status: 200 },
    ),
  );
  const { frame } = renderFrame();

  loadEditorFrame(frame);

  await waitFor(() => expect(penpal.child.startEdit).toHaveBeenCalledOnce());
  expect(penpal.child.startEdit).toHaveBeenCalledWith({
    payloadUrl: "/presentation-project.json",
    readOnly: false,
    title: "Saved presentation",
  });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("accepts the editor ready status from the loaded iframe without reconnecting", async () => {
  const { frame } = renderFrame();

  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        status: "ready",
        type: DECKELIER_LOAD_STATUS_MESSAGE,
        version: DECKELIER_PROTOCOL_VERSION,
      },
      origin: window.location.origin,
      source: frame.contentWindow,
    }),
  );

  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  expect(penpal.connectCount).toBe(0);
});

test("fills its page without embedded Workbench chrome", () => {
  renderWithIntl(
    <PresentationEditorFrame
      artifactId={artifactId}
      conversationId={conversationId}
      onClose={vi.fn()}
      onDetailUpdated={vi.fn()}
      readOnly={false}
      revisionId={revisionId}
      workspaceId={workspaceId}
    />,
  );

  const frame = screen.getByTestId("presentation-editor-frame");
  expect(frame).toHaveClass("h-full", "min-h-0");
  expect(frame).not.toHaveClass("rounded-[18px]");
});

test("covers the removed local-import mock while the revision is loading", () => {
  const { frame } = renderFrame();
  expect(screen.getByRole("status")).toHaveTextContent("正在准备画布与页面资源");
  expect(frame).toHaveClass("invisible");
});

test("keeps the active editor session mounted when a save advances the revision", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        kind: "pptd",
        pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
        pptdContent: "pages: [pages/cover.page]",
      }),
      { status: 200 },
    ),
  );
  const commonProps = {
    artifactId,
    conversationId,
    onClose: vi.fn(),
    onDetailUpdated: vi.fn(),
    readOnly: false,
    workspaceId,
  };
  const view = renderWithIntl(<PresentationEditorFrame {...commonProps} revisionId={revisionId} />);
  const frame = screen.getByTitle("智能课件") as HTMLIFrameElement;
  loadEditorFrame(frame);
  await waitFor(() => expect(penpal.child.convertPPTDToSlides).toHaveBeenCalledOnce());
  const fetchCountBeforeRevisionAdvance = fetchMock.mock.calls.length;

  view.rerender(
    <PresentationEditorFrame {...commonProps} revisionId="00000000-0000-4000-8000-000000000705" />,
  );

  expect(screen.getByTitle("智能课件")).toBe(frame);
  expect(penpal.connectCount).toBe(1);
  expect(fetchMock).toHaveBeenCalledTimes(fetchCountBeforeRevisionAdvance);
});

test("connects only from the iframe load lifecycle", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        kind: "pptd",
        pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
        pptdContent: "pages: [pages/cover.page]",
      }),
      { status: 200 },
    ),
  );
  const { frame } = renderFrame();

  loadEditorFrame(frame);

  await waitFor(() => expect(penpal.connectCount).toBe(1));
  expect(penpal.connectCount).toBe(1);
  expect(penpal.destroy).not.toHaveBeenCalled();
});

test("reconnects when the iframe document is reloaded", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          kind: "pptd",
          pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
          pptdContent: "pages: [pages/cover.page]",
        }),
        { status: 200 },
      ),
    ),
  );
  const { frame } = renderFrame();
  loadEditorFrame(frame);
  await waitFor(() => expect(penpal.connectCount).toBe(1));

  loadEditorFrame(frame);

  await waitFor(() => expect(penpal.connectCount).toBe(2));
  expect(penpal.destroy).toHaveBeenCalledOnce();
});

test("replaces the iframe realm before reconnecting after configuration changes", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          kind: "pptd",
          pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
          pptdContent: "pages: [pages/cover.page]",
        }),
        { status: 200 },
      ),
    ),
  );
  const { frame, onClose, view } = renderFrame();
  loadEditorFrame(frame);
  await waitFor(() => expect(penpal.connectCount).toBe(1));

  view.rerender(
    <PresentationEditorFrame
      artifactId={artifactId}
      conversationId={conversationId}
      onClose={onClose}
      onDetailUpdated={vi.fn()}
      readOnly
      revisionId={revisionId}
      workspaceId={workspaceId}
    />,
  );
  const reloadedFrame = screen.getByTitle("智能课件") as HTMLIFrameElement;
  expect(reloadedFrame).not.toBe(frame);
  expect(penpal.connectCount).toBe(1);
  loadEditorFrame(reloadedFrame);

  await waitFor(() => expect(penpal.connectCount).toBe(2));
  expect(penpal.destroy).toHaveBeenCalledOnce();
});

test("resolves archive images, closes the workspace, and materializes uploaded images", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          kind: "pptd",
          pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
          pptdContent: "pages: [pages/cover.page]",
        }),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ assets: ["data:image/png;base64,iVBORw=="] }), {
        status: 200,
      }),
    );
  const { frame, onClose } = renderFrame();
  loadEditorFrame(frame);
  await waitFor(() => expect(penpal.methods).not.toBeNull());

  const assets = await penpal.methods?.getOKCImage(["/images/cover.png"]);
  penpal.methods?.close();
  const uploaded = await penpal.methods?.uploadImage(
    new File([new Uint8Array([1, 2, 3])], "added.png", { type: "image/png" }),
  );

  expect(assets).toEqual(["data:image/png;base64,iVBORw=="]);
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.stringContaining(`/api/artifacts/presentation/${artifactId}/source-assets?`),
    expect.objectContaining({
      body: JSON.stringify({ paths: ["/images/cover.png"] }),
      method: "POST",
    }),
  );
  expect(onClose).toHaveBeenCalledOnce();
  expect(uploaded).toBe("data:image/png;base64,AQID");
});

test("blocks saving when a referenced source image cannot be materialized", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          kind: "pptd",
          pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
          pptdContent: "pages: [pages/cover.page]",
        }),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ assets: [null] }), { status: 200 }));
  const { frame } = renderFrame();
  loadEditorFrame(frame);
  await waitFor(() => expect(penpal.methods).not.toBeNull());

  await expect(penpal.methods?.getOKCImage(["/images/missing.png"])).rejects.toThrow(
    "presentation_source_asset_missing",
  );
  await expect(
    penpal.methods?.save({
      name: "Broken",
      pptJson: new Blob(["{}"], { type: "application/json" }),
    }),
  ).rejects.toThrow("presentation_source_assets_incomplete");
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("课件编辑器暂时无法加载"),
  );
});
