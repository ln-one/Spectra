import type { ArtifactDetail, ArtifactSelection } from "@/features/artifacts/contract";
import type { ArtifactEditProposal } from "@/features/artifacts/proposal-contract";
import { artifactClientModule } from "./artifactClientModules";
import type { ArtifactWorkspacePhase } from "./artifactWorkbench";

type ArtifactWorkspaceProps = {
  conversationId: string;
  detail: ArtifactDetail | null;
  onBack: () => void;
  onDetailUpdated: (detail: ArtifactDetail) => void;
  onSuggestion: (prompt: string) => void;
  phase: ArtifactWorkspacePhase;
  readOnly?: boolean;
  workspaceId: string;
  selection?: ArtifactSelection | null;
  proposal?: ArtifactEditProposal | null;
  onSelectionChange?: (selection: ArtifactSelection | null) => void;
  onProposalDismiss?: () => void;
  onProposalRetry?: (request: string) => void;
  onRequestAssistant?: () => void;
};

export function ArtifactWorkspaceView({
  kind,
  ...props
}: ArtifactWorkspaceProps & { kind: ArtifactDetail["kind"] }) {
  switch (kind) {
    case "teaching_document": {
      const Workspace = artifactClientModule("teaching_document").Workspace;
      const detail = props.detail?.kind === "teaching_document" ? props.detail : null;
      return (
        <Workspace
          {...props}
          detail={detail}
          selection={props.selection?.kind === "teaching_document_blocks" ? props.selection : null}
          proposal={props.proposal?.kind === "teaching_document" ? props.proposal : null}
          {...(props.onSelectionChange ? { onSelectionChange: props.onSelectionChange } : {})}
          {...(props.onProposalDismiss ? { onProposalDismiss: props.onProposalDismiss } : {})}
          {...(props.onProposalRetry ? { onProposalRetry: props.onProposalRetry } : {})}
          {...(props.onRequestAssistant ? { onRequestAssistant: props.onRequestAssistant } : {})}
        />
      );
    }
    case "mind_map": {
      const Workspace = artifactClientModule("mind_map").Workspace;
      const detail = props.detail?.kind === "mind_map" ? props.detail : null;
      return (
        <Workspace
          {...props}
          detail={detail}
          selection={props.selection?.kind === "mind_map_subtrees" ? props.selection : null}
          proposal={props.proposal?.kind === "mind_map" ? props.proposal : null}
          {...(props.onSelectionChange ? { onSelectionChange: props.onSelectionChange } : {})}
          {...(props.onProposalDismiss ? { onProposalDismiss: props.onProposalDismiss } : {})}
        />
      );
    }
    case "quiz": {
      const Workspace = artifactClientModule("quiz").Workspace;
      const detail = props.detail?.kind === "quiz" ? props.detail : null;
      return (
        <Workspace
          {...props}
          detail={detail}
          selection={props.selection?.kind === "quiz_questions" ? props.selection : null}
          proposal={props.proposal?.kind === "quiz" ? props.proposal : null}
          {...(props.onSelectionChange ? { onSelectionChange: props.onSelectionChange } : {})}
          {...(props.onProposalDismiss ? { onProposalDismiss: props.onProposalDismiss } : {})}
        />
      );
    }
    case "game": {
      const Workspace = artifactClientModule("game").Workspace;
      const detail = props.detail?.kind === "game" ? props.detail : null;
      return <Workspace {...props} detail={detail} selection={null} proposal={null} />;
    }
    case "presentation": {
      const Workspace = artifactClientModule("presentation").Workspace;
      const detail = props.detail?.kind === "presentation" ? props.detail : null;
      return (
        <Workspace
          {...props}
          detail={detail}
          selection={props.selection?.kind === "presentation_slides" ? props.selection : null}
          proposal={props.proposal?.kind === "presentation" ? props.proposal : null}
          {...(props.onSelectionChange ? { onSelectionChange: props.onSelectionChange } : {})}
          {...(props.onProposalDismiss ? { onProposalDismiss: props.onProposalDismiss } : {})}
        />
      );
    }
    case "animation": {
      const Workspace = artifactClientModule("animation").Workspace;
      const detail = props.detail?.kind === "animation" ? props.detail : null;
      return <Workspace {...props} detail={detail} selection={null} proposal={null} />;
    }
  }
}
