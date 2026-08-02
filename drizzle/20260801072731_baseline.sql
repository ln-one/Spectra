CREATE SCHEMA IF NOT EXISTS "auth";--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('uploaded_file', 'workspace_reference', 'artifact');--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_principal_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"active_stream_id" uuid,
	"title" varchar(200),
	"deleted_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_conversations_workspace_conversation_unique" UNIQUE("workspace_id","conversation_id"),
	CONSTRAINT "ai_conversations_tombstone_check" CHECK ("ai_conversations"."purged_at" is null or "ai_conversations"."deleted_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_run_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"execution_key" varchar(200),
	"attempt_number" integer NOT NULL,
	"state" varchar(24) DEFAULT 'running' NOT NULL,
	"requested_provider" varchar(64) NOT NULL,
	"requested_model" varchar(128) NOT NULL,
	"effective_provider" varchar(64),
	"effective_model" varchar(128),
	"profile_snapshot" jsonb NOT NULL,
	"usage_state" varchar(16) DEFAULT 'unknown' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"estimated_cost_microusd" integer,
	"finish_reason" varchar(64),
	"error_code" varchar(100),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ai_run_attempts_number_check" CHECK ("ai_run_attempts"."attempt_number" >= 1),
	CONSTRAINT "ai_run_attempts_tool_count_check" CHECK ("ai_run_attempts"."tool_call_count" >= 0),
	CONSTRAINT "ai_run_attempts_state_check" CHECK ("ai_run_attempts"."state" in ('running', 'succeeded', 'failed', 'interrupted', 'cancelled')),
	CONSTRAINT "ai_run_attempts_terminal_check" CHECK (("ai_run_attempts"."state" = 'running' and "ai_run_attempts"."finished_at" is null) or ("ai_run_attempts"."state" in ('succeeded', 'failed', 'interrupted', 'cancelled') and "ai_run_attempts"."finished_at" is not null)),
	CONSTRAINT "ai_run_attempts_usage_state_check" CHECK ("ai_run_attempts"."usage_state" in ('known', 'unknown', 'unsettled'))
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_request_id" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"operation" varchar(24) NOT NULL,
	"input_message_id" varchar(128) NOT NULL,
	"state" varchar(24) DEFAULT 'claimed' NOT NULL,
	"abort_reason" varchar(32),
	"failure_code" varchar(100),
	"budget" jsonb NOT NULL,
	"budget_usage" jsonb NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_runs_request_hash_check" CHECK ("ai_runs"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ai_runs_operation_check" CHECK ("ai_runs"."operation" in ('send', 'edit', 'regenerate', 'artifact')),
	CONSTRAINT "ai_runs_state_check" CHECK ("ai_runs"."state" in ('claimed', 'running', 'publishing', 'succeeded', 'failed', 'interrupted', 'cancelled', 'superseded')),
	CONSTRAINT "ai_runs_terminal_check" CHECK (("ai_runs"."state" in ('succeeded', 'failed', 'interrupted', 'cancelled', 'superseded') and "ai_runs"."finished_at" is not null) or ("ai_runs"."state" in ('claimed', 'running', 'publishing') and "ai_runs"."finished_at" is null))
);
--> statement-breakpoint
CREATE TABLE "artifact_edit_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"base_revision_id" uuid NOT NULL,
	"created_by_principal_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"state" varchar(16) DEFAULT 'pending' NOT NULL,
	"accepted_revision_id" uuid,
	"accepted_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_edit_proposals_kind_check" CHECK ("artifact_edit_proposals"."kind" in ('teaching_document', 'mind_map', 'quiz')),
	CONSTRAINT "artifact_edit_proposals_state_check" CHECK ("artifact_edit_proposals"."state" in ('pending', 'accepted', 'dismissed')),
	CONSTRAINT "artifact_edit_proposals_terminal_check" CHECK (("artifact_edit_proposals"."state" = 'pending' and "artifact_edit_proposals"."accepted_revision_id" is null and "artifact_edit_proposals"."accepted_at" is null and "artifact_edit_proposals"."dismissed_at" is null) or ("artifact_edit_proposals"."state" = 'accepted' and "artifact_edit_proposals"."accepted_revision_id" is not null and "artifact_edit_proposals"."accepted_at" is not null and "artifact_edit_proposals"."dismissed_at" is null) or ("artifact_edit_proposals"."state" = 'dismissed' and "artifact_edit_proposals"."accepted_revision_id" is null and "artifact_edit_proposals"."accepted_at" is null and "artifact_edit_proposals"."dismissed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "artifact_generation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"executor_kind" varchar(24) NOT NULL,
	"state" varchar(16) DEFAULT 'queued' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"phase" varchar(16),
	"provider_conversation_id" uuid,
	"provider_status" varchar(40),
	"failure_code" varchar(100),
	"failure_detail" text,
	"provisioning_started_at" timestamp with time zone,
	"authoring_started_at" timestamp with time zone,
	"rendering_started_at" timestamp with time zone,
	"publishing_started_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_generation_attempts_artifact_id_id_unique" UNIQUE("artifact_id","id"),
	CONSTRAINT "artifact_generation_attempts_ordinal_check" CHECK ("artifact_generation_attempts"."ordinal" >= 1),
	CONSTRAINT "artifact_generation_attempts_sequence_check" CHECK ("artifact_generation_attempts"."sequence" >= 0),
	CONSTRAINT "artifact_generation_attempts_executor_check" CHECK ("artifact_generation_attempts"."executor_kind" in ('deterministic', 'model', 'task_agent')),
	CONSTRAINT "artifact_generation_attempts_state_check" CHECK ("artifact_generation_attempts"."state" in ('queued', 'running', 'submitted', 'failed', 'cancelled')),
	CONSTRAINT "artifact_generation_attempts_phase_check" CHECK ("artifact_generation_attempts"."phase" is null or "artifact_generation_attempts"."phase" in ('queued', 'provisioning', 'authoring', 'rendering', 'publishing', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "artifact_generation_attempts_terminal_check" CHECK (("artifact_generation_attempts"."state" = 'queued' and "artifact_generation_attempts"."started_at" is null and "artifact_generation_attempts"."finished_at" is null) or ("artifact_generation_attempts"."state" = 'running' and "artifact_generation_attempts"."started_at" is not null and "artifact_generation_attempts"."finished_at" is null) or ("artifact_generation_attempts"."state" in ('submitted', 'failed', 'cancelled') and "artifact_generation_attempts"."finished_at" is not null)),
	CONSTRAINT "artifact_generation_attempts_failure_check" CHECK (("artifact_generation_attempts"."state" = 'failed' and "artifact_generation_attempts"."failure_code" is not null and length(btrim("artifact_generation_attempts"."failure_code")) > 0) or ("artifact_generation_attempts"."state" <> 'failed' and "artifact_generation_attempts"."failure_code" is null))
);
--> statement-breakpoint
CREATE TABLE "artifact_provider_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_attempt_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"requested_provider" varchar(64) NOT NULL,
	"requested_model" varchar(128) NOT NULL,
	"effective_provider" varchar(64),
	"effective_model" varchar(128),
	"provider_call_count" integer DEFAULT 0 NOT NULL,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"state" varchar(16) DEFAULT 'running' NOT NULL,
	"error_code" varchar(100),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "artifact_provider_attempts_ordinal_check" CHECK ("artifact_provider_attempts"."ordinal" >= 1),
	CONSTRAINT "artifact_provider_attempts_state_check" CHECK ("artifact_provider_attempts"."state" in ('running', 'succeeded', 'failed', 'exhausted')),
	CONSTRAINT "artifact_provider_attempts_count_check" CHECK ("artifact_provider_attempts"."provider_call_count" >= 0 and "artifact_provider_attempts"."tool_call_count" >= 0),
	CONSTRAINT "artifact_provider_attempts_terminal_check" CHECK (("artifact_provider_attempts"."state" = 'running' and "artifact_provider_attempts"."finished_at" is null) or ("artifact_provider_attempts"."state" in ('succeeded', 'failed', 'exhausted') and "artifact_provider_attempts"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "artifact_render_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"artifact_revision_id" uuid NOT NULL,
	"format" varchar(32) NOT NULL,
	"state" varchar(24) DEFAULT 'queued' NOT NULL,
	"renderer_version" varchar(64) NOT NULL,
	"output_object_key" varchar(512),
	"output_object_version_id" varchar(255),
	"output_media_type" varchar(160),
	"output_size_bytes" integer,
	"output_sha256" varchar(64),
	"failure_code" varchar(100),
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_render_jobs_format_check" CHECK ("artifact_render_jobs"."format" in ('docx', 'pptx', 'mp4')),
	CONSTRAINT "artifact_render_jobs_state_check" CHECK ("artifact_render_jobs"."state" in ('queued', 'rendering', 'ready', 'failed', 'cancelled')),
	CONSTRAINT "artifact_render_jobs_attempt_check" CHECK ("artifact_render_jobs"."attempt_number" >= 1),
	CONSTRAINT "artifact_render_jobs_output_check" CHECK (("artifact_render_jobs"."state" = 'ready' and "artifact_render_jobs"."output_object_key" is not null and "artifact_render_jobs"."output_object_version_id" is not null and "artifact_render_jobs"."output_media_type" is not null and "artifact_render_jobs"."output_size_bytes" > 0 and "artifact_render_jobs"."output_sha256" ~ '^[0-9a-f]{64}$') or ("artifact_render_jobs"."state" <> 'ready' and "artifact_render_jobs"."output_object_key" is null and "artifact_render_jobs"."output_object_version_id" is null and "artifact_render_jobs"."output_media_type" is null and "artifact_render_jobs"."output_size_bytes" is null and "artifact_render_jobs"."output_sha256" is null))
);
--> statement-breakpoint
CREATE TABLE "artifact_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"parent_revision_id" uuid,
	"created_by_principal_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"content" jsonb NOT NULL,
	"content_sha256" varchar(64) NOT NULL,
	"producing_run_id" uuid,
	"producing_attempt_id" uuid,
	"generation_attempt_id" uuid,
	"generation_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_revisions_artifact_id_id_unique" UNIQUE("artifact_id","id"),
	CONSTRAINT "artifact_revisions_number_check" CHECK ("artifact_revisions"."revision_number" >= 1),
	CONSTRAINT "artifact_revisions_hash_check" CHECK ("artifact_revisions"."content_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "artifact_source_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"generation_attempt_id" uuid NOT NULL,
	"artifact_revision_id" uuid,
	"state" varchar(16) DEFAULT 'staged' NOT NULL,
	"bundle_format" varchar(24) NOT NULL,
	"recipe_version" varchar(100) NOT NULL,
	"object_key" varchar(512) NOT NULL,
	"object_version_id" varchar(255) NOT NULL,
	"media_type" varchar(160) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_source_bundles_state_check" CHECK ("artifact_source_bundles"."state" in ('staged', 'published')),
	CONSTRAINT "artifact_source_bundles_publication_check" CHECK (("artifact_source_bundles"."state" = 'staged' and "artifact_source_bundles"."artifact_revision_id" is null) or ("artifact_source_bundles"."state" = 'published' and "artifact_source_bundles"."artifact_revision_id" is not null)),
	CONSTRAINT "artifact_source_bundles_format_check" CHECK ("artifact_source_bundles"."bundle_format" in ('tar_gzip')),
	CONSTRAINT "artifact_source_bundles_identity_check" CHECK ("artifact_source_bundles"."size_bytes" > 0 and "artifact_source_bundles"."sha256" ~ '^[0-9a-f]{64}$' and length(btrim("artifact_source_bundles"."object_key")) > 0 and length(btrim("artifact_source_bundles"."object_version_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "artifact_sources" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"artifact_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact_suggestion_requests" (
	"workspace_id" uuid NOT NULL,
	"locale" varchar(8) NOT NULL,
	"artifact_kind" varchar(32) NOT NULL,
	"context_hash" varchar(64) NOT NULL,
	"epoch" integer DEFAULT 1 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_suggestion_requests_epoch_check" CHECK ("artifact_suggestion_requests"."epoch" >= 1),
	CONSTRAINT "artifact_suggestion_requests_locale_check" CHECK ("artifact_suggestion_requests"."locale" in ('zh-CN', 'en-US')),
	CONSTRAINT "artifact_suggestion_requests_kind_check" CHECK ("artifact_suggestion_requests"."artifact_kind" in ('teaching_document', 'mind_map', 'quiz', 'game', 'presentation', 'animation')),
	CONSTRAINT "artifact_suggestion_requests_context_hash_check" CHECK (length("artifact_suggestion_requests"."context_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "artifact_suggestion_snapshots" (
	"workspace_id" uuid NOT NULL,
	"locale" varchar(8) NOT NULL,
	"artifact_kind" varchar(32) NOT NULL,
	"context_hash" varchar(64) NOT NULL,
	"suggestions" jsonb NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_suggestion_snapshots_locale_check" CHECK ("artifact_suggestion_snapshots"."locale" in ('zh-CN', 'en-US')),
	CONSTRAINT "artifact_suggestion_snapshots_kind_check" CHECK ("artifact_suggestion_snapshots"."artifact_kind" in ('teaching_document', 'mind_map', 'quiz', 'game', 'presentation', 'animation'))
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid,
	"created_by_principal_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"title" varchar(200) NOT NULL,
	"generation_state" varchar(16) DEFAULT 'ready' NOT NULL,
	"generation_request" jsonb,
	"generation_draft" jsonb,
	"generation_failure_code" varchar(100),
	"generation_attempt_id" uuid,
	"generation_sequence" integer DEFAULT 0 NOT NULL,
	"source_user_message_id" varchar(128),
	"source_plan_item_id" uuid,
	"root_run_id" uuid,
	"deleted_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"current_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifacts_kind_check" CHECK ("artifacts"."kind" in ('teaching_document', 'mind_map', 'quiz', 'game', 'presentation', 'animation')),
	CONSTRAINT "artifacts_title_check" CHECK (length(btrim("artifacts"."title")) between 1 and 200),
	CONSTRAINT "artifacts_generation_state_check" CHECK ("artifacts"."generation_state" in ('queued', 'generating', 'finalizing', 'ready', 'failed', 'cancelled')),
	CONSTRAINT "artifacts_generation_failure_check" CHECK (("artifacts"."generation_state" = 'failed' and "artifacts"."generation_failure_code" is not null and length(btrim("artifacts"."generation_failure_code")) > 0) or ("artifacts"."generation_state" <> 'failed' and "artifacts"."generation_failure_code" is null)),
	CONSTRAINT "artifacts_generation_attempt_check" CHECK ("artifacts"."generation_state" = 'queued' or ("artifacts"."generation_state" in ('generating', 'finalizing') and "artifacts"."generation_attempt_id" is not null) or ("artifacts"."generation_state" in ('ready', 'failed', 'cancelled') and "artifacts"."generation_attempt_id" is null)),
	CONSTRAINT "artifacts_generation_sequence_check" CHECK ("artifacts"."generation_sequence" >= 0),
	CONSTRAINT "artifacts_tombstone_check" CHECK (("artifacts"."generation_state" <> 'cancelled' or "artifacts"."deleted_at" is not null) and ("artifacts"."purged_at" is null or "artifacts"."deleted_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "cleanup_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" varchar(32) NOT NULL,
	"scope_id" uuid NOT NULL,
	"owner" varchar(64) NOT NULL,
	"resource_type" varchar(64) NOT NULL,
	"resource_id" varchar(512) NOT NULL,
	"outcome" varchar(24) NOT NULL,
	"failure_code" varchar(100),
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cleanup_receipts_outcome_check" CHECK ("cleanup_receipts"."outcome" in ('deleted', 'already_absent', 'not_owned', 'failed')),
	CONSTRAINT "cleanup_receipts_attempt_check" CHECK ("cleanup_receipts"."attempt_number" >= 1),
	CONSTRAINT "cleanup_receipts_failure_check" CHECK (("cleanup_receipts"."outcome" = 'failed' and "cleanup_receipts"."failure_code" is not null) or ("cleanup_receipts"."outcome" <> 'failed' and "cleanup_receipts"."failure_code" is null))
);
--> statement-breakpoint
CREATE TABLE "file_sources" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"size_bytes" integer NOT NULL,
	"upload_key" varchar(512),
	"upload_expires_at" timestamp with time zone,
	"upload_generation" integer DEFAULT 1 NOT NULL,
	"storage_key" varchar(512),
	"storage_version_id" varchar(255),
	"state" varchar(32) DEFAULT 'pending_upload' NOT NULL,
	"failure_code" varchar(100),
	CONSTRAINT "file_sources_original_filename_check" CHECK (length(btrim("file_sources"."original_filename")) between 1 and 255),
	CONSTRAINT "file_sources_size_bytes_check" CHECK ("file_sources"."size_bytes" between 1 and 52428800),
	CONSTRAINT "file_sources_upload_generation_check" CHECK ("file_sources"."upload_generation" >= 1),
	CONSTRAINT "file_sources_state_check" CHECK ("file_sources"."state" in ('pending_upload', 'stored', 'failed')),
	CONSTRAINT "file_sources_upload_reference_check" CHECK (("file_sources"."upload_key" is null) = ("file_sources"."upload_expires_at" is null) and ("file_sources"."upload_key" is null or length("file_sources"."upload_key") > 0)),
	CONSTRAINT "file_sources_storage_reference_check" CHECK (("file_sources"."storage_key" is null) = ("file_sources"."storage_version_id" is null) and ("file_sources"."storage_key" is null or (length("file_sources"."storage_key") > 0 and length("file_sources"."storage_version_id") > 0))),
	CONSTRAINT "file_sources_failure_code_check" CHECK (("file_sources"."state" = 'failed' and "file_sources"."failure_code" is not null and length(btrim("file_sources"."failure_code")) > 0) or ("file_sources"."state" <> 'failed' and "file_sources"."failure_code" is null)),
	CONSTRAINT "file_sources_state_references_check" CHECK (("file_sources"."state" = 'pending_upload' and "file_sources"."storage_key" is null) or
          ("file_sources"."state" = 'stored' and "file_sources"."upload_key" is null) or
          ("file_sources"."state" = 'failed' and "file_sources"."upload_key" is null and "file_sources"."storage_key" is null))
);
--> statement-breakpoint
CREATE TABLE "game_revival_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"death_id" uuid NOT NULL,
	"state" varchar(16) DEFAULT 'in_progress' NOT NULL,
	"question_ids" jsonb NOT NULL,
	"answers" jsonb,
	"correct_count" integer,
	"submit_request_id" varchar(128),
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_revival_rounds_state_check" CHECK ("game_revival_rounds"."state" in ('in_progress', 'passed', 'failed')),
	CONSTRAINT "game_revival_rounds_result_check" CHECK (("game_revival_rounds"."state" = 'in_progress' and "game_revival_rounds"."answers" is null and "game_revival_rounds"."correct_count" is null and "game_revival_rounds"."submit_request_id" is null and "game_revival_rounds"."submitted_at" is null) or ("game_revival_rounds"."state" in ('passed', 'failed') and "game_revival_rounds"."answers" is not null and "game_revival_rounds"."correct_count" between 0 and 3 and "game_revival_rounds"."submit_request_id" is not null and "game_revival_rounds"."submitted_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "game_run_deaths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"request_id" varchar(128) NOT NULL,
	"score" integer NOT NULL,
	"elapsed_ms" integer NOT NULL,
	"flap_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_run_deaths_summary_check" CHECK ("game_run_deaths"."sequence" >= 1 and "game_run_deaths"."score" >= 0 and "game_run_deaths"."elapsed_ms" >= 0 and "game_run_deaths"."flap_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "game_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"artifact_revision_id" uuid NOT NULL,
	"actor_principal_id" uuid NOT NULL,
	"surface_key" varchar(128) NOT NULL,
	"start_request_id" varchar(128) NOT NULL,
	"seed" varchar(64) NOT NULL,
	"runtime_version" varchar(64) NOT NULL,
	"question_order" jsonb NOT NULL,
	"state" varchar(24) DEFAULT 'in_progress' NOT NULL,
	"current_score" integer DEFAULT 0 NOT NULL,
	"final_score" integer,
	"successful_revivals" integer DEFAULT 0 NOT NULL,
	"finish_reason" varchar(40),
	"finished_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_runs_state_check" CHECK ("game_runs"."state" in ('in_progress', 'awaiting_revival', 'finished', 'abandoned')),
	CONSTRAINT "game_runs_score_check" CHECK ("game_runs"."current_score" >= 0 and "game_runs"."successful_revivals" >= 0 and ("game_runs"."final_score" is null or "game_runs"."final_score" >= 0)),
	CONSTRAINT "game_runs_terminal_check" CHECK (("game_runs"."state" = 'finished' and "game_runs"."finished_at" is not null and "game_runs"."final_score" is not null and "game_runs"."finish_reason" is not null and "game_runs"."abandoned_at" is null) or ("game_runs"."state" = 'abandoned' and "game_runs"."abandoned_at" is not null and "game_runs"."finished_at" is null and "game_runs"."final_score" is null) or ("game_runs"."state" in ('in_progress', 'awaiting_revival') and "game_runs"."finished_at" is null and "game_runs"."abandoned_at" is null and "game_runs"."final_score" is null))
);
--> statement-breakpoint
CREATE TABLE "presentation_editor_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"artifact_revision_id" uuid NOT NULL,
	"project_object_key" varchar(512) NOT NULL,
	"project_object_version_id" varchar(255) NOT NULL,
	"project_media_type" varchar(160) NOT NULL,
	"project_size_bytes" integer NOT NULL,
	"project_sha256" varchar(64) NOT NULL,
	"cover_object_key" varchar(512),
	"cover_object_version_id" varchar(255),
	"cover_media_type" varchar(160),
	"cover_size_bytes" integer,
	"cover_sha256" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presentation_editor_snapshots_project_identity_check" CHECK ("presentation_editor_snapshots"."project_media_type" = 'application/json' and "presentation_editor_snapshots"."project_size_bytes" between 1 and 26214400 and "presentation_editor_snapshots"."project_sha256" ~ '^[0-9a-f]{64}$' and length(btrim("presentation_editor_snapshots"."project_object_key")) > 0 and length(btrim("presentation_editor_snapshots"."project_object_version_id")) > 0),
	CONSTRAINT "presentation_editor_snapshots_cover_identity_check" CHECK (("presentation_editor_snapshots"."cover_object_key" is null and "presentation_editor_snapshots"."cover_object_version_id" is null and "presentation_editor_snapshots"."cover_media_type" is null and "presentation_editor_snapshots"."cover_size_bytes" is null and "presentation_editor_snapshots"."cover_sha256" is null) or ("presentation_editor_snapshots"."cover_object_key" is not null and "presentation_editor_snapshots"."cover_object_version_id" is not null and "presentation_editor_snapshots"."cover_media_type" in ('image/jpeg', 'image/png', 'image/webp') and "presentation_editor_snapshots"."cover_size_bytes" between 1 and 10485760 and "presentation_editor_snapshots"."cover_sha256" ~ '^[0-9a-f]{64}$'))
);
--> statement-breakpoint
CREATE TABLE "principals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" varchar(255) NOT NULL,
	"handle" varchar(39) NOT NULL,
	"email" varchar(320),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "principals_status_check" CHECK ("principals"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "quiz_attempt_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" jsonb NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"check_count" integer DEFAULT 0 NOT NULL,
	"correct" boolean,
	"earned_points" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_attempt_answers_version_check" CHECK ("quiz_attempt_answers"."version" >= 1),
	CONSTRAINT "quiz_attempt_answers_check_count_check" CHECK ("quiz_attempt_answers"."check_count" >= 0),
	CONSTRAINT "quiz_attempt_answers_points_check" CHECK ("quiz_attempt_answers"."earned_points" is null or "quiz_attempt_answers"."earned_points" >= 0),
	CONSTRAINT "quiz_attempt_answers_grade_pair_check" CHECK (("quiz_attempt_answers"."correct" is null) = ("quiz_attempt_answers"."earned_points" is null))
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"artifact_revision_id" uuid NOT NULL,
	"actor_principal_id" uuid NOT NULL,
	"state" varchar(16) DEFAULT 'in_progress' NOT NULL,
	"feedback_mode" varchar(24) NOT NULL,
	"navigation_mode" varchar(16) NOT NULL,
	"score" integer,
	"total_points" integer,
	"grader_version" varchar(64),
	"submitted_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_attempts_state_check" CHECK ("quiz_attempts"."state" in ('in_progress', 'submitted', 'abandoned')),
	CONSTRAINT "quiz_attempts_feedback_check" CHECK ("quiz_attempts"."feedback_mode" in ('after_submission', 'immediate')),
	CONSTRAINT "quiz_attempts_navigation_check" CHECK ("quiz_attempts"."navigation_mode" in ('free', 'sequential')),
	CONSTRAINT "quiz_attempts_result_check" CHECK (("quiz_attempts"."state" = 'submitted' and "quiz_attempts"."submitted_at" is not null and "quiz_attempts"."score" is not null and "quiz_attempts"."total_points" is not null and "quiz_attempts"."grader_version" is not null) or ("quiz_attempts"."state" <> 'submitted' and "quiz_attempts"."submitted_at" is null and "quiz_attempts"."score" is null and "quiz_attempts"."total_points" is null and "quiz_attempts"."grader_version" is null)),
	CONSTRAINT "quiz_attempts_abandoned_check" CHECK (("quiz_attempts"."state" = 'abandoned') = ("quiz_attempts"."abandoned_at" is not null)),
	CONSTRAINT "quiz_attempts_score_check" CHECK ("quiz_attempts"."score" is null or ("quiz_attempts"."score" >= 0 and "quiz_attempts"."total_points" >= "quiz_attempts"."score"))
);
--> statement-breakpoint
CREATE TABLE "retrieval_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"index_generation_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"representation_id" varchar(160) NOT NULL,
	"ordinal" integer NOT NULL,
	"first_block_ordinal" integer NOT NULL,
	"last_block_ordinal" integer NOT NULL,
	"heading_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exact_text" text NOT NULL,
	"index_text" text NOT NULL,
	"dense_vector_hash" varchar(64),
	"content_hash" varchar(64) NOT NULL,
	"locator_start" integer,
	"locator_end" integer,
	"capacity_units" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retrieval_chunks_ordinal_check" CHECK ("retrieval_chunks"."ordinal" >= 0 and "retrieval_chunks"."first_block_ordinal" >= 0 and "retrieval_chunks"."last_block_ordinal" >= "retrieval_chunks"."first_block_ordinal"),
	CONSTRAINT "retrieval_chunks_locator_check" CHECK (("retrieval_chunks"."locator_start" is null and "retrieval_chunks"."locator_end" is null) or ("retrieval_chunks"."locator_start" is not null and "retrieval_chunks"."locator_end" is not null and "retrieval_chunks"."locator_start" >= 0 and "retrieval_chunks"."locator_end" > "retrieval_chunks"."locator_start")),
	CONSTRAINT "retrieval_chunks_content_check" CHECK (length("retrieval_chunks"."exact_text") > 0 and length("retrieval_chunks"."index_text") > 0 and length("retrieval_chunks"."content_hash") = 64 and "retrieval_chunks"."capacity_units" > 0),
	CONSTRAINT "retrieval_chunks_vector_hash_check" CHECK ("retrieval_chunks"."dense_vector_hash" is null or length("retrieval_chunks"."dense_vector_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "retrieval_evidence_units" (
	"id" uuid PRIMARY KEY NOT NULL,
	"index_generation_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"representation_id" varchar(160) NOT NULL,
	"ordinal" integer NOT NULL,
	"block_ordinal" integer NOT NULL,
	"kind" varchar(32) NOT NULL,
	"exact_excerpt" text,
	"locator" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"fidelity" varchar(32) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"locator_start" integer,
	"locator_end" integer,
	"capacity_units" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retrieval_evidence_units_ordinal_check" CHECK ("retrieval_evidence_units"."ordinal" >= 0 and "retrieval_evidence_units"."block_ordinal" >= 0),
	CONSTRAINT "retrieval_evidence_units_locator_check" CHECK (("retrieval_evidence_units"."locator_start" is null and "retrieval_evidence_units"."locator_end" is null) or ("retrieval_evidence_units"."locator_start" is not null and "retrieval_evidence_units"."locator_end" is not null and "retrieval_evidence_units"."locator_start" >= 0 and "retrieval_evidence_units"."locator_end" > "retrieval_evidence_units"."locator_start")),
	CONSTRAINT "retrieval_evidence_units_excerpt_check" CHECK (((length("retrieval_evidence_units"."exact_excerpt") > 0 and "retrieval_evidence_units"."capacity_units" > 0) or ("retrieval_evidence_units"."exact_excerpt" is null and "retrieval_evidence_units"."capacity_units" = 0 and "retrieval_evidence_units"."content"->>'kind' = 'visual_region')) and length("retrieval_evidence_units"."content_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "retrieval_index_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_ingestion_id" uuid,
	"artifact_revision_id" uuid,
	"source_revision" integer NOT NULL,
	"source_revision_id" varchar(160) NOT NULL,
	"representation_id" varchar(160) NOT NULL,
	"representation_family" varchar(32),
	"representation_adapter_id" varchar(100),
	"representation_adapter_version" varchar(32),
	"representation_hash" varchar(64),
	"representation_metadata" jsonb,
	"collection_name" varchar(255) NOT NULL,
	"embedding_model_id" varchar(255) NOT NULL,
	"embedding_dimension" integer NOT NULL,
	"chunk_profile_id" varchar(100) NOT NULL,
	"sparse_profile_id" varchar(100) NOT NULL,
	"manifest_hash" varchar(64) NOT NULL,
	"source_policy_hash" varchar(64) NOT NULL,
	"workflow_id" varchar(255) NOT NULL,
	"state" varchar(24) DEFAULT 'queued' NOT NULL,
	"failure_code" varchar(100),
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retrieval_index_generations_revision_check" CHECK ("retrieval_index_generations"."source_revision" >= 1),
	CONSTRAINT "retrieval_index_generations_origin_check" CHECK (("retrieval_index_generations"."source_ingestion_id" is not null) <> ("retrieval_index_generations"."artifact_revision_id" is not null)),
	CONSTRAINT "retrieval_index_generations_state_check" CHECK ("retrieval_index_generations"."state" in ('queued', 'projecting', 'publishing', 'ready', 'failed', 'obsolete')),
	CONSTRAINT "retrieval_index_generations_failure_check" CHECK (("retrieval_index_generations"."state" = 'failed' and "retrieval_index_generations"."failure_code" is not null and length(btrim("retrieval_index_generations"."failure_code")) > 0) or ("retrieval_index_generations"."state" <> 'failed' and "retrieval_index_generations"."failure_code" is null)),
	CONSTRAINT "retrieval_index_generations_published_check" CHECK (("retrieval_index_generations"."state" in ('ready', 'obsolete')) = ("retrieval_index_generations"."published_at" is not null)),
	CONSTRAINT "retrieval_index_generations_identity_check" CHECK ("retrieval_index_generations"."embedding_dimension" > 0 and length(btrim("retrieval_index_generations"."embedding_model_id")) > 0 and length(btrim("retrieval_index_generations"."chunk_profile_id")) > 0 and length(btrim("retrieval_index_generations"."sparse_profile_id")) > 0 and length("retrieval_index_generations"."manifest_hash") = 64 and length("retrieval_index_generations"."source_policy_hash") = 64 and length(btrim("retrieval_index_generations"."workflow_id")) > 0),
	CONSTRAINT "retrieval_index_generations_retry_count_check" CHECK ("retrieval_index_generations"."retry_count" >= 0),
	CONSTRAINT "retrieval_index_generations_retry_at_check" CHECK ("retrieval_index_generations"."state" = 'failed' or "retrieval_index_generations"."next_retry_at" is null)
);
--> statement-breakpoint
CREATE TABLE "retrieval_representation_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"index_generation_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"representation_id" varchar(160) NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" varchar(32) NOT NULL,
	"heading_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exact_text" text,
	"index_text" text,
	"locator" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"fidelity" varchar(32) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"locator_start" integer,
	"locator_end" integer,
	"capacity_units" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retrieval_representation_blocks_ordinal_check" CHECK ("retrieval_representation_blocks"."ordinal" >= 0),
	CONSTRAINT "retrieval_representation_blocks_locator_check" CHECK (("retrieval_representation_blocks"."locator_start" is null and "retrieval_representation_blocks"."locator_end" is null) or ("retrieval_representation_blocks"."locator_start" is not null and "retrieval_representation_blocks"."locator_end" is not null and "retrieval_representation_blocks"."locator_start" >= 0 and "retrieval_representation_blocks"."locator_end" > "retrieval_representation_blocks"."locator_start")),
	CONSTRAINT "retrieval_representation_blocks_content_check" CHECK (((length("retrieval_representation_blocks"."exact_text") > 0 and length("retrieval_representation_blocks"."index_text") > 0 and "retrieval_representation_blocks"."capacity_units" > 0) or (length("retrieval_representation_blocks"."exact_text") > 0 and "retrieval_representation_blocks"."index_text" is null and "retrieval_representation_blocks"."capacity_units" = 0) or ("retrieval_representation_blocks"."exact_text" is null and "retrieval_representation_blocks"."index_text" is null and "retrieval_representation_blocks"."capacity_units" = 0 and "retrieval_representation_blocks"."content"->>'kind' = 'visual_region')) and length("retrieval_representation_blocks"."content_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "source_ingestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"source_revision" integer DEFAULT 1 NOT NULL,
	"provider" varchar(32) DEFAULT 'mineru' NOT NULL,
	"provider_batch_id" varchar(255),
	"provider_submission_started_at" timestamp with time zone,
	"state" varchar(32) DEFAULT 'queued' NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"retryable" boolean DEFAULT false NOT NULL,
	"error_code" varchar(100),
	"result_storage_key" varchar(512),
	"result_storage_version_id" varchar(255),
	"result_sha256" varchar(64),
	"result_size_bytes" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_ingestions_revision_check" CHECK ("source_ingestions"."source_revision" >= 1),
	CONSTRAINT "source_ingestions_attempt_check" CHECK ("source_ingestions"."attempt_number" >= 1),
	CONSTRAINT "source_ingestions_provider_check" CHECK ("source_ingestions"."provider" in ('mineru', 'media_understanding', 'native_text')),
	CONSTRAINT "source_ingestions_state_check" CHECK ("source_ingestions"."state" in ('queued', 'processing', 'ready', 'failed', 'obsolete')),
	CONSTRAINT "source_ingestions_batch_check" CHECK (("source_ingestions"."provider" = 'mineru' and (("source_ingestions"."state" in ('processing', 'ready') and "source_ingestions"."provider_batch_id" is not null and "source_ingestions"."provider_submission_started_at" is not null) or ("source_ingestions"."state" in ('queued', 'failed', 'obsolete') and "source_ingestions"."provider_batch_id" is null))) or ("source_ingestions"."provider" in ('media_understanding', 'native_text') and "source_ingestions"."provider_batch_id" is null and "source_ingestions"."provider_submission_started_at" is null)),
	CONSTRAINT "source_ingestions_result_check" CHECK (("source_ingestions"."state" = 'ready' and "source_ingestions"."result_storage_key" is not null and "source_ingestions"."result_storage_version_id" is not null and "source_ingestions"."result_sha256" is not null and "source_ingestions"."result_size_bytes" > 0) or ("source_ingestions"."state" <> 'ready' and "source_ingestions"."result_storage_key" is null and "source_ingestions"."result_storage_version_id" is null and "source_ingestions"."result_sha256" is null and "source_ingestions"."result_size_bytes" is null)),
	CONSTRAINT "source_ingestions_error_check" CHECK (("source_ingestions"."state" = 'failed' and "source_ingestions"."error_code" is not null and length(btrim("source_ingestions"."error_code")) > 0) or ("source_ingestions"."state" <> 'failed' and "source_ingestions"."error_code" is null and "source_ingestions"."retryable" = false)),
	CONSTRAINT "source_ingestions_finished_check" CHECK (("source_ingestions"."state" in ('ready', 'failed', 'obsolete')) = ("source_ingestions"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	CONSTRAINT "sources_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "sources_tombstone_check" CHECK ("sources"."purged_at" is null or "sources"."deleted_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "workspace_locators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"slug" varchar(100) NOT NULL,
	"state" varchar(16) DEFAULT 'current' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replaced_at" timestamp with time zone,
	CONSTRAINT "workspace_locators_state_check" CHECK ("workspace_locators"."state" in ('current', 'redirect')),
	CONSTRAINT "workspace_locators_replaced_check" CHECK (("workspace_locators"."state" = 'current' and "workspace_locators"."replaced_at" is null) or ("workspace_locators"."state" = 'redirect' and "workspace_locators"."replaced_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "workspace_permission_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"principal_id" uuid NOT NULL,
	"permission" varchar(64) NOT NULL,
	"granted_by_principal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_permission_grants_permission_check" CHECK ("workspace_permission_grants"."permission" in ('workspace.read', 'workspace.chat', 'artifact.private.create', 'artifact.private.manage', 'artifact.publishToSources', 'source.manage', 'workspace.manageSharing', 'workspace.manageSettings'))
);
--> statement-breakpoint
CREATE TABLE "workspace_reference_sources" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"source_workspace_id" uuid NOT NULL,
	"target_workspace_id" uuid NOT NULL,
	CONSTRAINT "workspace_reference_sources_no_self_check" CHECK ("workspace_reference_sources"."source_workspace_id" <> "workspace_reference_sources"."target_workspace_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"visibility" varchar(16) DEFAULT 'private' NOT NULL,
	"referenceable" boolean DEFAULT false NOT NULL,
	"first_shared_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_id_owner_unique" UNIQUE("id","owner_id"),
	CONSTRAINT "workspaces_visibility_check" CHECK ("workspaces"."visibility" in ('private', 'public'))
);
--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_created_by_principal_id_principals_id_fk" FOREIGN KEY ("created_by_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_fk" FOREIGN KEY ("workspace_id","conversation_id") REFERENCES "public"."ai_conversations"("workspace_id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_attempts" ADD CONSTRAINT "ai_run_attempts_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_edit_proposals" ADD CONSTRAINT "artifact_edit_proposals_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_edit_proposals" ADD CONSTRAINT "artifact_edit_proposals_base_revision_id_artifact_revisions_id_fk" FOREIGN KEY ("base_revision_id") REFERENCES "public"."artifact_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_edit_proposals" ADD CONSTRAINT "artifact_edit_proposals_created_by_principal_id_principals_id_fk" FOREIGN KEY ("created_by_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_edit_proposals" ADD CONSTRAINT "artifact_edit_proposals_accepted_revision_id_artifact_revisions_id_fk" FOREIGN KEY ("accepted_revision_id") REFERENCES "public"."artifact_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_edit_proposals" ADD CONSTRAINT "artifact_edit_proposals_base_revision_ownership_fk" FOREIGN KEY ("artifact_id","base_revision_id") REFERENCES "public"."artifact_revisions"("artifact_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_edit_proposals" ADD CONSTRAINT "artifact_edit_proposals_accepted_revision_ownership_fk" FOREIGN KEY ("artifact_id","accepted_revision_id") REFERENCES "public"."artifact_revisions"("artifact_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_generation_attempts" ADD CONSTRAINT "artifact_generation_attempts_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_provider_attempts" ADD CONSTRAINT "artifact_provider_attempts_generation_attempt_id_artifact_generation_attempts_id_fk" FOREIGN KEY ("generation_attempt_id") REFERENCES "public"."artifact_generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_render_jobs" ADD CONSTRAINT "artifact_render_jobs_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_render_jobs" ADD CONSTRAINT "artifact_render_jobs_artifact_revision_id_artifact_revisions_id_fk" FOREIGN KEY ("artifact_revision_id") REFERENCES "public"."artifact_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_parent_revision_id_artifact_revisions_id_fk" FOREIGN KEY ("parent_revision_id") REFERENCES "public"."artifact_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_created_by_principal_id_principals_id_fk" FOREIGN KEY ("created_by_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_producing_run_id_ai_runs_id_fk" FOREIGN KEY ("producing_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_producing_attempt_id_ai_run_attempts_id_fk" FOREIGN KEY ("producing_attempt_id") REFERENCES "public"."ai_run_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_generation_attempt_id_artifact_generation_attempts_id_fk" FOREIGN KEY ("generation_attempt_id") REFERENCES "public"."artifact_generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_source_bundles" ADD CONSTRAINT "artifact_source_bundles_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_source_bundles" ADD CONSTRAINT "artifact_source_bundles_generation_attempt_id_artifact_generation_attempts_id_fk" FOREIGN KEY ("generation_attempt_id") REFERENCES "public"."artifact_generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_source_bundles" ADD CONSTRAINT "artifact_source_bundles_artifact_revision_id_artifact_revisions_id_fk" FOREIGN KEY ("artifact_revision_id") REFERENCES "public"."artifact_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_source_bundles" ADD CONSTRAINT "artifact_source_bundles_generation_attempt_ownership_fk" FOREIGN KEY ("artifact_id","generation_attempt_id") REFERENCES "public"."artifact_generation_attempts"("artifact_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_source_bundles" ADD CONSTRAINT "artifact_source_bundles_revision_ownership_fk" FOREIGN KEY ("artifact_id","artifact_revision_id") REFERENCES "public"."artifact_revisions"("artifact_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_sources" ADD CONSTRAINT "artifact_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_sources" ADD CONSTRAINT "artifact_sources_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_suggestion_requests" ADD CONSTRAINT "artifact_suggestion_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_suggestion_snapshots" ADD CONSTRAINT "artifact_suggestion_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_created_by_principal_id_principals_id_fk" FOREIGN KEY ("created_by_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_generation_attempt_id_artifact_generation_attempts_id_fk" FOREIGN KEY ("generation_attempt_id") REFERENCES "public"."artifact_generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_root_run_id_ai_runs_id_fk" FOREIGN KEY ("root_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_current_revision_id_artifact_revisions_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."artifact_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_sources" ADD CONSTRAINT "file_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_revival_rounds" ADD CONSTRAINT "game_revival_rounds_run_id_game_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."game_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_revival_rounds" ADD CONSTRAINT "game_revival_rounds_death_id_game_run_deaths_id_fk" FOREIGN KEY ("death_id") REFERENCES "public"."game_run_deaths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_run_deaths" ADD CONSTRAINT "game_run_deaths_run_id_game_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."game_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_runs" ADD CONSTRAINT "game_runs_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_runs" ADD CONSTRAINT "game_runs_artifact_revision_id_artifact_revisions_id_fk" FOREIGN KEY ("artifact_revision_id") REFERENCES "public"."artifact_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_runs" ADD CONSTRAINT "game_runs_actor_principal_id_principals_id_fk" FOREIGN KEY ("actor_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_runs" ADD CONSTRAINT "game_runs_artifact_revision_ownership_fk" FOREIGN KEY ("artifact_id","artifact_revision_id") REFERENCES "public"."artifact_revisions"("artifact_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_editor_snapshots" ADD CONSTRAINT "presentation_editor_snapshots_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_editor_snapshots" ADD CONSTRAINT "presentation_editor_snapshots_artifact_revision_id_artifact_revisions_id_fk" FOREIGN KEY ("artifact_revision_id") REFERENCES "public"."artifact_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_editor_snapshots" ADD CONSTRAINT "presentation_editor_snapshots_revision_ownership_fk" FOREIGN KEY ("artifact_id","artifact_revision_id") REFERENCES "public"."artifact_revisions"("artifact_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_artifact_revision_id_artifact_revisions_id_fk" FOREIGN KEY ("artifact_revision_id") REFERENCES "public"."artifact_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_actor_principal_id_principals_id_fk" FOREIGN KEY ("actor_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_artifact_revision_ownership_fk" FOREIGN KEY ("artifact_id","artifact_revision_id") REFERENCES "public"."artifact_revisions"("artifact_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_chunks" ADD CONSTRAINT "retrieval_chunks_index_generation_id_retrieval_index_generations_id_fk" FOREIGN KEY ("index_generation_id") REFERENCES "public"."retrieval_index_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_chunks" ADD CONSTRAINT "retrieval_chunks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_evidence_units" ADD CONSTRAINT "retrieval_evidence_units_index_generation_id_retrieval_index_generations_id_fk" FOREIGN KEY ("index_generation_id") REFERENCES "public"."retrieval_index_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_evidence_units" ADD CONSTRAINT "retrieval_evidence_units_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_index_generations" ADD CONSTRAINT "retrieval_index_generations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_index_generations" ADD CONSTRAINT "retrieval_index_generations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_index_generations" ADD CONSTRAINT "retrieval_index_generations_source_ingestion_id_source_ingestions_id_fk" FOREIGN KEY ("source_ingestion_id") REFERENCES "public"."source_ingestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_index_generations" ADD CONSTRAINT "retrieval_index_generations_artifact_revision_id_artifact_revisions_id_fk" FOREIGN KEY ("artifact_revision_id") REFERENCES "public"."artifact_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_representation_blocks" ADD CONSTRAINT "retrieval_representation_blocks_index_generation_id_retrieval_index_generations_id_fk" FOREIGN KEY ("index_generation_id") REFERENCES "public"."retrieval_index_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_representation_blocks" ADD CONSTRAINT "retrieval_representation_blocks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_ingestions" ADD CONSTRAINT "source_ingestions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_locators" ADD CONSTRAINT "workspace_locators_workspace_owner_fk" FOREIGN KEY ("workspace_id","owner_id") REFERENCES "public"."workspaces"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_permission_grants" ADD CONSTRAINT "workspace_permission_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_permission_grants" ADD CONSTRAINT "workspace_permission_grants_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_permission_grants" ADD CONSTRAINT "workspace_permission_grants_granted_by_principal_id_principals_id_fk" FOREIGN KEY ("granted_by_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_reference_sources" ADD CONSTRAINT "workspace_reference_sources_target_workspace_id_workspaces_id_fk" FOREIGN KEY ("target_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_reference_sources" ADD CONSTRAINT "workspace_reference_sources_source_workspace_fk" FOREIGN KEY ("source_id","source_workspace_id") REFERENCES "public"."sources"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_principals_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_workspace_updated_index" ON "ai_conversations" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_conversations_workspace_creator_updated_index" ON "ai_conversations" USING btree ("workspace_id","created_by_principal_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_conversations_deleted_index" ON "ai_conversations" USING btree ("deleted_at") WHERE "ai_conversations"."deleted_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_messages_conversation_position_unique" ON "ai_messages" USING btree ("workspace_id","conversation_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_run_attempts_run_purpose_number_unique" ON "ai_run_attempts" USING btree ("run_id","purpose","attempt_number");--> statement-breakpoint
CREATE INDEX "ai_run_attempts_run_started_index" ON "ai_run_attempts" USING btree ("run_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_runs_workspace_conversation_request_unique" ON "ai_runs" USING btree ("workspace_id","conversation_id","client_request_id");--> statement-breakpoint
CREATE INDEX "ai_runs_conversation_created_index" ON "ai_runs" USING btree ("workspace_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_runs_stale_index" ON "ai_runs" USING btree ("deadline_at") WHERE "ai_runs"."state" in ('claimed', 'running', 'publishing');--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_edit_proposals_artifact_run_unique" ON "artifact_edit_proposals" USING btree ("artifact_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_edit_proposals_artifact_pending_unique" ON "artifact_edit_proposals" USING btree ("artifact_id") WHERE "artifact_edit_proposals"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "artifact_edit_proposals_artifact_created_index" ON "artifact_edit_proposals" USING btree ("artifact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_generation_attempts_artifact_ordinal_unique" ON "artifact_generation_attempts" USING btree ("artifact_id","ordinal");--> statement-breakpoint
CREATE INDEX "artifact_generation_attempts_artifact_created_index" ON "artifact_generation_attempts" USING btree ("artifact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_provider_attempts_generation_ordinal_unique" ON "artifact_provider_attempts" USING btree ("generation_attempt_id","ordinal");--> statement-breakpoint
CREATE INDEX "artifact_provider_attempts_generation_started_index" ON "artifact_provider_attempts" USING btree ("generation_attempt_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_render_jobs_revision_format_renderer_unique" ON "artifact_render_jobs" USING btree ("artifact_revision_id","format","renderer_version");--> statement-breakpoint
CREATE INDEX "artifact_render_jobs_artifact_created_index" ON "artifact_render_jobs" USING btree ("artifact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_revisions_artifact_number_unique" ON "artifact_revisions" USING btree ("artifact_id","revision_number");--> statement-breakpoint
CREATE INDEX "artifact_revisions_artifact_created_index" ON "artifact_revisions" USING btree ("artifact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_source_bundles_generation_attempt_unique" ON "artifact_source_bundles" USING btree ("generation_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_source_bundles_revision_unique" ON "artifact_source_bundles" USING btree ("artifact_revision_id") WHERE "artifact_source_bundles"."artifact_revision_id" is not null;--> statement-breakpoint
CREATE INDEX "artifact_source_bundles_artifact_created_index" ON "artifact_source_bundles" USING btree ("artifact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_sources_artifact_unique" ON "artifact_sources" USING btree ("artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_suggestion_requests_workspace_locale_kind_unique" ON "artifact_suggestion_requests" USING btree ("workspace_id","locale","artifact_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_suggestion_snapshots_workspace_locale_kind_unique" ON "artifact_suggestion_snapshots" USING btree ("workspace_id","locale","artifact_kind");--> statement-breakpoint
CREATE INDEX "artifact_suggestion_snapshots_expires_index" ON "artifact_suggestion_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "artifacts_workspace_updated_index" ON "artifacts" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "artifacts_deleted_index" ON "artifacts" USING btree ("deleted_at") WHERE "artifacts"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "artifacts_workspace_conversation_updated_index" ON "artifacts" USING btree ("workspace_id","conversation_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_generation_source_message_unique" ON "artifacts" USING btree ("workspace_id","conversation_id","source_user_message_id","kind") WHERE "artifacts"."source_plan_item_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_generation_plan_item_unique" ON "artifacts" USING btree ("workspace_id","conversation_id","source_user_message_id","source_plan_item_id") WHERE "artifacts"."source_plan_item_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cleanup_receipts_resource_unique" ON "cleanup_receipts" USING btree ("scope_type","scope_id","owner","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "cleanup_receipts_scope_index" ON "cleanup_receipts" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_sources_upload_key_unique" ON "file_sources" USING btree ("upload_key");--> statement-breakpoint
CREATE UNIQUE INDEX "file_sources_storage_key_unique" ON "file_sources" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "game_revival_rounds_death_unique" ON "game_revival_rounds" USING btree ("death_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_revival_rounds_run_submit_request_unique" ON "game_revival_rounds" USING btree ("run_id","submit_request_id") WHERE "game_revival_rounds"."submit_request_id" is not null;--> statement-breakpoint
CREATE INDEX "game_revival_rounds_run_created_index" ON "game_revival_rounds" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "game_run_deaths_run_sequence_unique" ON "game_run_deaths" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "game_run_deaths_run_request_unique" ON "game_run_deaths" USING btree ("run_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_runs_actor_artifact_start_request_unique" ON "game_runs" USING btree ("actor_principal_id","artifact_id","start_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_runs_actor_artifact_surface_active_unique" ON "game_runs" USING btree ("actor_principal_id","artifact_id","surface_key") WHERE "game_runs"."state" in ('in_progress', 'awaiting_revival');--> statement-breakpoint
CREATE INDEX "game_runs_actor_artifact_created_index" ON "game_runs" USING btree ("actor_principal_id","artifact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_editor_snapshots_revision_unique" ON "presentation_editor_snapshots" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE INDEX "presentation_editor_snapshots_artifact_created_index" ON "presentation_editor_snapshots" USING btree ("artifact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "principals_auth_user_id_unique" ON "principals" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "principals_handle_unique" ON "principals" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "principals_email_unique" ON "principals" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempt_answers_attempt_question_unique" ON "quiz_attempt_answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX "quiz_attempt_answers_attempt_index" ON "quiz_attempt_answers" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_actor_artifact_active_unique" ON "quiz_attempts" USING btree ("actor_principal_id","artifact_id") WHERE "quiz_attempts"."state" = 'in_progress';--> statement-breakpoint
CREATE INDEX "quiz_attempts_actor_artifact_created_index" ON "quiz_attempts" USING btree ("actor_principal_id","artifact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "retrieval_chunks_generation_ordinal_unique" ON "retrieval_chunks" USING btree ("index_generation_id","ordinal");--> statement-breakpoint
CREATE INDEX "retrieval_chunks_source_index" ON "retrieval_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retrieval_evidence_units_generation_ordinal_unique" ON "retrieval_evidence_units" USING btree ("index_generation_id","ordinal");--> statement-breakpoint
CREATE INDEX "retrieval_evidence_units_source_index" ON "retrieval_evidence_units" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retrieval_index_generations_ingestion_manifest_policy_unique" ON "retrieval_index_generations" USING btree ("source_ingestion_id","manifest_hash","source_policy_hash") WHERE "retrieval_index_generations"."source_ingestion_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "retrieval_index_generations_artifact_revision_manifest_policy_unique" ON "retrieval_index_generations" USING btree ("source_id","artifact_revision_id","manifest_hash","source_policy_hash") WHERE "retrieval_index_generations"."artifact_revision_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "retrieval_index_generations_ready_source_unique" ON "retrieval_index_generations" USING btree ("source_id") WHERE "retrieval_index_generations"."state" = 'ready';--> statement-breakpoint
CREATE INDEX "retrieval_index_generations_workspace_state_index" ON "retrieval_index_generations" USING btree ("workspace_id","state");--> statement-breakpoint
CREATE INDEX "retrieval_index_generations_source_state_index" ON "retrieval_index_generations" USING btree ("source_id","state");--> statement-breakpoint
CREATE INDEX "retrieval_index_generations_state_updated_index" ON "retrieval_index_generations" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "retrieval_index_generations_retry_index" ON "retrieval_index_generations" USING btree ("state","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "retrieval_representation_blocks_generation_ordinal_unique" ON "retrieval_representation_blocks" USING btree ("index_generation_id","ordinal");--> statement-breakpoint
CREATE INDEX "retrieval_representation_blocks_source_index" ON "retrieval_representation_blocks" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_ingestions_attempt_unique" ON "source_ingestions" USING btree ("source_id","source_revision","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "source_ingestions_active_unique" ON "source_ingestions" USING btree ("source_id","source_revision") WHERE "source_ingestions"."state" in ('queued', 'processing', 'ready');--> statement-breakpoint
CREATE UNIQUE INDEX "source_ingestions_provider_batch_unique" ON "source_ingestions" USING btree ("provider_batch_id") WHERE "source_ingestions"."provider_batch_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "source_ingestions_result_storage_key_unique" ON "source_ingestions" USING btree ("result_storage_key") WHERE "source_ingestions"."result_storage_key" is not null;--> statement-breakpoint
CREATE INDEX "source_ingestions_source_created_index" ON "source_ingestions" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE INDEX "sources_workspace_active_created_index" ON "sources" USING btree ("workspace_id","created_at") WHERE "sources"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "sources_deleted_index" ON "sources" USING btree ("deleted_at") WHERE "sources"."deleted_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_locators_owner_slug_unique" ON "workspace_locators" USING btree ("owner_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_locators_workspace_current_unique" ON "workspace_locators" USING btree ("workspace_id") WHERE "workspace_locators"."state" = 'current';--> statement-breakpoint
CREATE INDEX "workspace_locators_workspace_created_index" ON "workspace_locators" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_permission_grants_workspace_principal_permission_unique" ON "workspace_permission_grants" USING btree ("workspace_id","principal_id","permission");--> statement-breakpoint
CREATE INDEX "workspace_permission_grants_principal_workspace_index" ON "workspace_permission_grants" USING btree ("principal_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_reference_sources_edge_unique" ON "workspace_reference_sources" USING btree ("source_workspace_id","target_workspace_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_id_index" ON "workspaces" USING btree ("owner_id");
