"use client";

import { type DictationAdapter, WebSpeechDictationAdapter } from "@assistant-ui/react";
import type { Locale } from "@/i18n/config";

export type DictationErrorKind = "unsupported" | "failed";

type DictationCallbacks = {
  onError: (kind: DictationErrorKind) => void;
  onStart: () => void;
};

export function createLocaleDictationAdapter(
  locale: Locale,
  callbacks: DictationCallbacks,
): DictationAdapter {
  const delegate = new WebSpeechDictationAdapter({ language: locale });

  return {
    listen() {
      callbacks.onStart();

      let session: DictationAdapter.Session;
      try {
        session = delegate.listen();
      } catch (error) {
        callbacks.onError(
          error instanceof Error && error.message.includes("not supported")
            ? "unsupported"
            : "failed",
        );
        throw error;
      }

      let pollId: ReturnType<typeof setInterval> | undefined = setInterval(() => {
        if (session.status.type !== "ended") return;
        if (session.status.reason === "error") callbacks.onError("failed");
        if (pollId !== undefined) clearInterval(pollId);
        pollId = undefined;
      }, 100);

      const stopPolling = () => {
        if (pollId === undefined) return;
        clearInterval(pollId);
        pollId = undefined;
      };

      return {
        get status() {
          return session.status;
        },
        stop: async () => {
          try {
            await session.stop();
          } finally {
            stopPolling();
          }
        },
        cancel: () => {
          try {
            session.cancel();
          } finally {
            stopPolling();
          }
        },
        onSpeechStart: session.onSpeechStart,
        onSpeechEnd: session.onSpeechEnd,
        onSpeech: session.onSpeech,
      };
    },
  };
}
