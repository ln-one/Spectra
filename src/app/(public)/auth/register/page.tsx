import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/AuthShell";
import { isSignUpEnabled } from "@/features/auth/policy";
import { RegisterForm } from "@/features/auth/RegisterForm";
import { loginHref, safeRedirectPath } from "@/features/auth/redirect";
import { getAuthSession } from "@/features/auth/session";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; mode?: string }>;
}) {
  const t = await getTranslations("Auth");
  const params = await searchParams;
  const redirectPath = safeRedirectPath(params.redirect);
  const session = await getAuthSession();
  let onboardingOnly = params.mode === "handle";

  if (session) {
    try {
      await getCurrentActor();
      redirect(redirectPath);
    } catch (error) {
      if (error instanceof IdentityError && error.code === "onboarding_required") {
        onboardingOnly = true;
      } else if (error instanceof IdentityError && error.code === "principal_disabled") {
        redirect(loginHref(redirectPath));
      } else {
        throw error;
      }
    }
  } else if (onboardingOnly) {
    redirect(loginHref(redirectPath));
  }

  return (
    <AuthShell
      title={onboardingOnly ? t("onboardingTitle") : t("registerTitle")}
      subtitle={onboardingOnly ? t("onboardingSubtitle") : t("registerSubtitle")}
      prismTitle={t("registerPrismTitle")}
      prismSubtitle={t("registerPrismSubtitle")}
    >
      <RegisterForm
        redirectPath={redirectPath}
        onboardingOnly={onboardingOnly}
        signUpEnabled={isSignUpEnabled()}
      />
    </AuthShell>
  );
}
