export type ProjectReference = {
  id: string;
  projectId: string;
  targetProjectId: string;
  targetProjectName?: string | null;
  relationType: "base" | "auxiliary";
  mode: "follow" | "pinned";
  pinnedVersionId?: string | null;
  priority?: number;
  status: "active" | "disabled";
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectReferenceRequest = {
  target_project_id: string;
  relation_type: "base" | "auxiliary";
  mode: "follow" | "pinned";
  pinned_version_id?: string | null;
  priority?: number;
};

export type ProjectReferenceUpdateRequest = {
  mode?: "follow" | "pinned";
  pinned_version_id?: string | null;
  priority?: number;
  status?: "active" | "disabled";
};

export type ProjectReferenceResponse = { reference: ProjectReference };
export type ProjectReferencesResponse = { references: ProjectReference[] };

export type ProjectVersion = {
  id: string;
  projectId: string;
  parentVersionId?: string | null;
  summary?: string | null;
  changeType: string;
  snapshotData?: Record<string, unknown> | null;
  createdBy?: string | null;
  createdAt: string;
};

export type ProjectVersionsResponse = {
  versions: ProjectVersion[];
  currentVersionId?: string | null;
};

export type ProjectVersionResponse = { version: ProjectVersion };

export type ArtifactRecord = {
  id: string;
  projectId?: string;
  sessionId?: string | null;
  basedOnVersionId?: string | null;
  ownerUserId?: string | null;
  type: string;
  visibility: string;
  storagePath?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ArtifactsResponse = { artifacts: ArtifactRecord[] };
export type ArtifactResponse = { artifact?: ArtifactRecord | null };

export type ArtifactCreateRequest = {
  session_id?: string | null;
  based_on_version_id?: string | null;
  type: string;
  visibility?: string;
  mode?: "create" | "replace";
  content?: Record<string, unknown> | null;
};

export type ProjectMemberPermissions = {
  can_view?: boolean;
  can_reference?: boolean;
  can_collaborate?: boolean;
  can_manage?: boolean;
};

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  role: "owner" | "editor" | "viewer";
  permissions?: ProjectMemberPermissions | null;
  status: "active" | "disabled";
  createdAt: string;
};

export type ProjectMembersResponse = { members: ProjectMember[] };
export type ProjectMemberResponse = { member: ProjectMember };
export type ProjectMemberRequest = {
  user_id: string;
  role?: "owner" | "editor" | "viewer";
  permissions?: ProjectMemberPermissions | null;
};
export type ProjectMemberUpdateRequest = {
  role?: "owner" | "editor" | "viewer";
  permissions?: ProjectMemberPermissions | null;
  status?: "active" | "disabled";
};

export type CandidateChangeRecord = {
  id: string;
  projectId: string;
  sessionId?: string | null;
  baseVersionId?: string | null;
  title: string;
  summary?: string | null;
  payload?: Record<string, unknown> | null;
  changeKind?: string | null;
  changeContext?: Record<string, unknown> | null;
  acceptedSnapshot?: Record<string, unknown> | null;
  status: string;
  reviewComment?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  acceptedVersionId?: string | null;
  proposerUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateChangesResponse = { changes: CandidateChangeRecord[] };
export type CandidateChangeResponse = { change: CandidateChangeRecord };
export type CandidateChangeRequest = {
  title: string;
  summary?: string | null;
  payload?: Record<string, unknown> | null;
  session_id?: string | null;
  base_version_id?: string | null;
};
export type CandidateChangeReviewRequest = {
  action: "accept" | "reject";
  review_comment?: string | null;
};

export type SimpleSuccessResponse = { ok: boolean };
