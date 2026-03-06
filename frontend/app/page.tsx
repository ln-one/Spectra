"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TokenStorage } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }
    router.push("/projects");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}
