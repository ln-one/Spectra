export type PresentationDraftPreview = {
  pageMap: Record<string, string>;
  pptdContent: string;
  totalPages: number;
};

export function presentationPreviewUpdate(
  sentPptdContent: string | null,
  sentPageMap: Readonly<Record<string, string>>,
  preview: PresentationDraftPreview,
): { pageMap: Record<string, string>; pptdContent: string | undefined } | null {
  const fullReload = sentPptdContent !== preview.pptdContent;
  const pageMap = fullReload
    ? preview.pageMap
    : Object.fromEntries(
        Object.entries(preview.pageMap).filter(([path, content]) => sentPageMap[path] !== content),
      );
  if (!fullReload && Object.keys(pageMap).length === 0) return null;
  return {
    pageMap,
    pptdContent: fullReload ? preview.pptdContent : undefined,
  };
}
