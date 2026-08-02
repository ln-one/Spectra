import { z } from "zod";
import { artifactGenerationProvenanceSchema } from "@/features/artifacts/generation";
import { artifactGroundingBundleSchema } from "@/features/artifacts/grounding";

// Storage/render safety ceiling; overflow remains preserved in generation.rawOutput.
const MIND_MAP_RESOURCE_MAX_NODES = 5_000;

const nodeIdSchema = z.string().trim().min(1).max(128);
const labelSchema = z.string().trim().min(1).max(120);
const noteSchema = z.string().trim().min(1).max(20_000);

export const mindMapGenerationRequestSchema = z
  .object({
    grounding: artifactGroundingBundleSchema.optional().default({ evidence: [], version: 1 }),
    locale: z.enum(["zh-CN", "en-US"]),
    prompt: z.string().trim().min(1).max(20_000),
  })
  .strict();

export type MindMapGenerationRequest = z.infer<typeof mindMapGenerationRequestSchema>;

const mindMapNodeSchema = z
  .object({
    id: nodeIdSchema,
    label: labelSchema,
    note: noteSchema.optional(),
    order: z.number().int().min(0).max(MIND_MAP_RESOURCE_MAX_NODES),
    parentId: nodeIdSchema.nullable(),
  })
  .strict();

function validateMindMap(
  value: { nodes: Array<z.infer<typeof mindMapNodeSchema>>; rootId: string },
  context: z.RefinementCtx,
) {
  const byId = new Map<string, (typeof value.nodes)[number]>();
  for (const [index, node] of value.nodes.entries()) {
    if (byId.has(node.id)) {
      context.addIssue({
        code: "custom",
        message: "Mind map node IDs must be unique",
        path: ["nodes", index, "id"],
      });
    } else {
      byId.set(node.id, node);
    }
  }

  const roots = value.nodes.filter((node) => node.parentId === null);
  if (roots.length !== 1 || roots[0]?.id !== value.rootId) {
    context.addIssue({
      code: "custom",
      message: "Mind map must have exactly one root matching rootId",
      path: ["rootId"],
    });
  }

  const childrenByParent = new Map<string, (typeof value.nodes)[number][]>();
  for (const [index, node] of value.nodes.entries()) {
    if (node.parentId === null) continue;
    if (node.parentId === node.id || !byId.has(node.parentId)) {
      context.addIssue({
        code: "custom",
        message: "Mind map parent must exist and differ from the node",
        path: ["nodes", index, "parentId"],
      });
      continue;
    }
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }

  for (const children of childrenByParent.values()) {
    const orders = new Set<number>();
    for (const child of children) {
      if (orders.has(child.order)) {
        context.addIssue({
          code: "custom",
          message: "Mind map sibling order values must be unique",
          path: ["nodes", value.nodes.findIndex((node) => node.id === child.id), "order"],
        });
      }
      orders.add(child.order);
    }
  }

  const state = new Map<string, "visiting" | "visited">();
  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (state.get(id) === "visiting") {
      context.addIssue({
        code: "custom",
        message: "Mind map must not contain cycles",
        path: ["nodes"],
      });
      return;
    }
    if (state.get(id) === "visited") return;
    state.set(id, "visiting");
    reachable.add(id);
    for (const child of childrenByParent.get(id) ?? []) visit(child.id);
    state.set(id, "visited");
  };
  if (byId.has(value.rootId)) visit(value.rootId);
  for (const [index, node] of value.nodes.entries()) {
    if (!reachable.has(node.id)) {
      context.addIssue({
        code: "custom",
        message: "Every mind map node must be reachable from the root",
        path: ["nodes", index],
      });
    }
  }
}

const mindMapContentBaseSchema = z
  .object({
    nodes: z.array(mindMapNodeSchema).min(1).max(MIND_MAP_RESOURCE_MAX_NODES),
    rootId: nodeIdSchema,
  })
  .strict();

export const mindMapRevisionContentSchema = mindMapContentBaseSchema
  .extend({
    generation: artifactGenerationProvenanceSchema,
    schemaVersion: z.literal(2),
  })
  .superRefine(validateMindMap);

