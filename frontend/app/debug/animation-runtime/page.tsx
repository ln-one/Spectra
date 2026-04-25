import { promises as fs } from "fs";
import { unstable_noStore as noStore } from "next/cache";
import { PreviewStep } from "@/components/project/features/studio/tools/animation/PreviewStep";
import { DebugLegacyCompare } from "./DebugLegacyCompare";
import {
  DEBUG_CAPTURED_ANIMATION_RUNTIME_SNAPSHOT,
  buildDebugAnimationRuntimeFlowContext,
} from "./fixture";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadDebugMediaUrl(): Promise<string | null> {
  try {
    const video = await fs.readFile("/tmp/real_animation_runtime_video.mp4");
    return `data:video/mp4;base64,${video.toString("base64")}`;
  } catch {
    return null;
  }
}

async function loadDebugFlowContext() {
  noStore();
  try {
    const [raw, mediaUrl] = await Promise.all([
      fs.readFile("/tmp/real_animation_runtime_snapshot.json", "utf-8"),
      loadDebugMediaUrl(),
    ]);
    const snapshot = JSON.parse(raw) as Record<string, unknown>;
    return buildDebugAnimationRuntimeFlowContext(
      snapshot,
      mediaUrl
        ? "Loaded real generated animation runtime snapshot and MP4 preview."
        : "Loaded real generated animation runtime snapshot.",
      mediaUrl
    );
  } catch {
    return buildDebugAnimationRuntimeFlowContext(
      DEBUG_CAPTURED_ANIMATION_RUNTIME_SNAPSHOT,
      "Loaded bundled bubble-sort runtime fixture."
    );
  }
}

export default async function DebugAnimationRuntimePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const flowContext = await loadDebugFlowContext();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const freshParam = resolvedSearchParams?.fresh;
  const compareParam = resolvedSearchParams?.compare;
  const previewKey =
    typeof freshParam === "string"
      ? freshParam
      : Array.isArray(freshParam)
        ? freshParam.join(":")
        : "debug-runtime";
  const showLegacyCompare =
    compareParam === "legacy" ||
    (Array.isArray(compareParam) && compareParam.includes("legacy"));

  return (
    <main className="min-h-screen bg-zinc-100/70 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <PreviewStep
          key={previewKey}
          lastGeneratedAt="2026-04-18T09:00:00.000Z"
          serverSpecPreview={null}
          flowContext={flowContext}
        />
        {showLegacyCompare ? <DebugLegacyCompare flowContext={flowContext} /> : null}
      </div>
    </main>
  );
}
