"use client";

import type { DeckelierChildMethods, DeckelierParentApi } from "@deckelier/contracts";
import {
  DECKELIER_CHILD_READY_MESSAGE,
  DECKELIER_LOAD_STATUS_MESSAGE,
  DECKELIER_PARENT_READY_MESSAGE,
  DECKELIER_PROTOCOL_VERSION,
} from "@deckelier/contracts";
import { useTranslations } from "next-intl";
import { type Connection, connect, WindowMessenger } from "penpal";
import { useEffect, useRef, useState } from "react";
import {
  createPresentationEditorClient,
  createPresentationEditorImageMaterializer,
  PresentationEditorRevisionConflictError,
} from "@/features/artifacts/presentations/editor-client";
import { usePresentationEditorEndpoint } from "@/features/artifacts/presentations/editor-frame";
import type { PresentationDetail } from "@/features/artifacts/presentations/types";
import { useAppTheme } from "@/features/preferences/theme";

interface PresentationEditorFrameProps {
  artifactId: string;
  conversationId: string;
  onClose: () => void;
  onDetailUpdated: (detail: PresentationDetail) => void;
  onSlideSelectionChange?: (slideIndexes: number[]) => void;
  readOnly: boolean;
  revisionId: string;
  surface?: "editor" | "stream-preview";
  workspaceId: string;
}

export function PresentationEditorFrame(props: PresentationEditorFrameProps) {
  const sessionKey = [
    props.artifactId,
    props.conversationId,
    props.readOnly,
    props.surface ?? "editor",
    props.workspaceId,
  ].join(":");
  return <PresentationEditorSession key={sessionKey} {...props} />;
}

