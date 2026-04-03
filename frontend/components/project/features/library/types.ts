import type { components } from "@/lib/sdk/types";

export type ProjectReference = components["schemas"]["ProjectReference"];
export type ProjectVersion = components["schemas"]["ProjectVersion"];
export type Artifact = components["schemas"]["Artifact"];
export type ProjectMember = components["schemas"]["ProjectMember"];
export type CandidateChange = components["schemas"]["CandidateChange"];

export interface AvailableLibraryProject {
  id: string;
  name: string;
  description: string;
  status: string;
  visibility: "private" | "shared" | "unknown";
  isReferenceable: boolean;
  currentVersionId: string | null;
}
