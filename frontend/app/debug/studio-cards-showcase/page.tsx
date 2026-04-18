import { promises as fs } from "fs";
import path from "path";

import { ShowcasePageClient, type ShowcaseCardData } from "./pageClient";

const SHOWCASE_DIR = path.join(
  process.cwd(),
  ".generated",
  "studio-cards-showcase"
);

type RawResults = {
  project_id?: string;
  source_artifact_id?: string;
  [key: string]: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return asObject(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function resolveWorkspaceMirrorPath(localPath: string): Promise<string> {
  const fileName = path.basename(localPath);
  const mirroredPath = path.join(SHOWCASE_DIR, fileName);
  try {
    await fs.access(mirroredPath);
    return mirroredPath;
  } catch {
    return localPath;
  }
}

function buildDownloadUrl(projectId: string, artifactId: string): string {
  return `http://127.0.0.1:8000/api/v1/projects/${projectId}/artifacts/${artifactId}/download`;
}

function extractArtifact(entry: Record<string, unknown> | null): Record<string, unknown> | null {
  const executionResult = asObject(asObject(asObject(entry?.data)?.data)?.execution_result);
  return asObject(executionResult?.artifact);
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function loadCard(
  rawResults: RawResults,
  cardId: ShowcaseCardData["id"],
  label: string,
  payloadFileName: string
): Promise<ShowcaseCardData | null> {
  const rawEntry = asObject(rawResults[cardId]);
  if (!rawEntry) return null;
  const artifact = extractArtifact(rawEntry);
  const projectId = typeof rawResults.project_id === "string" ? rawResults.project_id : "";
  const artifactId = typeof artifact?.id === "string" ? artifact.id : "";
  const artifactType = typeof artifact?.type === "string" ? artifact.type : "";
  const rawLocalPath =
    typeof rawEntry.local_path === "string" && rawEntry.local_path.trim()
      ? rawEntry.local_path.trim()
      : "";
  const localPath = rawLocalPath
    ? await resolveWorkspaceMirrorPath(rawLocalPath)
    : path.join(SHOWCASE_DIR, payloadFileName);
  const payloadPath = path.join(SHOWCASE_DIR, payloadFileName);
  const payload = await readJsonFile(payloadPath);
  const createdAt =
    typeof artifact?.created_at === "string" ? artifact.created_at : null;

  return {
    id: cardId,
    label,
    status: Number(rawEntry.status ?? 0),
    artifact: {
      artifactId,
      artifactType,
      localPath,
      downloadUrl:
        projectId && artifactId ? buildDownloadUrl(projectId, artifactId) : null,
      elapsedSeconds: toNumber(rawEntry.elapsed),
      createdAt,
      title:
        typeof artifact?.title === "string" && artifact.title.trim()
          ? artifact.title.trim()
          : label,
    },
    payload,
    markdown:
      cardId === "word_document" && payload && typeof payload.markdown === "string"
        ? payload.markdown
        : null,
    summary:
      payload && typeof payload.summary === "string" ? payload.summary : null,
  };
}

export default async function StudioCardsShowcasePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderPage({ searchParams });
}

function normalizeTab(value: unknown): ShowcaseCardData["id"] | undefined {
  if (
    value === "word_document" ||
    value === "knowledge_mindmap" ||
    value === "speaker_notes" ||
    value === "interactive_quick_quiz"
  ) {
    return value;
  }
  return undefined;
}

async function renderPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<
    string,
    string | string[] | undefined
  >;
}) {
  const resultsPath = path.join(SHOWCASE_DIR, "results.json");
  const rawResults = (await readJsonFile(resultsPath)) as RawResults | null;

  if (!rawResults) {
    return (
      <main className="min-h-screen bg-[#f5f0e7] px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-5xl rounded-[28px] border border-zinc-300 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight">
            Studio Cards Showcase
          </h1>
          <p className="mt-3 text-sm text-zinc-600">
            暂未发现真实 showcase 结果文件。请先跑一次实际 API showcase，再刷新本页。
          </p>
        </div>
      </main>
    );
  }

  const cards = (
    await Promise.all([
      loadCard(rawResults, "word_document", "教学文档", "word_document_content.json"),
      loadCard(rawResults, "knowledge_mindmap", "知识导图", "knowledge_mindmap.json"),
      loadCard(rawResults, "speaker_notes", "讲稿备注", "speaker_notes.json"),
      loadCard(
        rawResults,
        "interactive_quick_quiz",
        "随堂小测",
        "interactive_quick_quiz.json"
      ),
    ])
  ).filter((item): item is ShowcaseCardData => Boolean(item));

  const resolvedSearchParams =
    searchParams && typeof (searchParams as Promise<unknown>).then === "function"
      ? await (searchParams as Promise<Record<string, string | string[] | undefined>>)
      : (searchParams as Record<string, string | string[] | undefined> | undefined);
  const requestedTab = Array.isArray(resolvedSearchParams?.tab)
    ? resolvedSearchParams?.tab[0]
    : resolvedSearchParams?.tab;
  const defaultTab = normalizeTab(requestedTab);

  return (
    <ShowcasePageClient
      projectId={typeof rawResults.project_id === "string" ? rawResults.project_id : ""}
      sourceArtifactId={
        typeof rawResults.source_artifact_id === "string"
          ? rawResults.source_artifact_id
          : ""
      }
      cards={cards}
      defaultTab={defaultTab}
    />
  );
}

export async function generateMetadata() {
  return {
    title: "Studio Cards Showcase",
  };
}