function PresentationEditorSession({
  artifactId,
  conversationId,
  onClose,
  onDetailUpdated,
  onSlideSelectionChange,
  readOnly,
  revisionId,
  surface = "editor",
  workspaceId,
}: PresentationEditorFrameProps) {
  const t = useTranslations("Workbench");
  const { setTheme } = useAppTheme();
  const editorEndpoint = usePresentationEditorEndpoint(
    surface === "stream-preview" ? "stream-preview" : undefined,
  );
  const activeSessionCleanupRef = useRef<(() => void) | null>(null);
  const connectToEditorRef = useRef<(force?: boolean) => void>(() => {});
  const frameLoadedRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const initialRevisionIdRef = useRef(revisionId);
  const onCloseRef = useRef(onClose);
  const onDetailUpdatedRef = useRef(onDetailUpdated);
  const onSlideSelectionChangeRef = useRef(onSlideSelectionChange);
  const pendingSessionCleanupRef = useRef<object | null>(null);
  const [status, setStatus] = useState<"conflict" | "error" | "loading" | "ready">("loading");
  onCloseRef.current = onClose;
  onDetailUpdatedRef.current = onDetailUpdated;
  onSlideSelectionChangeRef.current = onSlideSelectionChange;

  useEffect(() => {
    if (editorEndpoint === null) setStatus("error");
  }, [editorEndpoint]);

  useEffect(() => {
    if (!editorEndpoint) return;
    const endpoint = editorEndpoint;
    const scheduleSessionCleanup = (cleanup: () => void) => () => {
      const cleanupToken = {};
      pendingSessionCleanupRef.current = cleanupToken;
      queueMicrotask(() => {
        if (
          pendingSessionCleanupRef.current !== cleanupToken ||
          activeSessionCleanupRef.current !== cleanup
        ) {
          return;
        }
        cleanup();
        activeSessionCleanupRef.current = null;
        pendingSessionCleanupRef.current = null;
      });
    };
    pendingSessionCleanupRef.current = null;
    if (activeSessionCleanupRef.current) {
      return scheduleSessionCleanup(activeSessionCleanupRef.current);
    }

    const frame = iframeRef.current;
    if (!frame) return;
    const mountedFrame: HTMLIFrameElement = frame;
    const revisionClient = createPresentationEditorClient(
      {
        artifactId,
        conversationId,
        revisionId: initialRevisionIdRef.current,
        workspaceId,
      },
      { readOnly },
    );
    let disposed = false;
    let connection: Connection<DeckelierChildMethods> | null = null;
    let cancelPendingTransport: (() => void) | null = null;
    const materializeEditorImage = createPresentationEditorImageMaterializer();
    const editorTheme = () =>
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";

    const syncEditorTheme = (child: DeckelierChildMethods) => child.setTheme(editorTheme());

    const setReady = () => {
      if (!disposed) setStatus("ready");
    };
    const setFailed = () => {
      if (!disposed) setStatus("error");
    };

    async function loadSourceIntoEditor(child: DeckelierChildMethods) {
      const loadedSource = await revisionClient.loadSource();
      if (disposed) return;
      if (loadedSource.kind === "saved-project") {
        await child.startEdit({
          payloadUrl: loadedSource.payloadUrl,
          readOnly,
          title: loadedSource.title,
        });
        setReady();
        return;
      }
      if (surface === "stream-preview") {
        // The ready preview must use the full conversion path so icon elements are
        // materialized instead of being lost by Deckelier's incremental updater.
        await child.convertPPTDToSlides(loadedSource.pptdContent, loadedSource.pageMap, {
          readOnly: true,
          saveOnFirstGenerate: false,
        });
      } else {
        await child.convertPPTDToSlides(loadedSource.pptdContent, loadedSource.pageMap, {
          readOnly,
          saveOnFirstGenerate: false,
        });
      }
      setReady();
    }

    async function saveProject(payload: Parameters<DeckelierParentApi["save"]>[0]) {
      try {
        const detail = await revisionClient.saveProject(payload);
        if (disposed) return;
        setReady();
        onDetailUpdatedRef.current(detail);
      } catch (error) {
        if (error instanceof PresentationEditorRevisionConflictError && !disposed) {
          setStatus("conflict");
        }
        throw error;
      }
    }

    async function resolveSourceAssets(paths: string[]) {
      try {
        return await revisionClient.resolveSourceAssets(paths);
      } catch (error) {
        setFailed();
        throw error;
      }
    }

    function connectToEditor(force = false) {
      const contentWindow = mountedFrame.contentWindow;
      if (!contentWindow) return;
      if (connection && !force) return;
      cancelPendingTransport?.();
      cancelPendingTransport = null;
      connection?.destroy();
      if (!disposed) setStatus("loading");

      const transportSessionId = crypto.randomUUID();
      const transportTimeout = window.setTimeout(() => {
        cancelPendingTransport?.();
        cancelPendingTransport = null;
        setFailed();
      }, 8_000);
      const handleTransportReady = (event: MessageEvent) => {
        if (event.origin !== endpoint.origin || event.source !== contentWindow) return;
        const data: unknown = event.data;
        if (!data || typeof data !== "object") return;
        if (
          Reflect.get(data, "type") !== DECKELIER_CHILD_READY_MESSAGE ||
          Reflect.get(data, "sessionId") !== transportSessionId ||
          Reflect.get(data, "version") !== DECKELIER_PROTOCOL_VERSION
        ) {
          return;
        }
        cancelPendingTransport?.();
        cancelPendingTransport = null;
        if (disposed) return;

        const nextConnection = connect<DeckelierChildMethods>({
          messenger: new WindowMessenger({
            allowedOrigins: [endpoint.origin],
            remoteWindow: contentWindow,
          }),
          methods: {
            close: () => onCloseRef.current(),
            getOKCImage: resolveSourceAssets,
            loaded: (success: boolean) => {
              if (!success) setFailed();
              else setReady();
            },
            save: saveProject,
            selectSlides: (slideIndexes) => onSlideSelectionChangeRef.current?.(slideIndexes),
            setTheme,
            uploadImage: materializeEditorImage,
          } satisfies DeckelierParentApi,
        });
        connection = nextConnection;
        nextConnection.promise
          .then((child) => {
            if (disposed || connection !== nextConnection) return;
            return syncEditorTheme(child).then(() => loadSourceIntoEditor(child));
          })
          .catch(() => {
            if (connection === nextConnection) setFailed();
          });
      };
      window.addEventListener("message", handleTransportReady);
      cancelPendingTransport = () => {
        window.clearTimeout(transportTimeout);
        window.removeEventListener("message", handleTransportReady);
      };
      contentWindow.postMessage(
        {
          sessionId: transportSessionId,
          type: DECKELIER_PARENT_READY_MESSAGE,
          version: DECKELIER_PROTOCOL_VERSION,
        },
        endpoint.origin,
      );
    }

    function handleEditorLoadStatus(event: MessageEvent) {
      if (event.origin !== endpoint.origin) return;
      if (event.source !== mountedFrame.contentWindow) return;
      const data: unknown = event.data;
      if (!data || typeof data !== "object") return;
      if (Reflect.get(data, "type") !== DECKELIER_LOAD_STATUS_MESSAGE) return;
      if (Reflect.get(data, "version") !== DECKELIER_PROTOCOL_VERSION) return;
      const status = Reflect.get(data, "status");
      if (status === "ready") setReady();
      if (status === "failed") setFailed();
    }

    window.addEventListener("message", handleEditorLoadStatus);
    const themeObserver = new MutationObserver(() => {
      if (!connection) return;
      void connection.promise.then((child) => syncEditorTheme(child));
    });
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["data-theme"],
      attributes: true,
    });
    connectToEditorRef.current = connectToEditor;
    if (frameLoadedRef.current) connectToEditor();
    const cleanupSession = () => {
      disposed = true;
      window.removeEventListener("message", handleEditorLoadStatus);
      themeObserver.disconnect();
      if (connectToEditorRef.current === connectToEditor) {
        connectToEditorRef.current = () => {};
      }
      cancelPendingTransport?.();
      cancelPendingTransport = null;
      connection?.destroy();
      connection = null;
    };
    activeSessionCleanupRef.current = cleanupSession;
    return scheduleSessionCleanup(cleanupSession);
  }, [artifactId, conversationId, editorEndpoint, readOnly, setTheme, surface, workspaceId]);

  return (
    <div
      className="relative h-full min-h-0 w-full overflow-hidden bg-[var(--workspace-surface)]"
      data-testid="presentation-editor-frame"
    >
      {editorEndpoint ? (
        <iframe
          allow="clipboard-read; clipboard-write"
          aria-hidden={status !== "ready"}
          className={`h-full w-full border-0${status === "ready" ? "" : " invisible"}`}
          onLoad={() => {
            frameLoadedRef.current = true;
            connectToEditorRef.current(true);
          }}
          ref={iframeRef}
          referrerPolicy="origin"
          src={editorEndpoint.href}
          title={t("presentationTitle")}
        />
      ) : null}
      {status === "error" ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-[var(--workspace-surface)] px-6 text-center text-sm text-[var(--workspace-text-muted)]"
          role="alert"
        >
          {t("presentationEditorUnavailable")}
        </div>
      ) : null}
      {status === "loading" ? (
        <div
          className="pointer-events-none absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-[var(--workspace-surface)]"
          role="status"
        >
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--studio-border)] bg-[var(--studio-surface)] px-5">
            <div className="flex items-center gap-4">
              <span className="h-7 w-20 rounded-md bg-[var(--workspace-text)]/10" />
              <span className="h-5 w-px bg-[var(--studio-border)]" />
              <span className="h-7 w-7 rounded-md bg-[var(--workspace-text)]/10" />
              <span className="h-7 w-7 rounded-md bg-[var(--workspace-text)]/10" />
            </div>
            <span className="h-5 w-44 rounded-full bg-[var(--workspace-text)]/10" />
            <div className="flex gap-2">
              <span className="h-7 w-14 rounded-md bg-[var(--workspace-text)]/10" />
              <span className="h-7 w-14 rounded-md bg-[var(--studio-emphasis)]/30" />
            </div>
          </header>
          <div className="flex min-h-0 flex-1">
            <aside className="hidden w-52 shrink-0 border-r border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] p-3 sm:flex sm:flex-col sm:gap-3">
              {["first", "second", "third", "fourth"].map((slide, index) => (
                <div
                  className={`aspect-video rounded-md border p-2 ${index === 0 ? "border-[var(--studio-emphasis)]/60 bg-[var(--studio-surface)]" : "border-[var(--studio-border)] bg-[var(--studio-surface)]/50"}`}
                  key={slide}
                >
                  <span className="block h-1.5 w-2/3 rounded-full bg-[var(--workspace-text)]/10" />
                </div>
              ))}
            </aside>
            <section className="flex min-w-0 flex-1 flex-col bg-[radial-gradient(circle_at_50%_35%,var(--studio-surface-subtle),transparent_55%)] p-5 sm:p-8">
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] p-4 sm:p-8">
                <div className="aspect-video w-full max-w-5xl rounded-lg bg-[var(--studio-surface)] p-7 shadow-[0_18px_50px_rgb(0_0_0_/_18%)] sm:p-10">
                  <div className="flex h-full flex-col justify-between">
                    <div className="space-y-4">
                      <span className="block h-3 w-20 rounded-full bg-[var(--studio-emphasis)]/40" />
                      <span className="block h-8 w-3/5 rounded-md bg-[var(--workspace-text)]/10" />
                      <span className="block h-4 w-2/5 rounded-md bg-[var(--workspace-text)]/10" />
                    </div>
                    <div className="flex items-end gap-4">
                      <span className="h-20 w-20 rounded-xl bg-[var(--studio-emphasis)]/20" />
                      <span className="h-12 flex-1 rounded-xl bg-[var(--workspace-text)]/5" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex h-9 shrink-0 items-end gap-2 text-xs text-[var(--workspace-text-muted)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--studio-emphasis)] motion-reduce:animate-none" />
                <span>{t("presentationEditorPreparingCanvas")}</span>
              </div>
            </section>
          </div>
        </div>
      ) : null}
      {status === "conflict" ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--workspace-surface)] px-6 text-center text-sm text-[var(--workspace-text-muted)]"
          role="alert"
        >
          <span>{t("presentationEditorConflict")}</span>
          <button
            className="rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] px-4 py-2 text-xs font-semibold text-[var(--studio-accent-text)]"
            type="button"
            onClick={() => window.location.reload()}
          >
            {t("presentationEditorReload")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
