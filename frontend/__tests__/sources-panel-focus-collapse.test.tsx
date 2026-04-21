import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SourcesPanel } from "@/components/project/features/sources/SourcesPanel";
import { useProjectStore } from "@/stores/projectStore";
import { useNotificationStore } from "@/stores/notificationStore";

jest.mock("framer-motion", () => {
  const React = require("react") as typeof import("react");
  const MOTION_PROP_NAMES = new Set([
    "animate",
    "exit",
    "initial",
    "layout",
    "transition",
    "whileHover",
    "whileTap",
    "whileInView",
    "viewport",
  ]);

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: new Proxy(
      {},
      {
        get: (_target, tagName: string) =>
          React.forwardRef(
            (
              { children, ...props }: React.HTMLAttributes<HTMLElement>,
              ref: React.Ref<HTMLElement>
            ) => {
              const propEntries = Object.entries(
                props as Record<string, unknown>
              );
              const domProps = propEntries.reduce<
                Record<string, unknown>
              >((acc, [propName, value]) => {
                if (!MOTION_PROP_NAMES.has(propName)) {
                  acc[propName] = value;
                }
                return acc;
              }, {});
              return React.createElement(tagName, { ...domProps, ref }, children);
            }
          ),
      }
    ),
  };
});

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
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
  defaultSchema: {},
}));

jest.mock("@/stores/projectStore", () => ({
  ...jest.requireActual("@/stores/projectStore"),
  useProjectStore: jest.fn(),
}));

jest.mock("@/stores/notificationStore", () => ({
  useNotificationStore: jest.fn(),
}));

describe("SourcesPanel focused source collapse", () => {
  const mockedProjectStore = useProjectStore as unknown as jest.Mock;
  const mockedNotificationStore =
    useNotificationStore as unknown as jest.Mock;
  let storeState: Record<string, unknown>;

  beforeAll(() => {
    class ResizeObserverMock {
      observe() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    }

    Object.defineProperty(globalThis, "ResizeObserver", {
      writable: true,
      configurable: true,
      value: ResizeObserverMock,
    });

    Object.defineProperty(globalThis, "requestAnimationFrame", {
      writable: true,
      configurable: true,
      value: (callback: FrameRequestCallback) => setTimeout(callback, 0),
    });

    Object.defineProperty(globalThis, "cancelAnimationFrame", {
      writable: true,
      configurable: true,
      value: (handle: number) => clearTimeout(handle),
    });

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      writable: true,
      configurable: true,
      value: jest.fn(),
    });

    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return 480;
      },
    });

    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return 720;
      },
    });
  });

  beforeEach(() => {
    mockedNotificationStore.mockReturnValue({
      addNotification: jest.fn(),
      updateNotification: jest.fn(),
      replaceNotification: jest.fn(),
    });
    mockedProjectStore.mockImplementation(() => storeState);
  });

  it("re-expands focused content when the same chunk is focused again after collapse", async () => {
    const clearActiveSource = jest.fn();
    storeState = {
      files: [
        {
          id: "file-1",
          filename: "lesson.pdf",
          file_type: "pdf",
          file_size: 128,
          status: "ready",
          created_at: "2026-04-20T00:00:00Z",
          updated_at: "2026-04-20T00:00:00Z",
        },
      ],
      selectedFileIds: [],
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
      toggleFileSelection: jest.fn(),
      activeSourceDetail: {
        chunk_id: "chunk-1",
        content: "quoted content",
        file_info: {
          id: "file-1",
        },
        source: {
          source_type: "document",
          page_number: 2,
        },
        context: {},
      },
      activeSourceFocusNonce: 1,
      clearActiveSource,
    };

    const { rerender } = render(<SourcesPanel projectId="proj_1" />);

    expect(await screen.findByRole("button", { name: "收起内容" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起内容" }));

    expect(screen.queryByRole("button", { name: "收起内容" })).not.toBeInTheDocument();
    expect(clearActiveSource).not.toHaveBeenCalled();

    storeState = {
      ...storeState,
      activeSourceDetail: {
        chunk_id: "chunk-1",
        content: "quoted content",
        file_info: {
          id: "file-1",
        },
        source: {
          source_type: "document",
          page_number: 2,
        },
        context: {},
      },
      activeSourceFocusNonce: 2,
    };
    rerender(<SourcesPanel projectId="proj_1" />);

    expect(await screen.findByRole("button", { name: "收起内容" })).toBeInTheDocument();
  });
});