export const mindMapDraftSnapshotSchema = mindMapContentBaseSchema
  .superRefine(validateMindMap)
  .describe("Mind map draft snapshot");

const mindMapGenerationCheckpointSchema = z
  .object({
    format: z.literal("mind_map_raw"),
    rawOutput: z.string(),
    snapshot: mindMapDraftSnapshotSchema.nullable(),
  })
  .strict();

export const mindMapGenerationDraftSchema = mindMapGenerationCheckpointSchema;

type GeneratedMindMapNode = {
  children: GeneratedMindMapNode[];
  label: string;
  note?: string | undefined;
};

const generatedMindMapNodeSchema: z.ZodType<GeneratedMindMapNode> = z.lazy(() =>
  z
    .object({
      children: z.array(generatedMindMapNodeSchema),
      label: z.string(),
      note: z.string().optional(),
    })
    .passthrough(),
);

export const mindMapDraftSchema = z.object({ root: generatedMindMapNodeSchema }).passthrough();

type ProjectedChild = { id: string; label: string };

export function createMindMapSnapshotProjector(idFactory: () => string) {
  const rootId = idFactory();
  const previousChildren = new Map<string, ProjectedChild[]>();

  return (value: unknown): MindMapDraftSnapshot | null => {
    if (!value || typeof value !== "object") return null;
    const rawRoot = Reflect.get(value, "root");
    if (!rawRoot || typeof rawRoot !== "object") return null;
    const rawRootLabel = Reflect.get(rawRoot, "label");
    if (typeof rawRootLabel !== "string" || !rawRootLabel.trim()) return null;

    const nodes: MindMapNode[] = [];
    const walk = (candidate: unknown, id: string, parentId: string | null, order: number) => {
      if (
        nodes.length >= MIND_MAP_RESOURCE_MAX_NODES ||
        !candidate ||
        typeof candidate !== "object"
      ) {
        return;
      }
      const rawLabel = Reflect.get(candidate, "label");
      if (typeof rawLabel !== "string" || !rawLabel.trim()) return;
      const label = rawLabel.normalize("NFKC").trim().slice(0, 120);
      const rawNote = Reflect.get(candidate, "note");
      const note =
        typeof rawNote === "string" && rawNote.trim()
          ? rawNote.normalize("NFKC").trim().slice(0, 20_000)
          : undefined;
      nodes.push({ id, label, ...(note ? { note } : {}), order, parentId });

      const rawChildren = Reflect.get(candidate, "children");
      const childCandidates = Array.isArray(rawChildren) ? rawChildren : [];
      const prior = previousChildren.get(id) ?? [];
      const used = new Set<string>();
      const next: ProjectedChild[] = [];
      for (const [childOrder, child] of childCandidates.entries()) {
        if (!child || typeof child !== "object") continue;
        const childLabel = Reflect.get(child, "label");
        if (typeof childLabel !== "string" || !childLabel.trim()) continue;
        const normalized = childLabel.normalize("NFKC").trim();
        const exact = prior.find((item) => !used.has(item.id) && item.label === normalized);
        const positional = prior[childOrder];
        const childId =
          exact?.id ?? (positional && !used.has(positional.id) ? positional.id : idFactory());
        used.add(childId);
        next.push({ id: childId, label: normalized });
        walk(child, childId, id, childOrder);
      }
      previousChildren.set(id, next);
    };
    walk(rawRoot, rootId, null, 0);
    const parsed = mindMapDraftSnapshotSchema.safeParse({ nodes, rootId });
    return parsed.success ? parsed.data : null;
  };
}

type MindMapNode = z.infer<typeof mindMapNodeSchema>;
export type MindMapContent = z.infer<typeof mindMapDraftSnapshotSchema>;
export type MindMapRevisionContent = z.infer<typeof mindMapRevisionContentSchema>;
export type MindMapDraftSnapshot = z.infer<typeof mindMapDraftSnapshotSchema>;
