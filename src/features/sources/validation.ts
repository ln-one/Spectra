import { z } from "zod";

export const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_NATIVE_TEXT_SOURCE_FILE_BYTES = 10 * 1024 * 1024;
export const SOURCE_INGESTION_PROVIDERS = ["mineru", "media_understanding", "native_text"] as const;
export type SourceIngestionProvider = (typeof SOURCE_INGESTION_PROVIDERS)[number];
export type SourceMediaKind = "audio" | "video";
type SourceRepresentationFamily =
  | "prose"
  | "paged"
  | "grid"
  | "structured"
  | "notebook"
  | "code"
  | "timed-text"
  | "timed-media"
  | "image";

type SourceFormatPolicy = {
  provider: SourceIngestionProvider;
  family: SourceRepresentationFamily;
  adapter: string;
  locatorKind: string;
  maxBytes: number;
  mediaKind?: SourceMediaKind;
  capabilities: {
    ingest: boolean;
    project: boolean;
    retrieve: boolean;
    nativeLocator: boolean;
    preview: boolean;
  };
};

export type SourceFormatCapability = keyof SourceFormatPolicy["capabilities"];

const BACKEND_READY = {
  ingest: true,
  project: true,
  retrieve: true,
  nativeLocator: true,
  preview: false,
} as const;

