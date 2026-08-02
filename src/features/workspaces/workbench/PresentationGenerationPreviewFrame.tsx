"use client";

import type { DeckelierChildMethods, DeckelierParentApi } from "@deckelier/contracts";
import {
  DECKELIER_CHILD_READY_MESSAGE,
  DECKELIER_PARENT_READY_MESSAGE,
  DECKELIER_PROTOCOL_VERSION,
} from "@deckelier/contracts";
import { type Connection, connect, WindowMessenger } from "penpal";
import { useEffect, useRef, useState } from "react";
import {
  type PresentationDraftAssetIdentity,
  resolvePresentationDraftAssets,
} from "@/features/artifacts/presentations/draft-assets-client";
import { usePresentationEditorEndpoint } from "@/features/artifacts/presentations/editor-frame";
import {
  type PresentationDraftPreview,
  presentationPreviewUpdate,
} from "@/features/artifacts/presentations/preview-session";

export function PresentationGenerationPreviewFrame({
  artifactId,
  attemptId,
  checking,
  conversationId,
  generationSequence,
  preview,
  resolveAssets: assetResolver,
  unavailableLabel,
  workspaceId,
}: {
  artifactId: string;
  attemptId: string;
  checking: boolean;
  conversationId: string;
  generationSequence: number;
  preview: PresentationDraftPreview;
  resolveAssets?: (paths: string[]) => Promise<Array<string | undefined>>;
  unavailableLabel: string;
  workspaceId: string;
}) {
  const sessionKey = `${artifactId}:${attemptId}`;
  return (
    <PresentationGenerationPreviewSession
      artifactId={artifactId}
      attemptId={attemptId}
      checking={checking}
      conversationId={conversationId}
      generationSequence={generationSequence}
      key={sessionKey}
      preview={preview}
      {...(assetResolver ? { assetResolver } : {})}
      unavailableLabel={unavailableLabel}
      workspaceId={workspaceId}
    />
  );
}

