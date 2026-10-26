export const sourceImportRequestEvent = "spectra:source-import-request";

export function openSourceImportMenu() {
  window.dispatchEvent(new Event(sourceImportRequestEvent));
}
