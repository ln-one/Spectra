"use client";

export type NormalizedSvgPreviewManifest = {
  index: number;
  slide_id: string;
  format: "svg";
  svg_data_url: string;
  width?: number | null;
  height?: number | null;
};

export type NormalizedSvgPreviewFrame = {
  index: number;
  slide_id: string;
  format: "svg";
  svg_data_url: string;
  split_index: number;
  split_count: number;
  status?: string;
  preview: NormalizedSvgPreviewManifest;
  width?: number | null;
  height?: number | null;
};

type SvgPreviewLike = {
  index?: unknown;
  slide_id?: unknown;
  format?: unknown;
  svg_data_url?: unknown;
  width?: unknown;
  height?: unknown;
};

type SvgPreviewFrameLike = SvgPreviewLike & {
  preview?: unknown;
  split_index?: unknown;
  split_count?: unknown;
  status?: unknown;
};

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function isRenderableSvgDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.trim().startsWith("data:image/svg+xml");
}

export function normalizeSvgPreviewManifest(
  value: unknown,
  fallback?: {
    index?: number;
    slideId?: string;
  }
): NormalizedSvgPreviewManifest | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as SvgPreviewLike;
  const svgDataUrl = readTrimmedString(source.svg_data_url);
  if (!isRenderableSvgDataUrl(svgDataUrl)) {
    return null;
  }
  const index = readFiniteNumber(source.index) ?? fallback?.index ?? 0;
  const slideId =
    readTrimmedString(source.slide_id) || fallback?.slideId || `slide-${index}`;
  return {
    index,
    slide_id: slideId,
    format: "svg",
    svg_data_url: svgDataUrl,
    width: readFiniteNumber(source.width),
    height: readFiniteNumber(source.height),
  };
}

export function normalizeSvgPreviewFrame(
  value: unknown,
  fallback?: {
    index?: number;
    slideId?: string;
    splitIndex?: number;
    splitCount?: number;
    status?: string;
  }
): NormalizedSvgPreviewFrame | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as SvgPreviewFrameLike;
  const preview =
    normalizeSvgPreviewManifest(source.preview, {
      index: fallback?.index,
      slideId: fallback?.slideId,
    }) ||
    normalizeSvgPreviewManifest(source, {
      index: fallback?.index,
      slideId: fallback?.slideId,
    });
  if (!preview) {
    return null;
  }
  return {
    index: preview.index,
    slide_id: preview.slide_id,
    format: "svg",
    svg_data_url: preview.svg_data_url,
    split_index: readFiniteNumber(source.split_index) ?? fallback?.splitIndex ?? 0,
    split_count: Math.max(
      1,
      readFiniteNumber(source.split_count) ?? fallback?.splitCount ?? 1
    ),
    status: readTrimmedString(source.status) || fallback?.status,
    preview,
    width: preview.width,
    height: preview.height,
  };
}

export function decodeSvgDataUrlToBlob(svgDataUrl: string): Blob | null {
  if (!isRenderableSvgDataUrl(svgDataUrl)) {
    return null;
  }
  const commaIndex = svgDataUrl.indexOf(",");
  if (commaIndex < 0) {
    return null;
  }
  const metadata = svgDataUrl.slice(0, commaIndex);
  const body = svgDataUrl.slice(commaIndex + 1);
  const isBase64Encoded = /;base64/i.test(metadata);
  const mimeTypeMatch = /^data:([^;,]+)/i.exec(metadata);
  const mimeType = mimeTypeMatch?.[1] || "image/svg+xml";

  try {
    if (isBase64Encoded) {
      const binary = atob(body);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new Blob([bytes], { type: mimeType });
    }
    return new Blob([decodeURIComponent(body)], { type: mimeType });
  } catch {
    return null;
  }
}
