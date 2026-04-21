import { Download, Gamepad2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkbenchCenteredState } from "../WorkbenchCenteredState";

export type ParsedGamePayload = {
  html: string | null;
  title: string | null;
  instruction: string | null;
  gamePattern: string | null;
};

interface GameSurfaceAdapterProps extends ParsedGamePayload {
  latestArtifactId?: string | null;
  onStructuredRefine?: (() => Promise<void> | void) | undefined;
  onExportArtifact?: ((artifactId: string) => Promise<void> | void) | undefined;
}

export function getPatternLabel(pattern: string | null): string {
  switch (pattern) {
    case "timeline_sort":
      return "时间轴排序";
    case "concept_match":
      return "概念连线";
    case "term_pairing":
      return "术语配对";
    case "fill_in_blank":
      return "填空挑战";
    case "quiz_run":
      return "轻量闯关";
    case "quiz_challenge":
      return "知识闯关";
    default:
      return "互动游戏";
  }
}

export function parseGamePayload(rawContent: unknown): ParsedGamePayload {
  if (rawContent && typeof rawContent === "object" && !Array.isArray(rawContent)) {
    const parsed = rawContent as Record<string, unknown>;
    const html =
      typeof parsed.html === "string" && parsed.html.trim()
        ? parsed.html.trim()
        : typeof parsed.content_html === "string" && parsed.content_html.trim()
          ? parsed.content_html.trim()
          : null;
    const gameData =
      parsed.game_data && typeof parsed.game_data === "object"
        ? (parsed.game_data as Record<string, unknown>)
        : null;
    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : typeof gameData?.game_title === "string" && gameData.game_title.trim()
          ? gameData.game_title.trim()
          : null;
    const instruction =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : typeof gameData?.instruction === "string" &&
            gameData.instruction.trim()
          ? gameData.instruction.trim()
          : null;
    const gamePattern =
      typeof parsed.game_pattern === "string" && parsed.game_pattern.trim()
        ? parsed.game_pattern.trim()
        : null;
    return { html, title, instruction, gamePattern };
  }

  if (typeof rawContent !== "string") {
    return { html: null, title: null, instruction: null, gamePattern: null };
  }

  const raw = rawContent.trim();
  if (!raw) {
    return { html: null, title: null, instruction: null, gamePattern: null };
  }

  if (!raw.startsWith("{") && !raw.startsWith("[")) {
    return { html: raw, title: null, instruction: null, gamePattern: null };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const html =
      typeof parsed.html === "string" && parsed.html.trim()
        ? parsed.html.trim()
        : typeof parsed.content_html === "string" && parsed.content_html.trim()
          ? parsed.content_html.trim()
          : null;
    const gameData =
      parsed.game_data && typeof parsed.game_data === "object"
        ? (parsed.game_data as Record<string, unknown>)
        : null;
    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : typeof gameData?.game_title === "string" && gameData.game_title.trim()
          ? gameData.game_title.trim()
          : null;
    const instruction =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : typeof gameData?.instruction === "string" &&
            gameData.instruction.trim()
          ? gameData.instruction.trim()
          : null;
    const gamePattern =
      typeof parsed.game_pattern === "string" && parsed.game_pattern.trim()
        ? parsed.game_pattern.trim()
        : null;

    return { html, title, instruction, gamePattern };
  } catch {
    return { html: raw, title: null, instruction: null, gamePattern: null };
  }
}

export function GameSurfaceAdapter({
  html,
  title,
  instruction,
  gamePattern,
  latestArtifactId,
  onStructuredRefine,
  onExportArtifact,
}: GameSurfaceAdapterProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">互动游戏工作面</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            冻结期只保留真实游戏 surface 和治理壳层，不再继续长独立 runtime 工作台。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gamePattern ? (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600">
              玩法：{getPatternLabel(gamePattern)}
            </span>
          ) : null}
          {onStructuredRefine ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => void onStructuredRefine()}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              提交正式 Rewrite
            </Button>
          ) : null}
          {latestArtifactId && onExportArtifact ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => void onExportArtifact(latestArtifactId)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              导出当前成果
            </Button>
          ) : null}
        </div>
      </div>

      {title || instruction ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
            <p className="text-[11px] font-medium text-zinc-700">当前玩法定位</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900">
              {title ?? getPatternLabel(gamePattern)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
            <p className="text-[11px] font-medium text-zinc-700">课堂互动说明</p>
            <p className="mt-1 text-[12px] leading-5 text-zinc-600">
              {instruction ?? "后端已返回游戏结果，可以继续试玩、微调或导出。"}
            </p>
          </div>
        </div>
      ) : null}

      {html ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <iframe
            title="backend-game-preview"
            srcDoc={html}
            sandbox="allow-scripts allow-same-origin"
            className="h-[560px] w-full bg-white"
          />
        </div>
      ) : (
        <WorkbenchCenteredState
          tone="rose"
          icon={Gamepad2}
          title="暂未收到后端真实游戏"
          description="当前不会渲染前端假游戏。等待后端 HTML 返回后，这里会直接变成可试玩的课堂玩法。"
        />
      )}
    </div>
  );
}
