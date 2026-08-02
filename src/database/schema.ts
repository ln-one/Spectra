import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const principals = pgTable(
  "principals",
  {
    id: uuid().defaultRandom().primaryKey(),
    authUserId: varchar("auth_user_id", { length: 255 }).notNull(),
    handle: varchar({ length: 39 }).notNull(),
    email: varchar({ length: 320 }),
    status: varchar({ length: 16 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("principals_auth_user_id_unique").on(table.authUserId),
    uniqueIndex("principals_handle_unique").on(table.handle),
    uniqueIndex("principals_email_unique").on(table.email),
    check("principals_status_check", sql`${table.status} in ('active', 'disabled')`),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid().defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    name: varchar({ length: 200 }).notNull(),
    visibility: varchar({ length: 16 }).notNull().default("private"),
    referenceable: boolean().notNull().default(false),
    firstSharedAt: timestamp("first_shared_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("workspaces_id_owner_unique").on(table.id, table.ownerId),
    index("workspaces_owner_id_index").on(table.ownerId),
    check("workspaces_visibility_check", sql`${table.visibility} in ('private', 'public')`),
  ],
);

export const workspacePermissionGrants = pgTable(
  "workspace_permission_grants",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    principalId: uuid("principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "cascade" }),
    permission: varchar({ length: 64 }).notNull(),
    grantedByPrincipalId: uuid("granted_by_principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_permission_grants_workspace_principal_permission_unique").on(
      table.workspaceId,
      table.principalId,
      table.permission,
    ),
    index("workspace_permission_grants_principal_workspace_index").on(
      table.principalId,
      table.workspaceId,
    ),
    check(
      "workspace_permission_grants_permission_check",
      sql`${table.permission} in ('workspace.read', 'workspace.chat', 'artifact.private.create', 'artifact.private.manage', 'artifact.publishToSources', 'source.manage', 'workspace.manageSharing', 'workspace.manageSettings')`,
    ),
  ],
);

export const workspaceLocators = pgTable(
  "workspace_locators",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    slug: varchar({ length: 100 }).notNull(),
    state: varchar({ length: 16 }).notNull().default("current"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.ownerId],
      foreignColumns: [workspaces.id, workspaces.ownerId],
      name: "workspace_locators_workspace_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("workspace_locators_owner_slug_unique").on(table.ownerId, table.slug),
    uniqueIndex("workspace_locators_workspace_current_unique")
      .on(table.workspaceId)
      .where(sql`${table.state} = 'current'`),
    index("workspace_locators_workspace_created_index").on(table.workspaceId, table.createdAt),
    check("workspace_locators_state_check", sql`${table.state} in ('current', 'redirect')`),
    check(
      "workspace_locators_replaced_check",
      sql`(${table.state} = 'current' and ${table.replacedAt} is null) or (${table.state} = 'redirect' and ${table.replacedAt} is not null)`,
    ),
  ],
);

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    conversationId: uuid("conversation_id").notNull(),
    clientRequestId: varchar("client_request_id", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    operation: varchar({ length: 24 }).notNull(),
    inputMessageId: varchar("input_message_id", { length: 128 }).notNull(),
    state: varchar({ length: 24 }).notNull().default("claimed"),
    abortReason: varchar("abort_reason", { length: 32 }),
    failureCode: varchar("failure_code", { length: 100 }),
    budget: jsonb().notNull(),
    budgetUsage: jsonb("budget_usage").notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_runs_workspace_conversation_request_unique").on(
      table.workspaceId,
      table.conversationId,
      table.clientRequestId,
    ),
    index("ai_runs_conversation_created_index").on(
      table.workspaceId,
      table.conversationId,
      table.createdAt,
    ),
    index("ai_runs_stale_index")
      .on(table.deadlineAt)
      .where(sql`${table.state} in ('claimed', 'running', 'publishing')`),
    check("ai_runs_request_hash_check", sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "ai_runs_operation_check",
      sql`${table.operation} in ('send', 'edit', 'regenerate', 'artifact')`,
    ),
    check(
      "ai_runs_state_check",
      sql`${table.state} in ('claimed', 'running', 'publishing', 'succeeded', 'failed', 'interrupted', 'cancelled', 'superseded')`,
    ),
    check(
      "ai_runs_terminal_check",
      sql`(${table.state} in ('succeeded', 'failed', 'interrupted', 'cancelled', 'superseded') and ${table.finishedAt} is not null) or (${table.state} in ('claimed', 'running', 'publishing') and ${table.finishedAt} is null)`,
    ),
  ],
);

