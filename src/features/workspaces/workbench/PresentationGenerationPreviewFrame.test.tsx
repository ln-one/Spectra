import {
  DECKELIER_CHILD_READY_MESSAGE,
  DECKELIER_PARENT_READY_MESSAGE,
  DECKELIER_PROTOCOL_VERSION,
} from "@deckelier/contracts";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { PresentationGenerationPreviewFrame } from "./PresentationGenerationPreviewFrame";

type ParentMethods = {
  getOKCImage(paths: string[]): Promise<Array<string | undefined>>;
};

const transport = vi.hoisted(() => ({
  child: {
    previewPPTDSlides: vi.fn(),
    setTheme: vi.fn().mockResolvedValue(undefined),
  },
  methods: null as ParentMethods | null,
}));

const draftAssets = vi.hoisted(() => ({
  resolve: vi.fn(),
}));

vi.mock("penpal", () => ({
  connect: vi.fn(({ methods }: { methods: ParentMethods }) => {
    transport.methods = methods;
    return {
      destroy: vi.fn(),
      promise: Promise.resolve(transport.child),
    };
  }),
  WindowMessenger: class WindowMessenger {},
}));

vi.mock("@/features/artifacts/presentations/draft-assets-client", () => ({
  resolvePresentationDraftAssets: draftAssets.resolve,
}));

const identity = {
  artifactId: "00000000-0000-4000-8000-000000000701",
  attemptId: "00000000-0000-4000-8000-000000000702",
  conversationId: "00000000-0000-4000-8000-000000000703",
  workspaceId: "00000000-0000-4000-8000-000000000704",
};

const firstPreview = {
  pageMap: { "pages/cover.page": "first" },
  pptdContent: "pages: [pages/cover.page]",
  totalPages: 1,
};

async function loadPreviewFrame(frame: HTMLIFrameElement) {
  const postMessage = vi.spyOn(frame.contentWindow as Window, "postMessage");
  fireEvent.load(frame);
  await waitFor(() =>
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: DECKELIER_PARENT_READY_MESSAGE }),
      window.location.origin,
    ),
  );
  const readyRequest = postMessage.mock.calls.at(-1)?.[0];
  if (!readyRequest || typeof readyRequest !== "object") {
    throw new Error("presentation preview transport request was not sent");
  }
  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        sessionId: Reflect.get(readyRequest, "sessionId"),
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
  transport.methods = null;
  transport.child.previewPPTDSlides.mockReset();
  transport.child.setTheme.mockReset().mockResolvedValue(undefined);
  draftAssets.resolve.mockReset();
});

test("resends the complete preview when its asset request crosses a generation sequence", async () => {
  let finishAssetRequest: ((assets: Array<string | undefined>) => void) | undefined;
  draftAssets.resolve.mockReturnValueOnce(
    new Promise<Array<string | undefined>>((resolve) => {
      finishAssetRequest = resolve;
    }),
  );
  const firstAssetResults: Array<Array<string | undefined>> = [];
  transport.child.previewPPTDSlides
    .mockImplementationOnce(async () => {
      if (!transport.methods) throw new Error("preview transport unavailable");
      firstAssetResults.push(await transport.methods.getOKCImage(["/images/hero.png"]));
    })
    .mockResolvedValue(undefined);

  const view = render(
    <PresentationGenerationPreviewFrame
      {...identity}
      checking
      generationSequence={1}
      preview={firstPreview}
      unavailableLabel="Unavailable"
    />,
  );
  await loadPreviewFrame(view.getByTitle("Presentation streaming preview") as HTMLIFrameElement);
  await waitFor(() => expect(draftAssets.resolve).toHaveBeenCalledOnce());

  const secondPreview = {
    ...firstPreview,
    pageMap: { "pages/cover.page": "second" },
  };
  view.rerender(
    <PresentationGenerationPreviewFrame
      {...identity}
      checking
      generationSequence={2}
      preview={secondPreview}
      unavailableLabel="Unavailable"
    />,
  );
  finishAssetRequest?.(["data:image/png;base64,AA=="]);

  await waitFor(() => expect(transport.child.previewPPTDSlides).toHaveBeenCalledTimes(2));
  expect(firstAssetResults).toEqual([["data:image/png;base64,AA=="]]);
  expect(transport.child.previewPPTDSlides.mock.calls[1]?.[0]).toBe(secondPreview.pptdContent);
  expect(transport.child.previewPPTDSlides.mock.calls[1]?.[1]).toEqual(secondPreview.pageMap);
});
