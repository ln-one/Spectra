"use client";

import { useEffect, useState } from "react";
import { clientEnvironment } from "@/environment/client";

const configuredEditorUrl = clientEnvironment.presentationEditorUrl;

export interface PresentationEditorEndpoint {
  href: string;
  origin: string;
}

function loopbackHostname(value: string) {
  return (
    value === "localhost" ||
    value.endsWith(".localhost") ||
    /^127(?:\.\d{1,3}){3}$/.test(value) ||
    value === "[::1]"
  );
}

export function resolvePresentationEditorEndpoint(
  parentOrigin: string,
  options: { editorUrl?: string; surface?: "stream-preview" } = {},
): PresentationEditorEndpoint {
  const parent = new URL(parentOrigin);
  const editor = new URL(options.editorUrl ?? configuredEditorUrl, parent);
  if (
    editor.protocol !== "https:" &&
    !(editor.protocol === "http:" && loopbackHostname(editor.hostname))
  ) {
    throw new Error("presentation_editor_url_invalid");
  }
  editor.searchParams.set("parentOrigin", parent.origin);
  if (options.surface) editor.searchParams.set("surface", options.surface);
  return { href: editor.toString(), origin: editor.origin };
}

export function usePresentationEditorEndpoint(surface?: "stream-preview") {
  const [endpoint, setEndpoint] = useState<PresentationEditorEndpoint | null>();
  useEffect(() => {
    try {
      setEndpoint(
        resolvePresentationEditorEndpoint(window.location.origin, {
          ...(surface ? { surface } : {}),
        }),
      );
    } catch {
      setEndpoint(null);
    }
  }, [surface]);
  return endpoint;
}
