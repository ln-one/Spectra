"use client";

import {
  Check,
  ChevronDown,
  Gamepad2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trophy,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { GameArtifact } from "@/features/artifacts/games/types";
import type { QuizAnswer } from "@/features/artifacts/quizzes/contract";
import {
  artifactSuggestionQueryKeys,
  fetchArtifactSuggestions,
  regenerateArtifactSuggestions,
} from "@/features/artifacts/suggestions/queries";
import { ArtifactStartView, ArtifactWorkspaceShell } from "./ArtifactWorkspacePrimitives";
import type { ArtifactWorkspacePhase } from "./artifactWorkbench";
import { GameCanvas } from "./GameCanvas";
import type {
  GameQuestion,
  GameRunResult,
  GameRunResultPayload,
  GameSkin,
} from "./game-workspace-client";
import { QuizMarkdown } from "./QuizMarkdown";
import { QuizSurveyRuntime } from "./QuizSurveyRuntime";
import { useArtifactSuggestions } from "./useArtifactSuggestions";
import { useGameRunSession } from "./useGameRunSession";

export function GameWorkspaceView({
  artifact,
  conversationId,
  failureCode,
  onBack,
  onSuggestion,
  pendingTitle,
  phase,
  workspaceId,
}: {
  artifact: GameArtifact | null;
  conversationId: string;
  failureCode: string | null;
  onBack: () => void;
  onSuggestion: (prompt: string) => void;
  pendingTitle: string | null;
  phase: ArtifactWorkspacePhase;
  workspaceId: string;
}) {
  const locale = useLocale() === "en-US" ? "en-US" : "zh-CN";
  const zh = locale === "zh-CN";
  const t = useTranslations("Workbench");
  const generationFailureMessage =
    failureCode === "game_generation_timeout"
      ? t("gameGenerationTimeout")
      : failureCode === "game_invalid_output"
        ? t("gameGenerationInvalidOutput")
        : failureCode === "game_rate_limited"
          ? t("gameGenerationRateLimited")
          : failureCode === "game_provider_configuration"
            ? t("gameGenerationProviderConfiguration")
            : failureCode === "game_budget_exhausted"
              ? t("gameGenerationBudgetExhausted")
              : t("gameGenerationFailedDescription");
  const artifactId = artifact?.id ?? null;
  const revisionId = artifact?.currentRevision.id ?? null;
  const suggestions = useArtifactSuggestions({
    enabled: phase === "idle" && !artifact,
    fetchSuggestions: (afterGeneration, waitOnly) =>
      fetchArtifactSuggestions(workspaceId, locale, "game", afterGeneration, waitOnly),
    queryKey: artifactSuggestionQueryKeys.suggestions(workspaceId, conversationId, locale, "game"),
    regenerateSuggestions: (afterGeneration) =>
      regenerateArtifactSuggestions(workspaceId, locale, "game", afterGeneration),
  });
  const {
    answers,
    answerRevivalQuestion,
    canvasRef,
    countdown,
    deliverySnapshot,
    finish,
    onCanvasError,
    onCanvasPause,
    onCanvasReady,
    onDeath,
    overview,
    pauseGame,
    personalBest,
    questionIndex,
    requestRevival,
    result,
    revivalAvailable,
    revivalComplete,
    revivalSubmitFailed,
    revivalSubmitting,
    reviveCorrectCount,
    resumeGame,
    run,
    score,
    setQuestionIndex,
    setScore,
    shellState,
    startMutation,
    submitRevival,
  } = useGameRunSession({ artifactId, phase, revisionId, workspaceId });
  const gameOverview = overview.data;
  const ambientBackground =
    gameOverview?.skin === "city_night"
      ? "radial-gradient(circle at 78% 18%, rgba(99, 102, 241, 0.1), transparent 38%), var(--workspace-surface-muted)"
      : gameOverview?.skin === "city_sunset"
        ? "radial-gradient(circle at 18% 18%, rgba(249, 115, 22, 0.12), transparent 40%), var(--workspace-surface-muted)"
        : "radial-gradient(circle at 18% 18%, rgba(14, 165, 233, 0.08), transparent 40%), var(--workspace-surface-muted)";
  const menuState = shellState === "overview" || shellState === "result" || shellState === "error";
  const scrollableMenu = phase === "ready" && artifact !== null && menuState;

  return (
    <ArtifactWorkspaceShell
      backLabel={zh ? "返回" : "Back"}
      groundingSources={artifact?.groundingSources ?? []}
      contentClassName={
        phase === "idle" && !artifact ? "p-6" : scrollableMenu ? "min-h-full" : "h-full"
      }
      liveScrollTestId="game-live-scroll"
      onBack={onBack}
      phase={phase}
      scrollClassName={
        (phase === "idle" && !artifact) || scrollableMenu
          ? "overflow-y-auto overscroll-y-contain"
          : "overflow-hidden"
      }
      subtitle={zh ? "飞行、复活与知识复盘" : "Fly, revive, and review"}
      testId="game-workspace"
      title={artifact?.title ?? pendingTitle ?? (zh ? "飞跃复活" : "Flap Revival")}
    >
      {phase === "idle" && !artifact ? (
        <ArtifactStartView
          description={t("gameStartDescription")}
          error={suggestions.error}
          errorLabel={t("suggestionsUnavailable")}
          Icon={Gamepad2}
          loading={suggestions.loading}
          loadingLabel={t("preparingSuggestions")}
          onRefresh={suggestions.refresh}
          onRetry={() => void suggestions.retry()}
          onSuggestion={onSuggestion}
          refreshing={suggestions.refreshing}
          refreshLabel={t("retrySuggestions")}
          suggestions={suggestions.suggestions}
          title={t("gameStartTitle")}
        />
      ) : phase !== "ready" || !artifact ? (
        phase === "failed" ? (
          <GameGenerationFailure
            actionLabel={t("gameGenerationBack")}
            description={generationFailureMessage}
            onBack={onBack}
            title={t("gameGenerationFailedTitle")}
          />
        ) : (
          <GameGenerationSkeleton
            status={phase === "finalizing" ? t("gameFinalizing") : t("gameGenerating")}
          />
        )
      ) : overview.isError ? (
        <GameOverviewError
          message={t("gameOverviewLoadFailed")}
          onRetry={() => void overview.refetch()}
          retryLabel={t("gameOverviewRetry")}
        />
      ) : !gameOverview ? (
        <GameGenerationSkeleton status={t("gameLoading")} />
      ) : (
        <div
          className={`relative ${menuState ? "min-h-full px-4 py-5 sm:px-6 sm:py-7" : "flex h-full min-h-[560px] items-center justify-center overflow-hidden p-4 sm:p-6"}`}
          style={{ background: ambientBackground }}
        >
          {menuState ? (
            <div className="relative z-10 mx-auto flex min-h-[520px] w-full max-w-5xl items-center justify-center">
              {shellState === "result" ? (
                <GameResultPanel
                  isStarting={startMutation.isPending}
                  onPlayAgain={() => startMutation.mutate()}
                  result={result}
                  title={gameOverview.title}
                  zh={zh}
                />
              ) : (
                <GameOverviewPanel
                  description={gameOverview.descriptionMarkdown}
                  error={shellState === "error"}
                  isStarting={startMutation.isPending}
                  maximumRevivalRounds={gameOverview.maximumRevivalRounds}
                  onStart={() => startMutation.mutate()}
                  personalBest={gameOverview.personalBest}
                  questionCount={gameOverview.questionCount}
                  skin={gameOverview.skin}
                  title={gameOverview.title}
                  zh={zh}
                />
              )}
            </div>
          ) : (
            <div className="relative z-10 h-[min(100%,720px)] aspect-[352/576] max-w-full overflow-hidden rounded-[28px] border border-[var(--workspace-border)] bg-black shadow-[0_24px_70px_-38px_rgba(15,23,42,.65)]">
              {run ? (
                <GameCanvas
                  ref={canvasRef}
                  seed={run.seed}
                  skin={gameOverview.skin}
                  onScore={setScore}
                  onDeath={onDeath}
                  onError={onCanvasError}
                  onReady={onCanvasReady}
                  onPause={onCanvasPause}
                />
              ) : null}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/55 to-transparent p-4 text-white">
                <div>
                  <span className="block text-[10px] uppercase tracking-widest opacity-70">
                    Score
                  </span>
                  <strong className="text-3xl tabular-nums">{score}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-black/35 px-3 py-1.5 text-xs">
                    <Trophy className="mr-1 inline h-3.5 w-3.5" />
                    {personalBest}
                  </span>
                  <button
                    type="button"
                    aria-label={
                      shellState === "paused" ? (zh ? "继续" : "Resume") : zh ? "暂停" : "Pause"
                    }
                    onClick={() => {
                      if (shellState === "paused") resumeGame();
                      else pauseGame();
                    }}
                    className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/45"
                  >
                    {shellState === "paused" ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              {shellState === "paused" ? (
                <OverlayCard title={zh ? "已暂停" : "Paused"}>
                  <button
                    type="button"
                    onClick={resumeGame}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--app-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--app-on-primary)]"
                  >
                    <Play className="h-4 w-4" />
                    {zh ? "继续" : "Resume"}
                  </button>
                </OverlayCard>
              ) : null}
              {shellState === "starting" ? (
                <OverlayCard title={zh ? "正在准备" : "Preparing"}>
                  <p className="text-sm text-[var(--workspace-text-muted)]">
                    {zh
                      ? "正在固定本局题序与随机种子…"
                      : "Fixing this run's question order and seed…"}
                  </p>
                </OverlayCard>
              ) : null}
              {shellState === "dead" ? (
                <OverlayCard title={zh ? "飞行结束" : "Flight ended"}>
                  <p className="mb-5 text-sm text-[var(--workspace-text-muted)]">
                    {zh ? `本次得分 ${score}` : `Score ${score}`}
                  </p>
                  {revivalAvailable ? (
                    <button
                      type="button"
                      onClick={requestRevival}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--app-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--app-on-primary)]"
                    >
                      <Gamepad2 className="h-4 w-4" />
                      {zh ? "知识复活" : "Knowledge revival"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={finish}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--workspace-border)] px-4 py-2.5 text-sm font-medium"
                  >
                    {zh ? "结束本局" : "End run"}
                  </button>
                </OverlayCard>
              ) : null}
              {shellState === "countdown" ? (
                <div className="absolute inset-0 grid place-items-center bg-black/40 text-center text-white drop-shadow-lg motion-reduce:transition-none">
                  <div>
                    <p className="mb-4 text-lg font-semibold">
                      {zh
                        ? `复活成功 · ${reviveCorrectCount ?? 0}/3`
                        : `Revival succeeded · ${reviveCorrectCount ?? 0}/3`}
                    </p>
                    <strong className="block text-8xl font-black">{countdown || ""}</strong>
                  </div>
                </div>
              ) : null}
              {shellState === "answering" && deliverySnapshot ? (
                <div className="absolute inset-0 z-20 flex flex-col bg-[var(--workspace-surface)] text-[var(--workspace-text-primary)]">
                  <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--workspace-border)] px-5">
                    <div>
                      <strong>{zh ? "知识复活" : "Knowledge revival"}</strong>
                      <span className="ml-2 text-xs text-[var(--workspace-text-muted)]">
                        {questionIndex + 1}/3
                      </span>
                    </div>
                    <span className="text-xs text-[var(--workspace-text-muted)]">
                      {zh ? "答对 2 题即可复活" : "2 correct answers to revive"}
                    </span>
                  </header>
                  <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    <QuizMarkdown
                      markdown={deliverySnapshot.questions[questionIndex]?.promptMarkdown ?? ""}
                    />
                    <QuizSurveyRuntime
                      answers={answers}
                      onAnswer={answerRevivalQuestion}
                      onPageChanged={setQuestionIndex}
                      pageIndex={questionIndex}
                      showChrome={false}
                      showPrompt={false}
                      snapshot={deliverySnapshot}
                    />
                  </div>
                  {revivalSubmitFailed ? (
                    <p role="alert" className="shrink-0 px-4 pb-2 text-center text-xs text-red-500">
                      {zh ? "提交失败，请重试。" : "Submission failed. Try again."}
                    </p>
                  ) : null}
                  <footer className="flex shrink-0 items-center justify-between border-t border-[var(--workspace-border)] p-4">
                    <button
                      type="button"
                      disabled={questionIndex === 0}
                      onClick={() => setQuestionIndex((value) => Math.max(0, value - 1))}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--workspace-border)] px-4 py-2.5 text-sm font-medium disabled:opacity-40"
                    >
                      {zh ? "上一题" : "Previous"}
                    </button>
                    {questionIndex < 2 ? (
                      <button
                        type="button"
                        onClick={() => setQuestionIndex((value) => Math.min(2, value + 1))}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--app-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--app-on-primary)]"
                      >
                        {zh ? "下一题" : "Next"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={submitRevival}
                        aria-busy={revivalSubmitting}
                        disabled={revivalSubmitting || !revivalComplete}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--app-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--app-on-primary)] disabled:opacity-40"
                      >
                        {revivalSubmitting
                          ? zh
                            ? "正在提交…"
                            : "Submitting…"
                          : zh
                            ? "统一提交"
                            : "Submit all"}
                      </button>
                    )}
                  </footer>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </ArtifactWorkspaceShell>
  );
}

