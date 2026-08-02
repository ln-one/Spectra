import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/AuthShell";
import { DisabledAccountNotice } from "@/features/auth/DisabledAccountNotice";
import { LoginForm } from "@/features/auth/LoginForm";
import { registerHref, safeRedirectPath } from "@/features/auth/redirect";
import { getAuthSession } from "@/features/auth/session";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const t = await getTranslations("Auth");
  const redirectPath = safeRedirectPath((await searchParams).redirect);
  const session = await getAuthSession();
  let principalDisabled = false;
  if (session) {
    try {
      await getCurrentActor();
      redirect(redirectPath);
    } catch (error) {
      if (error instanceof IdentityError && error.code === "onboarding_required") {
        redirect(registerHref(redirectPath, true));
      }
      if (error instanceof IdentityError && error.code === "principal_disabled") {
        principalDisabled = true;
      } else {
        throw error;
      }
    }
  }

  return (
    <AuthShell
      title={principalDisabled ? t("disabledTitle") : t("loginTitle")}
      subtitle={principalDisabled ? t("disabledSubtitle") : t("loginSubtitle")}
      prismTitle={t("loginPrismTitle")}
      prismSubtitle={t("loginPrismSubtitle")}
    >
      {principalDisabled ? <DisabledAccountNotice /> : <LoginForm redirectPath={redirectPath} />}
    </AuthShell>
  );
}
