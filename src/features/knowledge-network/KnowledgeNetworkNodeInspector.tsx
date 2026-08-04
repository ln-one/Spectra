"use client";

import { ArrowUpRight, X } from "lucide-react";
import type { SourceVisualFamily } from "@/features/sources/presentation";
import { SourcePresentationIcon } from "@/features/sources/ui/SourcePresentationIcon";
import {
  artifactSourcePresentation,
  sourceFilePresentation,
  workspaceSourcePresentation,
} from "@/features/sources/ui/source-file-presentation";
import styles from "./knowledge-network-graph-view.module.css";
import type {
  KnowledgeNetworkNodeSelectionLabels,
  KnowledgeNetworkSource,
  KnowledgeNetworkWorkspaceNavigationTarget,
} from "./model";

export type KnowledgeNetworkSelectedNode = {
  id: string;
  name: string;
  detail: string;
  typeLabel: string;
  family: SourceVisualFamily;
  meta: string[];
  relatedSources?: Array<
    Pick<
      KnowledgeNetworkSource,
      "id" | "name" | "detail" | "family" | "artifactKind" | "chunkCount"
    >
  >;
  artifactKind?: KnowledgeNetworkSource["artifactKind"];
  navigationTarget?: KnowledgeNetworkWorkspaceNavigationTarget;
  navigationLabel?: string;
  evidence?: {
    label: string;
    locator: string;
  };
};

type KnowledgeNetworkNodeInspectorProps = {
  node: KnowledgeNetworkSelectedNode;
  labels: KnowledgeNetworkNodeSelectionLabels;
  onClose: () => void;
  onEnterWorkspace?: ((target: KnowledgeNetworkWorkspaceNavigationTarget) => void) | undefined;
  onSelectNode?: ((id: string) => void) | undefined;
  variant?: "card" | "panel";
};

export function KnowledgeNetworkNodeInspector({
  node,
  labels,
  onClose,
  onEnterWorkspace,
  onSelectNode,
  variant = "card",
}: KnowledgeNetworkNodeInspectorProps) {
  const navigationTarget = node.navigationTarget;
  const presentation =
    node.family === "workspace"
      ? workspaceSourcePresentation()
      : node.artifactKind
        ? artifactSourcePresentation(node.artifactKind)
        : { category: "file" as const, ...sourceFilePresentation(node.name) };

  return (
    <div
      className={variant === "panel" ? styles.selectionPanel : styles.selectionCard}
      role="status"
      aria-live="polite"
      data-testid="knowledge-network-node-inspector"
    >
      <div className={styles.selectionCardIdentity}>
        <SourcePresentationIcon
          presentation={presentation}
          className={styles.selectionCardIdentityIcon ?? "h-9 w-9 rounded-[10px]"}
          iconClassName="h-5 w-5"
        />
        <div className={styles.selectionCardIdentityCopy}>
          <span className={styles.selectionCardType}>{node.typeLabel}</span>
          <strong className={styles.selectionCardTitle}>{node.name}</strong>
          <span className={styles.selectionCardDetail}>{node.detail}</span>
        </div>
        {variant === "card" ? (
          <button
            type="button"
            aria-label={labels.close}
            title={labels.close}
            className={styles.selectionCardClose}
            onClick={onClose}
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className={styles.selectionCardMeta}>
        {node.meta.map((item) => (
          <span key={`${node.id}:${item}`}>{item}</span>
        ))}
      </div>
      {navigationTarget && onEnterWorkspace ? (
        <div className={styles.selectionCardActionRow}>
          <button
            type="button"
            className={styles.selectionCardAction}
            data-testid="knowledge-network-enter-workspace"
            onClick={() => onEnterWorkspace(navigationTarget)}
          >
            <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{node.navigationLabel}</span>
          </button>
        </div>
      ) : null}
      {variant === "panel" && node.relatedSources?.length ? (
        <section className={styles.selectionRelatedSources} aria-label={labels.sourceListTitle}>
          <div className={styles.selectionRelatedHeader}>
            <strong>{labels.sourceListTitle}</strong>
            <span>{labels.sources(node.relatedSources.length)}</span>
          </div>
          <div className={styles.selectionRelatedList}>
            {node.relatedSources.map((source) => {
              const sourcePresentation = source.artifactKind
                ? artifactSourcePresentation(source.artifactKind)
                : { category: "file" as const, ...sourceFilePresentation(source.name) };
              const sourceContent = (
                <>
                  <SourcePresentationIcon
                    presentation={sourcePresentation}
                    className={styles.selectionRelatedIcon ?? "h-7 w-7 rounded-lg"}
                    iconClassName="h-4 w-4"
                  />
                  <span className={styles.selectionRelatedCopy}>
                    <strong>{source.name}</strong>
                    <small>{source.detail}</small>
                  </span>
                  <span className={styles.selectionRelatedChunks}>
                    {labels.chunks(source.chunkCount)}
                  </span>
                </>
              );

              return onSelectNode ? (
                <button
                  key={source.id}
                  type="button"
                  className={styles.selectionRelatedItem}
                  onClick={() => onSelectNode(source.id)}
                >
                  {sourceContent}
                </button>
              ) : (
                <div key={source.id} className={styles.selectionRelatedItem}>
                  {sourceContent}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      {node.evidence ? (
        <div className={styles.selectionCardEvidence}>
          <span>{labels.selectedEvidence}</span>
          <strong>{node.evidence.label}</strong>
          <small>{node.evidence.locator}</small>
        </div>
      ) : null}
    </div>
  );
}