export const SOURCE_FORMAT_REGISTRY = {
  pdf: {
    provider: "mineru",
    family: "paged",
    adapter: "mineru-content-v3",
    locatorKind: "page_regions",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  docx: {
    provider: "mineru",
    family: "paged",
    adapter: "mineru-content-v3",
    locatorKind: "page_regions",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  pptx: {
    provider: "mineru",
    family: "paged",
    adapter: "mineru-content-v3",
    locatorKind: "page_regions",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  xlsx: {
    provider: "native_text",
    family: "grid",
    adapter: "xlsx-grid-v2",
    locatorKind: "grid_range",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  txt: {
    provider: "native_text",
    family: "prose",
    adapter: "plain-text-v2",
    locatorKind: "text_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  md: {
    provider: "native_text",
    family: "prose",
    adapter: "markdown-v2",
    locatorKind: "text_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  csv: {
    provider: "native_text",
    family: "grid",
    adapter: "csv-grid-v2",
    locatorKind: "grid_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  json: {
    provider: "native_text",
    family: "structured",
    adapter: "json-ast-v2",
    locatorKind: "structured_path",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  yaml: {
    provider: "native_text",
    family: "structured",
    adapter: "yaml-cst-v2",
    locatorKind: "structured_path",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  yml: {
    provider: "native_text",
    family: "structured",
    adapter: "yaml-cst-v2",
    locatorKind: "structured_path",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  xml: {
    provider: "native_text",
    family: "structured",
    adapter: "xml-source-v2",
    locatorKind: "structured_path",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  html: {
    provider: "native_text",
    family: "structured",
    adapter: "html-source-v2",
    locatorKind: "structured_path",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  srt: {
    provider: "native_text",
    family: "timed-text",
    adapter: "subtitle-v2",
    locatorKind: "cue_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  vtt: {
    provider: "native_text",
    family: "timed-text",
    adapter: "subtitle-v2",
    locatorKind: "cue_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  ipynb: {
    provider: "native_text",
    family: "notebook",
    adapter: "nbformat-v2",
    locatorKind: "notebook_cell",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  py: {
    provider: "native_text",
    family: "code",
    adapter: "code-range-v2",
    locatorKind: "code_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  ts: {
    provider: "native_text",
    family: "code",
    adapter: "code-range-v2",
    locatorKind: "code_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  js: {
    provider: "native_text",
    family: "code",
    adapter: "code-range-v2",
    locatorKind: "code_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  java: {
    provider: "native_text",
    family: "code",
    adapter: "code-range-v2",
    locatorKind: "code_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  cpp: {
    provider: "native_text",
    family: "code",
    adapter: "code-range-v2",
    locatorKind: "code_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  go: {
    provider: "native_text",
    family: "code",
    adapter: "code-range-v2",
    locatorKind: "code_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  rs: {
    provider: "native_text",
    family: "code",
    adapter: "code-range-v2",
    locatorKind: "code_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  sql: {
    provider: "native_text",
    family: "code",
    adapter: "code-range-v2",
    locatorKind: "code_range",
    maxBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  png: {
    provider: "mineru",
    family: "image",
    adapter: "mineru-content-v3",
    locatorKind: "page_regions",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  jpg: {
    provider: "mineru",
    family: "image",
    adapter: "mineru-content-v3",
    locatorKind: "page_regions",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  jpeg: {
    provider: "mineru",
    family: "image",
    adapter: "mineru-content-v3",
    locatorKind: "page_regions",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  mp3: {
    provider: "media_understanding",
    mediaKind: "audio",
    family: "timed-media",
    adapter: "media-segment-v2",
    locatorKind: "media_range",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  wav: {
    provider: "media_understanding",
    mediaKind: "audio",
    family: "timed-media",
    adapter: "media-segment-v2",
    locatorKind: "media_range",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  aac: {
    provider: "media_understanding",
    mediaKind: "audio",
    family: "timed-media",
    adapter: "media-segment-v2",
    locatorKind: "media_range",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  mp4: {
    provider: "media_understanding",
    mediaKind: "video",
    family: "timed-media",
    adapter: "media-segment-v2",
    locatorKind: "media_range",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  mov: {
    provider: "media_understanding",
    mediaKind: "video",
    family: "timed-media",
    adapter: "media-segment-v2",
    locatorKind: "media_range",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  mkv: {
    provider: "media_understanding",
    mediaKind: "video",
    family: "timed-media",
    adapter: "media-segment-v2",
    locatorKind: "media_range",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  avi: {
    provider: "media_understanding",
    mediaKind: "video",
    family: "timed-media",
    adapter: "media-segment-v2",
    locatorKind: "media_range",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  flv: {
    provider: "media_understanding",
    mediaKind: "video",
    family: "timed-media",
    adapter: "media-segment-v2",
    locatorKind: "media_range",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
  wmv: {
    provider: "media_understanding",
    mediaKind: "video",
    family: "timed-media",
    adapter: "media-segment-v2",
    locatorKind: "media_range",
    maxBytes: MAX_SOURCE_FILE_BYTES,
    capabilities: BACKEND_READY,
  },
} as const satisfies Record<string, SourceFormatPolicy>;

const sourceFormatPolicies = SOURCE_FORMAT_REGISTRY;

export type SourceFileExtension = keyof typeof sourceFormatPolicies;
export type SourceNativeTextExtension = {
  [Extension in SourceFileExtension]: (typeof sourceFormatPolicies)[Extension] extends {
    provider: "native_text";
  }
    ? Extension
    : never;
}[SourceFileExtension];
export type SourceAudioExtension = {
  [Extension in SourceFileExtension]: (typeof sourceFormatPolicies)[Extension] extends {
    mediaKind: "audio";
  }
    ? Extension
    : never;
}[SourceFileExtension];
export type SourceVideoExtension = {
  [Extension in SourceFileExtension]: (typeof sourceFormatPolicies)[Extension] extends {
    mediaKind: "video";
  }
    ? Extension
    : never;
}[SourceFileExtension];
export const SOURCE_FILE_EXTENSIONS = Object.freeze(
  Object.keys(sourceFormatPolicies) as SourceFileExtension[],
);
export const SOURCE_NATIVE_TEXT_EXTENSIONS = Object.freeze(
  SOURCE_FILE_EXTENSIONS.filter(
    (extension): extension is SourceNativeTextExtension =>
      sourceFormatPolicies[extension].provider === "native_text",
  ),
);
export const SOURCE_VIDEO_EXTENSIONS = Object.freeze(
  SOURCE_FILE_EXTENSIONS.filter(
    (extension): extension is SourceVideoExtension =>
      "mediaKind" in sourceFormatPolicies[extension] &&
      sourceFormatPolicies[extension].mediaKind === "video",
  ),
);

export function sourceFileExtension(filename: string): SourceFileExtension | null {
  const separator = filename.lastIndexOf(".");
  if (separator === -1) return null;
  const extension = filename.slice(separator + 1).toLowerCase();
  return Object.hasOwn(sourceFormatPolicies, extension) ? (extension as SourceFileExtension) : null;
}

function sourceFormatSupports(extension: SourceFileExtension, capability: SourceFormatCapability) {
  return sourceFormatPolicies[extension].capabilities[capability];
}

export function requireSourceFormatCapabilities(
  extension: SourceFileExtension,
  capabilities: readonly SourceFormatCapability[],
) {
  const unavailable = capabilities.find(
    (capability) => !sourceFormatSupports(extension, capability),
  );
  if (unavailable) {
    throw new Error(`source_format_capability_unavailable:${extension}:${unavailable}`);
  }
}

export function sourceRetrievalPolicyManifest(extension: SourceFileExtension) {
  const policy = sourceFormatPolicies[extension];
  return {
    extension,
    provider: policy.provider,
    adapter: policy.adapter,
    family: policy.family,
    locatorKind: policy.locatorKind,
    capabilities: {
      project: policy.capabilities.project,
      retrieve: policy.capabilities.retrieve,
      nativeLocator: policy.capabilities.nativeLocator,
    },
  };
}

export function sourceIngestionProvider(filename: string): SourceIngestionProvider | null {
  const extension = sourceFileExtension(filename);
  if (!extension) return null;
  return sourceFormatPolicies[extension].provider;
}

export function isSourceIngestionProvider(value: string): value is SourceIngestionProvider {
  return SOURCE_INGESTION_PROVIDERS.some((provider) => provider === value);
}

export function isSourceNativeTextExtension(
  extension: SourceFileExtension | null,
): extension is SourceNativeTextExtension {
  return extension !== null && sourceFormatPolicies[extension].provider === "native_text";
}

export function sourceMediaKind(filename: string): SourceMediaKind | null {
  const extension = sourceFileExtension(filename);
  if (!extension) return null;
  const policy = sourceFormatPolicies[extension];
  return "mediaKind" in policy ? policy.mediaKind : null;
}

export function sourceMediaInput(
  filename: string,
):
  | { kind: "audio"; format: SourceAudioExtension }
  | { kind: "video"; format: SourceVideoExtension }
  | null {
  const extension = sourceFileExtension(filename);
  if (!extension) return null;
  const policy = sourceFormatPolicies[extension];
  if (!("mediaKind" in policy)) return null;
  return policy.mediaKind === "audio"
    ? { kind: "audio", format: extension as SourceAudioExtension }
    : { kind: "video", format: extension as SourceVideoExtension };
}

export function sourceFileMaxBytes(filename: string): number | null {
  const extension = sourceFileExtension(filename);
  return extension ? sourceFormatPolicies[extension].maxBytes : null;
}

function hasForbiddenFilenameCharacter(filename: string) {
  return Array.from(filename).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      character === "/" ||
      character === "\\" ||
      codePoint < 32 ||
      (codePoint >= 127 && codePoint <= 159)
    );
  });
}

const sourceFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .refine((filename) => Array.from(filename).length <= 255)
  .refine((filename) => !hasForbiddenFilenameCharacter(filename))
  .refine((filename) => {
    const extension = sourceFileExtension(filename);
    return extension !== null && sourceFormatSupports(extension, "ingest");
  });

export const sourceUploadIntentSchema = z
  .object({
    originalFilename: sourceFilenameSchema,
    declaredSizeBytes: z.number().int().min(1).max(MAX_SOURCE_FILE_BYTES),
  })
  .strict()
  .superRefine((input, context) => {
    const maxBytes = sourceFileMaxBytes(input.originalFilename);
    if (maxBytes !== null && input.declaredSizeBytes > maxBytes) {
      context.addIssue({
        code: "too_big",
        maximum: maxBytes,
        origin: "number",
        path: ["declaredSizeBytes"],
      });
    }
  });

export type SourceUploadIntent = z.infer<typeof sourceUploadIntentSchema>;

export const workspaceReferenceIntentSchema = z
  .object({
    targetWorkspaceId: z.string().uuid(),
  })
  .strict();
