import { parsePptdProject } from "@deckelier/contracts";
import { z } from "zod";
import {
  PRESENTATION_EDITOR_PROJECT_MAX_BYTES,
  PRESENTATION_EDITOR_SOURCE_MAX_BYTES,
} from "./editor-policy";
import { PresentationError } from "./errors";

export const PRESENTATION_EDITOR_PROJECT_MEDIA_TYPE = "application/json";
export const PRESENTATION_EDITOR_SOURCE_MEDIA_TYPE =
  "application/vnd.spectra.presentation-source+json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

type PresentationEditorElementBase = {
  height?: number;
  id: string;
  left?: number;
  top?: number;
  width?: number;
  [key: string]: unknown;
};

type PresentationEditorTableCell = {
  text?: string;
  [key: string]: unknown;
};

export type PresentationEditorSavedElement = PresentationEditorElementBase &
  (
    | { contentNode?: unknown; style?: string; textType?: string; type: "text" }
    | { text?: { contentNode: unknown; type?: string }; type: "shape" }
    | { data: Array<Array<PresentationEditorTableCell | null>>; type: "table" }
    | {
        chartType: string;
        data?: Array<Record<string, unknown>>;
        names?: unknown[];
        title?: string | Record<string, unknown>;
        type: "chart";
        x?: string;
        y?: string | string[];
      }
    | { type: "icon" }
    | { type: "image" }
    | { type: "line" }
  );

export type PresentationEditorSavedSlide = {
  elements: PresentationEditorSavedElement[];
  height?: number;
  id: string;
  remark?: string;
  width?: number;
};

function isEditorElement(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.top !== undefined && !isFiniteNumber(value.top)) ||
    (value.left !== undefined && !isFiniteNumber(value.left)) ||
    (value.width !== undefined && !isFiniteNumber(value.width)) ||
    (value.height !== undefined && !isFiniteNumber(value.height)) ||
    !["text", "shape", "line", "icon", "image", "table", "chart"].includes(String(value.type))
  ) {
    return false;
  }
  if (value.type === "table") {
    return (
      Array.isArray(value.data) &&
      value.data.every(
        (row) =>
          Array.isArray(row) &&
          row.every(
            (cell) =>
              cell === null ||
              (isRecord(cell) && (cell.text === undefined || typeof cell.text === "string")),
          ),
      )
    );
  }
  if (value.type === "chart") {
    return (
      typeof value.chartType === "string" &&
      (value.names === undefined || Array.isArray(value.names)) &&
      (value.data === undefined ||
        (Array.isArray(value.data) && value.data.every((entry) => isRecord(entry)))) &&
      (value.x === undefined || typeof value.x === "string") &&
      (value.y === undefined ||
        typeof value.y === "string" ||
        (Array.isArray(value.y) && value.y.every((entry) => typeof entry === "string")))
    );
  }
  return true;
}

const editorSlideSchema = z.custom<PresentationEditorSavedSlide>(
  (value) =>
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.width === undefined || isFiniteNumber(value.width)) &&
    (value.height === undefined || isFiniteNumber(value.height)) &&
    (value.remark === undefined || typeof value.remark === "string") &&
    Array.isArray(value.elements) &&
    value.elements.every(isEditorElement),
  "Invalid presentation editor slide",
);

const presentationEditorSavedProjectSchema = z
  .object({
    height: z.number().positive(),
    slides: z.array(editorSlideSchema).min(1).max(200),
    title: z.string().trim().min(1).max(200),
    type: z.string().trim().min(1).max(100),
    width: z.number().positive(),
  })
  .passthrough();

export type PresentationEditorSavedProject = z.infer<typeof presentationEditorSavedProjectSchema>;

export type PresentationEditorObject = {
  body: Uint8Array;
  mediaType: string;
};

const presentationEditorSourceSchema = z
  .object({
    pageMap: z
      .record(
        z.string().min(1).max(500),
        z.string().min(1).max(PRESENTATION_EDITOR_SOURCE_MAX_BYTES),
      )
      .refine((pageMap) => Object.keys(pageMap).length <= 512, "Too many presentation pages"),
    pptdContent: z.string().min(1).max(PRESENTATION_EDITOR_SOURCE_MAX_BYTES),
  })
  .strict();

export type PresentationEditorSource = z.infer<typeof presentationEditorSourceSchema>;

export function parsePresentationEditorSource(value: unknown): PresentationEditorSource {
  try {
    const source = presentationEditorSourceSchema.parse(value);
    const encodedSize = new TextEncoder().encode(
      JSON.stringify({ pageMap: source.pageMap, pptdContent: source.pptdContent }),
    ).byteLength;
    if (encodedSize > PRESENTATION_EDITOR_SOURCE_MAX_BYTES) {
      throw new Error("presentation_editor_source_too_large");
    }
    if (parsePptdProject(source.pptdContent, source.pageMap).pages.length > 200) {
      throw new Error("Too many presentation pages");
    }
    return source;
  } catch (error) {
    throw new PresentationError("presentation_editor_project_invalid", { cause: error });
  }
}

export function parsePresentationEditorProject(
  object: PresentationEditorObject,
): PresentationEditorSavedProject {
  if (
    object.mediaType !== PRESENTATION_EDITOR_PROJECT_MEDIA_TYPE ||
    object.body.byteLength < 1 ||
    object.body.byteLength > PRESENTATION_EDITOR_PROJECT_MAX_BYTES
  ) {
    throw new PresentationError("presentation_editor_project_invalid");
  }
  try {
    return presentationEditorSavedProjectSchema.parse(
      JSON.parse(new TextDecoder().decode(object.body)),
    );
  } catch (error) {
    throw new PresentationError("presentation_editor_project_invalid", { cause: error });
  }
}