function GameOverviewPanel({
  description,
  error,
  isStarting,
  maximumRevivalRounds,
  onStart,
  personalBest,
  questionCount,
  skin,
  title,
  zh,
}: {
  description: string;
  error: boolean;
  isStarting: boolean;
  maximumRevivalRounds: number;
  onStart: () => void;
  personalBest: number;
  questionCount: number;
  skin: GameSkin;
  title: string;
  zh: boolean;
}) {
  return (
    <div
      className="grid w-full overflow-hidden rounded-[28px] border border-[var(--workspace-border)] bg-[var(--workspace-surface)] shadow-[0_24px_70px_-38px_rgba(15,23,42,.55)] lg:grid-cols-[minmax(300px,42%)_minmax(0,1fr)]"
      data-testid="game-overview-panel"
    >
      <StagePreview skin={skin} />
      <section className="flex min-w-0 flex-col justify-center p-6 sm:p-8 lg:px-10 lg:py-12">
        <p className="text-xs font-semibold tracking-[.18em] text-[var(--studio-accent-text)]">
          FLAP REVIVAL
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h3>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--workspace-text-muted)]">
          {description ||
            (zh
              ? "点击、触摸或按空格起飞。死亡后答对三题中的两题即可复活。"
              : "Click, tap, or press Space to flap. Answer two of three questions correctly to revive.")}
        </p>
        <div className="mt-7 grid grid-cols-3">
          <Metric label={zh ? "个人最高分" : "Personal best"} value={personalBest} />
          <Metric label={zh ? "题库" : "Questions"} value={questionCount} />
          <Metric label={zh ? "最多复活" : "Revival rounds"} value={maximumRevivalRounds} />
        </div>
        {error ? (
          <p role="alert" className="mt-5 text-sm text-red-500">
            {zh ? "操作失败，请重试。" : "The operation failed. Try again."}
          </p>
        ) : null}
        <button
          type="button"
          disabled={isStarting}
          onClick={onStart}
          className="mt-8 inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-[var(--app-primary)] px-5 text-sm font-semibold text-[var(--app-on-primary)] shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus)] focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {zh ? "开始游戏" : "Start game"}
        </button>
      </section>
    </div>
  );
}

