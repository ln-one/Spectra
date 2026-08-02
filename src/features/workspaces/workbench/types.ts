import type { UIMessage } from "ai";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ArtifactSourceKind } from "@/features/artifacts/types";
import type { ArtifactTone } from "@/features/artifacts/ui/artifact-presentation";
import type { SourceVisualFamily } from "@/features/sources/presentation";
import type { WorkspaceInviteCandidate, WorkspaceSharingState } from "../sharing.server";
import type { StudioToolId } from "./studioTools";

export type WorkspaceHeaderViewProps = {
  workspaceName: string;
  threadTitle: string;
};

export type WorkspaceConversationNavigationItem = {
  conversationId: string;
  title: string | null;
  updatedAt: string;
};

export type WorkspaceSettingsFormState =
  | { code: "workspace_settings_invalid" }
  | { code: "workspace_slug_conflict" }
  | { code: "workspace_slug_required" }
  | { code: "workspace_settings_failed" }
  | null;

export type WorkspaceSettingsFormAction = (
  state: WorkspaceSettingsFormState,
  formData: FormData,
) => Promise<WorkspaceSettingsFormState>;

export type WorkspaceSharingFormState = {
  code:
    | "workspace_share_failed"
    | "workspace_share_identity_invalid"
    | "workspace_share_invitee_not_found"
    | "workspace_share_slug_conflict"
    | "workspace_share_slug_invalid"
    | null;
  data: WorkspaceSharingState;
};

export type WorkspaceSharingFormAction = (
  state: WorkspaceSharingFormState,
  formData: FormData,
) => Promise<WorkspaceSharingFormState>;

type WorkspaceInviteSearchResult =
  | { ok: true; candidates: WorkspaceInviteCandidate[] }
  | { ok: false; candidates: []; code: "workspace_invite_search_failed" };

export type WorkspaceInviteSearchAction = (
  workspaceId: string,
  query: string,
) => Promise<WorkspaceInviteSearchResult>;

export type WorkspaceThreadRenameFormState =
  | { code: "thread_title_invalid" }
  | { code: "thread_not_found" }
  | { code: "thread_rename_failed" }
  | null;

export type WorkspaceThreadRenameFormAction = (
  state: WorkspaceThreadRenameFormState,
  formData: FormData,
) => Promise<WorkspaceThreadRenameFormState>;

export type WorkspaceThreadDeleteFormState =
  | { code: "thread_not_found" }
  | { code: "thread_delete_failed" }
  | null;

export type WorkspaceThreadDeleteFormAction = (
  state: WorkspaceThreadDeleteFormState,
  formData: FormData,
) => Promise<WorkspaceThreadDeleteFormState>;

export type StudioPanelViewProps = {
  runtimeUnavailableTools?: readonly StudioToolId[];
  title: string;
  subtitle: string;
  tools: readonly StudioToolId[];
};

export type ChatPanelViewProps = {
  initialMessagesNextCursor?: string | null;
  title: string;
  subtitle: string;
  messages: readonly UIMessage[];
  selectedSourceCount: number;
};

type SourceItemBase = {
  id: string;
  name: string;
  status: string;
  Icon: LucideIcon;
  selected: boolean;
  canOpen: boolean;
  openHref?: string;
  canDelete: boolean;
  canProcess?: boolean;
  canRetryUpload?: boolean;
  uploadProgress?: number;
  statusTone?: "active" | "pending" | "success" | "error";
};

export type SourceItemViewModel =
  | (SourceItemBase & {
      kind: "artifact";
      artifactId?: string;
      artifactKind: ArtifactSourceKind;
      artifactTone: ArtifactTone;
      conversationId?: string;
      typeLabel?: string;
    })
  | (SourceItemBase & {
      kind: "workspace";
      typeLabel: string;
      iconTone: SourceVisualFamily;
      unavailable?: boolean;
    })
  | (SourceItemBase & {
      kind: "file";
      iconTone: SourceVisualFamily;
    });

export type SourcesPanelViewProps = {
  title: string;
  summary: string;
  permissionNotice?: string;
  sources: readonly SourceItemViewModel[];
  importControl?: ReactNode;
  deletingSourceId?: string | null;
  processingSourceId?: string | null;
  uploadError?: string | null;
  onRequestDelete?: (source: SourceItemViewModel) => void;
  onRequestOpen?: (source: SourceItemViewModel, sourceElement: HTMLElement) => void;
  onRequestPrefetch?: (source: SourceItemViewModel) => void;
  onRequestProcess?: (source: SourceItemViewModel) => void;
  onRequestRetryUpload?: (source: SourceItemViewModel) => void;
  onDismissUploadError?: () => void;
  processError?: string | null;
};

export type WorkbenchVisualFixture = {
  id: string;
  disclaimer: string;
  workspace: WorkspaceHeaderViewProps;
  studio: StudioPanelViewProps;
  chat: ChatPanelViewProps;
  sources: SourcesPanelViewProps;
};

export type WorkspaceWorkbenchFixture = Omit<WorkbenchVisualFixture, "sources">;
