import type { Methods } from "penpal";

export {
  type PptdPage,
  type PptdProject,
  parsePptdProject,
  pptdPageLocalAssetPaths,
  pptdPagePaths,
} from "./format";

export const DECKELIER_PROTOCOL_VERSION = 1;
export const DECKELIER_CHILD_READY_MESSAGE = "DECKELIER_CHILD_READY";
export const DECKELIER_LOAD_STATUS_MESSAGE = "DECKELIER_LOAD_STATUS";
export const DECKELIER_PARENT_READY_MESSAGE = "DECKELIER_PARENT_READY";

export type DeckelierLoadStatus = "failed" | "ready";
export type DeckelierTheme = "dark" | "light";

export interface DeckelierPptdSource {
  pageMap: Record<string, string>;
  pptdContent: string;
}

interface DeckelierLoadOptions {
  basePath?: string;
  imageReplacerMap?: Record<string, string>;
  isDataReady?: boolean;
  locatePage?: string;
  readOnly?: boolean;
  saveOnFirstGenerate?: boolean;
}

interface DeckelierStartEditPayload {
  payloadUrl: string;
  readOnly?: boolean;
  title: string;
}

export interface DeckelierSaveRequest {
  coverImage?: Blob;
  name: string;
  pptJson: Blob;
  source?: DeckelierPptdSource;
}

export interface DeckelierParentApi {
  loaded(success: boolean, message?: string): void | Promise<void>;
  save(payload: DeckelierSaveRequest): void | Promise<void>;
  close(): void | Promise<void>;
  getOKCImage(paths: string[]): Array<string | undefined> | Promise<Array<string | undefined>>;
  selectSlides?(slideIndexes: number[]): void | Promise<void>;
  setTheme(theme: DeckelierTheme): void | Promise<void>;
  uploadImage(file: File): string | Promise<string>;
}

export type DeckelierParentMethods = Methods & DeckelierParentApi;

export interface DeckelierChildApi {
  closeWithSave(): Promise<void>;
  convertPPTDToSlides(
    pptdContent: string,
    pageMap: Record<string, string>,
    options?: DeckelierLoadOptions,
  ): Promise<void>;
  previewPPTDSlides(
    pptdContent: string | undefined,
    pageMap: Record<string, string>,
    options?: DeckelierLoadOptions,
  ): Promise<void>;
  exportPPTD(): Promise<DeckelierPptdSource>;
  setSelectedSlides?(slideIndexes: number[]): Promise<void>;
  setTheme(theme: DeckelierTheme): Promise<void>;
  startEdit(payload: DeckelierStartEditPayload): Promise<void>;
}

export type DeckelierChildMethods = Methods & DeckelierChildApi;
export type DeckelierParentAdapter = Partial<DeckelierParentApi>;

export function resolveDeckelierParentOrigin(input: {
  editorHref: string;
  referrer: string;
}): string {
  const editor = new URL(input.editorHref);
  const configured = editor.searchParams.get("parentOrigin");
  if (configured) {
    const parent = new URL(configured);
    if (parent.origin !== configured) throw new Error("deckelier_parent_origin_invalid");
    return parent.origin;
  }
  if (input.referrer) return new URL(input.referrer).origin;
  return editor.origin;
}