export const aiRunAttempts = pgTable(
  "ai_run_attempts",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => aiRuns.id, { onDelete: "restrict" }),
    purpose: varchar({ length: 32 }).notNull(),
    executionKey: varchar("execution_key", { length: 200 }),
    attemptNumber: integer("attempt_number").notNull(),
    state: varchar({ length: 24 }).notNull().default("running"),
    requestedProvider: varchar("requested_provider", { length: 64 }).notNull(),
    requestedModel: varchar("requested_model", { length: 128 }).notNull(),
    effectiveProvider: varchar("effective_provider", { length: 64 }),
    effectiveModel: varchar("effective_model", { length: 128 }),
    profileSnapshot: jsonb("profile_snapshot").notNull(),
    usageState: varchar("usage_state", { length: 16 }).notNull().default("unknown"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    estimatedCostMicrousd: integer("estimated_cost_microusd"),
    finishReason: varchar("finish_reason", { length: 64 }),
    errorCode: varchar("error_code", { length: 100 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ai_run_attempts_run_purpose_number_unique").on(
      table.runId,
      table.purpose,
      table.attemptNumber,
    ),
    index("ai_run_attempts_run_started_index").on(table.runId, table.startedAt),
    check("ai_run_attempts_number_check", sql`${table.attemptNumber} >= 1`),
    check("ai_run_attempts_tool_count_check", sql`${table.toolCallCount} >= 0`),
    check(
      "ai_run_attempts_state_check",
      sql`${table.state} in ('running', 'succeeded', 'failed', 'interrupted', 'cancelled')`,
    ),
    check(
      "ai_run_attempts_terminal_check",
      sql`(${table.state} = 'running' and ${table.finishedAt} is null) or (${table.state} in ('succeeded', 'failed', 'interrupted', 'cancelled') and ${table.finishedAt} is not null)`,
    ),
    check(
      "ai_run_attempts_usage_state_check",
      sql`${table.usageState} in ('known', 'unknown', 'unsettled')`,
    ),
  ],
);

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    createdByPrincipalId: uuid("created_by_principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    conversationId: uuid("conversation_id").notNull(),
    activeStreamId: uuid("active_stream_id"),
    title: varchar({ length: 200 }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("ai_conversations_workspace_conversation_unique").on(
      table.workspaceId,
      table.conversationId,
    ),
    index("ai_conversations_workspace_updated_index").on(table.workspaceId, table.updatedAt),
    index("ai_conversations_workspace_creator_updated_index").on(
      table.workspaceId,
      table.createdByPrincipalId,
      table.updatedAt,
    ),
    index("ai_conversations_deleted_index")
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} is not null`),
    check(
      "ai_conversations_tombstone_check",
      sql`${table.purgedAt} is null or ${table.deletedAt} is not null`,
    ),
  ],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: varchar({ length: 128 }).primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    position: integer().notNull(),
    content: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.conversationId],
      foreignColumns: [aiConversations.workspaceId, aiConversations.conversationId],
      name: "ai_messages_conversation_fk",
    }).onDelete("cascade"),
    uniqueIndex("ai_messages_conversation_position_unique").on(
      table.workspaceId,
      table.conversationId,
      table.position,
    ),
  ],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    conversationId: uuid("conversation_id"),
    createdByPrincipalId: uuid("created_by_principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    kind: varchar({ length: 32 }).notNull(),
    title: varchar({ length: 200 }).notNull(),
    generationState: varchar("generation_state", { length: 16 }).notNull().default("ready"),
    generationRequest: jsonb("generation_request"),
    generationDraft: jsonb("generation_draft"),
    generationFailureCode: varchar("generation_failure_code", { length: 100 }),
    generationAttemptId: uuid("generation_attempt_id").references(
      (): AnyPgColumn => artifactGenerationAttempts.id,
      { onDelete: "restrict" },
    ),
    generationSequence: integer("generation_sequence").notNull().default(0),
    sourceUserMessageId: varchar("source_user_message_id", { length: 128 }),
    sourcePlanItemId: uuid("source_plan_item_id"),
    rootRunId: uuid("root_run_id").references(() => aiRuns.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    currentRevisionId: uuid("current_revision_id").references(
      (): AnyPgColumn => artifactRevisions.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("artifacts_workspace_updated_index").on(table.workspaceId, table.updatedAt),
    index("artifacts_deleted_index").on(table.deletedAt).where(sql`${table.deletedAt} is not null`),
    index("artifacts_workspace_conversation_updated_index").on(
      table.workspaceId,
      table.conversationId,
      table.updatedAt,
    ),
    uniqueIndex("artifacts_generation_source_message_unique")
      .on(table.workspaceId, table.conversationId, table.sourceUserMessageId, table.kind)
      .where(sql`${table.sourcePlanItemId} is null`),
    uniqueIndex("artifacts_generation_plan_item_unique")
      .on(
        table.workspaceId,
        table.conversationId,
        table.sourceUserMessageId,
        table.sourcePlanItemId,
      )
      .where(sql`${table.sourcePlanItemId} is not null`),
    check(
      "artifacts_kind_check",
      sql`${table.kind} in ('teaching_document', 'mind_map', 'quiz', 'game', 'presentation', 'animation')`,
    ),
    check("artifacts_title_check", sql`length(btrim(${table.title})) between 1 and 200`),
    check(
      "artifacts_generation_state_check",
      sql`${table.generationState} in ('queued', 'generating', 'finalizing', 'ready', 'failed', 'cancelled')`,
    ),
    check(
      "artifacts_generation_failure_check",
      sql`(${table.generationState} = 'failed' and ${table.generationFailureCode} is not null and length(btrim(${table.generationFailureCode})) > 0) or (${table.generationState} <> 'failed' and ${table.generationFailureCode} is null)`,
    ),
    check(
      "artifacts_generation_attempt_check",
      sql`${table.generationState} = 'queued' or (${table.generationState} in ('generating', 'finalizing') and ${table.generationAttemptId} is not null) or (${table.generationState} in ('ready', 'failed', 'cancelled') and ${table.generationAttemptId} is null)`,
    ),
    check("artifacts_generation_sequence_check", sql`${table.generationSequence} >= 0`),
    check(
      "artifacts_tombstone_check",
      sql`(${table.generationState} <> 'cancelled' or ${table.deletedAt} is not null) and (${table.purgedAt} is null or ${table.deletedAt} is not null)`,
    ),
  ],
);

export const artifactGenerationAttempts = pgTable(
  "artifact_generation_attempts",
  {
    id: uuid().defaultRandom().primaryKey(),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    ordinal: integer().notNull(),
    executorKind: varchar("executor_kind", { length: 24 }).notNull(),
    state: varchar({ length: 16 }).notNull().default("queued"),
    sequence: integer().notNull().default(0),
    phase: varchar({ length: 16 }),
    providerConversationId: uuid("provider_conversation_id"),
    providerStatus: varchar("provider_status", { length: 40 }),
    failureCode: varchar("failure_code", { length: 100 }),
    failureDetail: text("failure_detail"),
    provisioningStartedAt: timestamp("provisioning_started_at", { withTimezone: true }),
    authoringStartedAt: timestamp("authoring_started_at", { withTimezone: true }),
    renderingStartedAt: timestamp("rendering_started_at", { withTimezone: true }),
    publishingStartedAt: timestamp("publishing_started_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("artifact_generation_attempts_artifact_ordinal_unique").on(
      table.artifactId,
      table.ordinal,
    ),
    unique("artifact_generation_attempts_artifact_id_id_unique").on(table.artifactId, table.id),
    index("artifact_generation_attempts_artifact_created_index").on(
      table.artifactId,
      table.createdAt,
    ),
    check("artifact_generation_attempts_ordinal_check", sql`${table.ordinal} >= 1`),
    check("artifact_generation_attempts_sequence_check", sql`${table.sequence} >= 0`),
    check(
      "artifact_generation_attempts_executor_check",
      sql`${table.executorKind} in ('deterministic', 'model', 'task_agent')`,
    ),
    check(
      "artifact_generation_attempts_state_check",
      sql`${table.state} in ('queued', 'running', 'submitted', 'failed', 'cancelled')`,
    ),
    check(
      "artifact_generation_attempts_phase_check",
      sql`${table.phase} is null or ${table.phase} in ('queued', 'provisioning', 'authoring', 'rendering', 'publishing', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "artifact_generation_attempts_terminal_check",
      sql`(${table.state} = 'queued' and ${table.startedAt} is null and ${table.finishedAt} is null) or (${table.state} = 'running' and ${table.startedAt} is not null and ${table.finishedAt} is null) or (${table.state} in ('submitted', 'failed', 'cancelled') and ${table.finishedAt} is not null)`,
    ),
    check(
      "artifact_generation_attempts_failure_check",
      sql`(${table.state} = 'failed' and ${table.failureCode} is not null and length(btrim(${table.failureCode})) > 0) or (${table.state} <> 'failed' and ${table.failureCode} is null)`,
    ),
  ],
);