function GameResultPanel({
  isStarting,
  onPlayAgain,
  result,
  title,
  zh,
}: {
  isStarting: boolean;
  onPlayAgain: () => void;
  result: GameRunResultPayload | null;
  title: string;
  zh: boolean;
}) {
  if (!result?.valid) {
    return (
      <div
        role="alert"
        className="w-full max-w-md rounded-3xl border border-white/25 bg-[var(--workspace-surface)] p-7 text-center shadow-2xl"
      >
        <p className="text-sm text-[var(--workspace-text-muted)]">
          {zh ? "结算信息加载失败，请重新开始。" : "Could not load the result. Start again."}
        </p>
        <button
          type="button"
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--app-primary)] px-5 text-sm font-semibold text-[var(--app-on-primary)]"
          disabled={isStarting}
          onClick={onPlayAgain}
        >
          <RotateCcw className="h-4 w-4" />
          {zh ? "重新开始" : "Start again"}
        </button>
      </div>
    );
  }
  const finalScore = result.result.run.finalScore ?? result.result.run.currentScore;
  return (
    <div className="w-full max-w-4xl space-y-4 py-1" data-testid="game-result-panel">
      <section className="flex flex-col gap-5 rounded-3xl border border-white/25 bg-[var(--workspace-surface)]/95 p-6 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center sm:p-7">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[var(--workspace-surface-muted)] text-[var(--studio-accent-text)]">
          <Trophy className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-[var(--workspace-text-muted)]">{title}</p>
          <div className="mt-1 flex flex-wrap items-end gap-x-7 gap-y-2">
            <div>
              <span className="text-xs text-[var(--workspace-text-muted)]">
                {zh ? "本局分数" : "Run score"}
              </span>
              <strong className="block text-4xl leading-none tabular-nums">{finalScore}</strong>
            </div>
            <div>
              <span className="text-xs text-[var(--workspace-text-muted)]">
                {zh ? "个人最高分" : "Personal best"}
              </span>
              <strong className="block text-2xl leading-none tabular-nums">
                {result.result.personalBest}
              </strong>
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={isStarting}
          onClick={onPlayAgain}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--app-primary)] px-5 text-sm font-semibold text-[var(--app-on-primary)] shadow-lg transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus)] focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          {zh ? "再来一局" : "Play again"}
        </button>
      </section>
      <section className="rounded-3xl border border-white/25 bg-[var(--workspace-surface)]/95 p-5 shadow-xl backdrop-blur-xl sm:p-7">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">{zh ? "知识复盘" : "Knowledge review"}</h3>
          <p className="mt-1 text-xs text-[var(--workspace-text-muted)]">
            {zh
              ? "按复活轮次展开，查看答案与解析。"
              : "Expand a revival round to review its answers."}
          </p>
        </div>
        <ResultReview review={result.result.review} zh={zh} />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 border-l border-[var(--workspace-border)] px-4 first:border-l-0 first:pl-0 last:pr-0">
      <strong className="block text-2xl leading-none tabular-nums">{value}</strong>
      <span className="mt-2 block truncate text-[11px] text-[var(--workspace-text-muted)]">
        {label}
      </span>
    </div>
  );
}

