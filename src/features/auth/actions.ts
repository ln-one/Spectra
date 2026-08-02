"use server";

import { z } from "zod";
import { ensureCurrentPrincipal, getCurrentActor } from "@/features/identity/current";
import { IdentityError, type IdentityErrorCode } from "@/features/identity/errors";
import { registerHref, safeRedirectPath } from "./redirect";

export type OnboardingActionResult =
  | { ok: true }
  | { ok: false; code: IdentityErrorCode | "onboarding_failed" };

export async function onboardPrincipal(handle: string): Promise<OnboardingActionResult> {
  try {
    await ensureCurrentPrincipal(handle);
    return { ok: true };
  } catch (error) {
    if (error instanceof IdentityError) {
      return { ok: false, code: error.code };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, code: "onboarding_failed" };
    }
    return { ok: false, code: "onboarding_failed" };
  }
}

export async function postSignInDestination(redirectPath: string) {
  const destination = safeRedirectPath(redirectPath);
  try {
    await getCurrentActor();
    return destination;
  } catch (error) {
    if (error instanceof IdentityError && error.code === "onboarding_required") {
      return registerHref(destination, true);
    }
    throw error;
  }
}
