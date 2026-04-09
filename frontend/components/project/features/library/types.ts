import type {
  ArtifactRecord as Artifact,
  CandidateChangeRecord as CandidateChange,
  ProjectMember,
  ProjectReference,
  ProjectVersion,
} from "@/lib/sdk/project-space/types";

export type {
  Artifact,
  CandidateChange,
  ProjectMember,
  ProjectReference,
  ProjectVersion,
};

export interface AvailableLibraryProject {
  id: string;
  name: string;
  description: string;
  status: string;
  visibility: "private" | "shared" | "unknown";
  isReferenceable: boolean;
  currentVersionId: string | null;
}

export interface CurrentLibrarySettings {
  id: string;
  name: string;
  description: string;
  gradeLevel: string | null;
  visibility: "private" | "shared";
  isReferenceable: boolean;
}