function GameOverviewError({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div className="grid min-h-[560px] place-items-center bg-[var(--workspace-surface-muted)] p-6">
      <div
        role="alert"
        className="max-w-md rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-6 text-center shadow-lg"
      >
        <p className="text-sm leading-6 text-[var(--workspace-text-muted)]">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--workspace-border)] px-4 text-sm font-semibold text-[var(--workspace-text-primary)] hover:bg-[var(--workspace-surface-muted)]"
        >
          <RefreshCw className="h-4 w-4" />
          {retryLabel}
        </button>
      </div>
    </div>
  );
}

function StagePreview({ skin }: { skin: GameSkin }) {
  const src =
    skin === "city_night"
      ? "/game-assets/flap-revival/city-night.png"
      : skin === "city_sunset"
        ? "/game-assets/flap-revival/city-sunset.png"
        : "/game-assets/flap-revival/skyline-day.png";
  return (
    <div
      aria-hidden
      className="mx-auto aspect-[352/576] h-[min(48dvh,480px)] max-w-full overflow-hidden bg-black bg-cover bg-center shadow-[inset_-1px_0_0_var(--workspace-border)] [image-rendering:pixelated] max-lg:mt-5 max-lg:rounded-[22px] max-lg:border max-lg:border-[var(--workspace-border)] sm:h-[min(54dvh,520px)] lg:mx-0 lg:h-full lg:min-h-[500px] lg:w-full"
      style={{ backgroundImage: `url(${src})` }}
    />
  );
}
function GameGenerationSkeleton({ status }: { status: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="game-generation-skeleton"
      className="flex h-full min-h-[560px] w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_42%,color-mix(in_srgb,var(--studio-accent)_10%,transparent),transparent_42%)] px-6 py-5"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--studio-border)] bg-[var(--workspace-surface)]/90 px-3.5 py-2 text-xs font-medium text-[var(--studio-accent-text)] shadow-sm backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--studio-accent)] motion-reduce:animate-none" />
          {status}
        </div>
        <div className="relative aspect-[352/576] h-[min(62dvh,570px)] min-h-[390px] overflow-hidden rounded-[38px] border border-white/35 bg-gradient-to-b from-sky-300 via-sky-200 to-cyan-100 shadow-[0_28px_70px_-30px_rgba(2,132,199,.65)] ring-1 ring-black/5">
          <div className="absolute left-[13%] top-[16%] h-5 w-16 rounded-full bg-white/35" />
          <div className="absolute left-[20%] top-[13%] h-7 w-9 rounded-full bg-white/35" />
          <div className="absolute right-[14%] top-[27%] h-4 w-14 rounded-full bg-white/25" />
          <div className="absolute -right-2 top-0 h-[27%] w-[22%] rounded-b-lg bg-emerald-500/45 shadow-[-6px_0_0_rgba(255,255,255,.12)]" />
          <div className="absolute -right-4 top-[25%] h-8 w-[29%] rounded-md bg-emerald-500/55" />
          <div className="absolute -right-2 bottom-[17%] h-[22%] w-[22%] rounded-t-lg bg-emerald-500/45 shadow-[-6px_0_0_rgba(255,255,255,.12)]" />
          <div className="absolute -right-4 bottom-[37%] h-8 w-[29%] rounded-md bg-emerald-500/55" />
          <div className="absolute left-[27%] top-[45%] h-8 w-11 animate-pulse rounded-[48%_58%_48%_45%] bg-amber-300 shadow-[inset_-5px_-3px_0_rgba(245,158,11,.45),0_5px_0_rgba(14,116,144,.13)] motion-reduce:animate-none">
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-white shadow-[inset_-3px_0_0_#0f172a]" />
            <span className="absolute -right-2 top-3 h-2.5 w-4 rounded-sm bg-orange-500" />
            <span className="absolute -left-2 top-3 h-4 w-6 rounded-full bg-amber-400/90" />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-[17%] bg-amber-100/90">
            <div className="h-3 bg-emerald-400/70" />
            <div className="h-2 bg-emerald-700/35" />
            <div className="mt-2 h-2 bg-amber-300/45" />
          </div>
          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/8 to-transparent motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

function GameGenerationFailure({
  actionLabel,
  description,
  onBack,
  title,
}: {
  actionLabel: string;
  description: string;
  onBack: () => void;
  title: string;
}) {
  return (
    <div
      className="flex h-full min-h-[560px] items-center justify-center px-8 py-12 text-center"
      data-testid="game-generation-failure"
    >
      <div className="flex max-w-sm flex-col items-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--workspace-surface-muted)] text-[var(--studio-accent-text)] ring-1 ring-[var(--studio-border)]">
          <Gamepad2 aria-hidden className="h-6 w-6" />
        </div>
        <h3 className="mt-5 text-xl font-semibold text-[var(--workspace-text-primary)]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--workspace-text-muted)]">{description}</p>
        <button
          className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--studio-accent)] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus)] focus-visible:ring-offset-2"
          onClick={onBack}
          type="button"
        >
          <RotateCcw aria-hidden className="h-4 w-4" />
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
function OverlayCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/50 p-5 backdrop-blur-sm">
      <div className="w-full max-w-[280px] rounded-2xl border border-white/15 bg-[var(--workspace-surface)] p-5 text-[var(--workspace-text-primary)] shadow-2xl">
        <h3 className="mb-2 text-xl font-semibold">{title}</h3>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
    </div>
  );
}
function answerText(
  question: GameQuestion,
  answer: QuizAnswer | null,
  correct: boolean,
  zh: boolean,
) {
  if (question.type === "true_false") {
    const value = correct
      ? question.correctAnswer
      : answer?.type === "true_false"
        ? answer.value
        : null;
    return value === null ? "—" : value ? (zh ? "正确" : "True") : zh ? "错误" : "False";
  }
  const optionId = correct
    ? question.correctOptionId
    : answer?.type === "single_choice"
      ? answer.optionId
      : null;
  return question.options.find((option) => option.optionId === optionId)?.text ?? "—";
}