function PresentationGenerationPreviewSession({
  artifactId,
  attemptId,
  checking,
  conversationId,
  generationSequence,
  preview,
  assetResolver,
  unavailableLabel,
  workspaceId,
}: {
  artifactId: string;
  attemptId: string;
  checking: boolean;
  conversationId: string;
  generationSequence: number;
  preview: PresentationDraftPreview;
  assetResolver?: (paths: string[]) => Promise<Array<string | undefined>>;
  unavailableLabel: string;
  workspaceId: string;
}) {
  const editorEndpoint = usePresentationEditorEndpoint("stream-preview");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const connectToFrameRef = useRef<(force?: boolean) => void>(() => {});
  const connectionRef = useRef<Connection<DeckelierChildMethods> | null>(null);
  const childRef = useRef<DeckelierChildMethods | null>(null);
  const sentPptdRef = useRef<string | null>(null);
  const sentPagesRef = useRef<Record<string, string>>({});
  const sequenceRef = useRef(generationSequence);
  const updateQueueRef = useRef(Promise.resolve());
  const assetCacheRef = useRef({
    sequence: generationSequence,
    values: new Map<string, string | undefined>(),
  });
  const latestRef = useRef({ checking, preview, sequence: generationSequence });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  sequenceRef.current = generationSequence;

  useEffect(() => {
    if (editorEndpoint === null) setStatus("error");
  }, [editorEndpoint]);

  useEffect(() => {
    const syncTheme = () => {
      const child = childRef.current;
      if (!child) return;
      void child
        .setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light")
        .catch(() => {});
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributeFilter: ["data-theme"],
      attributes: true,
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!editorEndpoint) return;
    const frame = iframeRef.current;
    if (!frame) return;
    let disposed = false;
    let cancelPendingTransport: (() => void) | null = null;
    const resolveAssets = async (paths: string[]) => {
      if (assetResolver) return assetResolver(paths);
      const identity: PresentationDraftAssetIdentity = {
        artifactId,
        attemptId,
        conversationId,
        workspaceId,
      };
      const currentSequence = sequenceRef.current;
      if (assetCacheRef.current.sequence !== currentSequence) {
        assetCacheRef.current = {
          sequence: currentSequence,
          values: new Map(),
        };
      }
      const cache = assetCacheRef.current;
      const missing = [...new Set(paths)].filter((path) => !cache.values.has(path));
      if (missing.length > 0) {
        const values = await resolvePresentationDraftAssets(identity, missing);
        if (sequenceRef.current !== currentSequence || assetCacheRef.current !== cache) {
          const resolved = new Map(missing.map((path, index) => [path, values[index]]));
          return paths.map((path) => cache.values.get(path) ?? resolved.get(path));
        }
        missing.forEach((path, index) => {
          cache.values.set(path, values[index]);
        });
      }
      return paths.map((path) => cache.values.get(path));
    };

    const invalidateSentPreview = () => {
      sentPptdRef.current = null;
      sentPagesRef.current = {};
    };

    const feedPreview = (
      child: DeckelierChildMethods,
      connection: Connection<DeckelierChildMethods>,
    ) => {
      updateQueueRef.current = updateQueueRef.current
        .then(async () => {
          if (disposed || connectionRef.current !== connection) return;
          const latest = latestRef.current;
          const updateSequence = latest.sequence;
          const update = presentationPreviewUpdate(
            sentPptdRef.current,
            sentPagesRef.current,
            latest.preview,
          );
          if (!update) return;
          sentPptdRef.current = latest.preview.pptdContent;
          sentPagesRef.current = { ...latest.preview.pageMap };
          await child.previewPPTDSlides(update.pptdContent, update.pageMap, {
            isDataReady: latest.checking,
            readOnly: true,
            saveOnFirstGenerate: false,
          });
          if (disposed || connectionRef.current !== connection) return;
          if (sequenceRef.current !== updateSequence) {
            invalidateSentPreview();
            return;
          }
          setStatus("ready");
        })
        .catch(() => {
          if (disposed || connectionRef.current !== connection) return;
          invalidateSentPreview();
          setStatus("error");
        });
    };

    const connectToFrame = (force = false) => {
      const contentWindow = frame.contentWindow;
      if (!contentWindow) return;
      if ((connectionRef.current || cancelPendingTransport) && !force) return;
      cancelPendingTransport?.();
      cancelPendingTransport = null;
      connectionRef.current?.destroy();
      connectionRef.current = null;
      childRef.current = null;
      sentPptdRef.current = null;
      sentPagesRef.current = {};
      updateQueueRef.current = Promise.resolve();
      const transportSessionId = crypto.randomUUID();
      const transportTimeout = window.setTimeout(() => {
        cancelPendingTransport?.();
        cancelPendingTransport = null;
        if (!disposed) setStatus("error");
      }, 8_000);
      const handleTransportReady = (event: MessageEvent) => {
        if (event.origin !== editorEndpoint.origin || event.source !== contentWindow) return;
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
        const connection = connect<DeckelierChildMethods>({
          messenger: new WindowMessenger({
            allowedOrigins: [editorEndpoint.origin],
            remoteWindow: contentWindow,
          }),
          methods: {
            close: () => {},
            getOKCImage: resolveAssets,
            loaded: (success: boolean) => {
              if (!success && !disposed) setStatus("error");
            },
            save: () => {
              throw new Error("presentation_preview_read_only");
            },
            selectSlides: () => {},
            setTheme: () => {},
            uploadImage: () => {
              throw new Error("presentation_preview_read_only");
            },
          } satisfies DeckelierParentApi,
        });
        connectionRef.current = connection;
        connection.promise
          .then((child) => {
            if (disposed || connectionRef.current !== connection) return;
            childRef.current = child;
            void child
              .setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light")
              .catch(() => {});
            feedPreview(child, connection);
          })
          .catch(() => {
            if (!disposed && connectionRef.current === connection) setStatus("error");
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
        editorEndpoint.origin,
      );
    };
    connectToFrameRef.current = connectToFrame;
    connectToFrame();
    return () => {
      disposed = true;
      cancelPendingTransport?.();
      if (connectToFrameRef.current === connectToFrame) {
        connectToFrameRef.current = () => {};
      }
      childRef.current = null;
      connectionRef.current?.destroy();
      connectionRef.current = null;
    };
  }, [artifactId, attemptId, assetResolver, conversationId, editorEndpoint, workspaceId]);

  useEffect(() => {
    latestRef.current = { checking, preview, sequence: generationSequence };
    const child = childRef.current;
    const connection = connectionRef.current;
    if (!child || !connection) return;
    updateQueueRef.current = updateQueueRef.current
      .then(async () => {
        if (connectionRef.current !== connection || childRef.current !== child) return;
        const latest = latestRef.current;
        const updateSequence = latest.sequence;
        const update = presentationPreviewUpdate(
          sentPptdRef.current,
          sentPagesRef.current,
          latest.preview,
        );
        if (!update) return;
        sentPptdRef.current = latest.preview.pptdContent;
        sentPagesRef.current = { ...latest.preview.pageMap };
        await child.previewPPTDSlides(update.pptdContent, update.pageMap, {
          isDataReady: latest.checking,
          readOnly: true,
          saveOnFirstGenerate: false,
        });
        if (connectionRef.current !== connection || childRef.current !== child) return;
        if (sequenceRef.current !== updateSequence) {
          sentPptdRef.current = null;
          sentPagesRef.current = {};
          return;
        }
        setStatus("ready");
      })
      .catch(() => {
        if (connectionRef.current !== connection || childRef.current !== child) return;
        sentPptdRef.current = null;
        sentPagesRef.current = {};
        setStatus("error");
      });
  }, [checking, generationSequence, preview]);

  return (
    <div
      className="relative h-full min-h-0 w-full overflow-hidden bg-[var(--workspace-surface-muted)]"
      data-testid="presentation-generation-preview"
    >
      {editorEndpoint ? (
        <iframe
          className="h-full w-full border-0"
          onLoad={() => {
            setStatus("loading");
            connectToFrameRef.current(true);
          }}
          ref={iframeRef}
          referrerPolicy="origin"
          src={editorEndpoint.href}
          title="Presentation streaming preview"
        />
      ) : null}
      {status !== "ready" ? (
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center bg-[var(--workspace-surface-muted)]/90"
          role={status === "error" ? "alert" : "status"}
        >
          {status === "error" ? (
            <span className="text-sm text-[var(--workspace-text-muted)]">{unavailableLabel}</span>
          ) : (
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--studio-border-strong)] border-t-[var(--studio-emphasis)] motion-reduce:animate-none" />
          )}
        </div>
      ) : null}
    </div>
  );
}
