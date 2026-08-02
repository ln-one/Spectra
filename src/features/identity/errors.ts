export type IdentityErrorCode =
  | "authentication_required"
  | "onboarding_required"
  | "principal_disabled"
  | "handle_unavailable"
  | "identity_already_bound";

const messages: Record<IdentityErrorCode, string> = {
  authentication_required: "Authentication required",
  onboarding_required: "Choose a handle to finish setting up your account",
  principal_disabled: "This Spectra profile is disabled",
  handle_unavailable: "This handle is unavailable",
  identity_already_bound: "This account already has a different handle",
};

export class IdentityError extends Error {
  constructor(readonly code: IdentityErrorCode) {
    super(messages[code]);
    this.name = "IdentityError";
  }
}