function answerIsCorrect(question: GameQuestion, answer: QuizAnswer | null) {
  if (question.type === "true_false") {
    return answer?.type === "true_false" && answer.value === question.correctAnswer;
  }
  return answer?.type === "single_choice" && answer.optionId === question.correctOptionId;
}

function ResultReview({ review, zh }: { review: GameRunResult["review"]; zh: boolean }) {
  if (!review?.length) {
    return (
      <p className="rounded-2xl bg-[var(--workspace-surface-muted)] px-4 py-5 text-sm text-[var(--workspace-text-muted)]">
        {zh ? "本局没有使用复活题。" : "No revival questions were used in this run."}
      </p>
    );
  }
  return (
    <div className="space-y-2" data-testid="game-result-review">
      {review.map((round, index) => {
        const passed = (round.correctCount ?? 0) >= 2;
        return (
          <details
            key={`${round.state}:${round.questions.map(({ question }) => question.questionId).join(":")}`}
            className="group rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] open:shadow-sm"
          >
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-focus)] [&::-webkit-details-marker]:hidden">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${passed ? "bg-emerald-500/12 text-emerald-600" : "bg-amber-500/12 text-amber-600"}`}
              >
                {passed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                {zh ? `第 ${index + 1} 轮复活` : `Revival ${index + 1}`}
              </span>
              <span className="text-xs tabular-nums text-[var(--workspace-text-muted)]">
                {round.correctCount ?? 0}/3
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-[var(--workspace-text-muted)] transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="space-y-3 border-t border-[var(--workspace-border)] p-3 sm:p-4">
              {round.questions.map(({ answer, question }, questionIndex) => (
                <div
                  key={question.questionId}
                  className="rounded-xl bg-[var(--workspace-surface-muted)] p-4 text-sm"
                >
                  <div className="mb-3 flex items-center justify-between gap-3 text-xs font-semibold text-[var(--workspace-text-muted)]">
                    <span>
                      {zh ? `第 ${questionIndex + 1} 题` : `Question ${questionIndex + 1}`}
                    </span>
                    <span
                      className={
                        answerIsCorrect(question, answer) ? "text-emerald-600" : "text-amber-600"
                      }
                    >
                      {answerIsCorrect(question, answer)
                        ? zh
                          ? "回答正确"
                          : "Correct"
                        : zh
                          ? "需要复习"
                          : "Review"}
                    </span>
                  </div>
                  <QuizMarkdown markdown={question.promptMarkdown} />
                  <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-lg bg-[var(--workspace-surface)] px-3 py-2.5">
                      <dt className="block text-[var(--workspace-text-muted)]">
                        {zh ? "你的答案：" : "Your answer: "}
                      </dt>
                      <dd className="mt-1 font-medium">
                        {answerText(question, answer, false, zh)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-[var(--workspace-surface)] px-3 py-2.5">
                      <dt className="block text-[var(--workspace-text-muted)]">
                        {zh ? "正确答案：" : "Correct answer: "}
                      </dt>
                      <dd className="mt-1 font-medium">{answerText(question, answer, true, zh)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 border-t border-[var(--workspace-border)] pt-3 text-xs leading-5 text-[var(--workspace-text-muted)]">
                    <QuizMarkdown markdown={question.explanationMarkdown} />
                  </div>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
