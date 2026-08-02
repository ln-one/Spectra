import { redirect } from "next/navigation";
import { getAuthSession } from "@/features/auth/session";
import { WorkbenchPortal } from "@/features/marketing/WorkbenchPortal";

export default async function HomePage() {
  if (await getAuthSession()) redirect("/workspaces");
  return <WorkbenchPortal />;
}
