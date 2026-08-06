import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/AuthShell";
import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("Auth");
  const { token } = await searchParams;
  return (
    <AuthShell
      title={t("resetPasswordTitle")}
      subtitle={t("resetPasswordSubtitle")}
      prismTitle={t("loginPrismTitle")}
      prismSubtitle={t("loginPrismSubtitle")}
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