export const artifactProviderAttempts = pgTable(
  "artifact_provider_attempts",
  {
    id: uuid().defaultRandom().primaryKey(),
    generationAttemptId: uuid("generation_attempt_id")
      .notNull()
      .references(() => artifactGenerationAttempts.id, { onDelete: "restrict" }),
    ordinal: integer().notNull(),
    requestedProvider: varchar("requested_provider", { length: 64 }).notNull(),
    requestedModel: varchar("requested_model", { length: 128 }).notNull(),
    effectiveProvider: varchar("effective_provider", { length: 64 }),
    effectiveModel: varchar("effective_model", { length: 128 }),
    providerCallCount: integer("provider_call_count").notNull().default(0),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    state: varchar({ length: 16 }).notNull().default("running"),
    errorCode: varchar("error_code", { length: 100 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("artifact_provider_attempts_generation_ordinal_unique").on(
      table.generationAttemptId,
      table.ordinal,
    ),
    index("artifact_provider_attempts_generation_started_index").on(
      table.generationAttemptId,
      table.startedAt,
    ),
    check("artifact_provider_attempts_ordinal_check", sql`${table.ordinal} >= 1`),
    check(
      "artifact_provider_attempts_state_check",
      sql`${table.state} in ('running', 'succeeded', 'failed', 'exhausted')`,
    ),
    check(
      "artifact_provider_attempts_count_check",
      sql`${table.providerCallCount} >= 0 and ${table.toolCallCount} >= 0`,
    ),
    check(
      "artifact_provider_attempts_terminal_check",
      sql`(${table.state} = 'running' and ${table.finishedAt} is null) or (${table.state} in ('succeeded', 'failed', 'exhausted') and ${table.finishedAt} is not null)`,
    ),
  ],
);

export const artifactRevisions = pgTable(
  "artifact_revisions",
  {
    id: uuid().defaultRandom().primaryKey(),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    parentRevisionId: uuid("parent_revision_id").references(
      (): AnyPgColumn => artifactRevisions.id,
      { onDelete: "restrict" },
    ),
    createdByPrincipalId: uuid("created_by_principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    revisionNumber: integer("revision_number").notNull(),
    content: jsonb().notNull(),
    contentSha256: varchar("content_sha256", { length: 64 }).notNull(),
    producingRunId: uuid("producing_run_id").references(() => aiRuns.id, {
      onDelete: "restrict",
    }),
    producingAttemptId: uuid("producing_attempt_id").references(() => aiRunAttempts.id, {
      onDelete: "restrict",
    }),
    generationAttemptId: uuid("generation_attempt_id").references(
      () => artifactGenerationAttempts.id,
      { onDelete: "restrict" },
    ),
    generationMetadata: jsonb("generation_metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("artifact_revisions_artifact_number_unique").on(
      table.artifactId,
      table.revisionNumber,
    ),
    unique("artifact_revisions_artifact_id_id_unique").on(table.artifactId, table.id),
    index("artifact_revisions_artifact_created_index").on(table.artifactId, table.createdAt),
    check("artifact_revisions_number_check", sql`${table.revisionNumber} >= 1`),
    check("artifact_revisions_hash_check", sql`${table.contentSha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const artifactSourceBundles = pgTable(
  "artifact_source_bundles",
  {
    id: uuid().defaultRandom().primaryKey(),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    generationAttemptId: uuid("generation_attempt_id").references(
      () => artifactGenerationAttempts.id,
      {
        onDelete: "restrict",
      },
    ),
    producingRunId: uuid("producing_run_id").references(() => aiRuns.id, {
      onDelete: "restrict",
    }),
    artifactRevisionId: uuid("artifact_revision_id").references(() => artifactRevisions.id, {
      onDelete: "restrict",
    }),
    state: varchar({ length: 16 }).notNull().default("staged"),
    bundleFormat: varchar("bundle_format", { length: 24 }).notNull(),
    recipeVersion: varchar("recipe_version", { length: 100 }).notNull(),
    objectKey: varchar("object_key", { length: 512 }).notNull(),
    objectVersionId: varchar("object_version_id", { length: 255 }).notNull(),
    mediaType: varchar("media_type", { length: 160 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: varchar({ length: 64 }).notNull(),
    manifest: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("artifact_source_bundles_generation_attempt_unique")
      .on(table.generationAttemptId)
      .where(sql`${table.generationAttemptId} is not null`),
    uniqueIndex("artifact_source_bundles_producing_run_unique")
      .on(table.producingRunId)
      .where(sql`${table.producingRunId} is not null`),
    uniqueIndex("artifact_source_bundles_revision_unique")
      .on(table.artifactRevisionId)
      .where(sql`${table.artifactRevisionId} is not null`),
    index("artifact_source_bundles_artifact_created_index").on(table.artifactId, table.createdAt),
    foreignKey({
      columns: [table.artifactId, table.generationAttemptId],
      foreignColumns: [artifactGenerationAttempts.artifactId, artifactGenerationAttempts.id],
      name: "artifact_source_bundles_generation_attempt_ownership_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.artifactId, table.artifactRevisionId],
      foreignColumns: [artifactRevisions.artifactId, artifactRevisions.id],
      name: "artifact_source_bundles_revision_ownership_fk",
    }).onDelete("restrict"),
    check("artifact_source_bundles_state_check", sql`${table.state} in ('staged', 'published')`),
    check(
      "artifact_source_bundles_publication_check",
      sql`(${table.state} = 'staged' and ${table.artifactRevisionId} is null) or (${table.state} = 'published' and ${table.artifactRevisionId} is not null)`,
    ),
    check(
      "artifact_source_bundles_producer_check",
      sql`(${table.generationAttemptId} is not null and ${table.producingRunId} is null) or (${table.generationAttemptId} is null and ${table.producingRunId} is not null)`,
    ),
    check("artifact_source_bundles_format_check", sql`${table.bundleFormat} in ('tar_gzip')`),
    check(
      "artifact_source_bundles_identity_check",
      sql`${table.sizeBytes} > 0 and ${table.sha256} ~ '^[0-9a-f]{64}$' and length(btrim(${table.objectKey})) > 0 and length(btrim(${table.objectVersionId})) > 0`,
    ),
  ],
);

export const presentationEditorSnapshots = pgTable(
  "presentation_editor_snapshots",
  {
    id: uuid().defaultRandom().primaryKey(),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    artifactRevisionId: uuid("artifact_revision_id")
      .notNull()
      .references(() => artifactRevisions.id, { onDelete: "restrict" }),
    projectObjectKey: varchar("project_object_key", { length: 512 }).notNull(),
    projectObjectVersionId: varchar("project_object_version_id", { length: 255 }).notNull(),
    projectMediaType: varchar("project_media_type", { length: 160 }).notNull(),
    projectSizeBytes: integer("project_size_bytes").notNull(),
    projectSha256: varchar("project_sha256", { length: 64 }).notNull(),
    sourceObjectKey: varchar("source_object_key", { length: 512 }),
    sourceObjectVersionId: varchar("source_object_version_id", { length: 255 }),
    sourceMediaType: varchar("source_media_type", { length: 160 }),
    sourceSizeBytes: integer("source_size_bytes"),
    sourceSha256: varchar("source_sha256", { length: 64 }),
    coverObjectKey: varchar("cover_object_key", { length: 512 }),
    coverObjectVersionId: varchar("cover_object_version_id", { length: 255 }),
    coverMediaType: varchar("cover_media_type", { length: 160 }),
    coverSizeBytes: integer("cover_size_bytes"),
    coverSha256: varchar("cover_sha256", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("presentation_editor_snapshots_revision_unique").on(table.artifactRevisionId),
    index("presentation_editor_snapshots_artifact_created_index").on(
      table.artifactId,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.artifactId, table.artifactRevisionId],
      foreignColumns: [artifactRevisions.artifactId, artifactRevisions.id],
      name: "presentation_editor_snapshots_revision_ownership_fk",
    }).onDelete("restrict"),
    check(
      "presentation_editor_snapshots_project_identity_check",
      sql`${table.projectMediaType} = 'application/json' and ${table.projectSizeBytes} between 1 and 26214400 and ${table.projectSha256} ~ '^[0-9a-f]{64}$' and length(btrim(${table.projectObjectKey})) > 0 and length(btrim(${table.projectObjectVersionId})) > 0`,
    ),
    check(
      "presentation_editor_snapshots_source_identity_check",
      sql`(${table.sourceObjectKey} is null and ${table.sourceObjectVersionId} is null and ${table.sourceMediaType} is null and ${table.sourceSizeBytes} is null and ${table.sourceSha256} is null) or (${table.sourceObjectKey} is not null and ${table.sourceObjectVersionId} is not null and ${table.sourceMediaType} = 'application/vnd.spectra.presentation-source+json' and ${table.sourceSizeBytes} between 1 and 33554432 and ${table.sourceSha256} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      "presentation_editor_snapshots_cover_identity_check",
      sql`(${table.coverObjectKey} is null and ${table.coverObjectVersionId} is null and ${table.coverMediaType} is null and ${table.coverSizeBytes} is null and ${table.coverSha256} is null) or (${table.coverObjectKey} is not null and ${table.coverObjectVersionId} is not null and ${table.coverMediaType} in ('image/jpeg', 'image/png', 'image/webp') and ${table.coverSizeBytes} between 1 and 10485760 and ${table.coverSha256} ~ '^[0-9a-f]{64}$')`,
    ),
  ],
);

export const artifactEditProposals = pgTable(
  "artifact_edit_proposals",
  {
    id: uuid().defaultRandom().primaryKey(),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    baseRevisionId: uuid("base_revision_id")
      .notNull()
      .references(() => artifactRevisions.id, { onDelete: "restrict" }),
    createdByPrincipalId: uuid("created_by_principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    runId: uuid("run_id").notNull(),
    kind: varchar({ length: 32 }).notNull(),
    payload: jsonb().notNull(),
    state: varchar({ length: 16 }).notNull().default("pending"),
    acceptedRevisionId: uuid("accepted_revision_id").references(() => artifactRevisions.id, {
      onDelete: "restrict",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.artifactId, table.baseRevisionId],
      foreignColumns: [artifactRevisions.artifactId, artifactRevisions.id],
      name: "artifact_edit_proposals_base_revision_ownership_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.artifactId, table.acceptedRevisionId],
      foreignColumns: [artifactRevisions.artifactId, artifactRevisions.id],
      name: "artifact_edit_proposals_accepted_revision_ownership_fk",
    }).onDelete("restrict"),
    uniqueIndex("artifact_edit_proposals_artifact_run_unique").on(table.artifactId, table.runId),
    uniqueIndex("artifact_edit_proposals_artifact_pending_unique")
      .on(table.artifactId)
      .where(sql`${table.state} = 'pending'`),
    index("artifact_edit_proposals_artifact_created_index").on(table.artifactId, table.createdAt),
    check(
      "artifact_edit_proposals_kind_check",
      sql`${table.kind} in ('teaching_document', 'mind_map', 'quiz', 'presentation')`,
    ),
    check(
      "artifact_edit_proposals_state_check",
      sql`${table.state} in ('pending', 'accepted', 'dismissed')`,
    ),
    check(
      "artifact_edit_proposals_terminal_check",
      sql`(${table.state} = 'pending' and ${table.acceptedRevisionId} is null and ${table.acceptedAt} is null and ${table.dismissedAt} is null) or (${table.state} = 'accepted' and ${table.acceptedRevisionId} is not null and ${table.acceptedAt} is not null and ${table.dismissedAt} is null) or (${table.state} = 'dismissed' and ${table.acceptedRevisionId} is null and ${table.acceptedAt} is null and ${table.dismissedAt} is not null)`,
    ),
  ],
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid().defaultRandom().primaryKey(),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    artifactRevisionId: uuid("artifact_revision_id")
      .notNull()
      .references(() => artifactRevisions.id, { onDelete: "restrict" }),
    actorPrincipalId: uuid("actor_principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    state: varchar({ length: 16 }).notNull().default("in_progress"),
    feedbackMode: varchar("feedback_mode", { length: 24 }).notNull(),
    navigationMode: varchar("navigation_mode", { length: 16 }).notNull(),
    score: integer(),
    totalPoints: integer("total_points"),
    graderVersion: varchar("grader_version", { length: 64 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.artifactId, table.artifactRevisionId],
      foreignColumns: [artifactRevisions.artifactId, artifactRevisions.id],
      name: "quiz_attempts_artifact_revision_ownership_fk",
    }).onDelete("restrict"),
    uniqueIndex("quiz_attempts_actor_artifact_active_unique")
      .on(table.actorPrincipalId, table.artifactId)
      .where(sql`${table.state} = 'in_progress'`),
    index("quiz_attempts_actor_artifact_created_index").on(
      table.actorPrincipalId,
      table.artifactId,
      table.createdAt,
    ),
    check(
      "quiz_attempts_state_check",
      sql`${table.state} in ('in_progress', 'submitted', 'abandoned')`,
    ),
    check(
      "quiz_attempts_feedback_check",
      sql`${table.feedbackMode} in ('after_submission', 'immediate')`,
    ),
    check("quiz_attempts_navigation_check", sql`${table.navigationMode} in ('free', 'sequential')`),
    check(
      "quiz_attempts_result_check",
      sql`(${table.state} = 'submitted' and ${table.submittedAt} is not null and ${table.score} is not null and ${table.totalPoints} is not null and ${table.graderVersion} is not null) or (${table.state} <> 'submitted' and ${table.submittedAt} is null and ${table.score} is null and ${table.totalPoints} is null and ${table.graderVersion} is null)`,
    ),
    check(
      "quiz_attempts_abandoned_check",
      sql`(${table.state} = 'abandoned') = (${table.abandonedAt} is not null)`,
    ),
    check(
      "quiz_attempts_score_check",
      sql`${table.score} is null or (${table.score} >= 0 and ${table.totalPoints} >= ${table.score})`,
    ),
  ],
);

export const quizAttemptAnswers = pgTable(
  "quiz_attempt_answers",
  {
    id: uuid().defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => quizAttempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull(),
    answer: jsonb().notNull(),
    flagged: boolean().notNull().default(false),
    version: integer().notNull().default(1),
    checkCount: integer("check_count").notNull().default(0),
    correct: boolean(),
    earnedPoints: integer("earned_points"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("quiz_attempt_answers_attempt_question_unique").on(
      table.attemptId,
      table.questionId,
    ),
    index("quiz_attempt_answers_attempt_index").on(table.attemptId),
    check("quiz_attempt_answers_version_check", sql`${table.version} >= 1`),
    check("quiz_attempt_answers_check_count_check", sql`${table.checkCount} >= 0`),
    check(
      "quiz_attempt_answers_points_check",
      sql`${table.earnedPoints} is null or ${table.earnedPoints} >= 0`,
    ),
    check(
      "quiz_attempt_answers_grade_pair_check",
      sql`(${table.correct} is null) = (${table.earnedPoints} is null)`,
    ),
  ],
);

export const gameRuns = pgTable(
  "game_runs",
  {
    id: uuid().defaultRandom().primaryKey(),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    artifactRevisionId: uuid("artifact_revision_id")
      .notNull()
      .references(() => artifactRevisions.id, { onDelete: "restrict" }),
    actorPrincipalId: uuid("actor_principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    surfaceKey: varchar("surface_key", { length: 128 }).notNull(),
    startRequestId: varchar("start_request_id", { length: 128 }).notNull(),
    seed: varchar({ length: 64 }).notNull(),
    runtimeVersion: varchar("runtime_version", { length: 64 }).notNull(),
    questionOrder: jsonb("question_order").$type<string[]>().notNull(),
    state: varchar({ length: 24 }).notNull().default("in_progress"),
    currentScore: integer("current_score").notNull().default(0),
    finalScore: integer("final_score"),
    successfulRevivals: integer("successful_revivals").notNull().default(0),
    finishReason: varchar("finish_reason", { length: 40 }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.artifactId, table.artifactRevisionId],
      foreignColumns: [artifactRevisions.artifactId, artifactRevisions.id],
      name: "game_runs_artifact_revision_ownership_fk",
    }).onDelete("restrict"),
    uniqueIndex("game_runs_actor_artifact_start_request_unique").on(
      table.actorPrincipalId,
      table.artifactId,
      table.startRequestId,
    ),
    uniqueIndex("game_runs_actor_artifact_surface_active_unique")
      .on(table.actorPrincipalId, table.artifactId, table.surfaceKey)
      .where(sql`${table.state} in ('in_progress', 'awaiting_revival')`),
    index("game_runs_actor_artifact_created_index").on(
      table.actorPrincipalId,
      table.artifactId,
      table.createdAt,
    ),
    check(
      "game_runs_state_check",
      sql`${table.state} in ('in_progress', 'awaiting_revival', 'finished', 'abandoned')`,
    ),
    check(
      "game_runs_score_check",
      sql`${table.currentScore} >= 0 and ${table.successfulRevivals} >= 0 and (${table.finalScore} is null or ${table.finalScore} >= 0)`,
    ),
    check(
      "game_runs_terminal_check",
      sql`(${table.state} = 'finished' and ${table.finishedAt} is not null and ${table.finalScore} is not null and ${table.finishReason} is not null and ${table.abandonedAt} is null) or (${table.state} = 'abandoned' and ${table.abandonedAt} is not null and ${table.finishedAt} is null and ${table.finalScore} is null) or (${table.state} in ('in_progress', 'awaiting_revival') and ${table.finishedAt} is null and ${table.abandonedAt} is null and ${table.finalScore} is null)`,
    ),
  ],
);

export const gameRunDeaths = pgTable(
  "game_run_deaths",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => gameRuns.id, { onDelete: "cascade" }),
    sequence: integer().notNull(),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    score: integer().notNull(),
    elapsedMs: integer("elapsed_ms").notNull(),
    flapCount: integer("flap_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("game_run_deaths_run_sequence_unique").on(table.runId, table.sequence),
    uniqueIndex("game_run_deaths_run_request_unique").on(table.runId, table.requestId),
    check(
      "game_run_deaths_summary_check",
      sql`${table.sequence} >= 1 and ${table.score} >= 0 and ${table.elapsedMs} >= 0 and ${table.flapCount} >= 0`,
    ),
  ],
);

export const gameRevivalRounds = pgTable(
  "game_revival_rounds",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => gameRuns.id, { onDelete: "cascade" }),
    deathId: uuid("death_id")
      .notNull()
      .references(() => gameRunDeaths.id, { onDelete: "cascade" }),
    state: varchar({ length: 16 }).notNull().default("in_progress"),
    questionIds: jsonb("question_ids").$type<string[]>().notNull(),
    answers: jsonb().$type<Array<{ questionId: string; answer: unknown }>>(),
    correctCount: integer("correct_count"),
    submitRequestId: varchar("submit_request_id", { length: 128 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("game_revival_rounds_death_unique").on(table.deathId),
    uniqueIndex("game_revival_rounds_run_submit_request_unique")
      .on(table.runId, table.submitRequestId)
      .where(sql`${table.submitRequestId} is not null`),
    index("game_revival_rounds_run_created_index").on(table.runId, table.createdAt),
    check(
      "game_revival_rounds_state_check",
      sql`${table.state} in ('in_progress', 'passed', 'failed')`,
    ),
    check(
      "game_revival_rounds_result_check",
      sql`(${table.state} = 'in_progress' and ${table.answers} is null and ${table.correctCount} is null and ${table.submitRequestId} is null and ${table.submittedAt} is null) or (${table.state} in ('passed', 'failed') and ${table.answers} is not null and ${table.correctCount} between 0 and 3 and ${table.submitRequestId} is not null and ${table.submittedAt} is not null)`,
    ),
  ],
);

export const artifactRenderJobs = pgTable(
  "artifact_render_jobs",
  {
    id: uuid().defaultRandom().primaryKey(),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    artifactRevisionId: uuid("artifact_revision_id")
      .notNull()
      .references(() => artifactRevisions.id, { onDelete: "restrict" }),
    format: varchar({ length: 32 }).notNull(),
    state: varchar({ length: 24 }).notNull().default("queued"),
    rendererVersion: varchar("renderer_version", { length: 64 }).notNull(),
    outputObjectKey: varchar("output_object_key", { length: 512 }),
    outputObjectVersionId: varchar("output_object_version_id", { length: 255 }),
    outputMediaType: varchar("output_media_type", { length: 160 }),
    outputSizeBytes: integer("output_size_bytes"),
    outputSha256: varchar("output_sha256", { length: 64 }),
    failureCode: varchar("failure_code", { length: 100 }),
    attemptNumber: integer("attempt_number").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("artifact_render_jobs_revision_format_renderer_unique").on(
      table.artifactRevisionId,
      table.format,
      table.rendererVersion,
    ),
    index("artifact_render_jobs_artifact_created_index").on(table.artifactId, table.createdAt),
    check("artifact_render_jobs_format_check", sql`${table.format} in ('docx', 'pptx', 'mp4')`),
    check(
      "artifact_render_jobs_state_check",
      sql`${table.state} in ('queued', 'rendering', 'ready', 'failed', 'cancelled')`,
    ),
    check("artifact_render_jobs_attempt_check", sql`${table.attemptNumber} >= 1`),
    check(
      "artifact_render_jobs_output_check",
      sql`(${table.state} = 'ready' and ${table.outputObjectKey} is not null and ${table.outputObjectVersionId} is not null and ${table.outputMediaType} is not null and ${table.outputSizeBytes} > 0 and ${table.outputSha256} ~ '^[0-9a-f]{64}$') or (${table.state} <> 'ready' and ${table.outputObjectKey} is null and ${table.outputObjectVersionId} is null and ${table.outputMediaType} is null and ${table.outputSizeBytes} is null and ${table.outputSha256} is null)`,
    ),
  ],
);

export const cleanupReceipts = pgTable(
  "cleanup_receipts",
  {
    id: uuid().defaultRandom().primaryKey(),
    scopeType: varchar("scope_type", { length: 32 }).notNull(),
    scopeId: uuid("scope_id").notNull(),
    owner: varchar({ length: 64 }).notNull(),
    resourceType: varchar("resource_type", { length: 64 }).notNull(),
    resourceId: varchar("resource_id", { length: 512 }).notNull(),
    outcome: varchar({ length: 24 }).notNull(),
    failureCode: varchar("failure_code", { length: 100 }),
    attemptNumber: integer("attempt_number").notNull().default(1),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cleanup_receipts_resource_unique").on(
      table.scopeType,
      table.scopeId,
      table.owner,
      table.resourceType,
      table.resourceId,
    ),
    index("cleanup_receipts_scope_index").on(table.scopeType, table.scopeId),
    check(
      "cleanup_receipts_outcome_check",
      sql`${table.outcome} in ('deleted', 'already_absent', 'not_owned', 'failed')`,
    ),
    check("cleanup_receipts_attempt_check", sql`${table.attemptNumber} >= 1`),
    check(
      "cleanup_receipts_failure_check",
      sql`(${table.outcome} = 'failed' and ${table.failureCode} is not null) or (${table.outcome} <> 'failed' and ${table.failureCode} is null)`,
    ),
  ],
);

export const sourceKind = pgEnum("source_kind", [
  "uploaded_file",
  "workspace_reference",
  "artifact",
]);

export const sources = pgTable(
  "sources",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    kind: sourceKind().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
  },
  (table) => [
    unique("sources_id_workspace_unique").on(table.id, table.workspaceId),
    index("sources_workspace_active_created_index")
      .on(table.workspaceId, table.createdAt)
      .where(sql`${table.deletedAt} is null`),
    index("sources_deleted_index").on(table.deletedAt).where(sql`${table.deletedAt} is not null`),
    check(
      "sources_tombstone_check",
      sql`${table.purgedAt} is null or ${table.deletedAt} is not null`,
    ),
  ],
);

