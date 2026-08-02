import { z } from "zod";

export const workspaceSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,99}$/);

export const workspaceNameSchema = z.string().trim().min(1).max(200);

export const createWorkspaceSchema = z
  .object({
    name: workspaceNameSchema,
    slug: workspaceSlugSchema.nullable().optional(),
  })
  .strict();

export type CreateWorkspaceInput = z.input<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z
  .object({
    name: workspaceNameSchema,
    slug: workspaceSlugSchema.nullable(),
  })
  .strict();

export type UpdateWorkspaceInput = z.input<typeof updateWorkspaceSchema>;
