"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { SandboxShell } from "@/components/project/features/studio/tools/animation/runtime/SandboxShell";

export function SandboxPageClient() {
  const searchParams = useSearchParams();
  const sessionToken = searchParams.get("session") ?? "";
  const parentOrigin = useMemo(() => {
    const value = searchParams.get("parentOrigin") ?? "";
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }, [searchParams]);

  return <SandboxShell sessionToken={sessionToken} parentOrigin={parentOrigin} />;
}
