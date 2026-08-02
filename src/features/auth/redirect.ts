const DEFAULT_AUTH_REDIRECT = "/workspaces";

export function safeRedirectPath(value: string | null | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT;
  }

  try {
    const parsed = new URL(value, "http://spectra.local");
    if (parsed.origin !== "http://spectra.local") return DEFAULT_AUTH_REDIRECT;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
}

export function loginHref(redirectPath: string) {
  return `/auth/login?redirect=${encodeURIComponent(safeRedirectPath(redirectPath))}`;
}

export function registerHref(redirectPath: string, onboardingOnly = false) {
  const params = new URLSearchParams({ redirect: safeRedirectPath(redirectPath) });
  if (onboardingOnly) params.set("mode", "handle");
  return `/auth/register?${params.toString()}`;
}

export function authRecoveryHref(error: { code?: string }, redirectPath: string) {
  if (error.code === "authentication_required") return loginHref(redirectPath);
  if (error.code === "onboarding_required") return registerHref(redirectPath, true);
  if (error.code === "principal_disabled") return loginHref(redirectPath);
  return null;
}
