import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/AuthShell";
import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("Auth");
  return (
    <AuthShell
      title={t("forgotPasswordTitle")}
      subtitle={t("forgotPasswordSubtitle")}
      prismTitle={t("loginPrismTitle")}
      prismSubtitle={t("loginPrismSubtitle")}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
