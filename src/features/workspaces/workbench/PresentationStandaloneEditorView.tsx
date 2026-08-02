"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PresentationDetail } from "@/features/artifacts/presentations/types";
import { PresentationEditorFrame } from "./PresentationEditorFrame";

type ReadyPresentationDetail = PresentationDetail & {
  artifact: NonNullable<PresentationDetail["artifact"]>;
};

export function PresentationStandaloneEditorView({
  conversationId,
  detail: initialDetail,
  readOnly,
  returnHref,
  workspaceId,
}: {
  conversationId: string;
  detail: ReadyPresentationDetail;
  readOnly: boolean;
  returnHref: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const artifact = detail.artifact;

  useEffect(() => {
    router.prefetch(returnHref);
  }, [returnHref, router]);

  return (
    <main
      className="workspace-theme-root h-dvh w-screen overflow-hidden bg-[var(--workspace-surface)]"
      data-testid="presentation-standalone-page"
      data-workspace-style="mist-zinc"
      data-workspace-theme="mist-zinc"
    >
      <PresentationEditorFrame
        artifactId={artifact.id}
        conversationId={conversationId}
        onClose={() => router.replace(returnHref, { scroll: false })}
        onDetailUpdated={(updated) => {
          if (updated.artifact) setDetail({ ...updated, artifact: updated.artifact });
        }}
        readOnly={readOnly}
        revisionId={artifact.currentRevision.id}
        workspaceId={workspaceId}
      />
    </main>
  );
}
