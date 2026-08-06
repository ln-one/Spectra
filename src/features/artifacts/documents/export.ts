import "server-only";

import type { TeachingDocumentRevisionContent } from "./contract";

/**
 * DOCX export is temporarily disabled: it depends on @tiptap-pro/extension-export-docx,
 * a paid package served from registry.tiptap.dev that requires a subscription token.
 * Reinstall the dependency and restore the previous implementation to re-enable it.
 */
export async function teachingDocumentToDocx(
  _content: TeachingDocumentRevisionContent,
): Promise<Buffer> {
  throw new Error(
    "DOCX export is disabled in this build: the @tiptap-pro/extension-export-docx dependency was temporarily removed.",
  );
}

export function docxFilename(title: string) {
  const safe = [...title]
    .map((character) => (character.charCodeAt(0) < 32 ? "_" : character))
    .join("")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 120);
  return `${safe || "teaching-document"}.docx`;
}
