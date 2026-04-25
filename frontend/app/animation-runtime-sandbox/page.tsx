import { Suspense } from "react";
import { SandboxPageClient } from "./pageClient";

export default function AnimationRuntimeSandboxPage() {
  return (
    <Suspense fallback={null}>
      <SandboxPageClient />
    </Suspense>
  );
}