export const workspaceReferenceSources = pgTable(
  "workspace_reference_sources",
  {
    sourceId: uuid("source_id").primaryKey(),
    sourceWorkspaceId: uuid("source_workspace_id").notNull(),
    targetWorkspaceId: uuid("target_workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
  },
  (table) => [
    foreignKey({
      columns: [table.sourceId, table.sourceWorkspaceId],
      foreignColumns: [sources.id, sources.workspaceId],
      name: "workspace_reference_sources_source_workspace_fk",
    }).onDelete("cascade"),
    uniqueIndex("workspace_reference_sources_edge_unique").on(
      table.sourceWorkspaceId,
      table.targetWorkspaceId,
    ),
    check(
      "workspace_reference_sources_no_self_check",
      sql`${table.sourceWorkspaceId} <> ${table.targetWorkspaceId}`,
    ),
  ],
);

export const artifactSources = pgTable(
  "artifact_sources",
  {
    sourceId: uuid("source_id")
      .primaryKey()
      .references(() => sources.id, { onDelete: "cascade" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
  },
  (table) => [uniqueIndex("artifact_sources_artifact_unique").on(table.artifactId)],
);

export const fileSources = pgTable(
  "file_sources",
  {
    sourceId: uuid("source_id")
      .primaryKey()
      .references(() => sources.id, { onDelete: "cascade" }),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadKey: varchar("upload_key", { length: 512 }),
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }),
    uploadGeneration: integer("upload_generation").notNull().default(1),
    storageKey: varchar("storage_key", { length: 512 }),
    storageVersionId: varchar("storage_version_id", { length: 255 }),
    state: varchar({ length: 32 }).notNull().default("pending_upload"),
    failureCode: varchar("failure_code", { length: 100 }),
  },
  (table) => [
    uniqueIndex("file_sources_upload_key_unique").on(table.uploadKey),
    uniqueIndex("file_sources_storage_key_unique").on(table.storageKey),
    check(
      "file_sources_original_filename_check",
      sql`length(btrim(${table.originalFilename})) between 1 and 255`,
    ),
    check("file_sources_size_bytes_check", sql`${table.sizeBytes} between 1 and 52428800`),
    check("file_sources_upload_generation_check", sql`${table.uploadGeneration} >= 1`),
    check(
      "file_sources_state_check",
      sql`${table.state} in ('pending_upload', 'stored', 'failed')`,
    ),
    check(
      "file_sources_upload_reference_check",
      sql`(${table.uploadKey} is null) = (${table.uploadExpiresAt} is null) and (${table.uploadKey} is null or length(${table.uploadKey}) > 0)`,
    ),
    check(
      "file_sources_storage_reference_check",
      sql`(${table.storageKey} is null) = (${table.storageVersionId} is null) and (${table.storageKey} is null or (length(${table.storageKey}) > 0 and length(${table.storageVersionId}) > 0))`,
    ),
    check(
      "file_sources_failure_code_check",
      sql`(${table.state} = 'failed' and ${table.failureCode} is not null and length(btrim(${table.failureCode})) > 0) or (${table.state} <> 'failed' and ${table.failureCode} is null)`,
    ),
    check(
      "file_sources_state_references_check",
      sql`(${table.state} = 'pending_upload' and ${table.storageKey} is null) or
          (${table.state} = 'stored' and ${table.uploadKey} is null) or
          (${table.state} = 'failed' and ${table.uploadKey} is null and ${table.storageKey} is null)`,
    ),
  ],
);

export const sourceIngestions = pgTable(
  "source_ingestions",
  {
    id: uuid().defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    sourceRevision: integer("source_revision").notNull().default(1),
    provider: varchar({ length: 32 }).notNull().default("mineru"),
    providerBatchId: varchar("provider_batch_id", { length: 255 }),
    providerSubmissionStartedAt: timestamp("provider_submission_started_at", {
      withTimezone: true,
    }),
    state: varchar({ length: 32 }).notNull().default("queued"),
    attemptNumber: integer("attempt_number").notNull().default(1),
    retryable: boolean().notNull().default(false),
    errorCode: varchar("error_code", { length: 100 }),
    resultStorageKey: varchar("result_storage_key", { length: 512 }),
    resultStorageVersionId: varchar("result_storage_version_id", { length: 255 }),
    resultSha256: varchar("result_sha256", { length: 64 }),
    resultSizeBytes: integer("result_size_bytes"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("source_ingestions_attempt_unique").on(
      table.sourceId,
      table.sourceRevision,
      table.attemptNumber,
    ),
    uniqueIndex("source_ingestions_active_unique")
      .on(table.sourceId, table.sourceRevision)
      .where(sql`${table.state} in ('queued', 'processing', 'ready')`),
    uniqueIndex("source_ingestions_provider_batch_unique")
      .on(table.providerBatchId)
      .where(sql`${table.providerBatchId} is not null`),
    uniqueIndex("source_ingestions_result_storage_key_unique")
      .on(table.resultStorageKey)
      .where(sql`${table.resultStorageKey} is not null`),
    index("source_ingestions_source_created_index").on(table.sourceId, table.createdAt),
    check("source_ingestions_revision_check", sql`${table.sourceRevision} >= 1`),
    check("source_ingestions_attempt_check", sql`${table.attemptNumber} >= 1`),
    check(
      "source_ingestions_provider_check",
      sql`${table.provider} in ('mineru', 'media_understanding', 'native_text')`,
    ),
    check(
      "source_ingestions_state_check",
      sql`${table.state} in ('queued', 'processing', 'ready', 'failed', 'obsolete')`,
    ),
    check(
      "source_ingestions_batch_check",
      sql`(${table.provider} = 'mineru' and ((${table.state} in ('processing', 'ready') and ${table.providerBatchId} is not null and ${table.providerSubmissionStartedAt} is not null) or (${table.state} in ('queued', 'failed', 'obsolete') and ${table.providerBatchId} is null))) or (${table.provider} in ('media_understanding', 'native_text') and ${table.providerBatchId} is null and ${table.providerSubmissionStartedAt} is null)`,
    ),
    check(
      "source_ingestions_result_check",
      sql`(${table.state} = 'ready' and ${table.resultStorageKey} is not null and ${table.resultStorageVersionId} is not null and ${table.resultSha256} is not null and ${table.resultSizeBytes} > 0) or (${table.state} <> 'ready' and ${table.resultStorageKey} is null and ${table.resultStorageVersionId} is null and ${table.resultSha256} is null and ${table.resultSizeBytes} is null)`,
    ),
    check(
      "source_ingestions_error_check",
      sql`(${table.state} = 'failed' and ${table.errorCode} is not null and length(btrim(${table.errorCode})) > 0) or (${table.state} <> 'failed' and ${table.errorCode} is null and ${table.retryable} = false)`,
    ),
    check(
      "source_ingestions_finished_check",
      sql`(${table.state} in ('ready', 'failed', 'obsolete')) = (${table.finishedAt} is not null)`,
    ),
  ],
);

export const retrievalIndexGenerations = pgTable(
  "retrieval_index_generations",
  {
    id: uuid().defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceIngestionId: uuid("source_ingestion_id").references(() => sourceIngestions.id, {
      onDelete: "cascade",
    }),
    artifactRevisionId: uuid("artifact_revision_id").references(() => artifactRevisions.id, {
      onDelete: "cascade",
    }),
    sourceRevision: integer("source_revision").notNull(),
    sourceRevisionId: varchar("source_revision_id", { length: 160 }).notNull(),
    representationId: varchar("representation_id", { length: 160 }).notNull(),
    representationFamily: varchar("representation_family", { length: 32 }),
    representationAdapterId: varchar("representation_adapter_id", { length: 100 }),
    representationAdapterVersion: varchar("representation_adapter_version", { length: 32 }),
    representationHash: varchar("representation_hash", { length: 64 }),
    representationMetadata: jsonb("representation_metadata").$type<Record<string, unknown>>(),
    collectionName: varchar("collection_name", { length: 255 }).notNull(),
    embeddingModelId: varchar("embedding_model_id", { length: 255 }).notNull(),
    embeddingDimension: integer("embedding_dimension").notNull(),
    chunkProfileId: varchar("chunk_profile_id", { length: 100 }).notNull(),
    sparseProfileId: varchar("sparse_profile_id", { length: 100 }).notNull(),
    manifestHash: varchar("manifest_hash", { length: 64 }).notNull(),
    sourcePolicyHash: varchar("source_policy_hash", { length: 64 }).notNull(),
    workflowId: varchar("workflow_id", { length: 255 }).notNull(),
    state: varchar({ length: 24 }).notNull().default("queued"),
    failureCode: varchar("failure_code", { length: 100 }),
    retryCount: integer("retry_count").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("retrieval_index_generations_ingestion_manifest_policy_unique")
      .on(table.sourceIngestionId, table.manifestHash, table.sourcePolicyHash)
      .where(sql`${table.sourceIngestionId} is not null`),
    uniqueIndex("retrieval_index_generations_artifact_revision_manifest_policy_unique")
      .on(table.sourceId, table.artifactRevisionId, table.manifestHash, table.sourcePolicyHash)
      .where(sql`${table.artifactRevisionId} is not null`),
    uniqueIndex("retrieval_index_generations_ready_source_unique")
      .on(table.sourceId)
      .where(sql`${table.state} = 'ready'`),
    index("retrieval_index_generations_workspace_state_index").on(table.workspaceId, table.state),
    index("retrieval_index_generations_source_state_index").on(table.sourceId, table.state),
    index("retrieval_index_generations_state_updated_index").on(table.state, table.updatedAt),
    index("retrieval_index_generations_retry_index").on(table.state, table.nextRetryAt),
    check("retrieval_index_generations_revision_check", sql`${table.sourceRevision} >= 1`),
    check(
      "retrieval_index_generations_origin_check",
      sql`(${table.sourceIngestionId} is not null) <> (${table.artifactRevisionId} is not null)`,
    ),
    check(
      "retrieval_index_generations_state_check",
      sql`${table.state} in ('queued', 'projecting', 'publishing', 'ready', 'failed', 'obsolete')`,
    ),
    check(
      "retrieval_index_generations_failure_check",
      sql`(${table.state} = 'failed' and ${table.failureCode} is not null and length(btrim(${table.failureCode})) > 0) or (${table.state} <> 'failed' and ${table.failureCode} is null)`,
    ),
    check(
      "retrieval_index_generations_published_check",
      sql`(${table.state} in ('ready', 'obsolete')) = (${table.publishedAt} is not null)`,
    ),
    check(
      "retrieval_index_generations_identity_check",
      sql`${table.embeddingDimension} > 0 and length(btrim(${table.embeddingModelId})) > 0 and length(btrim(${table.chunkProfileId})) > 0 and length(btrim(${table.sparseProfileId})) > 0 and length(${table.manifestHash}) = 64 and length(${table.sourcePolicyHash}) = 64 and length(btrim(${table.workflowId})) > 0`,
    ),
    check("retrieval_index_generations_retry_count_check", sql`${table.retryCount} >= 0`),
    check(
      "retrieval_index_generations_retry_at_check",
      sql`${table.state} = 'failed' or ${table.nextRetryAt} is null`,
    ),
  ],
);

export const retrievalRepresentationBlocks = pgTable(
  "retrieval_representation_blocks",
  {
    id: uuid().primaryKey(),
    indexGenerationId: uuid("index_generation_id")
      .notNull()
      .references(() => retrievalIndexGenerations.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    representationId: varchar("representation_id", { length: 160 }).notNull(),
    ordinal: integer().notNull(),
    kind: varchar({ length: 32 }).notNull(),
    headingPath: jsonb("heading_path").$type<string[]>().notNull().default([]),
    exactText: text("exact_text"),
    indexText: text("index_text"),
    locator: jsonb().$type<Record<string, unknown>>().notNull(),
    content: jsonb().$type<Record<string, unknown>>().notNull(),
    fidelity: varchar({ length: 32 }).notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    locatorStart: integer("locator_start"),
    locatorEnd: integer("locator_end"),
    capacityUnits: integer("capacity_units").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("retrieval_representation_blocks_generation_ordinal_unique").on(
      table.indexGenerationId,
      table.ordinal,
    ),
    index("retrieval_representation_blocks_source_index").on(table.sourceId),
    check("retrieval_representation_blocks_ordinal_check", sql`${table.ordinal} >= 0`),
    check(
      "retrieval_representation_blocks_locator_check",
      sql`(${table.locatorStart} is null and ${table.locatorEnd} is null) or (${table.locatorStart} is not null and ${table.locatorEnd} is not null and ${table.locatorStart} >= 0 and ${table.locatorEnd} > ${table.locatorStart})`,
    ),
    check(
      "retrieval_representation_blocks_content_check",
      sql`((length(${table.exactText}) > 0 and length(${table.indexText}) > 0 and ${table.capacityUnits} > 0) or (length(${table.exactText}) > 0 and ${table.indexText} is null and ${table.capacityUnits} = 0) or (${table.exactText} is null and ${table.indexText} is null and ${table.capacityUnits} = 0 and ${table.content}->>'kind' = 'visual_region')) and length(${table.contentHash}) = 64`,
    ),
  ],
);

export const retrievalChunks = pgTable(
  "retrieval_chunks",
  {
    id: uuid().primaryKey(),
    indexGenerationId: uuid("index_generation_id")
      .notNull()
      .references(() => retrievalIndexGenerations.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    representationId: varchar("representation_id", { length: 160 }).notNull(),
    ordinal: integer().notNull(),
    firstBlockOrdinal: integer("first_block_ordinal").notNull(),
    lastBlockOrdinal: integer("last_block_ordinal").notNull(),
    headingPath: jsonb("heading_path").$type<string[]>().notNull().default([]),
    exactText: text("exact_text").notNull(),
    indexText: text("index_text").notNull(),
    denseVectorHash: varchar("dense_vector_hash", { length: 64 }),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    locatorStart: integer("locator_start"),
    locatorEnd: integer("locator_end"),
    capacityUnits: integer("capacity_units").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("retrieval_chunks_generation_ordinal_unique").on(
      table.indexGenerationId,
      table.ordinal,
    ),
    index("retrieval_chunks_source_index").on(table.sourceId),
    check(
      "retrieval_chunks_ordinal_check",
      sql`${table.ordinal} >= 0 and ${table.firstBlockOrdinal} >= 0 and ${table.lastBlockOrdinal} >= ${table.firstBlockOrdinal}`,
    ),
    check(
      "retrieval_chunks_locator_check",
      sql`(${table.locatorStart} is null and ${table.locatorEnd} is null) or (${table.locatorStart} is not null and ${table.locatorEnd} is not null and ${table.locatorStart} >= 0 and ${table.locatorEnd} > ${table.locatorStart})`,
    ),
    check(
      "retrieval_chunks_content_check",
      sql`length(${table.exactText}) > 0 and length(${table.indexText}) > 0 and length(${table.contentHash}) = 64 and ${table.capacityUnits} > 0`,
    ),
    check(
      "retrieval_chunks_vector_hash_check",
      sql`${table.denseVectorHash} is null or length(${table.denseVectorHash}) = 64`,
    ),
  ],
);

export const retrievalEvidenceUnits = pgTable(
  "retrieval_evidence_units",
  {
    id: uuid().primaryKey(),
    indexGenerationId: uuid("index_generation_id")
      .notNull()
      .references(() => retrievalIndexGenerations.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    representationId: varchar("representation_id", { length: 160 }).notNull(),
    ordinal: integer().notNull(),
    blockOrdinal: integer("block_ordinal").notNull(),
    kind: varchar({ length: 32 }).notNull(),
    exactExcerpt: text("exact_excerpt"),
    locator: jsonb().$type<Record<string, unknown>>().notNull(),
    content: jsonb().$type<Record<string, unknown>>().notNull(),
    fidelity: varchar({ length: 32 }).notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    locatorStart: integer("locator_start"),
    locatorEnd: integer("locator_end"),
    capacityUnits: integer("capacity_units").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("retrieval_evidence_units_generation_ordinal_unique").on(
      table.indexGenerationId,
      table.ordinal,
    ),
    index("retrieval_evidence_units_source_index").on(table.sourceId),
    check(
      "retrieval_evidence_units_ordinal_check",
      sql`${table.ordinal} >= 0 and ${table.blockOrdinal} >= 0`,
    ),
    check(
      "retrieval_evidence_units_locator_check",
      sql`(${table.locatorStart} is null and ${table.locatorEnd} is null) or (${table.locatorStart} is not null and ${table.locatorEnd} is not null and ${table.locatorStart} >= 0 and ${table.locatorEnd} > ${table.locatorStart})`,
    ),
    check(
      "retrieval_evidence_units_excerpt_check",
      sql`((length(${table.exactExcerpt}) > 0 and ${table.capacityUnits} > 0) or (${table.exactExcerpt} is null and ${table.capacityUnits} = 0 and ${table.content}->>'kind' = 'visual_region')) and length(${table.contentHash}) = 64`,
    ),
  ],
);

export const artifactSuggestionSnapshots = pgTable(
  "artifact_suggestion_snapshots",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    locale: varchar({ length: 8 }).notNull(),
    artifactKind: varchar("artifact_kind", { length: 32 }).notNull(),
    contextHash: varchar("context_hash", { length: 64 }).notNull(),
    suggestions: jsonb().$type<Array<{ prompt: string; title: string }>>().notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("artifact_suggestion_snapshots_workspace_locale_kind_unique").on(
      table.workspaceId,
      table.locale,
      table.artifactKind,
    ),
    index("artifact_suggestion_snapshots_expires_index").on(table.expiresAt),
    check("artifact_suggestion_snapshots_locale_check", sql`${table.locale} in ('zh-CN', 'en-US')`),
    check(
      "artifact_suggestion_snapshots_kind_check",
      sql`${table.artifactKind} in ('teaching_document', 'mind_map', 'quiz', 'game', 'presentation', 'animation')`,
    ),
  ],
);

export const artifactSuggestionRequests = pgTable(
  "artifact_suggestion_requests",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    locale: varchar({ length: 8 }).notNull(),
    artifactKind: varchar("artifact_kind", { length: 32 }).notNull(),
    contextHash: varchar("context_hash", { length: 64 }).notNull(),
    epoch: integer().notNull().default(1),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("artifact_suggestion_requests_workspace_locale_kind_unique").on(
      table.workspaceId,
      table.locale,
      table.artifactKind,
    ),
    check("artifact_suggestion_requests_epoch_check", sql`${table.epoch} >= 1`),
    check("artifact_suggestion_requests_locale_check", sql`${table.locale} in ('zh-CN', 'en-US')`),
    check(
      "artifact_suggestion_requests_kind_check",
      sql`${table.artifactKind} in ('teaching_document', 'mind_map', 'quiz', 'game', 'presentation', 'animation')`,
    ),
    check(
      "artifact_suggestion_requests_context_hash_check",
      sql`length(${table.contextHash}) = 64`,
    ),
  ],
);
