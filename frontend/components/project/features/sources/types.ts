import type { components } from "@/lib/sdk/types";

export type UploadedFile = components["schemas"]["UploadedFile"];

export interface SourceFocusDetail {
  chunk_id?: string;
  content?: string;
  source?: {
    page_number?: number | null;
    source_type?: string;
    timestamp?: number | string | null;
  };
  context?: {
    previous_chunk?: string | null;
    next_chunk?: string | null;
  } | null;
}
