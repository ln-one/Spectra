export const AUTH_STATE_CHANGE_EVENT = "spectra:auth-state-changed";

export function emitAuthStateChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_STATE_CHANGE_EVENT));
}
